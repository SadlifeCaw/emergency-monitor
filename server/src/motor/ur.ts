/**
 * Ur.
 *
 * Motoren spoerger aldrig selv om tiden. Uret injiceres, saa hele natten kan
 * afspilles deterministisk i en test og koeres 60 gange hurtigere til generalproeven,
 * uden at motoren kender til forskellen.
 */

export interface Ur {
  /** Millisekunder siden epoch. */
  naa(): number;
}

export interface StyretUr extends Ur {
  spol(millisekunder: number): void;
  saet(millisekunder: number): void;
}

export interface KomprimeretUropsaetning {
  /** Kilden der maaler faktisk forloeben tid. */
  readonly kilde: Ur;
  /** Det virtuelle tidspunkt uret starter paa. */
  readonly virtuelStart: number;
  /** 1 = realtid, 60 = et minut i sekundet. */
  readonly hastighed: number;
}

export const systemUr = (): Ur => ({
  naa: () => Date.now(),
});

/**
 * Ur der kun bevaeger sig, naar man beder det om det. Bruges i test og i
 * generalproeven, hvor forloebet skal kunne standses og spoles.
 */
export const testUr = (start: number): StyretUr => {
  let nu = start;
  return {
    naa: () => nu,
    spol: (millisekunder) => {
      nu += millisekunder;
    },
    saet: (millisekunder) => {
      nu = millisekunder;
    },
  };
};

/**
 * Ur der loeber `hastighed` gange hurtigere end kilden. Hele natten paa faa minutter.
 */
export const komprimeretUr = ({
  kilde,
  virtuelStart,
  hastighed,
}: KomprimeretUropsaetning): Ur => {
  if (!(hastighed > 0)) {
    throw new RangeError(`Hastighed skal vaere stoerre end 0, fik ${hastighed}`);
  }
  const realStart = kilde.naa();
  return {
    naa: () => virtuelStart + (kilde.naa() - realStart) * hastighed,
  };
};
