import * as THREE from 'three';
import { TUNING } from '../config/tuning';

/**
 * Cosmetic physics, stepped in fixedUpdate so the feel is identical at 30 or 144 fps.
 * Squash is a damped spring a = −k·x − c·v (semi-implicit Euler); damping ratio ζ = c / (2√k) ≈ 0.52,
 * so the jelly overshoots once or twice and settles. Shake amplitude decays as A·e^(−λt).
 */
export class FeedbackMotion {
  squash = 0;
  private squashVelocity = 0;
  private shakeAmplitude = 0;
  private shakeTime = 0;
  readonly shakeOffset = new THREE.Vector3();

  kickSquash(strength: number): void {
    this.squashVelocity += TUNING.squashImpulse * strength;
  }

  kickShake(strength: number): void {
    this.shakeAmplitude = Math.max(this.shakeAmplitude, TUNING.shakeAmplitude * strength);
  }

  reset(): void {
    this.squash = 0;
    this.squashVelocity = 0;
    this.shakeAmplitude = 0;
    this.shakeOffset.set(0, 0, 0);
  }

  fixedUpdate(dt: number): void {
    const acceleration = -TUNING.squashStiffness * this.squash - TUNING.squashDamping * this.squashVelocity;
    this.squashVelocity += acceleration * dt;
    this.squash += this.squashVelocity * dt;

    this.shakeTime += dt;
    this.shakeAmplitude *= Math.exp(-TUNING.shakeDecay * dt);
    const a = this.shakeAmplitude;
    const t = this.shakeTime * 45;
    this.shakeOffset.set(Math.sin(t * 1.3) * a, Math.sin(t * 1.7 + 1.1) * a, Math.sin(t * 1.1 + 2.3) * a);
  }
}
