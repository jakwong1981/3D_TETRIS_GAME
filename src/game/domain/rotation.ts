import { vec3, type Vec3 } from './vec3';

export type Axis = 'x' | 'y' | 'z';
export type Direction = 1 | -1;

/**
 * Integer 90° rotations. Using exact integers (cos = 0, sin = ±1) keeps cells on the grid
 * with no floating-point drift after any number of turns.
 */
export function rotateOffset(p: Vec3, axis: Axis, dir: Direction): Vec3 {
  const s = dir;
  switch (axis) {
    case 'x':
      return vec3(p.x, -s * p.z, s * p.y);
    case 'y':
      return vec3(s * p.z, p.y, -s * p.x);
    case 'z':
      return vec3(-s * p.y, s * p.x, p.z);
  }
}

/** Rotates about the pivot cell, then re-anchors so the shape keeps a stable centre. */
export function rotateCells(cells: readonly Vec3[], axis: Axis, dir: Direction, pivot: Vec3): Vec3[] {
  return cells.map((c) => {
    const r = rotateOffset(vec3(c.x - pivot.x, c.y - pivot.y, c.z - pivot.z), axis, dir);
    return vec3(r.x + pivot.x, r.y + pivot.y, r.z + pivot.z);
  });
}

/** Tried in order after a rotation collides; up-kick last so floor kicks don't feel like cheating. */
export const KICK_OFFSETS: readonly Vec3[] = [
  vec3(0, 0, 0),
  vec3(1, 0, 0),
  vec3(-1, 0, 0),
  vec3(0, 1, 0),
  vec3(0, -1, 0),
  vec3(2, 0, 0),
  vec3(-2, 0, 0),
  vec3(0, 2, 0),
  vec3(0, -2, 0),
  vec3(0, 0, 1),
];

export interface Turn {
  axis: Axis;
  dir: Direction;
}

/**
 * "Vertical" turn as seen by the player: rotate about the grid axis that runs left↔right on screen,
 * in the direction that tips the piece's top away from the viewer (up → away).
 * `right` and `away` are perpendicular unit grid steps in the floor plane.
 */
export function tipAwayTurn(right: { dx: number; dy: number }, away: { dx: number; dy: number }): Turn {
  const axis: Axis = right.dx !== 0 ? 'x' : 'y';
  const up = vec3(0, 0, 1);
  const tipped = rotateOffset(up, axis, 1);
  const matches = tipped.x === away.dx && tipped.y === away.dy;
  return { axis, dir: matches ? 1 : -1 };
}

/** "Horizontal" turn: a quarter spin about the vertical (grid z) axis. */
export const SPIN_TURN: Turn = { axis: 'z', dir: 1 };

/**
 * 2D board turns, seen from the front (screen right = +x, up = +z, viewer on +y): rotating about
 * grid y with s = +1 sends the top cell (0,0,1) to (1,0,0), i.e. clockwise.
 */
export const PLANAR_CLOCKWISE: Turn = { axis: 'y', dir: 1 };
export const PLANAR_COUNTER_CLOCKWISE: Turn = { axis: 'y', dir: -1 };
