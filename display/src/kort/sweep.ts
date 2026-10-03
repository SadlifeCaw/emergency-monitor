/**
 * Radar-sweepet.
 *
 * Tegnes paa et canvas oven paa kortet, ikke som DOM-elementer: en roterende
 * kile er 60 billeder i sekundet i seks timer, og det maa ikke koste noget.
 *
 * Vinklen udledes af den lokale animationstid og ikke af serverens ur.
 * Serverens ur opdateres kun én gang i sekundet, og med 8 sekunder pr.
 * omdrejning ville sweepet saa springe 45 grader ad gangen. Sweepet er
 * stemning, ikke maaledata - det maa gerne loebe roligt videre uafhaengigt af
 * scenariet, ogsaa naar generalproeven kører natten 60 gange for hurtigt.
 */

/** Sekunder pr. omdrejning. */
export const OMDREJNING_SEK = 8;

/** Halens laengde bag den foerende linje. */
const HALE_GRADER = 88;
/** Reservetegning, hvis browseren ikke kan conic gradients. */
const HALE_TRIN = 36;

export interface Sweepgeometri {
  readonly cx: number;
  readonly cy: number;
  readonly radiusPx: number;
  readonly farve: string;
}

export interface Sweep {
  start(): void;
  stop(): void;
}

/** Vinklen sweepet peger paa til et givet tidspunkt. Ren funktion, testbar. */
export const sweepvinkel = (tidMs: number): number =>
  (((tidMs / (OMDREJNING_SEK * 1000)) % 1) + 1) % 1 * 360;

/** Canvas regner 0 grader som oest; kompasset regner det som nord. */
const rad = (grader: number): number => ((grader - 90) * Math.PI) / 180;

const medAlfa = (farve: string, alfa: number): string =>
  `${farve}${Math.round(Math.min(1, Math.max(0, alfa)) * 255)
    .toString(16)
    .padStart(2, '0')}`;

/**
 * Halen som én conic gradient.
 *
 * Tidligere blev den tegnet som 32 kiler med hver sin gennemsigtighed, hvilket
 * gav synlige baand. Én gradient er baade jaevnere at se paa og billigere at
 * tegne - ét fyld i stedet for toogtredive.
 */
const tegnHaleMedGradient = (
  ctx: CanvasRenderingContext2D,
  { cx, cy, radiusPx, farve }: Sweepgeometri,
  vinkel: number,
): void => {
  const start = rad(vinkel - HALE_GRADER);
  const gradient = ctx.createConicGradient(start, cx, cy);
  const andel = HALE_GRADER / 360;

  gradient.addColorStop(0, medAlfa(farve, 0));
  gradient.addColorStop(andel * 0.7, medAlfa(farve, 0.06));
  gradient.addColorStop(andel, medAlfa(farve, 0.22));
  gradient.addColorStop(Math.min(1, andel + 0.001), medAlfa(farve, 0));

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radiusPx, start, rad(vinkel));
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
};

/** Reservetegning for browsere uden createConicGradient. */
const tegnHaleMedKiler = (
  ctx: CanvasRenderingContext2D,
  { cx, cy, radiusPx, farve }: Sweepgeometri,
  vinkel: number,
): void => {
  ctx.fillStyle = farve;
  for (let i = 0; i < HALE_TRIN; i += 1) {
    const andel = i / HALE_TRIN;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(
      cx,
      cy,
      radiusPx,
      rad(vinkel - (HALE_GRADER * (i + 1)) / HALE_TRIN),
      rad(vinkel - (HALE_GRADER * i) / HALE_TRIN),
    );
    ctx.closePath();
    ctx.globalAlpha = 0.22 * (1 - andel) ** 2.2;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

const tegnForkant = (
  ctx: CanvasRenderingContext2D,
  { cx, cy, radiusPx, farve }: Sweepgeometri,
  vinkel: number,
): void => {
  const v = rad(vinkel);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(v) * radiusPx, cy + Math.sin(v) * radiusPx);
  ctx.strokeStyle = medAlfa(farve, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();
};

interface Flade {
  bredde: number;
  hoejde: number;
}

/**
 * Holder canvassets pixelstoerrelse aktuel.
 *
 * Stoerrelsen maales af en ResizeObserver og ikke i tegneloekken: at laese
 * clientWidth hvert billede tvinger browseren til at regne layout 60 gange i
 * sekundet - præcis den slags smaating der giver ryk.
 *
 * Der tegnes i skaermens faktiske pixels, saa kanterne ikke bliver trappede
 * paa en skaerm med hoej opløsning.
 */
const lavFlademaaler = (canvas: HTMLCanvasElement, flade: Flade): ResizeObserver =>
  new ResizeObserver(([indgang]) => {
    if (!indgang) return;
    const { width, height } = indgang.contentRect;
    const forhold = window.devicePixelRatio || 1;

    flade.bredde = width;
    flade.hoejde = height;
    canvas.width = Math.round(width * forhold);
    canvas.height = Math.round(height * forhold);
    canvas.getContext('2d')?.setTransform(forhold, 0, 0, forhold, 0, 0);
  });

/**
 * `hent` kaldes hvert billede og returnerer null, naar der ikke skal tegnes -
 * fx foer kortet er klar. Saa kan sweepet startes én gang og glemmes.
 */
export const lavSweep = (canvas: HTMLCanvasElement, hent: () => Sweepgeometri | null): Sweep => {
  const flade: Flade = { bredde: 0, hoejde: 0 };
  const maaler = lavFlademaaler(canvas, flade);
  let anmodning = 0;

  const billede = (tid: number): void => {
    anmodning = requestAnimationFrame(billede);

    const ctx = canvas.getContext('2d');
    if (!ctx || !flade.bredde) return;

    ctx.clearRect(0, 0, flade.bredde, flade.hoejde);

    const geometri = hent();
    if (!geometri) return;

    const vinkel = sweepvinkel(tid);

    ctx.save();
    if (typeof ctx.createConicGradient === 'function') {
      tegnHaleMedGradient(ctx, geometri, vinkel);
    } else {
      tegnHaleMedKiler(ctx, geometri, vinkel);
    }
    tegnForkant(ctx, geometri, vinkel);
    ctx.restore();
  };

  return {
    start: () => {
      if (anmodning) return;
      maaler.observe(canvas);
      anmodning = requestAnimationFrame(billede);
    },
    stop: () => {
      maaler.disconnect();
      cancelAnimationFrame(anmodning);
      anmodning = 0;
    },
  };
};
