/**
 * Koordinatet, naar modtageren har mistet signalet.
 *
 * Foerst stod der en fast raekke blokke - `██°██.███'█`. Det saa ud som et
 * billede af et oedelagt koordinat, ikke som et apparat der svigter. En rigtig
 * modtager, der ikke kan laase, staar ikke stille: den bliver ved med at joenske
 * efter et fix, cifre springer, enkelte pladser falder ud, og en sjaelden gang
 * imellem holder et par cifre et oejeblik, foer den taber dem igen.
 *
 * Skabelonen bliver staaende. Gradtegn, punktum, apostrof og retningsbogstav er
 * tegnet af instrumentet selv og forsvinder ikke, fordi antennen svigter - det
 * er kun tallene, der kommer udefra. Det er den detalje, der goer forskellen paa
 * "skaermen er i stykker" og "signalet er vaek".
 *
 * ## Sikkerheden
 *
 * Aflaesningen maa **aldrig** kunne laeses som et gyldigt koordinat. Et hold,
 * der fotograferer skaermen og tyder et enkelt billede, skal ikke kunne faa et
 * tal ud af det og gaa den forkerte vej i moerket. Derfor garanterer
 * `naesteAflaesning`, at mindst `MINDST_TABTE` pladser i hver linje er
 * bloktegn - i hvert eneste billede, ikke bare i gennemsnit.
 */

const CIFRE = '0123456789';

/** Pladser der er faldet helt ud. Blandet, saa det ikke bliver et moenster. */
const TABTE = '█▓▒';

/** `#` er en plads, der kommer fra antennen. Alt andet tegner instrumentet selv. */
export const SKABELON_LAT = "##°##.###'N";
export const SKABELON_LON = "###°##.###'E";

/**
 * Mindste antal udfaldne pladser pr. linje.
 *
 * Under tre kan et enkeltbillede komme til at ligne en aflaesning. Se
 * sikkerhedsafsnittet ovenfor.
 */
export const MINDST_TABTE = 3;

/** Hvor stor en del af pladserne der hoejst falder ud, naar linjen ikke er helt vaek. */
const HOEJST_TABTE_DEL = 0.7;

/** Chancen for at en plads beholder det, den viste sidst. Uden den blinker alt. */
const HOLD = 0.5;

/** Chancen for at hele linjen falder ud et enkelt billede. */
const HELT_VAEK = 0.1;

/** Millisekunder mellem to billeder. Hurtigt nok til at intet kan laeses i ro. */
const BILLEDE_MS = 90;

const vaelg = (tegn: string): string =>
  tegn.charAt(Math.floor(Math.random() * tegn.length)) || tegn.charAt(0);

/**
 * Naeste billede af en linje.
 *
 * `forrige` er linjen fra sidste billede, saa nogle pladser kan holde. Er den
 * tom eller af en anden laengde, begynder den forfra.
 */
export const naesteAflaesning = (skabelon: string, forrige = ''): string => {
  const pladser = [...skabelon];
  const gamle = forrige.length === skabelon.length ? [...forrige] : null;

  const cifferPladser = pladser.reduce<number[]>((liste, tegn, i) => {
    if (tegn === '#') liste.push(i);
    return liste;
  }, []);

  const heltVaek = Math.random() < HELT_VAEK;
  const antalTabte = heltVaek
    ? cifferPladser.length
    : MINDST_TABTE +
      Math.floor(
        Math.random() * (Math.floor(cifferPladser.length * HOEJST_TABTE_DEL) - MINDST_TABTE + 1),
      );

  // Traek de udfaldne pladser uden tilbagelaegning.
  const tilbage = [...cifferPladser];
  const tabte = new Set<number>();
  for (let n = 0; n < antalTabte && tilbage.length > 0; n += 1) {
    const [plads] = tilbage.splice(Math.floor(Math.random() * tilbage.length), 1);
    if (plads !== undefined) tabte.add(plads);
  }

  return pladser
    .map((tegn, i) => {
      if (tegn !== '#') return tegn;
      const gammelt = gamle?.[i];
      const varTabt = gammelt !== undefined && TABTE.includes(gammelt);
      // En plads holder kun, hvis den bliver i samme tilstand. Ellers ville et
      // ciffer kunne blive staaende, mens pladsen er faldet ud.
      if (gammelt !== undefined && varTabt === tabte.has(i) && Math.random() < HOLD) {
        return gammelt;
      }
      return tabte.has(i) ? vaelg(TABTE) : vaelg(CIFRE);
    })
    .join('');
};

/** Den stillestaaende udgave, naar brugeren har fravalgt bevaegelse. */
export const stilleAflaesning = (skabelon: string): string =>
  skabelon.replace(/#/g, TABTE.charAt(0));

export interface Koordinattab {
  /** Slaar aflaesningen til eller fra. Kaldes ved hvert skaermbillede. */
  saet(tabt: boolean): void;
  stop(): void;
}

interface Linje {
  readonly felt: HTMLElement;
  readonly skabelon: string;
}

export const lavKoordinattab = (linjer: readonly Linje[]): Koordinattab => {
  let venter: ReturnType<typeof setInterval> | null = null;
  let tabt = false;

  const roligt = (): boolean =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const billede = (): void => {
    for (const { felt, skabelon } of linjer) {
      felt.textContent = naesteAflaesning(skabelon, felt.textContent ?? '');
    }
  };

  const ryd = (): void => {
    if (venter !== null) clearInterval(venter);
    venter = null;
  };

  return {
    saet: (skalVaereTabt) => {
      if (skalVaereTabt === tabt) return;
      tabt = skalVaereTabt;
      if (!tabt) {
        ryd();
        return;
      }
      if (roligt()) {
        for (const { felt, skabelon } of linjer) felt.textContent = stilleAflaesning(skabelon);
        return;
      }
      billede();
      venter = setInterval(billede, BILLEDE_MS);
    },
    stop: () => {
      tabt = false;
      ryd();
    },
  };
};
