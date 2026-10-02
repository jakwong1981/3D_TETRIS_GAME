import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { RoundService } from '../../src/server/services/round-service';
import { InMemoryRoundRepository } from './in-memory-round-repository';
import { validRound } from './fixtures';

describe('HTTP routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      service: new RoundService(new InMemoryRoundRepository()),
      corsOrigin: 'http://localhost:5173',
      submitRateLimit: 3,
      logger: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /rounds returns 201 and the saved round', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/rounds', payload: validRound() });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ playerName: 'Ada', score: 1200 });
    expect(res.headers['x-trace-id']).toBeTruthy();
  });

  it('POST /rounds returns 400 with ApiErrorResponse on invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rounds',
      payload: { playerName: '<script>' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(typeof body.timestamp).toBe('string');
  });

  it('POST /rounds returns 422 for implausible rounds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/rounds',
      payload: validRound({ score: 9_999_999 }),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('IMPLAUSIBLE_ROUND');
  });

  it('rate-limits submissions', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      codes.push(
        (await app.inject({ method: 'POST', url: '/api/v1/rounds', payload: validRound() })).statusCode,
      );
    }
    expect(codes).toEqual([201, 201, 201, 429]);
  });

  it('GET /rankings validates query and returns a page', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/rounds', payload: validRound() });
    const ok = await app.inject({ method: 'GET', url: '/api/v1/rankings?mode=marathon&difficulty=normal' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().entries).toHaveLength(1);
    const bad = await app.inject({ method: 'GET', url: '/api/v1/rankings?mode=chess&difficulty=normal' });
    expect(bad.statusCode).toBe(400);
  });

  it('GET /players/:name/rounds returns history', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/rounds', payload: validRound() });
    const res = await app.inject({ method: 'GET', url: '/api/v1/players/Ada/rounds' });
    expect(res.statusCode).toBe(200);
    expect(res.json().rounds).toHaveLength(1);
  });
});
