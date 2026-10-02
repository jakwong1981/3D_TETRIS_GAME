import * as THREE from 'three';
import type { Grid } from '../domain/grid';

/** Grid (x, y, z = height) → world (X, Y-up, Z). One unit = one cell = one metre. */
export function cellToWorld(
  x: number,
  y: number,
  z: number,
  grid: Grid,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(x - grid.width / 2 + 0.5, z + 0.5, y - grid.depth / 2 + 0.5);
}
