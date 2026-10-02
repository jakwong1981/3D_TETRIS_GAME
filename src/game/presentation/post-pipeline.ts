import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { GRADE_SHADER } from './shaders/effects.glsl';

/**
 * Linear HDR → bloom (threshold + mip-chain Gaussian) → OutputPass (ACES tone map + sRGB encode, once)
 * → FXAA → vignette/grain. Custom materials therefore output linear colour and never gamma-encode.
 * Low-FX mode keeps only the render and output passes so colour stays correct.
 */
export class PostPipeline {
  private readonly composer: EffectComposer;
  private readonly fxaa: ShaderPass | null = null;
  private readonly grade: ShaderPass | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    lowFx: boolean,
  ) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (!lowFx) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.4, 0.92));
    this.composer.addPass(new OutputPass());
    if (lowFx) return;
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    this.grade = new ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.grade);
  }

  resize(width: number, height: number): void {
    const ratio = this.renderer.getPixelRatio();
    this.composer.setSize(width, height);
    const resolution = this.fxaa?.material.uniforms.resolution?.value as THREE.Vector2 | undefined;
    resolution?.set(1 / (width * ratio), 1 / (height * ratio));
  }

  render(time: number): void {
    const timeUniform = this.grade?.uniforms.uTime;
    if (timeUniform) timeUniform.value = time;
    this.composer.render();
  }
}
