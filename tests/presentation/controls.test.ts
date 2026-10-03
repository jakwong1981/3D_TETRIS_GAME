import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SPIN_TURN, rotateOffset, tipAwayTurn } from '../../src/game/domain/rotation';
import { vec3 } from '../../src/game/domain/vec3';
import { CameraRig } from '../../src/game/presentation/camera-rig';

// CameraRig only needs addEventListener on the canvas and on the global scope.
(globalThis as unknown as { addEventListener?: () => void }).addEventListener ??= () => undefined;
const fakeCanvas = { addEventListener: () => undefined } as unknown as HTMLCanvasElement;

/** Projects a one-cell grid step to screen (NDC) for the rig's current camera. */
function screenDelta(rig: CameraRig, dx: number, dy: number): THREE.Vector2 {
  rig.resize(1.6);
  rig.render(new THREE.Vector3());
  rig.camera.updateMatrixWorld();
  const a = new THREE.Vector3(0, 5, 0).project(rig.camera);
  const b = new THREE.Vector3(dx, 5, dy).project(rig.camera); // grid (x, y) → world (X, Z)
  return new THREE.Vector2(b.x - a.x, b.y - a.y);
}

describe('screen-relative movement', () => {
  it.each([0, 1, 2, 3])('right moves right and up moves up on screen after %i snaps', (snaps) => {
    const rig = new CameraRig(fakeCanvas);
    rig.frameWell(10, 10);
    for (let i = 0; i < snaps; i++) rig.snap(1);
    for (let i = 0; i < 200; i++) rig.fixedUpdate(1 / 60);

    const right = rig.screenToGrid(1, 0);
    const up = rig.screenToGrid(0, 1);
    const r = screenDelta(rig, right.dx, right.dy);
    const u = screenDelta(rig, up.dx, up.dy);

    expect(r.x).toBeGreaterThan(Math.abs(r.y)); // mostly rightwards
    expect(u.y).toBeGreaterThan(0); // upwards on screen
    expect(Math.abs(u.y)).toBeGreaterThan(Math.abs(u.x));
    expect(rig.screenToGrid(-1, 0)).toEqual({ dx: 0 - right.dx, dy: 0 - right.dy });
  });
});

describe('rotation turns', () => {
  it('tips the top of the piece away from the viewer for every view axis', () => {
    const frames = [
      { right: { dx: 1, dy: 0 }, away: { dx: 0, dy: -1 } },
      { right: { dx: 0, dy: -1 }, away: { dx: -1, dy: 0 } },
      { right: { dx: -1, dy: 0 }, away: { dx: 0, dy: 1 } },
      { right: { dx: 0, dy: 1 }, away: { dx: 1, dy: 0 } },
    ];
    for (const { right, away } of frames) {
      const turn = tipAwayTurn(right, away);
      const top = rotateOffset(vec3(0, 0, 1), turn.axis, turn.dir);
      expect([top.x + 0, top.y + 0, top.z + 0]).toEqual([away.dx, away.dy, 0]);
    }
  });

  it('spins horizontally about the vertical axis', () => {
    expect(SPIN_TURN.axis).toBe('z');
  });
});
