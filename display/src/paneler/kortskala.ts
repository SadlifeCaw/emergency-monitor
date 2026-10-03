/**
 * Afstandsskalaen i kortets hjoerne.
 *
 * Findes fordi kortet zoomer ind, naar alarmen falder: ringene med deres
 * metertal glider ud af billedet praecis naar skalaen skal bruges. Den her
 * bliver staaende.
 *
 * Laengden vaelges blandt runde tal, saa stregen altid svarer til noget, man
 * kan regne i hovedet - 50, 100, 200, 500 m - og aldrig til 173 m.
 */

import { el, saetTekst } from './panel.js';

const RUNDE_LAENGDER = [25, 50, 100, 200, 500, 1000] as const;
/** Skalastregen sigter efter denne bredde i pixels. */
const MAALBREDDE_PX = 110;

export interface Kortskala {
  opdater(meterPrPixel: number): void;
}

export const lavKortskala = (vaert: HTMLElement): Kortskala => {
  const streg = el('div', 'kortskala__streg');
  const maerkat = el('span', 'felt', '');
  vaert.append(streg, maerkat);

  return {
    opdater: (meterPrPixel) => {
      if (!Number.isFinite(meterPrPixel) || meterPrPixel <= 0) return;

      const oensket = MAALBREDDE_PX * meterPrPixel;
      // Findes intet rundt tal stort nok, bruges det stoerste vi har.
      const laengde = RUNDE_LAENGDER.find((l) => l >= oensket) ?? 1000;

      streg.style.width = `${Math.round(laengde / meterPrPixel)}px`;
      saetTekst(maerkat, `${laengde} m`);
    },
  };
};
