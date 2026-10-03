import * as THREE from 'three';
import { TUNING } from '../config/tuning';

const QUARTER = Math.PI / 2;
/**
 * Snap views sit ≈20° off a wall instead of on the 45° diagonal. Two walls stay visible, but one
 * grid axis clearly runs left↔right on screen, so arrow keys never move the piece diagonally.
 */
const VIEW_OFFSET = 0.22;
const DEFAULT_PITCH = 0.75;
/** 2D view: almost straight on, tilted just enough that cube tops read as 3D blocks. */
const PLANAR_PITCH = 0.08;
const PLANAR_MARGIN = 1.6;

export interface GridDir {
  dx: number;
  dy: number;
}

/** Screen-relative control frame derived from the live camera yaw. */
export interface ControlFrame {
  right: GridDir;
  away: GridDir;
}

const GRID_DIRS: readonly GridDir[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

function bestAligned(dirs: readonly GridDir[], x: number, y: number): GridDir {
  let best = dirs[0] ?? { dx: 1, dy: 0 };
  for (const d of dirs) if (d.dx * x + d.dy * y > best.dx * x + best.dy * y) best = d;
  return best;
}

/**
 * Game camera, not a model viewer: drag orbits with clamped pitch, Q/E snap a quarter turn.
 * Smoothing is exponential, x ← x + (target − x)(1 − e^(−dt/τ)), so it is frame-rate independent.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private planar = false;
  private yaw = QUARTER * VIEW_OFFSET;
  private pitch = DEFAULT_PITCH;
  private targetYaw = this.yaw;
  private targetPitch = this.pitch;
  private distance = 14;
  private focusY = 5;
  private dragging = false;
  private lastPointer = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(TUNING.fov, 1, 0.1, 1000);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    addEventListener('pointermove', this.onPointerMove);
    addEventListener('pointerup', this.onPointerUp);
  }

  /**
   * Frames the board. 3D: orbit view that keeps the spawn zone in frame at max pitch.
   * 2D: locked straight-on view of the front, with the whole board height (plus a margin) inside
   * the vertical field of view: distance = (H/2 + margin) / tan(fov/2).
   */
  frameWell(width: number, height: number, planar = false): void {
    const leavingPlanar = this.planar && !planar;
    this.planar = planar;
    if (planar) {
      const halfFov = THREE.MathUtils.degToRad(TUNING.fov / 2);
      this.distance = (height / 2 + PLANAR_MARGIN) / Math.tan(halfFov);
      this.focusY = height / 2;
      this.yaw = this.targetYaw = 0;
      this.pitch = this.targetPitch = PLANAR_PITCH;
      return;
    }
    this.distance = Math.max(width * 1.95, height * 1.4);
    this.focusY = height * 0.3;
    if (leavingPlanar) {
      this.yaw = this.targetYaw = QUARTER * VIEW_OFFSET;
      this.pitch = this.targetPitch = DEFAULT_PITCH;
    }
  }

  get isPlanar(): boolean {
    return this.planar;
  }

  snap(direction: 1 | -1): void {
    if (this.planar) return;
    const step = Math.round(this.targetYaw / QUARTER - VIEW_OFFSET) + direction;
    this.targetYaw = (step + VIEW_OFFSET) * QUARTER;
  }

  get currentYaw(): number {
    return this.yaw;
  }

  /**
   * Grid steps that look like "screen right" and "away from the viewer" from the current camera.
   * Camera at yaw θ sits at (sin θ, ·, cos θ) looking at the centre, so in grid (x, y) — world
   * (X, Z) — its right vector is (cos θ, −sin θ) and its horizontal forward is (−sin θ, −cos θ).
   * Each is snapped to the closest grid axis; "away" is taken perpendicular to "right".
   */
  controlFrame(): ControlFrame {
    const right = bestAligned(GRID_DIRS, Math.cos(this.yaw), -Math.sin(this.yaw));
    const perpendicular = GRID_DIRS.filter((d) => d.dx * right.dx + d.dy * right.dy === 0);
    const away = bestAligned(perpendicular, -Math.sin(this.yaw), -Math.cos(this.yaw));
    return { right, away };
  }

  /** Maps a screen-space push (right = ±1, away = ±1) to one grid step. */
  screenToGrid(right: number, away: number): GridDir {
    const frame = this.controlFrame();
    // `+ 0` turns −0 into 0 so callers can compare steps with ===.
    return {
      dx: right * frame.right.dx + away * frame.away.dx + 0,
      dy: right * frame.right.dy + away * frame.away.dy + 0,
    };
  }

  fixedUpdate(dt: number): void {
    const k = 1 - Math.exp(-dt / TUNING.camLag);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
  }

  render(shake: THREE.Vector3): void {
    const r = this.distance;
    this.camera.position.set(
      r * Math.cos(this.pitch) * Math.sin(this.yaw),
      this.focusY + r * Math.sin(this.pitch),
      r * Math.cos(this.pitch) * Math.cos(this.yaw),
    );
    this.camera.position.add(shake);
    this.camera.lookAt(shake.x * 0.5, this.focusY + shake.y * 0.5, shake.z * 0.5);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    removeEventListener('pointermove', this.onPointerMove);
    removeEventListener('pointerup', this.onPointerUp);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.planar) return; // 2D view is locked
    this.dragging = true;
    this.lastPointer.set(e.clientX, e.clientY);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer.set(e.clientX, e.clientY);
    this.targetYaw -= dx * TUNING.camDragSens;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch + dy * TUNING.camDragSens,
      TUNING.camPitchMin,
      TUNING.camPitchMax,
    );
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };
}
