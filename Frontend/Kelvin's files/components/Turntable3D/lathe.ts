import { BufferGeometry, Float32BufferAttribute, type Matrix4 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/*
 * Turned parts (platter, record, feet, knobs, the tonearm's pillar and weights) as lathe geometry:
 * a profile in (radius, height) swept around the y axis. Unlike three's LatheGeometry this keeps
 * corners crisp (a corner sharper than `crease` gets hard normals), rounds the corners it is asked
 * to with small fillets, gives each stretch of the profile its own material, and adds tangents
 * running around the axis, so brushed metal and the record's grooves can reflect anisotropically.
 */

/** One corner of a profile: radius, height, and how much to round it (0: sharp). */
export type ProfilePoint = [r: number, y: number, fillet?: number]

/**
 * A stretch of a profile's outline, walked with the part's outside on the right: out along the
 * bottom, up the side, back in across the top. Its segments use `material` (an index into the
 * mesh's materials); the next stretch carries on from its last point.
 */
export interface ProfileStretch {
  points: ProfilePoint[]
  material?: number
}

export interface LatheOptions {
  segments?: number
  /** Corners sharper than this (radians) get hard normals. */
  crease?: number
  /** Points per fillet arc. */
  filletSteps?: number
  /** uv1.v runs with the radius (r / radialV) instead of along the profile: rings on flat discs. */
  radialV?: number
  /** uv maps the top view onto a disc of this radius (the record's printed face); otherwise around × along. */
  planar?: number
}

interface OutlinePoint {
  r: number
  y: number
  /** Material of the segment that starts here. */
  material: number
  /** A fillet's points know their exact normal (the arc's); it matches the flat sides where they meet. */
  normal?: [number, number]
}

/** Replaces each corner that has a fillet with a small arc tangent to both of its sides. */
function filleted(points: ProfilePoint[], materials: number[], steps: number): OutlinePoint[] {
  const out: OutlinePoint[] = []
  points.forEach(([r, y, fillet = 0], index) => {
    const material = materials[index]
    const before = points[index - 1]
    const after = points[index + 1]
    const toA = before && normalize(before[0] - r, before[1] - y)
    const toB = after && normalize(after[0] - r, after[1] - y)
    const half = toA && toB ? Math.acos(clamp(toA[0] * toB[0] + toA[1] * toB[1])) / 2 : 0
    if (!fillet || !toA || !toB || half < 1e-4 || half > Math.PI / 2 - 1e-4) {
      out.push({ r, y, material })
      return
    }
    const reach = fillet / Math.tan(half)
    const bisector = normalize(toA[0] + toB[0], toA[1] + toB[1])
    const cr = r + (bisector[0] * fillet) / Math.sin(half)
    const cy = y + (bisector[1] * fillet) / Math.sin(half)
    const from = Math.atan2(y + toA[1] * reach - cy, r + toA[0] * reach - cr)
    let sweep = Math.atan2(y + toB[1] * reach - cy, r + toB[0] * reach - cr) - from
    sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep))
    // the arc's normal points away from its center on an outside corner, toward it on an inside one
    const incoming = normalize(y - before[1], -(r - before[0]))
    const outward = Math.cos(from) * incoming[0] + Math.sin(from) * incoming[1] > 0 ? 1 : -1
    for (let step = 0; step <= steps; step++) {
      const angle = from + (sweep * step) / steps
      const normal: [number, number] = [outward * Math.cos(angle), outward * Math.sin(angle)]
      out.push({ r: Math.max(0, cr + Math.cos(angle) * fillet), y: cy + Math.sin(angle) * fillet, material, normal })
    }
  })
  return out
}

/** A turned part from its profile stretches. */
export function lathe(stretches: ProfileStretch[], options: LatheOptions = {}): BufferGeometry {
  const { segments = 96, crease = 0.6, filletSteps = 4, radialV, planar } = options
  const points = stretches.flatMap((stretch) => stretch.points)
  const materials = stretches.flatMap(({ points: own, material = 0 }) => own.map(() => material))
  const outline = filleted(points, materials, filletSteps).filter(
    (point, i, all) => i === 0 || Math.hypot(point.r - all[i - 1].r, point.y - all[i - 1].y) > 1e-7,
  )

  // arc length along the profile, for uv1.v
  const along = [0]
  for (let i = 1; i < outline.length; i++) along.push(along[i - 1] + Math.hypot(outline[i].r - outline[i - 1].r, outline[i].y - outline[i - 1].y))
  const total = along.at(-1) || 1

  // each segment's outward normal in the (r, y) plane (the outside is on the right of the walk);
  // at a corner, the two sides share a normal unless the corner is sharper than the crease
  const segmentNormal = (i: number) => normalize(outline[i + 1].y - outline[i].y, -(outline[i + 1].r - outline[i].r))
  const cornerNormal = (corner: number, segment: number) => {
    const exact = outline[corner].normal
    if (exact) return exact
    const own = segmentNormal(segment)
    const neighbour = corner === segment ? corner - 1 : corner
    if (neighbour < 0 || neighbour >= outline.length - 1) return own
    const other = segmentNormal(neighbour)
    if (Math.acos(clamp(own[0] * other[0] + own[1] * other[1])) > crease) return own
    return normalize(own[0] + other[0], own[1] + other[1])
  }

  const position: number[] = []
  const normal: number[] = []
  const tangent: number[] = []
  const uv: number[] = []
  const uv1: number[] = []
  const index: number[] = []
  const geometry = new BufferGeometry()
  let groupStart = 0
  let groupMaterial = outline[0]?.material ?? 0

  for (let i = 0; i < outline.length - 1; i++) {
    if (outline[i].material !== groupMaterial) {
      geometry.addGroup(groupStart, index.length - groupStart, groupMaterial)
      groupStart = index.length
      groupMaterial = outline[i].material
    }
    const base = position.length / 3
    for (const corner of [i, i + 1]) {
      const { r, y } = outline[corner]
      const n = cornerNormal(corner, i)
      for (let s = 0; s <= segments; s++) {
        const phi = (s / segments) * Math.PI * 2
        const sin = Math.sin(phi)
        const cos = Math.cos(phi)
        position.push(r * sin, y, r * cos)
        normal.push(n[0] * sin, n[1], n[0] * cos)
        tangent.push(cos, 0, -sin, 1)
        if (planar) uv.push(0.5 + (r * sin) / (2 * planar), 0.5 - (r * cos) / (2 * planar))
        else uv.push(s / segments, along[corner] / total)
        uv1.push(s / segments, radialV ? r / radialV : along[corner] / total)
      }
    }
    for (let s = 0; s < segments; s++) {
      const p = base + s
      const q = base + segments + 1 + s
      index.push(p, p + 1, q, q, p + 1, q + 1)
    }
  }
  geometry.addGroup(groupStart, index.length - groupStart, groupMaterial)
  geometry.setIndex(index)
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3))
  geometry.setAttribute('tangent', new Float32BufferAttribute(tangent, 4))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.setAttribute('uv1', new Float32BufferAttribute(uv1, 2))
  return geometry
}

/** A turned part in one material. */
export const turned = (points: ProfilePoint[], options?: LatheOptions) => lathe([{ points }], options)

/** Several copies of one part, each placed by its matrix, as one geometry: one draw call, not many. */
export function copies(part: BufferGeometry, places: Matrix4[]): BufferGeometry {
  const merged = mergeGeometries(places.map((place) => part.clone().applyMatrix4(place)))
  part.dispose()
  return merged
}

function normalize(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y) || 1
  return [x / length, y / length]
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value))
