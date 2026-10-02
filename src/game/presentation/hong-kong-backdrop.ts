import * as THREE from 'three';
import type { RandomSource } from '../domain/random';
import {
  BACKGROUND_IMAGES,
  RANDOM_BACKDROP,
  type BackdropChoice,
  type BackgroundImage,
} from './background-images';
import {
  HK_BACKDROP_FRAGMENT,
  HK_BACKDROP_VERTEX,
  HK_HORIZON_COLORS,
  HK_PRESETS,
} from './shaders/hong-kong-backdrop.glsl';
import {
  PHOTO_DOME_FRAGMENT,
  PHOTO_DOME_VERTEX,
  PHOTO_SCREEN_FRAGMENT,
  PHOTO_SCREEN_VERTEX,
} from './shaders/photo-backdrop.glsl';

const TYPHOON_PRESET = 4;
const TYPHOON_CHANCE = 0.05;
const ENV_SIZE = 256;
const PHOTO_EXPOSURE = 1.0;
const PHOTO_PAN_PER_RADIAN = 0.03;

/**
 * Backdrop + reflection source. Two modes:
 * - photo: a user image drawn full-screen, and wrapped on a dome only to bake reflections;
 * - procedural: the Hong Kong sky-dome shader, used for both.
 * Reflections are baked into one cube render target that every cube material samples.
 */
export class HongKongBackdrop {
  readonly mesh: THREE.Mesh;
  readonly photoMesh: THREE.Mesh;
  readonly envTarget: THREE.WebGLCubeRenderTarget;
  readonly fogColor = new THREE.Color();
  presetName = '';

  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms = {
    uPreset: { value: 0 },
    uSeed: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uDim: { value: 1.1 },
    uDesat: { value: -0.45 },
    uSunDir: { value: new THREE.Vector3(0.6, 0.12, -0.8).normalize() },
  };
  private readonly photoUniforms = {
    uImage: { value: null as THREE.Texture | null },
    uImageAspect: { value: 16 / 9 },
    uScreenAspect: { value: 16 / 9 },
    uPan: { value: 0 },
    uExposure: { value: PHOTO_EXPOSURE },
  };
  private readonly photoDomeMaterial: THREE.ShaderMaterial;
  private readonly envScene = new THREE.Scene();
  private readonly envCamera: THREE.CubeCamera;
  private readonly envMesh: THREE.Mesh;
  private readonly loader = new THREE.TextureLoader();
  private readonly textures = new Map<string, Promise<THREE.Texture>>();
  private flash = 0;
  private envDirty = true;
  private photoRequest = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: HK_BACKDROP_VERTEX,
      fragmentShader: HK_BACKDROP_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.uniforms,
    });
    const geometry = new THREE.SphereGeometry(400, 64, 32);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;

    this.photoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: PHOTO_SCREEN_VERTEX,
        fragmentShader: PHOTO_SCREEN_FRAGMENT,
        uniforms: this.photoUniforms,
        depthWrite: false,
      }),
    );
    this.photoMesh.renderOrder = -1;
    this.photoMesh.frustumCulled = false;
    this.photoMesh.visible = false;

    this.photoDomeMaterial = new THREE.ShaderMaterial({
      vertexShader: PHOTO_DOME_VERTEX,
      fragmentShader: PHOTO_DOME_FRAGMENT,
      uniforms: this.photoUniforms,
      side: THREE.BackSide,
    });
    this.envTarget = new THREE.WebGLCubeRenderTarget(ENV_SIZE, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.envCamera = new THREE.CubeCamera(1, 1000, this.envTarget);
    this.envMesh = new THREE.Mesh(geometry, this.material);
    this.envScene.add(this.envMesh);
  }

  get envMaxLod(): number {
    return Math.log2(ENV_SIZE);
  }

  /**
   * Shows the chosen backdrop. 'random' picks uniformly among every photo plus the procedural
   * skyline; 'hong-kong' is the procedural skyline (random preset); anything else is a photo id.
   */
  apply(choice: BackdropChoice, random: RandomSource): void {
    if (choice === RANDOM_BACKDROP) {
      const index = Math.floor(random() * (BACKGROUND_IMAGES.length + 1));
      const image = BACKGROUND_IMAGES[index];
      if (image) this.showPhoto(image);
      else this.showProcedural(random);
      return;
    }
    const image = BACKGROUND_IMAGES.find((candidate) => candidate.id === choice);
    if (image) this.showPhoto(image);
    else this.showProcedural(random);
  }

  /** Keeps the photo "cover"-fitted and pans it slightly as the camera orbits. */
  setView(screenAspect: number, cameraYaw: number): void {
    this.photoUniforms.uScreenAspect.value = screenAspect;
    this.photoUniforms.uPan.value = -cameraYaw * PHOTO_PAN_PER_RADIAN;
  }

  /** Lightning only exists in the typhoon preset; it also brightens the scene's key light. */
  update(time: number, dt: number, random: RandomSource): number {
    this.uniforms.uTime.value = time;
    const typhoon = this.mesh.visible && this.uniforms.uPreset.value === TYPHOON_PRESET;
    if (typhoon && random() < dt * 0.25) this.flash = 1;
    this.flash *= Math.exp(-dt * 6);
    this.uniforms.uFlash.value = this.flash;
    return this.flash;
  }

  /** Reflections are baked only when the backdrop changes; animated detail is too small to matter in them. */
  updateEnvironment(renderer: THREE.WebGLRenderer): void {
    if (!this.envDirty) return;
    this.envCamera.update(renderer, this.envScene);
    this.envDirty = false;
  }

  private showProcedural(random: RandomSource): void {
    const preset = random() < TYPHOON_CHANCE ? TYPHOON_PRESET : Math.floor(random() * TYPHOON_PRESET);
    this.uniforms.uPreset.value = preset;
    this.uniforms.uSeed.value = random() * 100;
    this.presetName = HK_PRESETS[preset] ?? HK_PRESETS[0];
    const [r, g, b] = HK_HORIZON_COLORS[preset] ?? [0, 0, 0];
    // Darker than the backdrop horizon so the wall grid stays readable as it fades.
    this.fogColor.setRGB(r, g, b).multiplyScalar(0.55);
    this.setMode('procedural');
  }

  private showPhoto(image: BackgroundImage): void {
    this.presetName = image.name;
    const request = ++this.photoRequest;
    void this.loadTexture(image.url).then((texture) => {
      if (request !== this.photoRequest) return;
      const source = texture.image as HTMLImageElement;
      this.photoUniforms.uImage.value = texture;
      this.photoUniforms.uImageAspect.value = source.width / source.height;
      averageColor(source, this.fogColor);
      this.fogColor.multiplyScalar(0.6);
      this.setMode('photo');
    });
  }

  private setMode(mode: 'photo' | 'procedural'): void {
    const photo = mode === 'photo';
    this.photoMesh.visible = photo;
    this.mesh.visible = !photo;
    this.envMesh.material = photo ? this.photoDomeMaterial : this.material;
    this.envDirty = true;
  }

  private loadTexture(url: string): Promise<THREE.Texture> {
    const cached = this.textures.get(url);
    if (cached) return cached;
    const pending = this.loader.loadAsync(url).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.MirroredRepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    });
    this.textures.set(url, pending);
    return pending;
  }
}

/** Downsamples the image to 1×1 on a canvas: the browser's box filter gives the mean colour. */
function averageColor(image: HTMLImageElement, target: THREE.Color): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(image, 0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  target.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}
