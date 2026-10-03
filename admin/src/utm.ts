/**
 * ETRS89 / UTM zone 32N (EPSG:25832) til WGS84 bredde/laengde.
 *
 * Adressevaelgeren giver koordinater i UTM; skaermen og admin regner i grader.
 * ETRS89 og WGS84 afviger under en meter, saa de behandles som det samme.
 * Kruegers serie (Karney, 2011) - nøjagtig til millimeter inden for zonen.
 */

const A_AKSE = 6_378_137;
const FLADTRYK = 1 / 298.257222101;
const K0 = 0.9996;
const OEST_FORSKYDNING = 500_000;
const MIDTERMERIDIAN_GRAD = 9;

export interface Grader {
  readonly lat: number;
  readonly lon: number;
}

export const utm32TilGrader = (oest: number, nord: number): Grader => {
  const n = FLADTRYK / (2 - FLADTRYK);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n2 * n2;
  const aa = (A_AKSE / (1 + n)) * (1 + n2 / 4 + n4 / 64);

  const beta = [
    n / 2 - (2 * n2) / 3 + (37 * n3) / 96,
    n2 / 48 + n3 / 15,
    (17 * n3) / 480,
  ];
  const delta = [2 * n - (2 * n2) / 3 - 2 * n3, (7 * n2) / 3 - (8 * n3) / 5, (56 * n3) / 15];

  const xi = nord / (K0 * aa);
  const eta = (oest - OEST_FORSKYDNING) / (K0 * aa);

  let xiP = xi;
  let etaP = eta;
  beta.forEach((b, i) => {
    const j = 2 * (i + 1);
    xiP -= b * Math.sin(j * xi) * Math.cosh(j * eta);
    etaP -= b * Math.cos(j * xi) * Math.sinh(j * eta);
  });

  const chi = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  let phi = chi;
  delta.forEach((d, i) => {
    phi += d * Math.sin(2 * (i + 1) * chi);
  });

  const lambda = (MIDTERMERIDIAN_GRAD * Math.PI) / 180 + Math.atan2(Math.sinh(etaP), Math.cos(xiP));

  return { lat: (phi * 180) / Math.PI, lon: (lambda * 180) / Math.PI };
};
