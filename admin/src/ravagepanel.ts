/**
 * Forstyrrelserne.
 *
 * Tre kontakter, der saetter monitoren ud af drift. Kulten forstyrrer udstyret
 * - det er et virkemiddel, ikke en fejl.
 *
 * De er tegnet som fysiske kontakter og ikke som afkrydsningsfelter, fordi de
 * betjenes blindt: knappen bevaeger sig, saa man kan se hvad man gjorde uden at
 * skulle laese. Og de kraever ikke langt tryk - kun det, man ikke kan fortryde,
 * goer det. En forstyrrelse kan altid slaas fra igen.
 */

import type { Adminoversigt } from './typer.js';

type Navn = 'sloeretKort' | 'skjulKoordinat' | 'glitch';

interface Kontaktdef {
  readonly navn: Navn;
  readonly titel: string;
  readonly forklaring: string;
}

const KONTAKTER: readonly Kontaktdef[] = [
  {
    navn: 'sloeretKort',
    titel: 'Slør kortet',
    forklaring: 'Terrænet bliver ulæseligt. Ringe og alarmpunkt bliver skarpe.',
  },
  {
    navn: 'skjulKoordinat',
    titel: 'Skjul koordinatet',
    forklaring: 'Koordinatet flakker ud. Afstand og pejling bliver stående.',
  },
  {
    navn: 'glitch',
    titel: 'Glitch',
    forklaring: 'Skærmen sætter ud en gang imellem og kommer tilbage.',
  },
];

export interface Ravagepanel {
  opdater(oversigt: Adminoversigt): void;
}

export interface Ravageafhaengigheder {
  readonly saet: (aendringer: Record<Navn, boolean> | Partial<Record<Navn, boolean>>) => Promise<boolean>;
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

const lavKontakt = (def: Kontaktdef, slaaTil: (til: boolean) => void): HTMLButtonElement => {
  const knap = el('button', 'kontakt');
  knap.type = 'button';
  knap.setAttribute('role', 'switch');
  knap.setAttribute('aria-checked', 'false');

  const spor = el('span', 'kontakt__spor');
  spor.append(el('span', 'kontakt__knap'));

  const tekst = el('span', 'kontakt__tekst');
  tekst.append(
    el('span', 'kontakt__navn', def.titel),
    el('span', 'kontakt__forklaring', def.forklaring),
  );

  knap.append(spor, tekst);
  knap.addEventListener('click', () => {
    slaaTil(knap.getAttribute('aria-checked') !== 'true');
  });

  return knap;
};

export const lavRavagepanel = (
  vaert: HTMLElement,
  { saet }: Ravageafhaengigheder,
): Ravagepanel => {
  vaert.append(el('h2', 'legende', 'Forstyrrelser'));

  const knapper = new Map<Navn, HTMLButtonElement>();
  for (const def of KONTAKTER) {
    const knap = lavKontakt(def, (til) => {
      // Vises med det samme. Serverens svar retter den igen, hvis den blev afvist.
      knap.setAttribute('aria-checked', String(til));
      void saet({ [def.navn]: til });
    });
    knapper.set(def.navn, knap);
    vaert.append(knap);
  }

  return {
    opdater: (o) => {
      for (const [navn, knap] of knapper) {
        knap.setAttribute('aria-checked', String(o.ravage[navn]));
      }
    },
  };
};
