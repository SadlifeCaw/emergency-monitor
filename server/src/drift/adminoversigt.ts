/**
 * Admins overblik.
 *
 * En anden visning end skaermens: hvor `Skaermbillede` er skrevet til et
 * vagthold, er det her skrevet til den, der styrer natten. Derfor
 * haendelseslisten med status og nedtaelling - og derfor afstand og pejling paa
 * hvert alarmpunkt, saa et rettet koordinat kan efterproeves, foer det bruges.
 */

import { afstandM, formaterDdm, pejlingGrader, sektorFor } from '../motor/geo.js';
import type { Haendelse, Scenarie, Tilstand } from '../motor/typer.js';

export type Haendelsesstatus = 'planlagt' | 'fyret' | 'oploest';

export interface HaendelseIOversigt {
  readonly id: string;
  readonly type: Haendelse['type'];
  readonly at: string;
  readonly titel: string;
  readonly status: Haendelsesstatus;
  readonly fyretKl: string | null;
  /** Sekunder til haendelsen forfalder. Negativt naar tidspunktet er passeret. */
  readonly sekunderTil: number;
  /** Falsk hvis den allerede er fyret. Admin-fladen graaner knappen. */
  readonly kanFyres: boolean;
  /**
   * Haendelsens egne felter - tekst, sektor, procent, fragment og saa videre.
   *
   * Baeres med, saa admin-formularen kan udfyldes uden et ekstra kald. Hvilke
   * felter der er, afhaenger af typen; det er derfor de ligger som en klump og
   * ikke som navngivne felter.
   */
  readonly felter: Record<string, unknown>;
  /** Kun for alarmer: hvor punktet ligger i forhold til basen. */
  readonly punkt: {
    readonly lat: number;
    readonly lon: number;
    readonly afstandM: number;
    readonly pejlingGrader: number;
    readonly sektor: number;
    readonly ddm: string;
  } | null;
}

export interface Adminoversigt {
  readonly serverKl: string;
  readonly fase: Tilstand['fase'];
  readonly vagthold: string;
  readonly scenarienavn: string;
  readonly base: Scenarie['base'];
  readonly kort: Scenarie['kort'];
  readonly vagt: Scenarie['vagt'];
  readonly haendelser: readonly HaendelseIOversigt[];
  readonly aktivAlarm: Tilstand['aktivAlarm'];
  /** Hvilke forstyrrelser der er slaaet til lige nu. */
  readonly ravage: Tilstand['ravage'];
  /** Naeste haendelse der endnu ikke er fyret, eller null. */
  readonly naeste: HaendelseIOversigt | null;
}

const statusFor = (tilstand: Tilstand, id: string): Haendelsesstatus => {
  const fyret = tilstand.fyrede[id];
  if (!fyret) return 'planlagt';
  return fyret.oploestKl === null ? 'fyret' : 'oploest';
};

/** Alt paa haendelsen ud over de faelles felter, som formularen ikke redigerer. */
const felterFor = (h: Haendelse): Record<string, unknown> => {
  const { id: _id, type: _type, at: _at, lyd: _lyd, ...resten } = h;
  return resten;
};

const punktFor = (scenarie: Scenarie, h: Haendelse): HaendelseIOversigt['punkt'] => {
  if (h.type !== 'ALARM') return null;
  const pejling = pejlingGrader(scenarie.base, h);
  return {
    lat: h.lat,
    lon: h.lon,
    afstandM: Math.round(afstandM(scenarie.base, h)),
    pejlingGrader: Math.round(pejling) % 360,
    sektor: sektorFor(pejling, scenarie.kort.sektorer),
    ddm: formaterDdm(h),
  };
};

export const bygAdminoversigt = (
  scenarie: Scenarie,
  tilstand: Tilstand,
  nu: number,
): Adminoversigt => {
  const haendelser = scenarie.haendelser.map((h): HaendelseIOversigt => {
    const status = statusFor(tilstand, h.id);
    return {
      id: h.id,
      type: h.type,
      at: h.at,
      titel: h.titel,
      status,
      fyretKl: tilstand.fyrede[h.id]?.fyretKl ?? null,
      sekunderTil: Math.round((Date.parse(h.at) - nu) / 1000),
      kanFyres: status === 'planlagt',
      felter: felterFor(h),
      punkt: punktFor(scenarie, h),
    };
  });

  return {
    serverKl: new Date(nu).toISOString(),
    fase: tilstand.fase,
    vagthold: tilstand.vagthold,
    scenarienavn: scenarie.navn,
    base: scenarie.base,
    kort: scenarie.kort,
    vagt: scenarie.vagt,
    haendelser,
    aktivAlarm: tilstand.aktivAlarm,
    ravage: tilstand.ravage,
    naeste: haendelser.find((h) => h.kanFyres) ?? null,
  };
};
