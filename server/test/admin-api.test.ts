/**
 * API-test for admin-ruterne.
 *
 * Bygger den rigtige server og sender forespoergsler ind i den. En rute, der
 * kun er afproevet mod en anden opsaetning end driftens, er ikke afproevet.
 */

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { lavServer } from '../src/server.js';
import { testUr } from '../src/motor/ur.js';
import type { StyretUr } from '../src/motor/ur.js';
import type { Konfig } from '../src/konfig.js';

const ROD = resolve(import.meta.dirname, '../..');
const VAGT_START = Date.parse('2026-07-15T23:30:00+02:00');
const ALARM_KL = Date.parse('2026-07-16T02:14:00+02:00');
const min = (n: number) => n * 60_000;

const TOKEN = 'et-token-der-er-langt-nok-1234';

let mappe = '';
let app: FastifyInstance;
let ur: StyretUr;

const auth = { authorization: `Bearer ${TOKEN}` };

const konfigen = (): Konfig => ({
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
});

beforeEach(async () => {
  mappe = await mkdtemp(join(tmpdir(), 'natvagt-api-'));
  ur = testUr(VAGT_START);
  ({ app } = await lavServer({ konfig: konfigen(), rod: ROD, ur, medStatiskeFiler: false }));
});

afterEach(async () => {
  await app.close();
  await rm(mappe, { recursive: true, force: true });
});

describe('adgang', () => {
  test('afviser en forespoergsel uden token', async () => {
    const svar = await app.inject({ method: 'GET', url: '/api/admin/oversigt' });
    expect(svar.statusCode).toBe(401);
    expect(svar.json()).toHaveProperty('fejl');
  });

  test('afviser et forkert token', async () => {
    const svar = await app.inject({
      method: 'GET',
      url: '/api/admin/oversigt',
      headers: { authorization: 'Bearer noget-helt-andet-men-lige-langt' },
    });
    expect(svar.statusCode).toBe(401);
  });

  test('afviser et token uden Bearer-praefiks', async () => {
    const svar = await app.inject({
      method: 'GET',
      url: '/api/admin/oversigt',
      headers: { authorization: TOKEN },
    });
    expect(svar.statusCode).toBe(401);
  });

  test('lukker det rigtige token ind', async () => {
    const svar = await app.inject({ method: 'GET', url: '/api/admin/oversigt', headers: auth });
    expect(svar.statusCode).toBe(200);
  });

  test('skaermens egne ruter kraever ikke token', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/state' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});

describe('oversigten', () => {
  test('viser haendelserne med status og nedtaelling', async () => {
    const o = (await app.inject({ method: 'GET', url: '/api/admin/oversigt', headers: auth })).json();

    // Kun alarmer staar i listen. Anomalier og dekryptering genereres af uret
    // og er ikke noget, instruktoererne skal forholde sig til.
    expect(o.haendelser.every((h: { type: string }) => h.type === 'ALARM')).toBe(true);
    expect(o.haendelser.every((h: { status: string }) => h.status === 'planlagt')).toBe(true);
    expect(o.naeste.id).toBe('alarm-hoved');
  });

  test('viser alarmens punkt med afstand og pejling, saa et rettet koordinat kan efterproeves', async () => {
    const o = (await app.inject({ method: 'GET', url: '/api/admin/oversigt', headers: auth })).json();
    const alarm = o.haendelser.find((h: { id: string }) => h.id === 'alarm-hoved');

    expect(alarm.punkt).toMatchObject({ afstandM: 394, pejlingGrader: 60, sektor: 2 });
    expect(alarm.punkt.ddm).toBe("55°39.606'N 009°21.888'E");
  });

  test('haendelser uden koordinat har intet punkt', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/admin/haendelse',
      headers: auth,
      payload: {
        id: 'en-melding',
        type: 'MELDING',
        at: new Date(VAGT_START + min(45)).toISOString(),
        titel: 'MELDING',
        tekst: 'T',
        lyd: 'ingen',
      },
    });
    const o = (await app.inject({ method: 'GET', url: '/api/admin/oversigt', headers: auth })).json();
    const melding = o.haendelser.find((h: { id: string }) => h.id === 'en-melding');
    expect(melding.punkt).toBeNull();
  });
});

describe('fyr, kvitter og stop', () => {
  test('fyrer alarmen og svarer med det opdaterede overblik', async () => {
    const svar = await app.inject({
      method: 'POST',
      url: '/api/admin/fyr/alarm-hoved',
      headers: auth,
    });

    expect(svar.statusCode).toBe(200);
    expect(svar.json().fase).toBe('ALARM');
    expect(svar.json().aktivAlarm.haendelseId).toBe('alarm-hoved');
  });

  test('skaermen ser alarmen med det samme', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/fyr/alarm-hoved', headers: auth });
    const skaerm = (await app.inject({ method: 'GET', url: '/api/state' })).json();
    expect(skaerm.alarm.afstandM).toBe(394);
  });

  test('kvitterer', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/fyr/alarm-hoved', headers: auth });
    const svar = await app.inject({ method: 'POST', url: '/api/admin/kvitter', headers: auth });
    expect(svar.json().aktivAlarm.kvitteretKl).not.toBeNull();
  });

  test('stopper alarmen', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/fyr/alarm-hoved', headers: auth });
    const svar = await app.inject({ method: 'POST', url: '/api/admin/stop', headers: auth });
    expect(svar.json().fase).toBe('ROLIG');
    expect(svar.json().aktivAlarm).toBeNull();
  });

  test('afviser en haendelse der ikke findes, med en laesbar besked', async () => {
    const svar = await app.inject({
      method: 'POST',
      url: '/api/admin/fyr/findes-ikke',
      headers: auth,
    });
    expect(svar.statusCode).toBe(400);
    expect(svar.json().fejl).toMatch(/findes-ikke/);
  });

  test('afviser at fyre den samme haendelse to gange', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/fyr/alarm-hoved', headers: auth });
    const svar = await app.inject({
      method: 'POST',
      url: '/api/admin/fyr/alarm-hoved',
      headers: auth,
    });
    expect(svar.statusCode).toBe(400);
    expect(svar.json().fejl).toMatch(/allerede/i);
  });
});

describe('scenarieaendringer', () => {
  test('flytter alarmens tidspunkt', async () => {
    const nyTid = new Date(ALARM_KL + min(25)).toISOString();
    const svar = await app.inject({
      method: 'PATCH',
      url: '/api/admin/haendelse/alarm-hoved',
      headers: auth,
      payload: { at: nyTid },
    });

    expect(svar.statusCode).toBe(200);
    const alarm = svar.json().haendelser.find((h: { id: string }) => h.id === 'alarm-hoved');
    expect(alarm.at).toBe(nyTid);
  });

  test('afviser et koordinat uden for den rekognoscerede radius', async () => {
    // Den vigtigste spaerring i hele fladen: et taste-slip kl. 02 maa ikke
    // kunne sende fire teenagere mod Vejle Fjord.
    const svar = await app.inject({
      method: 'PATCH',
      url: '/api/admin/haendelse/alarm-hoved',
      headers: auth,
      payload: { lat: 55.72, lon: 9.47 },
    });

    expect(svar.statusCode).toBe(400);
    expect(svar.json().fejl).toMatch(/m fra basen/);
    expect(svar.json().fejl).toMatch(/3000 m/);
  });

  test('flytter alarmen til et gyldigt punkt og viser den nye afstand', async () => {
    const svar = await app.inject({
      method: 'PATCH',
      url: '/api/admin/haendelse/alarm-hoved',
      headers: auth,
      payload: { lat: 55.6595, lon: 9.3635 },
    });

    const alarm = svar.json().haendelser.find((h: { id: string }) => h.id === 'alarm-hoved');
    expect(alarm.punkt.afstandM).toBeLessThan(800);
    expect(alarm.punkt.afstandM).not.toBe(394);
  });

  test('opretter en ny haendelse', async () => {
    const svar = await app.inject({
      method: 'POST',
      url: '/api/admin/haendelse',
      headers: auth,
      payload: {
        id: 'ekstra-melding',
        type: 'MELDING',
        at: new Date(VAGT_START + min(45)).toISOString(),
        titel: 'MELDING FRA CENTRALEN',
        tekst: 'EKSTRA BESKED',
        lyd: 'alert',
      },
    });

    expect(svar.statusCode).toBe(200);
    expect(svar.json().haendelser.map((h: { id: string }) => h.id)).toContain('ekstra-melding');
  });

  test('afviser en ny haendelse med et id der findes', async () => {
    const svar = await app.inject({
      method: 'POST',
      url: '/api/admin/haendelse',
      headers: auth,
      payload: {
        id: 'alarm-hoved',
        type: 'MELDING',
        at: new Date(VAGT_START + min(45)).toISOString(),
        titel: 'T',
        tekst: 'T',
        lyd: 'ingen',
      },
    });
    expect(svar.statusCode).toBe(400);
    expect(svar.json().fejl).toMatch(/alarm-hoved/);
  });

  test('aflyser en planlagt haendelse', async () => {
    const svar = await app.inject({
      method: 'DELETE',
      url: '/api/admin/haendelse/alarm-hoved',
      headers: auth,
    });
    expect(svar.statusCode).toBe(200);
    expect(svar.json().haendelser.map((h: { id: string }) => h.id)).not.toContain('alarm-hoved');
  });

  test('naegter at aflyse en alarm der er i gang', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/fyr/alarm-hoved', headers: auth });
    const svar = await app.inject({
      method: 'DELETE',
      url: '/api/admin/haendelse/alarm-hoved',
      headers: auth,
    });
    expect(svar.statusCode).toBe(400);
    expect(svar.json().fejl).toMatch(/stop alarmen/i);
  });
});

describe('nulstilling', () => {
  test('kraever bekraeftelse', async () => {
    const svar = await app.inject({ method: 'POST', url: '/api/admin/nulstil', headers: auth });
    expect(svar.statusCode).toBe(400);
    expect(svar.json().fejl).toMatch(/bekraeft/i);
  });

  test('nulstiller med bekraeftelse', async () => {
    await app.inject({ method: 'POST', url: '/api/admin/fyr/alarm-hoved', headers: auth });
    const svar = await app.inject({
      method: 'POST',
      url: '/api/admin/nulstil?bekraeft=ja',
      headers: auth,
    });
    expect(svar.statusCode).toBe(200);
    expect(svar.json().fase).toBe('ROLIG');
    expect(svar.json().haendelser.every((h: { status: string }) => h.status === 'planlagt')).toBe(
      true,
    );
  });
});

describe('helbred', () => {
  test('fortaeller om skaermen er forbundet', async () => {
    const svar = await app.inject({ method: 'GET', url: '/api/admin/helbred', headers: auth });
    expect(svar.json()).toMatchObject({ skaermeForbundet: 0, fase: 'ROLIG', hastighed: 1 });
    expect(svar.json().serverKl).toBeTypeOf('string');
  });
});

describe('rate limit', () => {
  test('lukker ned for et hav af forespoergsler', async () => {
    // En telefon i lommen maa ikke kunne hamre paa serveren hele natten.
    let sidste = 200;
    for (let i = 0; i < 100; i += 1) {
      sidste = (await app.inject({ method: 'GET', url: '/api/admin/oversigt', headers: auth }))
        .statusCode;
    }
    expect(sidste).toBe(429);
  });
});

describe('vejen ind til admin-fladen', () => {
  /*
   * Kraever at fladen er bygget. Testen springes over, hvis den ikke er -
   * den skal fange en regression, ikke tvinge et build igennem.
   */
  const erBygget = existsSync(resolve(ROD, 'admin/dist/index.html'));

  test.skipIf(!erBygget)('/admin uden skraastreg fører til /admin/', async () => {
    // Ingen taster den afsluttende skraastreg, og slet ikke paa en telefon.
    const medFiler = await lavServer({
      konfig: konfigen(),
      rod: ROD,
      ur: testUr(VAGT_START),
      medStatiskeFiler: true,
    });

    const svar = await medFiler.app.inject({ method: 'GET', url: '/admin' });
    expect(svar.statusCode).toBe(301);
    expect(svar.headers.location).toBe('/admin/');

    const side = await medFiler.app.inject({ method: 'GET', url: '/admin/' });
    expect(side.statusCode).toBe(200);
    expect(side.headers['content-type']).toContain('text/html');

    await medFiler.app.close();
  });
});

describe('ravage', () => {
  const ravage = async (krop: Record<string, boolean>) =>
    app.inject({ method: 'POST', url: '/api/admin/ravage', headers: auth, payload: krop });

  test('slaar en forstyrrelse til', async () => {
    const svar = await ravage({ sloeretKort: true });
    expect(svar.statusCode).toBe(200);
    expect(svar.json().ravage).toMatchObject({ sloeretKort: true, glitch: false });
  });

  test('skaermen faar det at vide', async () => {
    await ravage({ glitch: true });
    expect((await app.inject({ method: 'GET', url: '/api/state' })).json().ravage.glitch).toBe(true);
  });

  test('holder koordinatet tilbage - det skjules ikke bare paa skaermen', async () => {
    // Sendes det med, kan det laeses ved at kigge i det serveren svarer.
    await app.inject({ method: 'POST', url: '/api/admin/fyr/alarm-hoved', headers: auth });
    expect((await app.inject({ method: 'GET', url: '/api/state' })).json().alarm.ddm).toBeTruthy();

    await ravage({ skjulKoordinat: true });

    const alarm = (await app.inject({ method: 'GET', url: '/api/state' })).json().alarm;
    expect(alarm.ddm).toBeNull();
    expect(alarm.ddmLat).toBeNull();
    expect(alarm.ddmLon).toBeNull();
    expect(alarm.gradLat).toBeNull();
    expect(alarm.gradLon).toBeNull();
    // Afstand og pejling bliver staaende - det er kun koordinatet der slaas fra.
    expect(alarm.afstandM).toBe(394);
    expect(alarm.pejlingGrader).toBe(60);
  });

  test('kan slaas fra igen', async () => {
    await ravage({ skjulKoordinat: true });
    await app.inject({ method: 'POST', url: '/api/admin/fyr/alarm-hoved', headers: auth });
    await ravage({ skjulKoordinat: false });
    expect((await app.inject({ method: 'GET', url: '/api/state' })).json().alarm.ddm).toBeTruthy();
  });

  test('lader de oevrige staa uroert', async () => {
    await ravage({ glitch: true });
    const svar = await ravage({ sloeretKort: true });
    expect(svar.json().ravage).toEqual({
      sloeretKort: true,
      skjulKoordinat: false,
      glitch: true,
    });
  });

  test('kraever token', async () => {
    const svar = await app.inject({
      method: 'POST',
      url: '/api/admin/ravage',
      payload: { glitch: true },
    });
    expect(svar.statusCode).toBe(401);
  });

  test('afviser noget der ikke er en forstyrrelse', async () => {
    const svar = await ravage({ noget: true } as never);
    expect(svar.statusCode).toBe(200);
    expect(svar.json().ravage).toEqual({
      sloeretKort: false,
      skjulKoordinat: false,
      glitch: false,
    });
  });
});
