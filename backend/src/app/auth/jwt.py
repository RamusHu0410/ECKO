"""Auth0 access-token validation.

Flow:
    JWT -> validate signature (via Auth0 JWKS) -> validate issuer ->
    validate audience -> extract "sub" -> return claims.

Auth0 owns identity; this module only *verifies* tokens Auth0 issued for
our API (the AUTH0_API_AUDIENCE). It never mints or stores credentials.
"""

import json
import time
from urllib.request import urlopen

from jose import jwt
from jose.exceptions import JWTError

# In-process cache of the tenant's signing keys (JWKS), refreshed periodically.
_JWKS_CACHE = {"keys": None, "fetched_at": 0.0}
_JWKS_TTL_SECONDS = 3600
# A token signed with a key the cache doesn't know (Auth0 rotated its keys) refetches the JWKS
# early, but at most this often, so made-up `kid`s can't make every request call Auth0.
_JWKS_MIN_REFRESH_SECONDS = 10


class AuthError(Exception):
    """Raised when a token is missing or invalid. Carries an HTTP status."""

    def __init__(self, error, status_code=401):
        super().__init__(error.get("description", "authorization error"))
        self.error = error
        self.status_code = status_code


def _get_jwks(domain, refresh=False):
    now = time.time()
    stale = (now - _JWKS_CACHE["fetched_at"]) > _JWKS_TTL_SECONDS
    may_refresh = refresh and (now - _JWKS_CACHE["fetched_at"]) > _JWKS_MIN_REFRESH_SECONDS
    if _JWKS_CACHE["keys"] is None or stale or may_refresh:
        url = f"https://{domain}/.well-known/jwks.json"
        with urlopen(url, timeout=5) as resp:  # noqa: S310 - fixed Auth0 host
            _JWKS_CACHE["keys"] = json.loads(resp.read())
            _JWKS_CACHE["fetched_at"] = now
    return _JWKS_CACHE["keys"]


def _rsa_key_for(token, jwks):
    """Find the JWKS entry matching the token's `kid` header."""
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:  # not a JWT at all: a 401, not a crash
        raise AuthError({"code": "invalid_header", "description": "The token is not a valid JWT."})
    for key in jwks.get("keys", []):
        if key.get("kid") == unverified_header.get("kid"):
            return {
                "kty": key["kty"],
                "kid": key["kid"],
                "use": key.get("use"),
                "n": key["n"],
                "e": key["e"],
            }
    return None


def verify_jwt(token, domain, audience, algorithms=("RS256",)):
    """Validate an Auth0 access token and return its claims dict.

    Raises AuthError on any failure (missing key, bad signature, wrong
    issuer/audience, expiry, etc.).
    """
    if not domain or not audience:
        raise AuthError(
            {
                "code": "server_misconfigured",
                "description": "Auth0 domain/audience not configured on the server.",
            },
            status_code=500,
        )

    try:
        jwks = _get_jwks(domain)
    except Exception as exc:  # noqa: BLE001
        raise AuthError(
            {"code": "jwks_unavailable", "description": f"Unable to fetch signing keys: {exc}"},
            status_code=503,
        )

    rsa_key = _rsa_key_for(token, jwks)
    if rsa_key is None:  # maybe Auth0 rotated its keys since the JWKS was cached
        try:
            rsa_key = _rsa_key_for(token, _get_jwks(domain, refresh=True))
        except (OSError, ValueError):  # Auth0 unreachable: the token just isn't signed by a key we have
            rsa_key = None
    if rsa_key is None:
        raise AuthError(
            {"code": "invalid_header", "description": "Unable to find an appropriate signing key."}
        )

    try:
        claims = jwt.decode(
            token,
            rsa_key,
            algorithms=list(algorithms),
            audience=audience,
            issuer=f"https://{domain}/",
        )
    except jwt.ExpiredSignatureError:
        raise AuthError({"code": "token_expired", "description": "Token is expired."})
    except jwt.JWTClaimsError:
        raise AuthError(
            {
                "code": "invalid_claims",
                "description": "Incorrect claims: check the audience and issuer.",
            }
        )
    except JWTError:
        raise AuthError({"code": "invalid_token", "description": "Unable to parse authentication token."})

    return claims
