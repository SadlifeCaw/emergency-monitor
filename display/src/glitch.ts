/**
 * Glitchen.
 *
 * Skaermen saetter ud en gang imellem og kommer tilbage. Anfaldene er korte og
 * ligger tilfaeldigt, saa de ikke bliver et genkendeligt interval - i det
 * oejeblik man kan forudse dem, holder de op med at foeles som en fejl paa
 * udstyret og bliver til pynt.
 *
 * Mellemrummet er langt nok til, at et vagthold kan naa at laese et koordinat
 * mellem to udfald. Det er ikke meningen, at skaermen bliver ubrugelig - kun
 * at den bliver utryg.
 */

/**
 * Sekunder mellem to anfald.
 *
 * Var 18-70. Det var for spredt: kontakten blev slaaet til, og saa stod man og
 * ventede over et minut paa at se, om den virkede. Nu er det tiere, men stadig
 * uforudsigeligt.
 */
export const GLITCH_MINDST_SEK = 7;
export const GLITCH_LAENGST_SEK = 26;

/** Hvor laenge ét anfald varer. Kort nok til at man tvivler paa, om man saa det. */
export const VARIGHED_MS = 700;

/**
 * Det foerste anfald efter kontakten slaas til.
 *
 * Kort, saa den der trykker faar at vide at der skete noget. Uden det ligner en
 * virkende kontakt en doed kontakt - og saa bliver den trykket paa igen.
 */
const FOERSTE_MINDST_MS = 1200;
const FOERSTE_LAENGST_MS = 3500;

export interface Glitch {
  /** Slaar effekten til eller fra. Kaldes ved hvert skaermbillede. */
  saet(taendt: boolean): void;
  stop(): void;
}

const mellem = (mindst: number, laengst: number): number =>
  mindst + Math.random() * (laengst - mindst);

export const naesteGlitch = (): number => mellem(GLITCH_MINDST_SEK, GLITCH_LAENGST_SEK) * 1000;

export const foersteGlitch = (): number => mellem(FOERSTE_MINDST_MS, FOERSTE_LAENGST_MS);

export const lavGlitch = (krop: HTMLElement): Glitch => {
  let venter: ReturnType<typeof setTimeout> | null = null;
  let taendt = false;

  const anfald = (): void => {
    krop.dataset['glitcher'] = 'ja';
    setTimeout(() => {
      delete krop.dataset['glitcher'];
    }, VARIGHED_MS);
    planlaeg();
  };

  const planlaeg = (omMs = naesteGlitch()): void => {
    if (!taendt) return;
    venter = setTimeout(anfald, omMs);
  };

  const ryd = (): void => {
    if (venter) clearTimeout(venter);
    venter = null;
    delete krop.dataset['glitcher'];
  };

  return {
    saet: (skalVaereTaendt) => {
      if (skalVaereTaendt === taendt) return;
      taendt = skalVaereTaendt;
      if (taendt) planlaeg(foersteGlitch());
      else ryd();
    },
    stop: () => {
      taendt = false;
      ryd();
    },
  };
};
