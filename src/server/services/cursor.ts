import { z } from 'zod';
import { ValidationError } from '../errors';
import type { RankingCursor } from '../repositories/round-repository';

const cursorSchema = z.object({
  value: z.number(),
  id: z.string().regex(/^[a-f0-9]{24}$/),
  rank: z.number().int().min(0),
});

export function encodeCursor(cursor: RankingCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(raw: string | undefined): RankingCursor | null {
  if (!raw) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    throw new ValidationError('Invalid cursor');
  }
}

export const objectIdPattern = /^[a-f0-9]{24}$/;
