/**
 * Telemetri-loggen.
 *
 * Nyeste linje nederst, som paa en printer - ikke oeverst, som paa et website.
 * Loggen er det instrument, der goer alarmen dramatisk: naar fyrre linjers
 * "intet at bemaerke" pludselig bliver roede, har man laest det uden at laese det.
 *
 * Kun den nyeste linje skrives ud tegn for tegn. Ville alle linjer gøre det ved
 * hver opdatering, ville bunden af skaermen flimre hele natten.
 */

import { lokalTid } from '../format.js';
import { el } from './panel.js';
import type { Panel } from './panel.js';
import type { Loglinje } from '../kontrakt.js';

/** Hvor mange linjer der kan staa. Resten klippes af, saa DOM'en ikke vokser. */
const SYNLIGE_LINJER = 14;

const lavLinje = (linje: Loglinje, erNyeste: boolean): HTMLElement => {
  const raekke = el('div', `log__linje${erNyeste ? ' log__linje--ny' : ''}`);
  raekke.dataset['niveau'] = linje.niveau;
  raekke.append(
    el('span', 'log__kl', lokalTid(linje.kl)),
    el('span', 'log__mark'),
    el('span', 'log__tekst', linje.tekst),
  );
  return raekke;
};

export const lavLogpanel = (vaert: HTMLElement): Panel => {
  let sidsteKl = '';

  return {
    opdater: (s) => {
      const nyeste = s.log.at(-1);
      if (!nyeste || nyeste.kl === sidsteKl) return;
      sidsteKl = nyeste.kl;

      const synlige = s.log.slice(-SYNLIGE_LINJER);
      vaert.replaceChildren(
        ...synlige.map((linje, i) => lavLinje(linje, i === synlige.length - 1)),
      );
    },
  };
};
