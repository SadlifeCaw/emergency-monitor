/**
 * Geografi.
 *
 * Alarmpanelet skal give et vagthold i moerke praecis tre ting: hvor langt,
 * hvilken retning, og et koordinat de kan skrive af. Det er det, filen her leverer.
 */

import type { Punkt } from './typer.js';

/** Jordens middelradius i meter (IUGG). */
const JORDRADIUS_M = 6_371_000;

const grader = (radianer: number): number => (radianer * 180) / Math.PI;
const radianer = (grad: number): number => (grad * Math.PI) / 180;

/** Storcirkelafstand i meter (haversine). */
export const afstandM = (fra: Punkt, til: Punkt): number => {
  const dLat = radianer(til.lat - fra.lat);
  const dLon = radianer(til.lon - fra.lon);
  const lat1 = radianer(fra.lat);
  const lat2 = radianer(til.lat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return JORDRADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Retvisende pejling i grader, altid i intervallet [0, 360). */
export const pejlingGrader = (fra: Punkt, til: Punkt): number => {
  const dLon = radianer(til.lon - fra.lon);
  const lat1 = radianer(fra.lat);
  const lat2 = radianer(til.lat);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (grader(Math.atan2(y, x)) + 360) % 360;
};

/**
 * Ligger punktet inden for radius af basen?
 *
 * Vagten er den eneste spaerring mellem et taste-slip kl. 02 og fire teenagere
 * sendt mod Vejle Fjord. Graensen er inklusiv.
 */
export const indenforRadius = (base: Punkt, punkt: Punkt, radiusM: number): boolean =>
  afstandM(base, punkt) <= radiusM;

/**
 * Hvilken sektor peger en pejling ind i?
 *
 * Sektor 1 begynder i nord og taelles med uret. Med 8 sektorer daekker sektor 1
 * altsaa 0-45 grader. Udledes altid af geometrien, saa skaermens kile og
 * skaermens tal ikke kan komme til at sige hver sit.
 */
export const sektorFor = (pejling: number, antalSektorer: number): number => {
  if (!Number.isInteger(antalSektorer) || antalSektorer < 1) {
    throw new RangeError(`Antal sektorer skal vaere mindst 1, fik ${antalSektorer}`);
  }
  const normaliseret = ((pejling % 360) + 360) % 360;
  return Math.floor((normaliseret / 360) * antalSektorer) + 1;
};

const ddmDel = (vaerdi: number, positiv: string, negativ: string, gradcifre: number): string => {
  const retning = vaerdi >= 0 ? positiv : negativ;
  const absolut = Math.abs(vaerdi);
  const hele = Math.floor(absolut);
  const minutter = (absolut - hele) * 60;
  return `${String(hele).padStart(gradcifre, '0')}°${minutter.toFixed(3).padStart(6, '0')}'${retning}`;
};

/**
 * Grader og decimalminutter, delt i to.
 *
 * Delt fordi skaermen saetter bredde og laengde paa hver sin linje: et
 * koordinat paa én linje bliver for smalt at laese paa afstand, og to linjer
 * er ogsaa den maade, et koordinat laeses op og skrives ned paa.
 */
export const ddmDele = (punkt: Punkt): { lat: string; lon: string } => ({
  lat: ddmDel(punkt.lat, 'N', 'S', 2),
  lon: ddmDel(punkt.lon, 'E', 'W', 3),
});

/**
 * Decimalgrader med fem decimaler (ca. 1 m) - samme skrivemaade som felterne i admin,
 * og den Google Maps forstaar, naar den indsaettes som "55.66010, 9.36480".
 */
export const decimalgrader = (punkt: Punkt): { lat: string; lon: string } => ({
  lat: punkt.lat.toFixed(5),
  lon: punkt.lon.toFixed(5),
});

/**
 * Grader og decimalminutter - formatet paa et soekort og i en redningsmelding.
 * Valgt frem for decimalgrader, fordi det er lettere at skrive korrekt af i moerke.
 */
export const formaterDdm = (punkt: Punkt): string => {
  const { lat, lon } = ddmDele(punkt);
  return `${lat} ${lon}`;
};
