import type { ClearedRow, RowAxis } from './grid';

export type ChainAxis = 'x' | 'y' | 'z';

export interface ColourBonus {
  /** Axes spanned by the best connected chain of same-colour rows (empty = no bonus). */
  axes: ChainAxis[];
  /** 2^axes.length: 1, 2, 4 or 8. */
  multiplier: number;
}

export const NO_COLOUR_BONUS: ColourBonus = { axes: [], multiplier: 1 };

/**
 * Same-colour bonus for one lock.
 *
 * A cleared row whose cubes all share one colour is a "mono row". Mono rows of the same colour are
 * chained when they touch: an X row and a Y row on the same layer always cross, and rows on
 * neighbouring layers chain when one sits directly above a cell of the other. A chain spans
 * axis X if it holds an X row, Y if it holds a Y row, and Z if it covers more than one layer.
 *
 *   multiplier = 2^k, k = axes spanned by the best chain  →  ×2 (one axis), ×4 (XY), ×8 (XYZ)
 *
 * `excluded` colours (puzzle prefill) never count.
 */
export function colourBonus(rows: readonly ClearedRow[], excluded: ReadonlySet<number>): ColourBonus {
  const mono = rows.filter(
    (r): r is ClearedRow & { colour: number } => r.colour !== null && !excluded.has(r.colour),
  );
  if (mono.length === 0) return NO_COLOUR_BONUS;

  const parent = mono.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] ?? root;
    parent[i] = root;
    return root;
  };
  for (let a = 0; a < mono.length; a++) {
    for (let b = a + 1; b < mono.length; b++) {
      const ra = mono[a];
      const rb = mono[b];
      if (ra && rb && rowsTouch(ra, rb)) parent[find(a)] = find(b);
    }
  }

  const chains = new Map<number, { axes: Set<RowAxis>; layers: Set<number> }>();
  mono.forEach((row, i) => {
    const root = find(i);
    const chain = chains.get(root) ?? { axes: new Set<RowAxis>(), layers: new Set<number>() };
    chain.axes.add(row.axis);
    chain.layers.add(row.z);
    chains.set(root, chain);
  });

  let best: ChainAxis[] = [];
  for (const chain of chains.values()) {
    const axes: ChainAxis[] = (['x', 'y'] as const).filter((a) => chain.axes.has(a));
    if (chain.layers.size > 1) axes.push('z');
    if (axes.length > best.length) best = axes;
  }
  return { axes: best, multiplier: 2 ** best.length };
}

function rowsTouch(a: ClearedRow & { colour: number }, b: ClearedRow & { colour: number }): boolean {
  if (a.colour !== b.colour) return false;
  const dz = Math.abs(a.z - b.z);
  if (dz > 1) return false;
  if (dz === 0) return a.axis !== b.axis; // parallel rows on one layer never share a cell
  // Neighbouring layers: touching if some (x, y) column is used by both rows.
  return a.cells.some((ca) => b.cells.some((cb) => ca.x === cb.x && ca.y === cb.y));
}
