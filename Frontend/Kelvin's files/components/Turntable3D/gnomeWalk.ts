import { PLATTER, PLATTER_TOP, PLINTH, RECORD, RECORD_TOP, TONEARM, TOP } from './dimensions'

/*
 * Where the gnome may stand and how it gets there: it walks across the plinth's top and the record,
 * hops up onto the platter and down again at its rim, and never walks into the tonearm or the spindle.
 * Everything is in the turntable's meters, on the plinth's top (x, z).
 */

export interface Spot {
  x: number
  z: number
}

/** One leg of a trip: a walk on one surface, or a hop between the plinth and the record. */
export interface Leg {
  kind: 'walk' | 'hop'
  from: Spot
  to: Spot
  seconds: number
}

/** Walking pace (m/s), how long a hop lasts, and how far a hop carries it across the rim. */
export const WALK_SPEED = 0.05
export const HOP_SECONDS = 0.5
const HOP_REACH = 0.024
/** Room the gnome needs around it: from the plinth's edge, the tonearm, and the spindle. */
const EDGE_ROOM = 0.026
const ARM_ROOM = 0.03
const SPINDLE_ROOM = 0.036
/** The rim: a band either side of the platter's edge that is hopped over, never stood on. */
const RIM_ROOM = 0.018

/** Where it first appears: on the front of the record, facing the camera, well clear of the stylus. */
export const SPAWN: Spot = { x: PLATTER.x - 0.01, z: 0.085 }

const armTip = (angle: number, length: number): Spot => ({
  x: TONEARM.x + Math.sin(angle) * length,
  z: TONEARM.z + Math.cos(angle) * length,
})
/** The tonearm at rest and on the record (a few centimeters longer, for the headshell), and its base. */
const ARM_SEGMENTS: [Spot, Spot][] = [
  [armTip(TONEARM.restAngle, -0.07), armTip(TONEARM.restAngle, TONEARM.length + 0.02)],
  [armTip(TONEARM.playAngle, -0.07), armTip(TONEARM.playAngle, TONEARM.length + 0.02)],
]
const ARM_BASE = 0.034

function distanceToSegment(p: Spot, [a, b]: [Spot, Spot]) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

const fromSpindle = (p: Spot) => Math.hypot(p.x - PLATTER.x, p.z - PLATTER.z)

/** Whether it's standing on the platter (and so on the record), rather than the plinth. */
export const onDisc = (p: Spot) => fromSpindle(p) <= PLATTER.radius

/** How high the surface under this spot is: the record, the platter's rim, or the plinth. */
export function groundAt(p: Spot) {
  const r = fromSpindle(p)
  if (r <= RECORD.radius) return RECORD_TOP
  if (r <= PLATTER.radius) return PLATTER_TOP
  return TOP
}

/** Somewhere it can pass through: on the plinth, clear of the tonearm and the spindle. */
function passable(p: Spot) {
  if (Math.abs(p.x) > PLINTH.width / 2 - EDGE_ROOM || Math.abs(p.z) > PLINTH.depth / 2 - EDGE_ROOM) return false
  if (fromSpindle(p) < SPINDLE_ROOM) return false
  if (Math.hypot(p.x - TONEARM.x, p.z - TONEARM.z) < ARM_BASE + ARM_ROOM) return false
  return ARM_SEGMENTS.every((segment) => distanceToSegment(p, segment) > ARM_ROOM)
}

/** Somewhere it can stop: passable, and not on the rim. */
function standable(p: Spot) {
  return passable(p) && Math.abs(fromSpindle(p) - PLATTER.radius) > RIM_ROOM
}

const lerp = (a: Spot, b: Spot, t: number): Spot => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
const distance = (a: Spot, b: Spot) => Math.hypot(b.x - a.x, b.z - a.z)

/**
 * The legs of a straight trip from `from` to `to`, hopping wherever it crosses the platter's rim,
 * or null if the way is blocked (the tonearm or the spindle is in it, or it would land on the rim).
 */
export function planTrip(from: Spot, to: Spot): Leg[] | null {
  const length = distance(from, to)
  if (length < 0.02 || !standable(to)) return null
  const steps = Math.ceil(length / 0.004)
  for (let i = 1; i <= steps; i++) if (!passable(lerp(from, to, i / steps))) return null

  // where the trip crosses the rim: between samples on either side, then refined by halving
  const crossings: number[] = []
  for (let i = 1; i <= steps; i++) {
    let low = (i - 1) / steps
    let high = i / steps
    if (onDisc(lerp(from, to, low)) === onDisc(lerp(from, to, high))) continue
    for (let n = 0; n < 12; n++) {
      const mid = (low + high) / 2
      if (onDisc(lerp(from, to, mid)) === onDisc(lerp(from, to, low))) low = mid
      else high = mid
    }
    crossings.push(low)
  }

  const reach = HOP_REACH / length
  const legs: Leg[] = []
  let at = 0
  for (const crossing of crossings) {
    const takeOff = crossing - reach
    const landing = crossing + reach
    if (takeOff <= at || landing >= 1) return null // too close to a start, the end, or the last hop
    const start = lerp(from, to, at)
    const edge = lerp(from, to, takeOff)
    legs.push({ kind: 'walk', from: start, to: edge, seconds: distance(start, edge) / WALK_SPEED })
    legs.push({ kind: 'hop', from: edge, to: lerp(from, to, landing), seconds: HOP_SECONDS })
    at = landing
  }
  const start = lerp(from, to, at)
  legs.push({ kind: 'walk', from: start, to, seconds: distance(start, to) / WALK_SPEED })
  return legs
}

/**
 * A trip somewhere new, chosen at random: about half the time onto (or around) the record, otherwise
 * around the plinth. Null if nothing reachable turned up this time (try again after a pause).
 */
export function wander(from: Spot, random = Math.random): Leg[] | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    let to: Spot
    if (random() < 0.55) {
      const angle = random() * Math.PI * 2
      const r = SPINDLE_ROOM + 0.01 + random() * (RECORD.radius - RIM_ROOM - SPINDLE_ROOM - 0.01)
      to = { x: PLATTER.x + Math.cos(angle) * r, z: PLATTER.z + Math.sin(angle) * r }
    } else {
      to = { x: (random() - 0.5) * PLINTH.width, z: (random() - 0.5) * PLINTH.depth }
    }
    // no marathons: at most a hand's width or so at a time
    if (distance(from, to) > 0.2) to = lerp(from, to, 0.2 / distance(from, to))
    const legs = planTrip(from, to)
    if (legs) return legs
  }
  return null
}
