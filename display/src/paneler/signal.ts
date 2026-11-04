/**
 * Signaltaarne fra udvidelsespakken: forbindelsespanel og kode.
 *
 * To flader, begge skjult som standard:
 *
 *  - **Signalkortet** oeverst paa radaren, mens et punkt staar der: hvad der er
 *    fundet, hvor det er, og hvad holdet skal goere. Instruktionen om at dele lokation
 *    er ikke en del af radaren - den staar bare som tekst.
 *  - **Koden**, naar alarmen er godkendt: et praedefineret billede, der vises
 *    i faa sekunder og lukker ned igen. Skaermen ved ikke hvem der godkendte.
 *
 * Er pakken ikke aktiveret, er `udvidelse` null, og ingen af dem tegnes.
 */

import { el, saetTekst } from './panel.js';
import type { Panel } from './panel.js';

const lavKode = (vaert: HTMLElement): Panel => {
  const overskrift = el('div', 'signalkode__hoved', 'SIGNAL BEKRÆFTET');
  const titel = el('div', 'signalkode__titel');
  const billede = el('img', 'signalkode__billede');
  billede.alt = 'Kode';
  const nedtaelling = el('div', 'signalkode__tid');
  vaert.append(overskrift, titel, billede, nedtaelling);

  let visFor = '';

  return {
    opdater: (s) => {
      const kode = s.udvidelse?.kode ?? null;
      vaert.hidden = kode === null;
      if (!kode) {
        // Billedet fjernes helt, saa koden ikke ligger i DOM'en bagefter.
        if (visFor !== '') billede.removeAttribute('src');
        visFor = '';
        return;
      }

      if (kode.billede !== visFor) {
        visFor = kode.billede;
        billede.src = kode.billede;
      }
      saetTekst(titel, kode.titel);
      saetTekst(nedtaelling, `LUKKER OM ${String(kode.sekunderTilbage).padStart(2, '0')} S`);
    },
  };
};

/**
 * Signaltaarnenes status: hvor mange der er aktive, og om forbindelsen staar.
 * Skjult, saa laenge pakken ikke har nogen taarne.
 */
const lavTaarnstatus = (vaert: HTMLElement): Panel => {
  const hoved = el('div', 'taarnstatus__hoved');
  const antal = el('span', 'taarnstatus__antal');
  hoved.append(el('span', undefined, 'SIGNALFORBINDELSE'), antal);
  const liste = el('div', 'taarnstatus__liste');
  const tilstand = el('div', 'taarnstatus__tilstand');
  vaert.append(hoved, liste, tilstand);

  let noegle = '';

  return {
    opdater: (s) => {
      const taarne = s.udvidelse?.taarne ?? [];
      vaert.hidden = taarne.length === 0;
      if (taarne.length === 0) {
        noegle = '';
        return;
      }

      const aktive = taarne.filter((t) => t.aktiv).length;
      const forbundet = s.udvidelse?.forbundet ?? false;
      vaert.dataset['forbundet'] = forbundet ? 'ja' : 'nej';
      saetTekst(antal, `${aktive} / ${taarne.length}`);
      saetTekst(tilstand, forbundet ? 'FORBUNDET' : 'IKKE FORBUNDET');

      const n = taarne.map((t) => `${t.id}:${t.aktiv ? 1 : 0}:${t.titel}`).join('|');
      if (n === noegle) return;
      noegle = n;
      liste.replaceChildren(
        ...taarne.map((t) => {
          const raekke = el('div', 'taarnstatus__raekke');
          raekke.dataset['aktiv'] = t.aktiv ? 'ja' : 'nej';
          raekke.append(el('span', 'taarnstatus__prik', '●'), el('span', undefined, t.titel));
          return raekke;
        }),
      );
    },
  };
};

export const lavSignalpanel = (kodevaert: HTMLElement, taarnvaert: HTMLElement): Panel => {
  const kode = lavKode(kodevaert);
  const taarne = lavTaarnstatus(taarnvaert);

  return {
    opdater: (s) => {
      kode.opdater(s);
      taarne.opdater(s);
      document.body.dataset['signalkode'] = s.udvidelse?.kode ? 'ja' : 'nej';
    },
  };
};
