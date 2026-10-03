/**
 * Deterministisk stoej.
 *
 * Telemetrien maa ikke bruge Math.random(). To grunde: generalproeven skal se
 * praecis ud som den rigtige nat, og en fejl kl. 03 skal kunne genskabes bagefter.
 *
 * Vi bruger en hash og ikke en stroem-generator. Forskellen betyder noget: en
 * klient der genforbinder midt i natten kan regne de samme vaerdier ud for de
 * samme tidspunkter, uden at kende det, der er sket imens.
 */

const BLANDINGSTAL = 0x9e3779b9; // gyldent snit, standardvalg til hash-blanding

/** Blander en raekke tal til et uint32. */
export const hash32 = (...tal: readonly number[]): number => {
  let h = 0x811c9dc5;
  for (const t of tal) {
    let x = Math.trunc(t) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x ^= x >>> 16;
    h = Math.imul(h ^ x, BLANDINGSTAL) >>> 0;
    h = ((h << 13) | (h >>> 19)) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * Hasher en tekst til et uint32.
 *
 * Bruges til at goere et haendelses-id til en trykningsnoegle, saa hver
 * haendelse faar sit eget - men altid det samme - traek.
 */
export const tekstHash = (tekst: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i += 1) {
    h = Math.imul(h ^ tekst.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash32(h);
};

/** Deterministisk stoej i intervallet [0, 1). */
export const enhedsStoej = (...noegler: readonly number[]): number =>
  hash32(...noegler) / 0x1_0000_0000;

/** Vaelger deterministisk et element fra en pulje. */
export const vaelg = <T>(pulje: readonly T[], ...noegler: readonly number[]): T => {
  if (pulje.length === 0) {
    throw new RangeError('Kan ikke vaelge fra en tom pulje');
  }
  const element = pulje[hash32(...noegler) % pulje.length];
  // Indekset er altid gyldigt; assertionen er kun for noUncheckedIndexedAccess.
  return element as T;
};
