/**
 * Faelles form for skaermens paneler.
 *
 * Hvert panel bygger selv sit indhold i en tom vaert og opdaterer sig fra ét
 * skaermbillede. Ingen panel kender de andre, og ingen af dem regner noget ud -
 * det er allerede gjort paa serveren.
 */

import type { Skaermbillede } from '../kontrakt.js';

export interface Panel {
  opdater(skaermbillede: Skaermbillede): void;
}

/** Kort hjaelper til at bygge et element uden at skrive seks linjer hver gang. */
export const el = <K extends keyof HTMLElementTagNameMap>(
  navn: K,
  klasse?: string,
  tekst?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(navn);
  if (klasse) e.className = klasse;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
};

/** Saetter tekst kun naar den faktisk aendrer sig. Sparer unødig gentegning. */
export const saetTekst = (e: HTMLElement, tekst: string): void => {
  if (e.textContent !== tekst) e.textContent = tekst;
};
