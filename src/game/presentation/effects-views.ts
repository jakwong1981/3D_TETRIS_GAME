import * as THREE from 'three';
import { TUNING } from '../config/tuning';
import { GHOST_FRAGMENT, GHOST_VERTEX, PARTICLE_FRAGMENT, PARTICLE_VERTEX } from './shaders/effects.glsl';

export class GhostView {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly matrix = new THREE.Matrix4();
  private readonly uniforms = { uColor: { value: new THREE.Color() }, uTime: { value: 0 } };

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: GHOST_VERTEX,
      fragmentShader: GHOST_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.uniforms,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.98, 0.98), this.material, 4);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  update(positions: readonly THREE.Vector3[], color: string, time: number): void {
    positions.forEach((p, i) => this.mesh.setMatrixAt(i, this.matrix.makeTranslation(p)));
    this.mesh.count = positions.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.uniforms.uColor.value.set(color);
    this.uniforms.uTime.value = time;
  }
}

const PARTICLE_CAPACITY = 4096;

/** Ring buffer of GPU particles; spawning writes a slice once, the vertex shader does the rest. */
export class ParticleBursts {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions = new THREE.BufferAttribute(new Float32Array(PARTICLE_CAPACITY * 3), 3);
  private readonly velocities = new THREE.BufferAttribute(new Float32Array(PARTICLE_CAPACITY * 3), 3);
  private readonly colors = new THREE.BufferAttribute(new Float32Array(PARTICLE_CAPACITY * 3), 3);
  private readonly starts = new THREE.BufferAttribute(new Float32Array(PARTICLE_CAPACITY).fill(-1000), 1);
  private cursor = 0;
  private readonly color = new THREE.Color();
  private readonly time = { value: 0 };

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('aVelocity', this.velocities);
    geometry.setAttribute('aColor', this.colors);
    geometry.setAttribute('aStart', this.starts);
    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: this.time,
        uGravity: { value: TUNING.particleGravity },
        uDrag: { value: TUNING.particleDrag },
        uLife: { value: TUNING.particleLife },
        uFloorY: { value: 0.05 },
        uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
      },
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  burst(
    origin: THREE.Vector3,
    color: string,
    count: number,
    speed: number,
    time: number,
    random: () => number,
  ): void {
    this.color.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % PARTICLE_CAPACITY;
      const theta = random() * Math.PI * 2;
      const up = random() * 0.8 + 0.2;
      const s = speed * (0.4 + random() * 0.6);
      this.positions.setXYZ(
        i,
        origin.x + random() - 0.5,
        origin.y + random() - 0.5,
        origin.z + random() - 0.5,
      );
      this.velocities.setXYZ(i, Math.cos(theta) * s, up * s * 1.2, Math.sin(theta) * s);
      this.colors.setXYZ(i, this.color.r, this.color.g, this.color.b);
      this.starts.setX(i, time);
    }
    for (const attribute of [this.positions, this.velocities, this.colors, this.starts])
      attribute.needsUpdate = true;
  }

  update(time: number): void {
    this.time.value = time;
  }
}
