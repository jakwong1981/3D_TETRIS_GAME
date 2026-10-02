import * as THREE from 'three';
import type { ActivePiece } from '../domain/active-piece';
import { PIECE_DEFINITIONS, type MaterialKind } from '../domain/tetracube';

const VIEW_DISTANCE = 7;

const SURFACE: Readonly<Record<MaterialKind, { metalness: number; roughness: number }>> = {
  glass: { metalness: 0.1, roughness: 0.1 },
  metal: { metalness: 0.75, roughness: 0.3 },
  jelly: { metalness: 0.0, roughness: 0.4 },
};

/**
 * Close-up of the falling piece in the HUD. It uses its own small canvas (the HUD panel sits on
 * top of the main canvas, so drawing there would be hidden) and copies the main camera's
 * orientation, so every A/S/Z (X/Y/Z-axis) turn and every Q/E or drag orbit shows up exactly as in the well.
 */
export class PiecePreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  private readonly group = new THREE.Group();
  private readonly geometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);
  private readonly edges = new THREE.EdgesGeometry(this.geometry);
  private readonly material = new THREE.MeshStandardMaterial();
  private readonly edgeMaterial = new THREE.LineBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.55,
  });
  private readonly forward = new THREE.Vector3();
  private shapeKey = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const key = new THREE.DirectionalLight('#ffe8d0', 2.6);
    key.position.set(4, 8, 5);
    this.scene.add(key, new THREE.HemisphereLight('#b8c8ff', '#302030', 1.1), this.group);
  }

  render(piece: ActivePiece | null, mainCamera: THREE.Camera): void {
    if (this.canvas.offsetParent === null) return;
    this.resize();
    if (!piece) {
      this.group.visible = false;
    } else {
      this.group.visible = true;
      this.syncShape(piece);
    }
    mainCamera.getWorldDirection(this.forward);
    this.camera.quaternion.copy(mainCamera.quaternion);
    this.camera.position.copy(this.forward).multiplyScalar(-VIEW_DISTANCE);
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x === width && size.y === height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Rebuilt only when the cell layout changes (spawn, rotation, hold), not on moves or falls. */
  private syncShape(piece: ActivePiece): void {
    const key = `${piece.kind}:${piece.localCells.map((c) => `${c.x},${c.y},${c.z}`).join('|')}`;
    if (key === this.shapeKey) return;
    this.shapeKey = key;

    const definition = PIECE_DEFINITIONS[piece.kind];
    this.material.color.set(definition.color);
    this.material.metalness = SURFACE[definition.material].metalness;
    this.material.roughness = SURFACE[definition.material].roughness;
    this.material.emissive.set(definition.color).multiplyScalar(0.2);

    this.group.clear();
    // Same axis mapping as the well: grid (x, y, z = height) → world (X, Z, Y), centred on the piece.
    const positions = piece.localCells.map((c) => new THREE.Vector3(c.x, c.z, c.y));
    const center = positions
      .reduce((sum, p) => sum.add(p), new THREE.Vector3())
      .divideScalar(positions.length);
    for (const p of positions) {
      const cube = new THREE.Mesh(this.geometry, this.material);
      cube.position.copy(p).sub(center);
      cube.add(new THREE.LineSegments(this.edges, this.edgeMaterial));
      this.group.add(cube);
    }
  }
}
