/**
 * Dekrypteringspanelet.
 *
 * Bindeleddet mellem skaermen og nattens papirarbejde: her laekker kultens
 * opsnappede beskeder ud gennem natten, én bid ad gangen.
 *
 * Meteret er sat i blokke frem for som en tegnet bjaelke, saa det deler skrift
 * og rytme med resten af terminalen. Fragmentet staar i papirfarve og ikke i
 * fosfor - forskellen fortaeller uden ord, at det her er noget kulten har
 * skrevet, ikke noget systemet har maalt.
 *
 * Overstregningen i teksten kommer fra serveren. Tidligere satte skaermen selv
 * blokke bagefter fragmentet ud fra procenten - men procenten er stemning og
 * vipper op og ned, saa blokkene betoed ingenting og saa forkerte ud.
 */

import { blokmeter, fastTal } from '../format.js';
import { el, saetTekst } from './panel.js';
import type { Panel } from './panel.js';

const METERBREDDE = 22;

export const lavDekrypteringspanel = (vaert: HTMLElement): Panel => {
  const procent = el('span', 'tal', '000%');
  const hoved = el('div', 'panel__navn');
  hoved.append(el('span', 'felt', 'Dekryptering'), procent);

  const meter = el('div', 'dekryptering__meter', blokmeter(0, METERBREDDE));
  const fragment = el('p', 'dekryptering__fragment', '');

  vaert.append(hoved, meter, fragment);

  return {
    opdater: (s) => {
      const p = s.dekryptering.procent;
      saetTekst(procent, `${fastTal(p, 3, 0)}%`);
      saetTekst(meter, blokmeter(p, METERBREDDE));
      // Overstregningen laegges paa af serveren, saa skaermen viser praecis
      // det, systemet mener det har laest.
      saetTekst(fragment, s.dekryptering.fragment ? `»${s.dekryptering.fragment}«` : '');
    },
  };
};
