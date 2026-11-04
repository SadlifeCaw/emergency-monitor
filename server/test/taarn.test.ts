/**
 * Signaltaarne: spawn inden for spektret, aktivering og forbindelse, kode og lyd.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { afstandM, pejlingGrader } from '../src/motor/geo.js';
import { testUr } from '../src/motor/ur.js';
import type { StyretUr } from '../src/motor/ur.js';
import { lavServer } from '../src/server.js';
import type { Konfig } from '../src/konfig.js';
import {
  KODE_SEK,
  OPBYGNING_SEK,
  nulstilLyd,
  aktiverTaarn,
  bygVisning,
  deaktiverTaarn,
  gemTaarn,
  respawnTaarn,
  saetPakke,
  sletTaarn,
  tomUdvidelse,
  visTaarnKode,
} from '../src/udvidelse/udvidelse.js';
import { bygScenarie, T0, sek } from './hjaelp/byg.js';

const scenarie = bygScenarie({ kort: { startZoom: 15, maxRadiusM: 3000, sektorer: 8 } });

/** Deterministisk "tilfaeldighed": en fast raekke tal, der gentages. */
const raekke = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length] ?? 0;
};

const pakke = () =>
  saetPakke(tomUdvidelse(), { aktiv: true, taarnAktiv: true, taarnLyd: 'klip.m4a' }, T0);

const medFire = () => {
  let u = pakke();
  for (const fra of [0, 90, 180, 270]) {
    u = gemTaarn(u, { titel: `T${fra}`, vinkelFra: fra, vinkelTil: fra + 90, kode: null }, scenarie, T0);
  }
  return u;
};

describe('spawn', () => {
  test('ligger altid inden for spektret og afstandsintervallet', () => {
    for (let i = 0; i < 200; i += 1) {
      const u = gemTaarn(
        pakke(),
        { titel: 'T', vinkelFra: 30, vinkelTil: 120, minM: 300, maksM: 700, kode: null },
        scenarie,
        T0,
      );
      const t = u.taarne[0]!;
      const p = pejlingGrader(scenarie.base, t);
      const d = afstandM(scenarie.base, t);
      expect(p).toBeGreaterThanOrEqual(29.5);
      expect(p).toBeLessThanOrEqual(120.5);
      expect(d).toBeGreaterThanOrEqual(299);
      expect(d).toBeLessThanOrEqual(701);
    }
  });

  test('et spektrum over nord (fra > til) virker', () => {
    for (let i = 0; i < 100; i += 1) {
      const u = gemTaarn(pakke(), { titel: 'T', vinkelFra: 330, vinkelTil: 30, kode: null }, scenarie, T0);
      const p = pejlingGrader(scenarie.base, u.taarne[0]!);
      expect(p >= 329.5 || p <= 30.5).toBe(true);
    }
  });

  test('et taarn maa hoejst staa 800 m fra centrum', () => {
    expect(() =>
      gemTaarn(pakke(), { titel: 'T', vinkelFra: 0, vinkelTil: 90, minM: 300, maksM: 1500, kode: null }, scenarie, T0),
    ).toThrow(/800 m/);

    // ogsaa uden at angive afstand: standarden er 800 m
    for (let i = 0; i < 100; i += 1) {
      const u = gemTaarn(pakke(), { titel: 'T', vinkelFra: 0, vinkelTil: 360, kode: null }, scenarie, T0);
      expect(afstandM(scenarie.base, u.taarne[0]!)).toBeLessThanOrEqual(801);
    }
  });

  test('afviser et afstandsinterval hvor fra ikke er mindre end til', () => {
    expect(() =>
      gemTaarn(pakke(), { titel: 'T', vinkelFra: 0, vinkelTil: 90, minM: 900, maksM: 800, kode: null }, scenarie, T0),
    ).toThrow(/mindre end/);
  });

  test('ret af spektrum flytter kun taarnet, hvis det ligger udenfor det nye', () => {
    const u = gemTaarn(pakke(), { id: 'x', titel: 'T', vinkelFra: 0, vinkelTil: 90, kode: null }, scenarie, T0);
    const foer = { lat: u.taarne[0]!.lat, lon: u.taarne[0]!.lon };

    const vidtre = gemTaarn(u, { id: 'x', titel: 'T2', vinkelFra: 0, vinkelTil: 180, kode: null }, scenarie, T0);
    expect(vidtre.taarne[0]).toMatchObject(foer);

    const andet = gemTaarn(u, { id: 'x', titel: 'T', vinkelFra: 180, vinkelTil: 270, kode: null }, scenarie, T0);
    const p = pejlingGrader(scenarie.base, andet.taarne[0]!);
    expect(p).toBeGreaterThanOrEqual(179.5);
    expect(p).toBeLessThanOrEqual(270.5);
  });

  test('respawn trækker forfra og afaktiverer taarnet', () => {
    let u = gemTaarn(pakke(), { id: 'x', titel: 'T', vinkelFra: 0, vinkelTil: 360, kode: null }, scenarie, T0, raekke(0.1, 0.1));
    u = aktiverTaarn(u, 'x', T0);
    expect(u.taarne[0]?.aktiv).toBe(true);

    const nyt = respawnTaarn(u, 'x', scenarie, T0, raekke(0.7, 0.9));
    expect(nyt.taarne[0]?.aktiv).toBe(false);
    expect(nyt.taarne[0]?.aktiveretKl).toBeNull();
    expect(nyt.taarne[0]?.lat).not.toBe(u.taarne[0]?.lat);
  });
});

describe('forbindelse', () => {
  test('forbundet foerst naar ALLE taarne er aktive', () => {
    let u = medFire();
    const ider = u.taarne.map((t) => t.id);

    for (const id of ider.slice(0, 3)) u = aktiverTaarn(u, id, T0);
    expect(u.forbundetKl).toBeNull();
    expect(bygVisning(u, scenarie, T0)?.forbindelse).toBeNull();

    u = aktiverTaarn(u, ider[3]!, T0 + sek(5));
    expect(u.forbundetKl).not.toBeNull();
    const v = bygVisning(u, scenarie, T0 + sek(7));
    expect(v?.forbundet).toBe(true);
    expect(v?.forbindelse).toMatchObject({ fil: 'klip.m4a', sekunderSiden: 2 });
  });

  test('et deaktiveret taarn afbryder forbindelsen, og en ny forbindelse faar nyt id', () => {
    let u = medFire();
    for (const t of u.taarne) u = aktiverTaarn(u, t.id, T0);
    const foerste = bygVisning(u, scenarie, T0)?.forbindelse?.id;

    u = deaktiverTaarn(u, u.taarne[0]!.id, T0 + sek(10));
    expect(u.forbundetKl).toBeNull();
    expect(bygVisning(u, scenarie, T0 + sek(10))?.forbindelse).toBeNull();

    u = aktiverTaarn(u, u.taarne[0]!.id, T0 + sek(20));
    expect(bygVisning(u, scenarie, T0 + sek(20))?.forbindelse?.id).not.toBe(foerste);
  });

  test('uden lydklip er der forbindelse, men intet at spille', () => {
    let u = saetPakke(medFire(), { taarnLyd: null }, T0);
    for (const t of u.taarne) u = aktiverTaarn(u, t.id, T0);
    const v = bygVisning(u, scenarie, T0);
    expect(v?.forbundet).toBe(true);
    expect(v?.forbindelse).toBeNull();
  });

  test('sletter man det sidste inaktive taarn, er de resterende forbundet', () => {
    let u = medFire();
    for (const t of u.taarne.slice(0, 3)) u = aktiverTaarn(u, t.id, T0);
    u = sletTaarn(u, u.taarne[3]!.id, T0 + sek(1));
    expect(u.forbundetKl).not.toBeNull();
  });

  test('et tomt system er aldrig forbundet', () => {
    expect(bygVisning(pakke(), scenarie, T0)?.forbundet).toBe(false);
  });

  test('kan ikke aktiveres, mens pakken er slaaet fra', () => {
    const u = gemTaarn(tomUdvidelse(), { id: 'x', titel: 'T', vinkelFra: 0, vinkelTil: 90, kode: null }, scenarie, T0);
    expect(() => aktiverTaarn(u, 'x', T0)).toThrow(/ikke aktiveret/);
  });
});

describe('skjult til admin slaar dem til', () => {
  test('skaermen faar intet - heller ikke at der ikke er forbindelse', () => {
    const u = saetPakke(medFire(), { taarnAktiv: false }, T0);
    const v = bygVisning(u, scenarie, T0);
    expect(v?.taarne).toEqual([]);
    expect(v?.forbundet).toBe(false);
    expect(v?.forbindelse).toBeNull();
  });

  test('alle aktive, men skjult: ingen lyd, foer de slaas til', () => {
    let u = saetPakke(medFire(), { taarnAktiv: false }, T0);
    for (const t of u.taarne) u = aktiverTaarn(u, t.id, T0);
    expect(bygVisning(u, scenarie, T0)?.forbindelse).toBeNull();

    const til = saetPakke(u, { taarnAktiv: true }, T0);
    expect(bygVisning(til, scenarie, T0)?.forbindelse).not.toBeNull();
  });

  test('en kode kan ikke loeftes frem, mens taarnene er skjult', () => {
    let u = saetPakke(pakke(), { taarnAktiv: false }, T0);
    u = gemTaarn(u, { id: 'x', titel: 'T', vinkelFra: 0, vinkelTil: 90, kode: 'kode-1.png' }, scenarie, T0);
    expect(() => visTaarnKode(u, 'x', T0)).toThrow(/ikke slaaet til/);
  });
});

describe('lydklippet husker hvor langt det er kommet', () => {
  const allePaa = (nu: number) => {
    let u = medFire();
    for (const t of u.taarne) u = aktiverTaarn(u, t.id, nu);
    return u;
  };

  test('serveren og skaermen er enige om synkroniseringens laengde', async () => {
    const kilde = await readFile(
      resolve(import.meta.dirname, '../../display/src/lydklipregler.ts'),
      'utf8',
    );
    const skaerm = Number(/export const OPBYGNING_SEK = (\d+);/.exec(kilde)?.[1]);
    expect(OPBYGNING_SEK).toBe(skaerm);
    expect(OPBYGNING_SEK).toBe(10);
  });

  test('mistes forbindelsen, fortsaetter stemmen dér - uden synkroniseringen', () => {
    let u = allePaa(T0);
    // 10 s synkronisering + 40 s stemme, saa falder ét taarn ud
    u = deaktiverTaarn(u, u.taarne[0]!.id, T0 + sek(OPBYGNING_SEK + 40));
    expect(u.afspilletSek).toBe(40);

    u = aktiverTaarn(u, u.taarne[0]!.id, T0 + sek(200));
    const v = bygVisning(u, scenarie, T0 + sek(200));
    expect(v?.forbindelse).toMatchObject({ startSek: 40, sekunderSiden: 0 });
  });

  test('en forbindelse der ikke naaede forbi synkroniseringen, taeller ikke', () => {
    let u = allePaa(T0);
    u = deaktiverTaarn(u, u.taarne[0]!.id, T0 + sek(4));
    expect(u.afspilletSek).toBe(0);
  });

  test('flere afbrud lægger sammen', () => {
    let u = allePaa(T0);
    u = deaktiverTaarn(u, 'taarn-1', T0 + sek(OPBYGNING_SEK + 20));
    u = aktiverTaarn(u, 'taarn-1', T0 + sek(100));
    u = deaktiverTaarn(u, 'taarn-1', T0 + sek(100 + OPBYGNING_SEK + 15));
    expect(u.afspilletSek).toBe(35);
  });

  test('skjules taarnene, regnes det ikke som afspillet', () => {
    let u = allePaa(T0);
    u = saetPakke(u, { taarnAktiv: false }, T0 + sek(OPBYGNING_SEK + 5));
    expect(u.afspilletSek).toBe(5);
    // skjult i et kvarter: tiden taeller ikke
    u = saetPakke(u, { taarnAktiv: true }, T0 + sek(900));
    expect(u.afspilletSek).toBe(5);
    expect(bygVisning(u, scenarie, T0 + sek(900))?.forbindelse?.startSek).toBe(5);
  });

  test('et andet lydklip, eller "nulstil lyd", faar beskeden til at starte forfra', () => {
    let u = allePaa(T0);
    u = deaktiverTaarn(u, u.taarne[0]!.id, T0 + sek(OPBYGNING_SEK + 40));
    expect(u.afspilletSek).toBe(40);
    expect(nulstilLyd(u, T0 + sek(100)).afspilletSek).toBe(0);
    expect(saetPakke(u, { taarnLyd: 'andet.m4a' }, T0 + sek(100)).afspilletSek).toBe(0);
  });

  test('nulstil lyd mens forbindelsen staar: beskeden begynder forfra med det samme', () => {
    let u = allePaa(T0);
    const foer = bygVisning(u, scenarie, T0 + sek(60))?.forbindelse;

    u = nulstilLyd(u, T0 + sek(60));
    const efter = bygVisning(u, scenarie, T0 + sek(61))?.forbindelse;
    expect(efter?.id).not.toBe(foer?.id);
    expect(efter).toMatchObject({ startSek: 0, sekunderSiden: 1 });

    // bryder den bagefter, er det kun tiden siden nulstillingen, der tæller
    u = deaktiverTaarn(u, u.taarne[0]!.id, T0 + sek(60 + OPBYGNING_SEK + 7));
    expect(u.afspilletSek).toBe(7);
  });

  test('nulstil lyd uden forbindelse glemmer det gemte', () => {
    let u = allePaa(T0);
    u = deaktiverTaarn(u, u.taarne[0]!.id, T0 + sek(OPBYGNING_SEK + 40));
    expect(u.afspilletSek).toBe(40);

    u = nulstilLyd(u, T0 + sek(100));
    expect(u.afspilletSek).toBe(0);
    expect(u.forbundetKl).toBeNull();

    u = aktiverTaarn(u, u.taarne[0]!.id, T0 + sek(300));
    expect(bygVisning(u, scenarie, T0 + sek(300))?.forbindelse?.startSek).toBe(0);
  });
});

describe('kode', () => {
  test('vises i ti sekunder, og kraever et kodebillede', () => {
    let u = gemTaarn(pakke(), { id: 'x', titel: 'T', vinkelFra: 0, vinkelTil: 90, kode: 'kode-1.png' }, scenarie, T0);
    u = visTaarnKode(u, 'x', T0);
    expect(bygVisning(u, scenarie, T0 + sek(KODE_SEK - 1))?.kode?.id).toBe('x');
    expect(bygVisning(u, scenarie, T0 + sek(KODE_SEK + 1))?.kode).toBeNull();

    const udenKode = gemTaarn(pakke(), { id: 'y', titel: 'T', vinkelFra: 0, vinkelTil: 90, kode: null }, scenarie, T0);
    expect(() => visTaarnKode(udenKode, 'y', T0)).toThrow(/ingen kode/);
  });
});

// ---------------------------------------------------------------- gennem serveren

const ROD = resolve(import.meta.dirname, '../..');
const TOKEN = 'et-token-der-er-langt-nok-1234';
const auth = { authorization: `Bearer ${TOKEN}` };

let mappe = '';
let app: FastifyInstance;
let ur: StyretUr;

const konfigen = (): Konfig => ({
  miljoe: 'udvikling',
  vaert: '127.0.0.1',
  port: 0,
  adminToken: TOKEN,
  tokenErGenereret: false,
  scenariesti: resolve(ROD, 'scenarios/nat.json'),
  tilstandssti: join(mappe, 'runtime.json'),
  kodemappe: join(mappe, 'koder'),
  lydmappe: join(mappe, 'lyd'),
  hastighed: 1,
  virtuelStart: null,
  logloft: 50,
});

const post = async (url: string, payload?: object) =>
  app.inject({ method: 'POST', url, headers: auth, ...(payload === undefined ? {} : { payload }) });

const skaerm = async () =>
  (await app.inject({ method: 'GET', url: '/api/state' })).json<{
    udvidelse: ReturnType<typeof bygVisning>;
    lydklip: { fil: string; haendelseId: string; sekunderSiden: number } | null;
  }>();

beforeEach(async () => {
  mappe = await mkdtemp(join(tmpdir(), 'natvagt-taarn-'));
  ur = testUr(T0);
  ({ app } = await lavServer({ konfig: konfigen(), rod: ROD, ur, medStatiskeFiler: false }));
  await writeFile(join(mappe, 'koder', 'kode-1.png'), Buffer.from('PNG-BYTES'));
  await mkdir(join(mappe, 'lyd'), { recursive: true });
  await writeFile(join(mappe, 'lyd', 'klip.m4a'), Buffer.from('LYD'));
});

afterEach(async () => {
  await app.close();
  await rm(mappe, { recursive: true, force: true });
});

describe('API: signaltaarne', () => {
  test('planen foeder fire taarne, og de staar paa kortet hele tiden', async () => {
    await post('/api/admin/udvidelse/pakke', { aktiv: true, taarnAktiv: true });
    const s = (await skaerm()).udvidelse;
    expect(s?.taarne).toHaveLength(4);
    expect(s?.taarne.every((t) => !t.aktiv)).toBe(true);

    // et minut efter staar de der stadig
    ur.spol(sek(600));
    expect((await skaerm()).udvidelse?.taarne).toHaveLength(4);
  });

  test('aktivér alle fire: lydklippet overtager skaermbilledet, og tier igen', async () => {
    await post('/api/admin/udvidelse/pakke', { aktiv: true, taarnAktiv: true, taarnLyd: 'klip.m4a' });
    const ider = (await skaerm()).udvidelse!.taarne.map((t) => t.id);

    for (const id of ider.slice(0, 3)) await post(`/api/admin/udvidelse/taarn/${id}/aktiver`);
    expect((await skaerm()).lydklip).toBeNull();

    await post(`/api/admin/udvidelse/taarn/${ider[3]}/aktiver`);
    const forbundet = await skaerm();
    expect(forbundet.lydklip?.fil).toBe('klip.m4a');
    expect(forbundet.udvidelse?.forbundet).toBe(true);

    await post(`/api/admin/udvidelse/taarn/${ider[0]}/deaktiver`);
    expect((await skaerm()).lydklip).toBeNull();
  });

  test('tilfoej, respawn, kode og slet', async () => {
    await post('/api/admin/udvidelse/pakke', { aktiv: true, taarnAktiv: true });

    const nyt = await post('/api/admin/udvidelse/taarn', {
      titel: 'TÅRN 5',
      vinkelFra: 10,
      vinkelTil: 50,
      kode: 'kode-1.png',
    });
    expect(nyt.statusCode).toBe(200);
    const taarne = nyt.json().udvidelse.taarne;
    expect(taarne).toHaveLength(5);
    const femte = taarne.at(-1);
    expect(femte.pejlingGrader).toBeGreaterThanOrEqual(9);
    expect(femte.pejlingGrader).toBeLessThanOrEqual(51);

    const respawn = await post(`/api/admin/udvidelse/taarn/${femte.id}/respawn`);
    expect(respawn.statusCode).toBe(200);

    const kode = await post(`/api/admin/udvidelse/taarn/${femte.id}/kode`);
    expect(kode.statusCode).toBe(200);
    const vist = (await skaerm()).udvidelse?.kode;
    expect(vist?.id).toBe(femte.id);
    const billede = await app.inject({ method: 'GET', url: vist?.billede ?? '' });
    expect(billede.statusCode).toBe(200);
    expect(billede.rawPayload.toString()).toBe('PNG-BYTES');

    ur.spol(sek(KODE_SEK + 30));
    expect((await skaerm()).udvidelse?.kode).toBeNull();
    expect((await app.inject({ method: 'GET', url: vist?.billede ?? '' })).statusCode).toBe(404);

    const slettet = await app.inject({
      method: 'DELETE',
      url: `/api/admin/udvidelse/taarn/${femte.id}`,
      headers: auth,
    });
    expect(slettet.json().udvidelse.taarne).toHaveLength(4);
  });

  test('nulstil lyd: beskeden begynder forfra, og knappen svarer med overblikket', async () => {
    await post('/api/admin/udvidelse/pakke', { aktiv: true, taarnAktiv: true, taarnLyd: 'klip.m4a' });
    const ider = (await skaerm()).udvidelse!.taarne.map((t) => t.id);
    for (const id of ider) await post(`/api/admin/udvidelse/taarn/${id}/aktiver`);

    const foer = (await skaerm()).lydklip?.haendelseId;
    expect(foer).toBeDefined();

    ur.spol(sek(60));
    const svar = await post('/api/admin/udvidelse/lyd/nulstil');
    expect(svar.statusCode).toBe(200);
    expect(svar.json().udvidelse.afspilletSek).toBe(0);

    const efter = (await skaerm()).lydklip;
    expect(efter?.haendelseId).not.toBe(foer);
    expect(efter?.sekunderSiden).toBe(0);
  });

  test('afviser et lydklip der ikke findes', async () => {
    const svar = await post('/api/admin/udvidelse/pakke', { taarnLyd: 'findes-ikke.m4a' });
    expect(svar.statusCode).toBe(400);
  });

  test('ugyldigt spektrum og ukendt taarn giver en forstaaelig fejl', async () => {
    await post('/api/admin/udvidelse/pakke', { aktiv: true, taarnAktiv: true });
    const dårligt = await post('/api/admin/udvidelse/taarn', { titel: 'T', vinkelFra: 0, vinkelTil: 400, kode: null });
    expect(dårligt.statusCode).toBe(400);

    const ukendt = await post('/api/admin/udvidelse/taarn/findes-ikke/aktiver');
    expect(ukendt.statusCode).toBe(400);
    expect(ukendt.json().fejl).toMatch(/findes ikke/);
  });
});
