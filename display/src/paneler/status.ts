/**
 * Statuspanelet.
 *
 * Ét felt der siger, hvad systemet mener lige nu, i hele saetninger frem for i
 * koder. Det er det panel, en instruktoer kan kigge paa fra doeren og forstaa.
 *
 * Anomalier vises som gule linjer med teksten "afventer bekraeftelse". Det er
 * med vilje: tvivlen skal ligge i det gule. Naar alarmen falder, er der ingen
 * tvivl - og fase 5 lader den overtage skaermen herfra.
 */

import { el, saetTekst } from './panel.js';
import type { Panel } from './panel.js';
import type { Fase } from '../kontrakt.js';

const ROLIG_TEKST: Record<Fase, string> = {
  ROLIG: 'Området er stille. Sensorerne svarer som de skal.',
  OPTRAPNING: 'Målingerne stiger. Bliv ved skærmen.',
  ALARM: 'Bekræftet aktivitet. Ryk ud mod punktet på kortet.',
  AFSLUTTET: 'Vagten er slut. Sagen er overdraget til dagholdet.',
};

export const lavStatuspanel = (vaert: HTMLElement): Panel => {
  const hoved = el('div', 'panel__navn');
  hoved.append(el('span', 'felt', 'Status'));

  const tekst = el('p', 'status__tekst', '');
  const anomalier = el('div');

  vaert.append(hoved, tekst, anomalier);

  return {
    opdater: (s) => {
      vaert.dataset['fase'] = s.fase;
      saetTekst(tekst, ROLIG_TEKST[s.fase]);

      anomalier.replaceChildren(
        ...s.anomalier.map((a) => {
          const linje = el('div', 'anomali');
          linje.append(
            el('span', 'anomali__mark', '!'),
            document.createTextNode(`Sektor ${a.sektor}: ${a.titel.toLowerCase()}. ${a.tekst}.`),
          );
          return linje;
        }),
      );
    },
  };
};
