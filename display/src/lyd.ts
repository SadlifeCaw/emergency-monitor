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

/** Et taarn laaser sig fast: tre toner op, den sidste lidt laengere. */
const TAARN_AKTIVERET: readonly Tone[] = [
  { hz: 520, varighed: 0.1 },
  { hz: 780, varighed: 0.1 },
  { hz: 1170, varighed: 0.22 },
];

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
  /** Opbygningen foer en transmission. Varer `sek` sekunder og ender i stilhed. */
  opbygning(sek: number): void;
  /** Afbryder en opbygning, der er i gang - fx naar forbindelsen mistes. */
  stopOpbygning(): void;
  /** Et taarn er aktiveret: stigende toner. */
  taarnAktiveret(): void;
  /** Lyden af en forbindelse, der brydes: faldende tone og statisk, saa stilhed. */
  signalTabt(): void;
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

/** Hvid stoej, ét sekund, loebende. Bygges kun naar opbygningen skal bruge den. */
const stoejBuffer = (ctx: AudioContext): AudioBuffer => {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  return buf;
};

/**
 * Opbygning: lyden af noget, der er paa vej ind.
 *
 * Tre ting vokser sammen over hele varigheden - en dyb rumlen med stigende
 * puls, en tone der klatrer fra bunden til toppen, og statisk med stadig flere
 * udbrud. Sidste halve sekund er et haardt udbrud, og saa er der stilhed, saa
 * stemmen faar al plads.
 */
const byggOp = (ctx: AudioContext, sek: number, styrke: number): (() => void) => {
  const t0 = ctx.currentTime + 0.05;
  const slut = t0 + sek;
  const udbrud = slut - 0.5;
  const kilder: (OscillatorNode | AudioBufferSourceNode)[] = [];

  const master = ctx.createGain();
  master.gain.setValueAtTime(styrke, t0);
  // Stilhed lige foer stemmen.
  master.gain.setValueAtTime(styrke, udbrud + 0.28);
  master.gain.linearRampToValueAtTime(0, udbrud + 0.34);
  master.connect(ctx.destination);

  // --- rumlen med puls
  const rumlen = ctx.createOscillator();
  rumlen.type = 'sawtooth';
  rumlen.frequency.setValueAtTime(36, t0);
  rumlen.frequency.exponentialRampToValueAtTime(64, udbrud);
  const rumlenFilter = ctx.createBiquadFilter();
  rumlenFilter.type = 'lowpass';
  rumlenFilter.frequency.setValueAtTime(150, t0);
  const rumlenNiveau = ctx.createGain();
  rumlenNiveau.gain.setValueAtTime(0.0001, t0);
  rumlenNiveau.gain.exponentialRampToValueAtTime(0.7, udbrud);
  const puls = ctx.createGain();
  puls.gain.setValueAtTime(0.5, t0);
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(0.7, t0);
  lfo.frequency.exponentialRampToValueAtTime(7, udbrud);
  const lfoNiveau = ctx.createGain();
  lfoNiveau.gain.setValueAtTime(0.5, t0);
  lfo.connect(lfoNiveau).connect(puls.gain);
  rumlen.connect(rumlenFilter).connect(rumlenNiveau).connect(puls).connect(master);
  kilder.push(rumlen, lfo);

  // --- den stigende tone, fra en tredjedel inde
  const tone = ctx.createOscillator();
  tone.type = 'sine';
  const toneStart = t0 + sek * 0.33;
  tone.frequency.setValueAtTime(160, t0);
  tone.frequency.setValueAtTime(160, toneStart);
  tone.frequency.exponentialRampToValueAtTime(2100, udbrud);
  const vibrato = ctx.createOscillator();
  vibrato.frequency.setValueAtTime(5.5, t0);
  const vibratoDybde = ctx.createGain();
  vibratoDybde.gain.setValueAtTime(6, t0);
  vibrato.connect(vibratoDybde).connect(tone.frequency);
  const toneNiveau = ctx.createGain();
  toneNiveau.gain.setValueAtTime(0.0001, toneStart);
  toneNiveau.gain.exponentialRampToValueAtTime(0.3, udbrud);
  tone.connect(toneNiveau).connect(master);
  kilder.push(tone, vibrato);

  // --- statisk med flere og flere udbrud
  const stoej = ctx.createBufferSource();
  stoej.buffer = stoejBuffer(ctx);
  stoej.loop = true;
  const baand = ctx.createBiquadFilter();
  baand.type = 'bandpass';
  baand.Q.setValueAtTime(0.8, t0);
  baand.frequency.setValueAtTime(700, t0);
  baand.frequency.exponentialRampToValueAtTime(5200, udbrud);
  const stoejNiveau = ctx.createGain();
  stoejNiveau.gain.setValueAtTime(0.01, t0);
  stoejNiveau.gain.exponentialRampToValueAtTime(0.12, udbrud);
  stoej.connect(baand).connect(stoejNiveau).connect(master);
  kilder.push(stoej);

  // Udbruddene kommer tættere og kraftigere, jo laengere man er inde.
  const udbruddene = Math.round(sek * 0.9);
  for (let i = 0; i < udbruddene; i += 1) {
    const fremdrift = (i / udbruddene) ** 1.6;
    const t = t0 + fremdrift * (sek - 1);
    const laengde = 0.04 + Math.random() * 0.12;
    const hoejde = 0.1 + fremdrift * 0.55 + Math.random() * 0.1;
    stoejNiveau.gain.setValueAtTime(0.01 + fremdrift * 0.1, t);
    stoejNiveau.gain.linearRampToValueAtTime(hoejde, t + 0.01);
    stoejNiveau.gain.linearRampToValueAtTime(0.01 + fremdrift * 0.1, t + laengde);
  }

  // --- det haarde udbrud lige foer stilheden
  stoejNiveau.gain.cancelScheduledValues(udbrud);
  stoejNiveau.gain.setValueAtTime(0.9, udbrud);
  stoejNiveau.gain.linearRampToValueAtTime(0.0001, udbrud + 0.3);
  rumlenNiveau.gain.cancelScheduledValues(udbrud);
  rumlenNiveau.gain.setValueAtTime(0.9, udbrud);
  rumlenNiveau.gain.linearRampToValueAtTime(0.0001, udbrud + 0.2);
  toneNiveau.gain.cancelScheduledValues(udbrud);
  toneNiveau.gain.setValueAtTime(0.0001, udbrud);

  for (const k of kilder) {
    k.start(t0);
    k.stop(slut + 0.1);
  }

  // Afbryder opbygningen med det samme: lyden daempes og kilderne stoppes.
  return () => {
    const nu = ctx.currentTime;
    master.gain.cancelScheduledValues(nu);
    master.gain.setTargetAtTime(0, nu, 0.02);
    for (const k of kilder) {
      try {
        k.stop(nu + 0.15);
      } catch {
        // Allerede stoppet.
      }
    }
  };
};

/**
 * Signal tabt: en tone, der falder fra hoejt til dybt, mens statisk bryder ind
 * og dør ud. Kort - under to sekunder - og ender i stilhed.
 */
const signalTabt = (ctx: AudioContext, styrke: number): void => {
  const t0 = ctx.currentTime + 0.02;
  const slut = t0 + 1.6;

  const master = ctx.createGain();
  master.gain.setValueAtTime(styrke, t0);
  master.gain.linearRampToValueAtTime(0.0001, slut);
  master.connect(ctx.destination);

  // Tonen falder, som naar en baerebolge forsvinder.
  const tone = ctx.createOscillator();
  tone.type = 'square';
  tone.frequency.setValueAtTime(1100, t0);
  tone.frequency.exponentialRampToValueAtTime(60, t0 + 1.2);
  const toneNiveau = ctx.createGain();
  toneNiveau.gain.setValueAtTime(0.25, t0);
  toneNiveau.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
  tone.connect(toneNiveau).connect(master);

  // Statisk, der kommer ind og knitrer ud.
  const stoej = ctx.createBufferSource();
  stoej.buffer = stoejBuffer(ctx);
  stoej.loop = true;
  const baand = ctx.createBiquadFilter();
  baand.type = 'bandpass';
  baand.frequency.setValueAtTime(3200, t0);
  baand.frequency.exponentialRampToValueAtTime(500, slut);
  const stoejNiveau = ctx.createGain();
  stoejNiveau.gain.setValueAtTime(0.6, t0);
  for (let i = 0; i < 14; i += 1) {
    const t = t0 + 0.15 + i * 0.1;
    stoejNiveau.gain.setValueAtTime(0.5 * (1 - i / 14) + 0.02, t);
    stoejNiveau.gain.setValueAtTime(0.02, t + 0.03 + Math.random() * 0.04);
  }
  stoejNiveau.gain.linearRampToValueAtTime(0.0001, slut);
  stoej.connect(baand).connect(stoejNiveau).connect(master);

  for (const k of [tone, stoej]) {
    k.start(t0);
    k.stop(slut + 0.1);
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
  let stopOpbygning: (() => void) | null = null;

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

    opbygning: (sek) => {
      const c = hentCtx();
      if (!c || c.state !== 'running') return;
      // En ny opbygning afloeser en, der stadig lyder.
      stopOpbygning?.();
      stopOpbygning = byggOp(c, sek, MESTER * 1.1);
    },

    stopOpbygning: () => {
      stopOpbygning?.();
      stopOpbygning = null;
    },

    taarnAktiveret: () => spilNu(TAARN_AKTIVERET, MESTER * 0.7),

    signalTabt: () => {
      const c = hentCtx();
      if (!c || c.state !== 'running') return;
      signalTabt(c, MESTER * 0.9);
    },

    tavs: () => {
      if (!gentagelse) return;
      clearInterval(gentagelse);
      gentagelse = null;
    },
  };
};
