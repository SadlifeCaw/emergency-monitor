/**
 * Lydklip: validering, skaermbillede og admin-API.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { LYDKLIP_VINDUE_SEK, bygLydklip } from '../src/drift/skaermbillede.js';
import type { Konfig } from '../src/konfig.js';
import { laesScenarie } from '../src/motor/scenarie.js';
import { testUr } from '../src/motor/ur.js';
import type { StyretUr } from '../src/motor/ur.js';
import type { Tilstand } from '../src/motor/typer.js';
import { lavServer } from '../src/server.js';
import { bygScenarie, iso, T0 } from './hjaelp/byg.js';

const klip = (overskriv: Record<string, unknown> = {}) => ({
  id: 'lyd-1',
  type: 'LYD',
  at: iso(T0 + 60_000),
  titel: 'UIDENTIFICERET SIGNAL',
  lyd: 'ingen',
  fil: 'signal.mp3',
  ...overskriv,
});

const scenarieMed = (h: unknown) => ({ ...bygScenarie(), haendelser: [h] });

describe('scenarie', () => {
  test('accepterer et lydklip', () => {
    const s = laesScenarie(scenarieMed(klip()));
    expect(s.haendelser[0]).toMatchObject({ type: 'LYD', fil: 'signal.mp3' });
  });

  test.each(['../hemmelig.mp3', 'mappe/signal.mp3', 'c:x.mp3', 'mappe\\signal.mp3', 'signal.exe', 'signal', '.mp3'])(
    'afviser filnavnet %s',
    (fil) => {
      expect(() => laesScenarie(scenarieMed(klip({ fil })))).toThrow();
    },
  );
});

describe('skaermbillede', () => {
  const scen = laesScenarie(scenarieMed(klip()));
  const tilstand = (fyretKl: string | null): Tilstand =>
    ({
      fyrede: fyretKl ? { 'lyd-1': { fyretKl, oploestKl: null } } : {},
    }) as unknown as Tilstand;

  test('intet klip foer det er fyret', () => {
    expect(bygLydklip(scen, tilstand(null), T0)).toBeNull();
  });

  test('klippet staar i skaermbilledet efter fyring', () => {
    const v = bygLydklip(scen, tilstand(iso(T0)), T0 + 7_000);
    expect(v).toEqual({
      haendelseId: 'lyd-1',
      titel: 'UIDENTIFICERET SIGNAL',
      fil: 'signal.mp3',
      sekunderSiden: 7,
    });
  });

  test('forsvinder efter vinduet', () => {
    const v = bygLydklip(scen, tilstand(iso(T0)), T0 + (LYDKLIP_VINDUE_SEK + 1) * 1000);
    expect(v).toBeNull();
  });
});

describe('admin-api', () => {
  const TOKEN = 'et-token-der-er-langt-nok-1234';
  const auth = { authorization: `Bearer ${TOKEN}` };
  const ROD = resolve(import.meta.dirname, '../..');
  let mappe = '';
  let app: FastifyInstance;
  let ur: StyretUr;

  beforeEach(async () => {
    mappe = await mkdtemp(join(tmpdir(), 'natvagt-lyd-'));
    await mkdir(join(mappe, 'lyd'));
    await writeFile(join(mappe, 'lyd', 'signal.mp3'), 'x');
    await writeFile(join(mappe, 'lyd', 'note.txt'), 'x');
    const konfig: Konfig = {
      miljoe: 'udvikling',
      vaert: '127.0.0.1',
      port: 0,
      adminToken: TOKEN,
      tokenErGenereret: false,
      scenariesti: resolve(ROD, 'scenarios/nat.json'),
      tilstandssti: join(mappe, 'runtime.json'),
      hastighed: 1,
      virtuelStart: null,
      logloft: 50,
      lydmappe: join(mappe, 'lyd'),
    };
    ur = testUr(Date.parse('2026-07-15T23:30:00+02:00'));
    ({ app } = await lavServer({ konfig, rod: ROD, ur, medStatiskeFiler: false }));
  });

  afterEach(async () => {
    await app.close();
    await rm(mappe, { recursive: true, force: true });
  });

  const opret = (krop: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/admin/haendelse', headers: auth, payload: krop });

  test('lister kun lydfiler', async () => {
    const svar = await app.inject({ method: 'GET', url: '/api/admin/lydfiler', headers: auth });
    expect(svar.json().filer).toEqual(['signal.mp3']);
  });

  test('afviser et klip hvis fil ikke findes', async () => {
    const svar = await opret(klip({ fil: 'findes-ikke.mp3' }));
    expect(svar.statusCode).toBe(400);
    expect(svar.json().fejl).toContain('findes ikke');
  });

  test('et klip fyret nu staar i skaermbilledet paa naeste tick', async () => {
    const svar = await opret(klip());
    expect(svar.statusCode).toBe(200);

    await app.inject({ method: 'POST', url: '/api/admin/fyr/lyd-1', headers: auth });
    ur.spol(1000);
    const s = (await app.inject({ method: 'GET', url: '/api/state' })).json();
    expect(s.lydklip).toMatchObject({ haendelseId: 'lyd-1', fil: 'signal.mp3' });
  });

  test('aflysning fjerner klippet fra skaermbilledet', async () => {
    await opret(klip());
    await app.inject({ method: 'POST', url: '/api/admin/fyr/lyd-1', headers: auth });

    await app.inject({ method: 'DELETE', url: '/api/admin/haendelse/lyd-1', headers: auth });
    const s = (await app.inject({ method: 'GET', url: '/api/state' })).json();
    expect(s.lydklip).toBeNull();
  });
});
