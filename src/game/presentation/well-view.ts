import * as THREE from 'three';
import type { Grid } from '../domain/grid';
import type { Vec3 } from '../domain/vec3';
import { WELL_FRAGMENT, WELL_VERTEX } from './shaders/well.glsl';

export class WellView {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly activeCells = Array.from({ length: 4 }, () => new THREE.Vector3());
  private readonly uniforms: ReturnType<typeof createWellUniforms>;

  constructor(grid: Grid) {
    this.uniforms = createWellUniforms(grid, this.activeCells);
    this.material = new THREE.ShaderMaterial({
      vertexShader: WELL_VERTEX,
      fragmentShader: WELL_FRAGMENT,
      // Back faces only: the walls nearest the camera are culled, so the well never hides the stack.
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
    });
    const geometry = new THREE.BoxGeometry(grid.width, grid.height, grid.depth);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.y = grid.height / 2;
  }

  update(params: {
    time: number;
    fogColor: THREE.Color;
    active: readonly Vec3[] | null;
    clearingLayers: readonly number[];
    clearProgress: number;
  }): void {
    const u = this.uniforms;
    u.uTime.value = params.time;
    u.uFogColor.value.copy(params.fogColor);
    u.uHasActive.value = params.active ? 1 : 0;
    if (params.active) {
      params.active.forEach((c, i) => this.activeCells[i]?.set(c.x, c.y, c.z));
      const zs = params.active.map((c) => c.z);
      u.uActiveLayers.value.set(Math.min(...zs), Math.max(...zs));
    }
    u.uClearMask.value = params.clearingLayers.reduce((mask, z) => mask | (1 << z), 0);
    u.uClearPulse.value = Math.sin(Math.min(params.clearProgress, 1) * Math.PI);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

function createWellUniforms(grid: Grid, activeCells: THREE.Vector3[]) {
  return {
    uWellSize: { value: new THREE.Vector3(grid.width, grid.depth, grid.height) },
    uActive: { value: activeCells },
    uHasActive: { value: 0 },
    uActiveLayers: { value: new THREE.Vector2() },
    uClearMask: { value: 0 },
    uClearPulse: { value: 0 },
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color() },
    uLineColor: { value: new THREE.Color('#7fa8ff') },
    uHighlightColor: { value: new THREE.Color('#fff2c4') },
    uBaseAlpha: { value: 0.28 },
  };
}
