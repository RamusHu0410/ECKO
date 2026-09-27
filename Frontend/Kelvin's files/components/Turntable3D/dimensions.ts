/*
 * The turntable's measurements, in meters, so every part lines up. The plinth stands on the floor
 * (y = 0) with its front facing +z; the camera looks at it from the front, a little to the right.
 * gnomeWalk.ts reads the plinth, platter, record and tonearm from here, so the gnome keeps to them.
 */

/** A solid walnut block with small, crisp rounded edges. */
export const PLINTH = { width: 0.5, height: 0.07, depth: 0.36, radius: 0.0025 }
/** Four turned feet, each with a rubber pad under it. */
export const FOOT = { radius: 0.019, height: 0.012, inset: 0.05, pad: 0.0018 }
/** Height of the plinth's top surface. */
export const TOP = FOOT.height + PLINTH.height
/** The plinth's front face, where the HUM button and the speed knob sit. */
export const FRONT = PLINTH.depth / 2
/** Halfway up the front face: the height of the button and the knob. */
export const CONTROL_Y = FOOT.height + PLINTH.height / 2

/** A 12-inch record on a felt mat on a machined-aluminum platter, left of center. */
export const PLATTER = { x: -0.07, z: 0, radius: 0.156, height: 0.018, lift: 0.004 }
export const MAT = { radius: 0.15, height: 0.003 }
export const RECORD = { radius: 0.1475, height: 0.0018 }
export const PLATTER_TOP = TOP + PLATTER.lift + PLATTER.height
export const RECORD_TOP = PLATTER_TOP + MAT.height + RECORD.height

/**
 * The record's face, as fractions of its radius: the same bands drawVinyl.ts draws (grooves, the
 * smooth gaps between tracks, the lip) and the spindle hole of discGeometry.ts. The label's size is
 * the --vinyl-label-size token. Past the lip, a slightly raised rim; the label area is a hair thicker.
 */
export const VINYL = { inner: 0.37, outer: 0.955, gaps: [0.58, 0.77], lip: 0.972, hole: 0.026, rim: 0.0003, label: 0.00015 }
/** The chrome spindle, standing this far above the record. */
export const SPINDLE = { radius: 0.0036, height: 0.0135 }

/**
 * The tonearm pivots at the back-right. At rest it points to the front; swung 35° it puts the
 * stylus on the record's outer grooves (the same angle the CSS turntable uses). `height` is the
 * arm tube's axis: with the arm lowered, the stylus just touches the record.
 */
export const TONEARM = {
  x: 0.175,
  z: -0.115,
  length: 0.23,
  height: RECORD_TOP + 0.0205,
  restAngle: 0,
  playAngle: (-35 * Math.PI) / 180,
}

/** HUM: a stadium-shaped push button set into the front of the plinth, at the left, with an LED to its right. */
export const KEY = { x: -0.178, width: 0.046, height: 0.016, depth: 0.009, travel: 0.0028, proud: 0.0008, ledGap: 0.011 }
/** The 33/45 speed knob at the right of the front, and the power light beside it. */
export const SPEED = { x: 0.19, radius: 0.0075, depth: 0.0085, ledX: 0.162 }
