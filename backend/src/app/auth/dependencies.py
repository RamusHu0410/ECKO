"""Flask request-auth helpers built on top of Auth0 token validation.

Usage in a route:

    @bp.route("/api/me")
    @require_auth()
    def me():
        user = get_current_user()   # auto-created app user
        return jsonify({"auth0_id": user.auth0_id})

Optionally require scopes/permissions:

    @require_auth("read:recordings")
"""

from functools import wraps

from flask import current_app, g, jsonify, request

from .jwt import AuthError, verify_jwt


def _get_token_from_header():
    auth = request.headers.get("Authorization", None)
    if not auth:
        raise AuthError(
            {"code": "authorization_header_missing", "description": "Authorization header is expected."}
        )
    parts = auth.split()
    if parts[0].lower() != "bearer":
        raise AuthError(
            {"code": "invalid_header", "description": "Authorization header must start with Bearer."}
        )
    if len(parts) == 1:
        raise AuthError({"code": "invalid_header", "description": "Token not found."})
    if len(parts) > 2:
        raise AuthError({"code": "invalid_header", "description": "Authorization header must be Bearer token."})
    return parts[1]


def _claims_have_scopes(claims, required_scopes):
    if not required_scopes:
        return True
    # Auth0 access tokens carry granted scopes in the space-delimited "scope"
    # claim and/or a "permissions" array (when RBAC is enabled).
    token_scopes = set((claims.get("scope") or "").split())
    token_scopes.update(claims.get("permissions") or [])
    return all(s in token_scopes for s in required_scopes)


def require_auth(*required_scopes):
    """Decorator: validate the Auth0 bearer token before running the view.

    Stashes the verified claims on `flask.g.auth_claims` and lazily
    resolves/creates the application user via get_current_user().
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                token = _get_token_from_header()
                claims = verify_jwt(
                    token,
                    domain=current_app.config.get("AUTH0_DOMAIN"),
                    audience=current_app.config.get("AUTH0_API_AUDIENCE"),
                    algorithms=current_app.config.get("AUTH0_ALGORITHMS", ["RS256"]),
                )
                if not _claims_have_scopes(claims, required_scopes):
                    raise AuthError(
                        {
                            "code": "insufficient_scope",
                            "description": f"Requires scope(s): {', '.join(required_scopes)}.",
                        },
                        status_code=403,
                    )
                g.auth_claims = claims
                # get_current_user() inside the view can refuse the token too (no `sub`).
                return fn(*args, **kwargs)
            except AuthError as exc:
                return jsonify(exc.error), exc.status_code

        return wrapper

    return decorator


def get_current_user():
    """Return the application User for the current request, creating it on
    first sight (Auth0 user -> application user).

    Safe when two first requests arrive at once. `auth0_id` and `username` are
    unique, so a clashing insert fails instead of making a duplicate: if the
    same person's other request won, use its row; if someone else took the
    username first, derive another and try again.

    Must be called from within a @require_auth()-protected view.
    """
    from sqlalchemy.exc import IntegrityError

    from app.extensions import db
    from app.models import User

    claims = getattr(g, "auth_claims", None)
    if claims is None:
        raise AuthError({"code": "not_authenticated", "description": "No verified token on request."})

    # Cache on the request context so repeated calls don't re-query.
    if getattr(g, "current_user", None) is not None:
        return g.current_user

    auth0_id = claims.get("sub")
    if not auth0_id:
        raise AuthError({"code": "invalid_claims", "description": "The token has no subject (sub)."})

    user = _user_by_auth0_id(auth0_id)
    for attempt in range(_CREATE_ATTEMPTS):
        if user is not None:
            break
        try:
            user = User(
                auth0_id=auth0_id,
                username=_derive_username(claims),
                display_name=_derive_display_name(claims),
                avatar_url=claims.get("picture"),
            )
            db.session.add(user)
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            user = _user_by_auth0_id(auth0_id)  # None: it was the username that clashed
            if user is None and attempt == _CREATE_ATTEMPTS - 1:
                raise

    g.current_user = user
    return user


# Each retry sees the usernames taken so far, so more than a couple means something else is wrong.
_CREATE_ATTEMPTS = 3


def _user_by_auth0_id(auth0_id):
    from app.extensions import db
    from app.models import User

    return db.session.execute(db.select(User).filter_by(auth0_id=auth0_id)).scalar_one_or_none()


def _derive_username(claims):
    """Best-effort unique username seed from token claims.

    Access tokens often only carry `sub`, so we fall back to a slug of the
    Auth0 id and de-duplicate against existing usernames.
    """
    from app.extensions import db
    from app.models import User

    base = (
        claims.get("nickname")
        or claims.get("preferred_username")
        or (claims.get("email") or "").split("@")[0]
        or claims.get("sub", "user").replace("|", "_")
    )
    base = "".join(ch for ch in base.lower() if ch.isalnum() or ch in ("_", "-"))[:70] or "user"
    candidate = base
    suffix = 1
    while db.session.query(User).filter_by(username=candidate).first() is not None:
        suffix += 1
        candidate = f"{base}{suffix}"
    return candidate


def _derive_display_name(claims):
    return claims.get("name") or claims.get("nickname") or None
