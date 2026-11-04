/**
 * Udvidelsespakken: kontakten.
 *
 * Taarnene og lydklippene (se taarnpanel.ts og lydpanel.ts) ligger under
 * pakken og dukker kun op, naar den er slaaet til. Er pakken fra, ser skaermen
 * ud som normalt - og intet af det der hoerer til pakken vises i admin.
 */

import type { Adminoversigt } from './typer.js';

export interface Signalpanel {
  opdater(oversigt: Adminoversigt): void;
}

export interface Signalafhaengigheder {
  readonly pakke: (aendring: { aktiv?: boolean }) => Promise<boolean>;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  navn: K,
  klasse?: string,
  tekst?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(navn);
  if (klasse) e.className = klasse;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};

export const lavSignalpanel = (vaert: HTMLElement, afh: Signalafhaengigheder): Signalpanel => {
  vaert.append(el('h2', 'legende', 'Udvidelsespakke'));

  const kontakt = el('button', 'kontakt');
  kontakt.type = 'button';
  kontakt.setAttribute('role', 'switch');
  kontakt.setAttribute('aria-checked', 'false');

  const spor = el('span', 'kontakt__spor');
  spor.append(el('span', 'kontakt__knap'));

  const tekst = el('span', 'kontakt__tekst');
  tekst.append(
    el('span', 'kontakt__navn', 'Aktivér udvidelsespakken'),
    el(
      'span',
      'kontakt__forklaring',
      'Låser signaltårne og lydklip op. Slået fra ser skærmen ud som normalt.',
    ),
  );

  kontakt.append(spor, tekst);
  kontakt.addEventListener('click', () => {
    const til = kontakt.getAttribute('aria-checked') !== 'true';
    kontakt.setAttribute('aria-checked', String(til));
    void afh.pakke({ aktiv: til });
  });
  vaert.append(kontakt);

  return {
    opdater: (o) => {
      kontakt.setAttribute('aria-checked', String(o.udvidelse?.aktiv ?? false));
    },
  };
};
