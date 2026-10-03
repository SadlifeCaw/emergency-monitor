/**
 * Lyd.
 *
 * Tonerne syntetiseres med Web Audio i stedet for at ligge som filer. Tre
 * grunde: der er ingen licens at holde styr paa, der er ingen fil at glemme at
 * kopiere med over paa driftsmaskinen, og det virker offline per definition.
 *
 * Sirenen er kort og gentaget, ikke et konstant hyl. Et vagthold skal kunne
 * tale sammen og laese et koordinat hoejt, mens den koerer - derfor to sekunders
 * signal og tre sekunders stilhed.
 *
 * Browsere afspiller ikke lyd, foer nogen har roert siden. Derfor `armer()`,
 * som kaldes fra armeringsbjaelken ved opsaetningen. I kiosk-drift saettes
 * Chrome desuden op med --autoplay-policy=no-user-gesture-required, saa en
 * genstart kl. 03 ikke efterlader en tavs skaerm.
 */

/** Samlet styrke. Resten justeres paa forstaerkeren i lokalet. */
const MESTER = 0.22;

/** Sekunder mellem sirenens gentagelser. Stilheden imellem er med vilje. */
const SIRENE_INTERVAL_SEK = 5;

interface Tone {
  readonly hz: number;
  readonly varighed: number;
}

/** To toner der skifter - genkendeligt som en udrykning, ikke som et spil. */
const SIRENE: readonly Tone[] = [
  { hz: 620, varighed: 0.34 },
  { hz: 880, varighed: 0.34 },
  { hz: 620, varighed: 0.34 },
  { hz: 880, varighed: 0.34 },
];

const BLIP: readonly Tone[] = [{ hz: 1180, varighed: 0.09 }];

const ALERT: readonly Tone[] = [
  { hz: 940, varighed: 0.1 },
  { hz: 0, varighed: 0.07 },
  { hz: 940, varighed: 0.1 },
];

export interface Lyd {
  /** Laaser browserens autoplay op. Skal kaldes fra en klikhandling. */
  armer(): Promise<boolean>;
  erArmeret(): boolean;
  /** Starter den gentagne sirene. Gentager sig selv indtil `tavs()`. */
  sirene(): void;
  blip(): void;
  alert(): void;
  tavs(): void;
}

/**
 * Spiller en raekke toner efter hinanden.
 *
 * Hver tone faar en blød ind- og udgang. Uden den klikker det ved hver
 * tonestart, og et klik hvert fjerde sekund i en time er utaaleligt.
 */
const spil = (ctx: AudioContext, toner: readonly Tone[], styrke: number): void => {
  let naar = ctx.currentTime + 0.02;

  for (const tone of toner) {
    if (tone.hz > 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(tone.hz, naar);

      // Firkantboelgen er skarp; et lavpasfilter tager det vaerste af den, saa
      // den lyder som et apparat og ikke som en telefon.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, naar);

      const kant = Math.min(0.03, tone.varighed / 3);
      gain.gain.setValueAtTime(0, naar);
      gain.gain.linearRampToValueAtTime(styrke, naar + kant);
      gain.gain.setValueAtTime(styrke, naar + tone.varighed - kant);
      gain.gain.linearRampToValueAtTime(0, naar + tone.varighed);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(naar);
      osc.stop(naar + tone.varighed + 0.02);
    }
    naar += tone.varighed;
  }
};

/**
 * Laaser lydkonteksten op og kvitterer hoerbart.
 *
 * Kvitteringen er ikke pynt: den der armerer, skal kunne hoere at hoejttaleren
 * er skruet op og tilsluttet - ikke bare se at en knap forsvandt.
 */
const laasOp = async (c: AudioContext): Promise<boolean> => {
  try {
    await c.resume();
  } catch {
    return false;
  }
  if (c.state !== 'running') return false;
  spil(c, ALERT, MESTER * 0.6);
  return true;
};

export const lavLyd = (): Lyd => {
  let ctx: AudioContext | null = null;
  let armeret = false;
  let gentagelse: ReturnType<typeof setInterval> | null = null;

  const hentCtx = (): AudioContext | null => {
    if (!ctx) {
      try {
        ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    return ctx;
  };

  const spilNu = (toner: readonly Tone[], styrke: number): void => {
    const c = hentCtx();
    if (!c || c.state !== 'running') return;
    spil(c, toner, styrke);
  };

  return {
    armer: async () => {
      const c = hentCtx();
      armeret = c ? await laasOp(c) : false;
      return armeret;
    },

    erArmeret: () => armeret,

    sirene: () => {
      if (gentagelse) return;
      spilNu(SIRENE, MESTER);
      gentagelse = setInterval(() => spilNu(SIRENE, MESTER), SIRENE_INTERVAL_SEK * 1000);
    },

    blip: () => spilNu(BLIP, MESTER * 0.5),
    alert: () => spilNu(ALERT, MESTER * 0.7),

    tavs: () => {
      if (!gentagelse) return;
      clearInterval(gentagelse);
      gentagelse = null;
    },
  };
};
