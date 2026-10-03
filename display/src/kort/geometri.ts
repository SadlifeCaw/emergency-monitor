/**
 * Kortgeometri.
 *
 * Ringene og sektorlinjerne er ikke pynt: de er den maalestok, et vagthold
 * bruger til at gaette afstanden til et punkt, foer de har laest tallet.
 * Derfor udregnes de, og haardkodes ikke.
 */

const JORDRADIUS_M = 6_371_000;

const rad = (grad: number): number => (grad * Math.PI) / 180;
const grad = (radianer: number): number => (radianer * 180) / Math.PI;

export interface Punkt {
  readonly lat: number;
  readonly lon: number;
}

export interface Sektorlinje {
  readonly fra: Punkt;
  readonly til: Punkt;
  readonly pejling: number;
}

/**
 * Punktet man naar ved at gaa `afstandM` meter i retning `pejling` fra `fra`.
 * Modstykket til geo.pejlingGrader paa serveren.
 */
export const punktIRetning = (fra: Punkt, pejling: number, afstandM: number): Punkt => {
  const vinkelafstand = afstandM / JORDRADIUS_M;
  const theta = rad(pejling);
  const lat1 = rad(fra.lat);
  const lon1 = rad(fra.lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(vinkelafstand) +
      Math.cos(lat1) * Math.sin(vinkelafstand) * Math.cos(theta),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(vinkelafstand) * Math.cos(lat1),
      Math.cos(vinkelafstand) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: grad(lat2), lon: grad(lon2) };
};

/**
 * Afstandsringene. Yderste ring er altid selve alarmradius, saa skaermen viser
 * den graense, admin ogsaa valideres mod.
 */
export const ringradier = (maxRadiusM: number): number[] => [
  maxRadiusM / 4,
  maxRadiusM / 2,
  maxRadiusM,
];

/** Graenselinjerne mellem sektorerne, taellet med uret fra nord. */
export const sektorlinjer = (base: Punkt, antalSektorer: number, radiusM: number): Sektorlinje[] =>
  Array.from({ length: antalSektorer }, (_, i) => {
    const pejling = (i * 360) / antalSektorer;
    return { fra: base, til: punktIRetning(base, pejling, radiusM), pejling };
  });

/** Midterpejlingen i en sektor. Bruges til at placere sektornummeret. */
export const sektormidte = (sektorNummer: number, antalSektorer: number): number =>
  ((sektorNummer - 1) * 360) / antalSektorer + 180 / antalSektorer;
