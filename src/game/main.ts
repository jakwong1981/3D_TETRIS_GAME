import type { Difficulty, SubmitRoundRequest } from '../shared/contracts';
import { GameSession, type RoundResult, type SessionEvent } from './application/game-session';
import { CLIENT_VERSION, TUNING } from './config/tuning';
import { PUZZLES } from './domain/puzzles';
import { createSeededRandom } from './domain/random';
import { PIECE_DEFINITIONS } from './domain/tetracube';
import { AudioSynth } from './infrastructure/audio-synth';
import { InputMapper } from './infrastructure/input-mapper';
import { ScoreApi, ScoreApiError } from './infrastructure/score-api';
import { backdropStorage, musicStorage, playerNameStorage } from './infrastructure/storage';
import { GameRenderer } from './presentation/game-renderer';
import { byId, formatDuration } from './ui/dom';
import { HudView } from './ui/hud-view';
import { MenuView, type MenuChoice } from './ui/menu-view';
import { RankingView } from './ui/ranking-view';

const PUZZLE_DIFFICULTY_BY_SIZE: Readonly<Record<number, Difficulty>> = { 3: 'easy', 4: 'normal', 5: 'hard' };

const lowFx = new URLSearchParams(location.search).has('lowfx');
const visualRandom = createSeededRandom(Date.now() >>> 0);
const renderer = new GameRenderer(
  byId('scene', HTMLCanvasElement),
  visualRandom,
  byId('hud-preview', HTMLCanvasElement),
  lowFx,
);
const audio = new AudioSynth(musicStorage.read());
const api = new ScoreApi();
const hud = new HudView();
const ranking = new RankingView(api);
const overPanel = byId('over', HTMLElement);
const pausedPanel = byId('paused', HTMLElement);

let choice: MenuChoice = {
  playerName: playerNameStorage.read(),
  mode: 'marathon',
  difficulty: 'normal',
  puzzleIndex: 0,
  backdrop: backdropStorage.read(),
};
let session = createSession(choice);
let roundActive = false;

const menu = new MenuView(choice.playerName, choice.backdrop, {
  onStart: (selected) => {
    choice = selected;
    playerNameStorage.write(selected.playerName);
    backdropStorage.write(selected.backdrop);
    startRound();
  },
  onRanking: (selected) => openRanking(selected, () => menu.show()),
});

const input = new InputMapper({
  shift: (right, away) => {
    const { dx, dy } = renderer.rig.screenToGrid(right, away);
    session.move(dx, dy);
  },
  rotate: (axis, dir) => session.rotate(axis, dir),
  hardDrop: () => session.hardDrop(),
  hold: () => session.hold(),
  setSoftDrop: (active) => {
    session.softDropping = active;
  },
  snapCamera: (dir) => renderer.rig.snap(dir),
  reset: () => {
    if (roundActive || !overPanel.hidden) startRound();
  },
  togglePause: () => {
    if (!roundActive) return;
    session.togglePause();
    pausedPanel.hidden = session.phase !== 'paused';
    audio.setMusicWanted(session.phase !== 'paused');
  },
  toggleMusic,
  firstGesture: () => audio.unlock(),
});
const musicButton = byId('music-toggle', HTMLButtonElement);
musicButton.addEventListener('click', () => {
  audio.unlock();
  toggleMusic();
  musicButton.blur(); // keep Space / arrows going to the game, not re-pressing the button
});
renderMusicButton();

function toggleMusic(): void {
  musicStorage.write(audio.toggleMusic());
  renderMusicButton();
}

function renderMusicButton(): void {
  const on = audio.isMusicEnabled;
  musicButton.textContent = on ? '♪ Music on (M)' : '♪ Music off (M)';
  musicButton.setAttribute('aria-pressed', String(on));
}
input.bindPad(byId('move-pad', HTMLElement));

byId('again', HTMLButtonElement).addEventListener('click', () => startRound());
byId('over-menu', HTMLButtonElement).addEventListener('click', () => {
  overPanel.hidden = true;
  menu.show();
});
byId('over-ranking', HTMLButtonElement).addEventListener('click', () => {
  overPanel.hidden = true;
  openRanking(choice, () => {
    overPanel.hidden = false;
  });
});

function createSession(selected: MenuChoice): GameSession {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  const created = new GameSession({
    mode: selected.mode,
    difficulty: selected.difficulty,
    seed,
    puzzleIndex: selected.puzzleIndex,
  });
  created.onEvent(onSessionEvent);
  renderer.attach(created, selected.backdrop);
  return created;
}

function startRound(): void {
  menu.hide();
  overPanel.hidden = true;
  pausedPanel.hidden = true;
  session = createSession(choice);
  roundActive = true;
  input.enabled = true;
  hud.show(renderer.presetName);
  audio.setMusicLevel(session.level);
  audio.setMusicWanted(true);
}

function openRanking(selected: MenuChoice, onClose: () => void): void {
  menu.hide();
  ranking.open({
    mode: selected.mode,
    difficulty: difficultyFor(selected),
    playerName: selected.playerName,
    onClose,
  });
}

function difficultyFor(selected: MenuChoice): Difficulty {
  if (selected.mode !== 'puzzle') return selected.difficulty;
  return PUZZLE_DIFFICULTY_BY_SIZE[PUZZLES[selected.puzzleIndex]?.size ?? 3] ?? 'easy';
}

function onSessionEvent(e: SessionEvent): void {
  switch (e.type) {
    case 'move':
      return audio.move();
    case 'rotate':
      return audio.rotate();
    case 'lock':
      return audio.lock(PIECE_DEFINITIONS[e.kind].material);
    case 'clearStart':
      hud.showClear(e.plan, e.bonus, e.points);
      return audio.clear(e.plan.lines + e.plan.layers.length * 4, e.bonus.multiplier);
    case 'clearEnd':
      return audio.setMusicLevel(session.level);
    case 'over':
      return endRound(e.result);
    default:
      return;
  }
}

function endRound(result: RoundResult): void {
  if (!roundActive) return;
  roundActive = false;
  input.enabled = false;
  audio.setMusicWanted(false);
  audio.gameOver();
  const title = result.completed && result.mode !== 'marathon' ? 'Cleared' : 'Game over';
  byId('over-title', HTMLElement).textContent = title;
  byId('over-result', HTMLElement).textContent =
    `Score ${result.score.toLocaleString()} · ${result.linesCleared} lines · ${result.layersCleared} layers · ` +
    `${result.piecesPlaced} pieces · ${formatDuration(result.durationMs)}`;
  overPanel.hidden = false;
  void submit(result);
}

async function submit(result: RoundResult): Promise<void> {
  const status = byId('over-status', HTMLElement);
  if (result.piecesPlaced < 1) {
    status.textContent = 'Round too short to record.';
    return;
  }
  const request: SubmitRoundRequest = {
    ...result,
    difficulty: difficultyFor(choice),
    playerName: choice.playerName,
    clientVersion: CLIENT_VERSION,
  };
  status.textContent = 'Saving round…';
  try {
    const saved = await api.submitRound(request);
    status.textContent = saved
      ? 'Round saved to the ranking.'
      : 'Offline: round queued and will upload later.';
  } catch (error) {
    status.textContent =
      error instanceof ScoreApiError ? `Not recorded: ${error.message}` : 'Could not save round.';
  }
}

const step = 1 / TUNING.simHz;
let accumulator = 0;
let last = performance.now();
let simTime = 0;

function frame(now: number): void {
  // Clamp so a background-tab hitch cannot fast-forward the game by seconds.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  accumulator += dt;
  while (accumulator >= step) {
    if (roundActive && !menu.isOpen && !ranking.isOpen) {
      input.fixedUpdate(step);
      session.fixedUpdate(step);
    }
    renderer.fixedUpdate(step);
    simTime += step;
    accumulator -= step;
  }
  renderer.render(simTime, dt);
  if (roundActive) hud.update(session);
  requestAnimationFrame(frame);
}

void api.flushPending().catch(() => undefined);
menu.show();
requestAnimationFrame(frame);
