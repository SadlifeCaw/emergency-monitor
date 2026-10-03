/**
 * Testhjaelpere: byg scenarier og tilstande uden at gentage 40 linjers JSON i hver test.
 */

import type {
  Afslut,
  Alarm,
  Anomali,
  Dekryptering,
  Haendelse,
  Melding,
  Scenarie,
  Tilstand,
} from '../../src/motor/typer.js';

/** Vork Bakker 12, 7100 Vejle. Slaaet op i OpenStreetMap, skal verificeres i marken. */
export const VORK = { lat: 55.65831, lon: 9.359385 } as const;

/** Fast referencetidspunkt, saa testene aldrig afhaenger af hvornaar de koeres. */
export const T0 = Date.parse('2026-07-15T23:30:00+02:00');

export const iso = (ms: number): string => new Date(ms).toISOString();
export const sek = (n: number): number => n * 1000;
export const min = (n: number): number => n * 60_000;

export const bygScenarie = (overskriv: Partial<Scenarie> = {}): Scenarie => ({
  version: 1,
  navn: 'Testnat',
  seed: 20260715,
  base: { ...VORK, label: 'STATION VORK', verificeret: false },
  kort: { startZoom: 15, maxRadiusM: 800, sektorer: 8 },
  nat: { fra: '23:00', til: '05:00', anomalierPrNat: 4 },
  haendelser: [],
  ...overskriv,
});

export const bygAnomali = (overskriv: Partial<Anomali> = {}): Anomali => ({
  type: 'ANOMALI',
  id: 'anomali-1',
  at: iso(T0 + min(60)),
  titel: 'SVAGT SEISMISK UDSLAG',
  tekst: 'AFVENTER BEKRAEFTELSE',
  sektor: 3,
  autoOploesSek: 90,
  lyd: 'blip',
  ...overskriv,
});

export const bygAlarm = (overskriv: Partial<Alarm> & { spredningMin?: number } = {}): Alarm => ({
  type: 'ALARM',
  id: 'alarm-hoved',
  at: iso(T0 + min(164)),
  titel: 'BEKRAEFTET AKTIVITET',
  lat: 55.6601,
  lon: 9.3648,
  usikkerhedM: 40,
  naermestePunkt: 'P15 TREKANTSDEPOT',
  instruks: 'UDRYK STRAKS - MELD VED ANKOMST',
  optrapningSek: 300,
  lyd: 'sirene',
  ...overskriv,
});

export const bygDekryptering = (overskriv: Partial<Dekryptering> = {}): Dekryptering => ({
  type: 'DEKRYPTERING',
  id: 'dekryptering-1',
  at: iso(T0 + min(30)),
  titel: 'DELVIS DEKRYPTERING',
  procent: 34,
  fragment: '...den sovende skal vaekkes ved det sjette ...',
  lyd: 'ingen',
  ...overskriv,
});

export const bygMelding = (overskriv: Partial<Melding> = {}): Melding => ({
  type: 'MELDING',
  id: 'melding-1',
  at: iso(T0 + min(15)),
  titel: 'MELDING FRA CENTRALEN',
  tekst: 'ARKIVMATERIALE EGTVED FRIGIVET TIL NYOPTAGET PERSONEL',
  lyd: 'alert',
  ...overskriv,
});

export const bygAfslut = (overskriv: Partial<Afslut> = {}): Afslut => ({
  type: 'AFSLUT',
  id: 'afslut-1',
  at: iso(T0 + min(300)),
  titel: 'VAGTEN AFSLUTTET',
  tekst: 'SAGEN OVERDRAGES TIL DAGHOLDET',
  lyd: 'ingen',
  ...overskriv,
});

export const bygTilstand = (overskriv: Partial<Tilstand> = {}): Tilstand => ({
  scenarioId: 'test',
  startetKl: iso(T0),
  fase: 'ROLIG',
  fyrede: {},
  tvungne: {},
  aktivAlarm: null,
  dekrypteringProcent: 0,
  dekrypteringFragment: null,
  vagthold: 'A',
  ravage: { sloeretKort: false, skjulKoordinat: false, glitch: false },
  ...overskriv,
});

/** Kort til at bygge et scenarie med et par haendelser. */
export const medHaendelser = (...haendelser: Haendelse[]): Scenarie =>
  bygScenarie({ haendelser });
