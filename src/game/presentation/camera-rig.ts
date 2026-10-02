import * as THREE from 'three';
import { TUNING } from '../config/tuning';

const QUARTER = Math.PI / 2;

/**
 * Game camera, not a model viewer: drag orbits with clamped pitch, Q/E snap a quarter turn.
 * Smoothing is exponential, x ← x + (target − x)(1 − e^(−dt/τ)), so it is frame-rate independent.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = QUARTER * 0.5;
  private pitch = 0.75;
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

  frameWell(width: number, height: number): void {
    // Far enough that the spawn zone at the top of the well stays in frame at max pitch.
    this.distance = Math.max(width * 1.95, height * 1.4);
    this.focusY = height * 0.3;
  }

  snap(direction: 1 | -1): void {
    this.targetYaw = (Math.round(this.targetYaw / QUARTER - 0.5) + 0.5 + direction) * QUARTER;
  }

  get currentYaw(): number {
    return this.yaw;
  }

  /** Index 0..3 of the quarter the camera is looking from; used to make arrow keys screen-relative. */
  get quadrant(): number {
    // Snap angles sit on diagonals (two walls visible); floor() picks one axis consistently.
    const q = Math.floor(this.yaw / QUARTER);
    return ((q % 4) + 4) % 4;
  }

  /**
   * Maps a screen-space push (right = +1, away = +1) to a grid step. At yaw = 0 the camera sits
   * on +Z looking −Z, so screen right is +x and "away" is −y in grid terms.
   */
  screenToGrid(right: number, away: number): { dx: number; dy: number } {
    const yaw = this.quadrant * QUARTER;
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    return {
      dx: Math.round(right * rx + away * fx),
      dy: Math.round(right * rz + away * fz),
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
