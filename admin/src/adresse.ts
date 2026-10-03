/**
 * Adresseopslag - kun i admin.
 *
 * Skaermen er offline-first og roerer aldrig ved internettet. Opslaget sker
 * derfor fra instruktoerens telefon, direkte til Klimadatastyrelsens
 * Adressevaelger (erstatningen for DAWA), og kun naar der trykkes "Find".
 * Falder nettet vaek, er det kun den bekvemmelighed der forsvinder: koordinatet
 * kan stadig tastes.
 *
 * To trin, fordi soegningen ikke returnerer koordinater:
 *   1. /husnumre/soeg   -> titel + id
 *   2. /husnumre/{id}   -> adgangspunkt i EPSG:25832, som regnes om til grader
 */

import { utm32TilGrader } from './utm.js';
import type { Grader } from './utm.js';

export interface Adressetraef {
  readonly navn: string;
  readonly id: string;
}

export type Hent = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const RODEN = 'https://adressevaelger.dk';
/** Delt demo-token fra Klimadatastyrelsens dokumentation. */
const TOKEN = 'adressevaelger123';
const MAKS_TRAEF = 5;
const MIN_TEGN = 3;

export class AdresseFejl extends Error {}

export const soegUrl = (soeg: string): string => {
  const params = new URLSearchParams({
    tekst: soeg,
    token: TOKEN,
    maksimum: String(MAKS_TRAEF),
  });
  return `${RODEN}/husnumre/soeg?${params.toString()}`;
};

export const opslagUrl = (id: string): string =>
  `${RODEN}/husnumre/${encodeURIComponent(id)}?token=${TOKEN}`;

const hentJson = async (url: string, hent: Hent): Promise<unknown> => {
  let svar;
  try {
    svar = await hent(url);
  } catch {
    throw new AdresseFejl('Ingen forbindelse til opslag. Tast koordinatet i stedet.');
  }
  if (!svar.ok) throw new AdresseFejl('Opslaget fejlede. Prøv igen, eller tast koordinatet.');
  return svar.json();
};

const erObjekt = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const soegAdresse = async (soeg: string, hent: Hent): Promise<Adressetraef[]> => {
  const tekst = soeg.trim();
  if (tekst.length < MIN_TEGN) throw new AdresseFejl('Skriv mindst tre tegn.');

  const raa = await hentJson(soegUrl(tekst), hent);
  const fund = erObjekt(raa) ? raa['fund'] : undefined;
  if (!Array.isArray(fund)) throw new AdresseFejl('Uventet svar fra opslaget.');

  return fund
    .filter(erObjekt)
    .map((f) => ({ navn: String(f['titel'] ?? ''), id: String(f['id'] ?? '') }))
    .filter((t) => t.navn !== '' && t.id !== '')
    .slice(0, MAKS_TRAEF);
};

/** Henter adgangspunktet for et husnummer og regner det om til grader. */
export const hentKoordinat = async (id: string, hent: Hent): Promise<Grader> => {
  const raa = await hentJson(opslagUrl(id), hent);
  const husnummer = erObjekt(raa) ? raa['husnummer'] : undefined;
  const punkt = erObjekt(husnummer) ? husnummer['adgangspunkt'] : undefined;
  const koord = erObjekt(punkt) ? punkt['koordinater'] : undefined;

  const x = erObjekt(koord) ? Number(koord['x']) : Number.NaN;
  const y = erObjekt(koord) ? Number(koord['y']) : Number.NaN;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new AdresseFejl('Adressen har intet koordinat. Tast det i stedet.');
  }
  return utm32TilGrader(x, y);
};
