import * as THREE from 'three';
import { MATERIAL_IDS, PIECE_DEFINITIONS, PIECE_KINDS } from '../domain/tetracube';
import { CUBE_FRAGMENT, CUBE_VERTEX } from './shaders/cube.glsl';

const PREFILL_COLOR = new THREE.Color('#8a93a6');

export interface CubeInstance {
  position: THREE.Vector3;
  cellValue: number;
  clearing: boolean;
  recent: boolean;
}

export interface CubeSharedUniforms {
  uSceneColor: THREE.IUniform<THREE.Texture | null>;
  uResolution: THREE.IUniform<THREE.Vector2>;
  uEnv: THREE.IUniform<THREE.Texture | null>;
  uEnvMaxLod: THREE.IUniform<number>;
  uLightDir: THREE.IUniform<THREE.Vector3>;
  uLightColor: THREE.IUniform<THREE.Color>;
  uAmbient: THREE.IUniform<THREE.Color>;
  uTime: THREE.IUniform<number>;
  uClearT: THREE.IUniform<number>;
  uSquash: THREE.IUniform<number>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogFar: THREE.IUniform<number>;
}

export function createCubeSharedUniforms(): CubeSharedUniforms {
  return {
    uSceneColor: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uEnv: { value: null },
    uEnvMaxLod: { value: 8 },
    uLightDir: { value: new THREE.Vector3(0.5, 1, 0.35).normalize() },
    uLightColor: { value: new THREE.Color(1.0, 0.92, 0.82).multiplyScalar(2.6) },
    uAmbient: { value: new THREE.Color(0.18, 0.22, 0.32) },
    uTime: { value: 0 },
    uClearT: { value: 0 },
    uSquash: { value: 0 },
    uFogColor: { value: new THREE.Color() },
    uFogFar: { value: 60 },
  };
}

/**
 * All cubes of one role (stack or falling piece) share one InstancedMesh: a full 5×5×15 well
 * is 375 instances in a single draw call. Material choice is a per-instance attribute.
 */
export class CubeInstances {
  readonly mesh: THREE.InstancedMesh;
  private readonly colors: THREE.InstancedBufferAttribute;
  private readonly materials: THREE.InstancedBufferAttribute;
  private readonly clearing: THREE.InstancedBufferAttribute;
  private readonly recent: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor(capacity: number, shared: CubeSharedUniforms, rim: number, opacity = 1) {
    const geometry = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.materials = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.clearing = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.recent = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    geometry.setAttribute('aColor', this.colors);
    geometry.setAttribute('aMaterial', this.materials);
    geometry.setAttribute('aClearing', this.clearing);
    geometry.setAttribute('aRecent', this.recent);
    const material = new THREE.ShaderMaterial({
      vertexShader: CUBE_VERTEX,
      fragmentShader: CUBE_FRAGMENT,
      uniforms: { ...shared, uRim: { value: rim }, uOpacity: { value: opacity } },
      transparent: opacity < 1,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  setInstances(instances: readonly CubeInstance[]): void {
    instances.forEach((instance, i) => {
      this.matrix.makeTranslation(instance.position);
      this.mesh.setMatrixAt(i, this.matrix);
      const { color, material } = appearanceFor(instance.cellValue, this.color);
      this.colors.setXYZ(i, color.r, color.g, color.b);
      this.materials.setX(i, material);
      this.clearing.setX(i, instance.clearing ? 1 : 0);
      this.recent.setX(i, instance.recent ? 1 : 0);
    });
    this.mesh.count = instances.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const attribute of [this.colors, this.materials, this.clearing, this.recent])
      attribute.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

function appearanceFor(cellValue: number, target: THREE.Color): { color: THREE.Color; material: number } {
  const kind = PIECE_KINDS[cellValue - 1];
  if (!kind) return { color: target.copy(PREFILL_COLOR), material: MATERIAL_IDS.metal };
  const definition = PIECE_DEFINITIONS[kind];
  return { color: target.set(definition.color), material: MATERIAL_IDS[definition.material] };
}
