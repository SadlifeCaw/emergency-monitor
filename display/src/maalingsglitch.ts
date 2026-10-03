/**
 * Maalingsforstyrrelsen.
 *
 * Seismik, EMF, temperatur og dekryptering glitcher ud hver for sig og
 * sporadisk - som foelere der taber signalet et oejeblik. Det er ikke hele
 * skaermen, der saetter ud (det er `glitch.ts`): kun maalingerne.
 *
 * Hvert instrument har sit eget, tilfaeldige ur, saa de ikke ryster i takt.
 *
 * Under en alarm er effekten sat ud af spil. Alarmen er det eneste, vagtholdet
 * ikke maa tvivle paa, og tallene ved siden af skal kunne laeses.
 */

/** Sekunder mellem to udfald paa ét instrument. */
export const MAALING_MINDST_SEK = 4;
export const MAALING_LAENGST_SEK = 15;

/** Et udfald varer kort nok til, at man tvivler paa, om man saa det. */
export const MAALING_VARIGHED_MINDST_MS = 450;
export const MAALING_VARIGHED_LAENGST_MS = 1100;

const FOERSTE_MINDST_MS = 800;
const FOERSTE_LAENGST_MS = 3000;

export interface Maalingsglitch {
  /** Kaldes ved hvert skaermbillede. `aktiv` er falsk under alarm eller naar kontakten er fra. */
  saet(aktiv: boolean): void;
  stop(): void;
}

const mellem = (mindst: number, laengst: number): number =>
  mindst + Math.random() * (laengst - mindst);

export const naesteMaalingsglitch = (): number =>
  mellem(MAALING_MINDST_SEK, MAALING_LAENGST_SEK) * 1000;

export const maalingsvarighed = (): number =>
  mellem(MAALING_VARIGHED_MINDST_MS, MAALING_VARIGHED_LAENGST_MS);

/** Skal effekten koere nu? Kontakten skal vaere til, og der maa ikke vaere alarm. */
export const maalingsglitchAktiv = (kontakt: boolean, fase: string): boolean =>
  kontakt && fase !== 'ALARM';

const ATTRIBUT = 'data-maalingsfejl';

const saetFejl = (maal: HTMLElement, fejl: boolean): void => {
  if (fejl) maal.setAttribute(ATTRIBUT, 'ja');
  else maal.removeAttribute(ATTRIBUT);
};

export const lavMaalingsglitch = (maal: readonly HTMLElement[]): Maalingsglitch => {
  const ure = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const slukkeure = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  let aktiv = false;

  const ryd = (): void => {
    for (const t of ure.values()) clearTimeout(t);
    for (const t of slukkeure.values()) clearTimeout(t);
    ure.clear();
    slukkeure.clear();
    for (const m of maal) saetFejl(m, false);
  };

  const planlaeg = (m: HTMLElement, omMs: number): void => {
    if (!aktiv) return;
    ure.set(
      m,
      setTimeout(() => {
        saetFejl(m, true);
        slukkeure.set(
          m,
          setTimeout(() => saetFejl(m, false), maalingsvarighed()),
        );
        planlaeg(m, naesteMaalingsglitch());
      }, omMs),
    );
  };

  return {
    saet: (skalVaereAktiv) => {
      if (skalVaereAktiv === aktiv) return;
      aktiv = skalVaereAktiv;
      if (aktiv) for (const m of maal) planlaeg(m, mellem(FOERSTE_MINDST_MS, FOERSTE_LAENGST_MS));
      else ryd();
    },
    stop: () => {
      aktiv = false;
      ryd();
    },
  };
};
