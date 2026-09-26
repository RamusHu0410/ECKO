/*
 * The turntable's measurements, in meters, so every part lines up. The plinth stands on the floor
 * (y = 0) with its front facing +z; the camera looks at it from the front, a little to the right.
 */

export const PLINTH = { width: 0.5, height: 0.07, depth: 0.36, radius: 0.012 }
export const FOOT = { radius: 0.022, height: 0.012, inset: 0.05 }
/** Height of the plinth's top surface. */
export const TOP = FOOT.height + PLINTH.height

/** A 12-inch record on a mat on a brushed-aluminum platter, left of center. */
export const PLATTER = { x: -0.07, z: 0, radius: 0.156, height: 0.018, lift: 0.004 }
export const MAT = { radius: 0.15, height: 0.003 }
export const RECORD = { radius: 0.1475, height: 0.0018 }
export const PLATTER_TOP = TOP + PLATTER.lift + PLATTER.height
export const RECORD_TOP = PLATTER_TOP + MAT.height + RECORD.height

/**
 * The tonearm pivots at the back-right. At rest it points to the front; swung 35° it puts the
 * stylus on the record's outer grooves (the same angle the CSS turntable uses).
 */
export const TONEARM = {
  x: 0.175,
  z: -0.115,
  length: 0.23,
  height: RECORD_TOP + 0.016,
  restAngle: 0,
  playAngle: (-35 * Math.PI) / 180,
}

/** HUM and TALK: push buttons on the front of the plinth, at the left, each with an LED above it. */
export const KEY = { width: 0.072, height: 0.03, depth: 0.012, travel: 0.004, gap: 0.014, left: -0.21 }
export const KEY_Y = FOOT.height + PLINTH.height * 0.4
export const LED_Y = FOOT.height + PLINTH.height * 0.84
