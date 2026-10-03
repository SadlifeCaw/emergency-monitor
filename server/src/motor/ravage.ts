/**
 * Ravage.
 *
 * Kulten forstyrrer udstyret. Det er ikke en fejl i systemet - det er et
 * virkemiddel, instruktoererne slaar til fra telefonen, midt i det hele.
 *
 * Tre uafhaengige ting kan slaas til:
 *
 *  - **Sloeret kort.** Terraenet bliver ulaeseligt, saa man ikke kan orientere
 *    sig efter veje og bevoksning. Vores egne lag - base, ringe, sektorer og
 *    alarmpunkt - bliver skarpe, saa alarmen stadig kan bruges.
 *  - **Skjult koordinat.** Koordinatet er ikke bare skjult paa skaermen: det
 *    bliver slet ikke sendt. Saa kan det heller ikke laeses ved at kigge med
 *    over skulderen paa noget andet.
 *  - **Glitch.** Skaermen sætter ud en gang imellem og kommer tilbage igen.
 *
 * De er med vilje uafhaengige. Man skal kunne skrue op for ubehaget lidt ad
 * gangen og skrue ned igen, hvis det bliver for meget.
 */

import type { Tickresultat, Tilstand } from './typer.js';

export interface Ravage {
  readonly sloeretKort: boolean;
  readonly skjulKoordinat: boolean;
  readonly glitch: boolean;
}

export const tomRavage = (): Ravage => ({
  sloeretKort: false,
  skjulKoordinat: false,
  glitch: false,
});

/**
 * Kun de felter der naevnes.
 *
 * `undefined` skrives eksplicit ind i typen, saa telefonen kan sende ét
 * knaptryk ad gangen uden at skulle kende resten af tilstanden.
 */
export type Ravageaendring = { readonly [N in keyof Ravage]?: boolean | undefined };

/** Slaar en eller flere forstyrrelser til eller fra. */
export const saetRavage = (
  tilstand: Tilstand,
  aendringer: Ravageaendring,
  nu: number,
): Tickresultat => {
  const ravage: Ravage = {
    sloeretKort: aendringer.sloeretKort ?? tilstand.ravage.sloeretKort,
    skjulKoordinat: aendringer.skjulKoordinat ?? tilstand.ravage.skjulKoordinat,
    glitch: aendringer.glitch ?? tilstand.ravage.glitch,
  };

  const uaendret = (Object.keys(ravage) as (keyof Ravage)[]).every(
    (n) => ravage[n] === tilstand.ravage[n],
  );
  if (uaendret) return { tilstand, udgaaende: [] };

  return {
    tilstand: { ...tilstand, ravage },
    udgaaende: [{ slags: 'RAVAGE_AENDRET', ravage, kl: new Date(nu).toISOString() }],
  };
};
