/**
 * Langt tryk.
 *
 * De handlinger, der kan aendre natten - fyr, stop, nulstil - kraever at
 * knappen holdes inde. En telefon i en jakkelomme kl. 02 skal ikke kunne fyre
 * alarmen ved et uheld, og et fejltryk kan ikke fortrydes.
 *
 * Fremdriften vises som en CSS-variabel, saa knappen selv kan tegne den. Man
 * skal kunne se, at der sker noget, mens man holder - ellers slipper man.
 */

const STANDARD_VARIGHED_MS = 2000;

export interface Langtryk {
  afbryd(): void;
}

export interface Langtrykopsaetning {
  readonly knap: HTMLElement;
  readonly udfoer: () => void;
  readonly varighedMs?: number;
}

export const lavLangtryk = ({
  knap,
  udfoer,
  varighedMs = STANDARD_VARIGHED_MS,
}: Langtrykopsaetning): Langtryk => {
  let anmodning = 0;
  let start = 0;

  const nulstil = (): void => {
    cancelAnimationFrame(anmodning);
    anmodning = 0;
    knap.style.setProperty('--fremdrift', '0');
    knap.dataset['holder'] = 'nej';
  };

  const billede = (): void => {
    const andel = Math.min(1, (performance.now() - start) / varighedMs);
    knap.style.setProperty('--fremdrift', String(andel));

    if (andel >= 1) {
      nulstil();
      udfoer();
      return;
    }
    anmodning = requestAnimationFrame(billede);
  };

  const begynd = (h: PointerEvent): void => {
    if (anmodning || (knap as HTMLButtonElement).disabled) return;
    h.preventDefault();
    start = performance.now();
    knap.dataset['holder'] = 'ja';
    anmodning = requestAnimationFrame(billede);
  };

  knap.addEventListener('pointerdown', begynd);
  for (const navn of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
    knap.addEventListener(navn, nulstil);
  }
  // Et almindeligt klik maa ikke gøre noget - hele pointen er, at man holder.
  knap.addEventListener('click', (h) => h.preventDefault());

  return { afbryd: nulstil };
};
