import * as THREE from 'three';
import type { GameSession, SessionEvent } from '../application/game-session';
import type { RandomSource } from '../domain/random';
import type { Vec3 } from '../domain/vec3';
import { PIECE_DEFINITIONS, PIECE_KINDS } from '../domain/tetracube';
import { CameraRig } from './camera-rig';
import { cellToWorld } from './coordinates';
import { CubeInstances, createCubeSharedUniforms, type CubeInstance } from './cube-instances';
import { GhostView, ParticleBursts } from './effects-views';
import { FeedbackMotion } from './feedback-motion';
import type { BackdropChoice } from './background-images';
import { HongKongBackdrop } from './hong-kong-backdrop';
import { PiecePreview } from './piece-preview';
import { PostPipeline } from './post-pipeline';
import { WellView } from './well-view';
import { TUNING } from '../config/tuning';

const MAX_WELL_SIZE = 10;
const MAX_STACK = MAX_WELL_SIZE * MAX_WELL_SIZE * TUNING.wellHeight;

/** Presentation adapter: reads session state, writes Three.js objects and uniforms. Never mutates the sim. */
export class GameRenderer {
  readonly rig: CameraRig;
  readonly backdrop = new HongKongBackdrop();
  readonly feedback = new FeedbackMotion();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly shared = createCubeSharedUniforms();
  private readonly stack = new CubeInstances(MAX_STACK, this.shared, 0);
  private readonly active = new CubeInstances(4, this.shared, 1);
  private readonly ghost = new GhostView();
  private readonly particles = new ParticleBursts();
  private readonly opaqueTarget: THREE.WebGLRenderTarget;
  private readonly post: PostPipeline;
  private readonly preview: PiecePreview;
  private well: WellView | null = null;
  private session: GameSession | null = null;
  private recentCells = new Set<string>();
  private stackDirty = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly random: RandomSource,
    previewCanvas: HTMLCanvasElement,
    lowFx: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, lowFx ? 1 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.rig = new CameraRig(canvas);
    this.opaqueTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });

    this.scene.add(
      this.backdrop.mesh,
      this.backdrop.photoMesh,
      this.stack.mesh,
      this.active.mesh,
      this.ghost.mesh,
      this.particles.points,
    );
    this.ghost.mesh.renderOrder = 2;
    this.particles.points.renderOrder = 3;

    this.shared.uSceneColor.value = this.opaqueTarget.texture;
    this.shared.uEnv.value = this.backdrop.envTarget.texture;
    this.shared.uEnvMaxLod.value = this.backdrop.envMaxLod;
    this.post = new PostPipeline(this.renderer, this.scene, this.rig.camera, lowFx);
    this.preview = new PiecePreview(previewCanvas);
    this.resize();
    addEventListener('resize', this.resize);
  }

  attach(session: GameSession, backdrop: BackdropChoice): void {
    this.session = session;
    this.well?.dispose();
    this.well = new WellView(session.grid);
    this.scene.add(this.well.mesh);
    this.rig.frameWell(session.grid.width, session.grid.height);
    // Fog distance scales with the well so a large floor isn't washed out at its far corner.
    this.shared.uFogFar.value = Math.max(60, session.grid.width * 6);
    this.backdrop.apply(backdrop, this.random);
    this.shared.uFogColor.value.copy(this.backdrop.fogColor);
    this.recentCells.clear();
    this.feedback.reset();
    this.stackDirty = true;
    session.onEvent(this.onSessionEvent);
  }

  get presetName(): string {
    return this.backdrop.presetName;
  }

  fixedUpdate(dt: number): void {
    this.rig.fixedUpdate(dt);
    this.feedback.fixedUpdate(dt);
  }

  render(time: number, dt: number): void {
    const session = this.session;
    if (!session || !this.well) return;
    const flash = this.backdrop.update(time, dt, this.random);
    this.backdrop.updateEnvironment(this.renderer);
    this.shared.uTime.value = time;
    this.shared.uSquash.value = this.feedback.squash;
    this.shared.uLightColor.value.setRGB(1.0, 0.92, 0.82).multiplyScalar(2.6 + flash * 4);
    const clearProgress = session.phase === 'clearing' ? session.clearTimer / TUNING.clearAnimSeconds : 0;
    this.shared.uClearT.value = clearProgress;

    if (this.stackDirty) this.rebuildStack(session);
    this.updateActive(session, time);
    this.well.update({
      time,
      fogColor: this.backdrop.fogColor,
      active: session.piece?.worldCells ?? null,
      // Wall band glows at every height that is clearing something (a row or a whole layer).
      clearingLayers: [...new Set(session.clearing.cells.map((c) => c.z))],
      clearProgress,
    });
    this.particles.update(time);
    this.rig.render(this.feedback.shakeOffset);
    this.backdrop.setView(this.rig.camera.aspect, this.rig.currentYaw);

    this.renderOpaquePass();
    this.post.render(time);
    this.preview.render(session.piece, this.rig.camera);
  }

  /** Background + well only, sampled by glass and jelly as the "behind the cube" colour for refraction. */
  private renderOpaquePass(): void {
    const hidden = [this.stack.mesh, this.active.mesh, this.ghost.mesh, this.particles.points];
    for (const o of hidden) o.visible = false;
    this.renderer.setRenderTarget(this.opaqueTarget);
    this.renderer.render(this.scene, this.rig.camera);
    this.renderer.setRenderTarget(null);
    for (const o of hidden) o.visible = true;
  }

  private rebuildStack(session: GameSession): void {
    const instances: CubeInstance[] = [];
    const grid = session.grid;
    const clearing = new Set(session.clearing.cells.map((c) => grid.index(c)));
    grid.forEachFilled((x, y, z, value) => {
      instances.push({
        position: cellToWorld(x, y, z, grid),
        cellValue: value,
        clearing: clearing.has(grid.index({ x, y, z })),
        recent: this.recentCells.has(`${x},${y},${z}`),
      });
    });
    this.stack.setInstances(instances);
    this.stackDirty = false;
  }

  private updateActive(session: GameSession, time: number): void {
    const piece = session.piece;
    if (!piece) {
      this.active.setInstances([]);
      this.ghost.update([], '#ffffff', time);
      return;
    }
    const cells = piece.worldCells.map((c) => ({
      position: cellToWorld(c.x, c.y, c.z, session.grid),
      cellValue: piece.cellValue,
      clearing: false,
      recent: false,
    }));
    this.active.setInstances(cells);
    const ghost = session.ghostPiece;
    const ghostCells = ghost && ghost.position.z !== piece.position.z ? ghost.worldCells : [];
    this.ghost.update(
      ghostCells.map((c) => cellToWorld(c.x, c.y, c.z, session.grid)),
      PIECE_DEFINITIONS[piece.kind].color,
      time,
    );
  }

  private readonly onSessionEvent = (e: SessionEvent): void => {
    const session = this.session;
    if (!session) return;
    switch (e.type) {
      case 'lock':
        this.recentCells = new Set(e.cells.map((c) => `${c.x},${c.y},${c.z}`));
        this.feedback.kickSquash(e.hardDropped ? 1.4 : 0.8);
        if (e.hardDropped) this.feedback.kickShake(0.5);
        this.stackDirty = true;
        break;
      case 'clearStart':
        this.stackDirty = true;
        this.feedback.kickShake(
          0.4 + e.plan.lines * 0.08 + e.plan.layers.length * 0.4 + (e.bonus.multiplier > 1 ? 0.3 : 0),
        );
        this.burstCells(session, e.plan.cells, e.plan.layers.length);
        break;
      case 'clearEnd':
        this.recentCells.clear();
        this.stackDirty = true;
        break;
      default:
        break;
    }
  };

  private burstCells(session: GameSession, cells: readonly Vec3[], layers: number): void {
    const grid = session.grid;
    const time = this.shared.uTime.value;
    // ~350 particles per clear (more for full layers) spread over however many cubes clear.
    const budget = 350 * Math.max(1, layers);
    const perCell = Math.min(8, Math.max(1, Math.round(budget / Math.max(1, cells.length))));
    for (const c of cells) {
      const kind = PIECE_KINDS[grid.get(c) - 1];
      const color = kind ? PIECE_DEFINITIONS[kind].color : '#c8d0e0';
      this.particles.burst(cellToWorld(c.x, c.y, c.z, grid), color, perCell, 4.5, time, this.random);
    }
  }

  private readonly resize = (): void => {
    const width = this.canvas.clientWidth || innerWidth;
    const height = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / height);
    this.post.resize(width, height);
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.opaqueTarget.setSize(buffer.x, buffer.y);
    this.shared.uResolution.value.copy(buffer);
  };
}
