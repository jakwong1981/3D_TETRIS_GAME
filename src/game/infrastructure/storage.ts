import type { SubmitRoundRequest } from '../../shared/contracts';

const NAME_KEY = 'tetracube.playerName';
const QUEUE_KEY = 'tetracube.pendingRounds';

export const playerNameStorage = {
  read(): string {
    return localStorage.getItem(NAME_KEY) ?? '';
  },
  write(name: string): void {
    localStorage.setItem(NAME_KEY, name);
  },
};

/** Rounds that could not reach the server wait here and are retried on the next submit or load. */
export const pendingRoundStorage = {
  read(): SubmitRoundRequest[] {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SubmitRoundRequest[]) : [];
    } catch {
      localStorage.removeItem(QUEUE_KEY);
      return [];
    }
  },
  write(rounds: readonly SubmitRoundRequest[]): void {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(rounds.slice(-50)));
  },
};

const MUSIC_KEY = 'tetracube.music';

/** Background music preference; on by default. */
export const musicStorage = {
  read(): boolean {
    return localStorage.getItem(MUSIC_KEY) !== 'off';
  },
  write(enabled: boolean): void {
    localStorage.setItem(MUSIC_KEY, enabled ? 'on' : 'off');
  },
};

const BACKDROP_KEY = 'tetracube.backdrop';

/** Last backdrop picked in the menu ('random' until the player chooses one). */
export const backdropStorage = {
  read(): string {
    return localStorage.getItem(BACKDROP_KEY) ?? 'random';
  },
  write(choice: string): void {
    localStorage.setItem(BACKDROP_KEY, choice);
  },
};
