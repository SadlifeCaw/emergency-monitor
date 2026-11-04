/**
 * Reglerne omkring lydklippet, som rene funktioner.
 *
 * Skilt fra afspilningen, fordi det er her tingene kan gaa galt uden at nogen
 * hoerer det: et klip der starter forfra ved hver genindlaesning, eller en
 * dekryptering der ikke staar paa 100 % mens klippet spiller.
 */

import type { Skaermbillede } from './kontrakt.js';

/** Sekunder med opbygning foer klippet starter. Giver skaermen tid til at "faa fat". */
export const OPBYGNING_SEK = 10;

/**
 * Hvor langt inde i klippet skaermen skal starte.
 *
 * Et friskt klip er 0-2 sekunder gammelt, naar skaermen ser det - det spilles
 * fra start. Er det aeldre, er skaermen genindlaest midt i det, og det genoptages
 * dér. (Under en generalproeve med hurtigt ur er sekunderne virtuelle; derfor
 * kun ved reelt gamle klip.)
 */
export const startforskydningSek = (sekunderSiden: number): number =>
  sekunderSiden > 2 ? sekunderSiden : 0;

/** Opbygningen springes over, naar skaermen genoptager midt i et klip. */
export const opbygningFor = (forskydningSek: number): number =>
  forskydningSek > 0 ? 0 : OPBYGNING_SEK;

/** Er klippet allerede forbi, naar vi naar til det? Ukendt laengde er ikke forbi. */
export const erForbi = (forskydningSek: number, varighedSek: number | null): boolean =>
  varighedSek !== null && forskydningSek >= varighedSek;

/**
 * Skaermbilledet panelerne tegner.
 *
 * `andel` er hvor langt dekrypteringen er naaet mod 100 %: 0 er uroert, 1 er
 * fuld. Under opbygningen loeber den op fra det normale tal; mens klippet spiller,
 * staar den paa 100. Null roerer ikke ved noget.
 */
export const medFuldDekryptering = (s: Skaermbillede, andel: number | null): Skaermbillede => {
  if (andel === null) return s;
  const a = Math.min(1, Math.max(0, andel));
  const procent = Math.round(s.dekryptering.procent + (100 - s.dekryptering.procent) * a);
  return { ...s, dekryptering: { ...s.dekryptering, procent } };
};
