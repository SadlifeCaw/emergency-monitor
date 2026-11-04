/**
 * Lydpanelet: planlaeg et lydklip, eller spil det nu.
 *
 * Klippet ligger som fil paa maskinen (assets/lyd). Her vaelges fil og
 * tidspunkt. Mens klippet spiller, staar dekrypteringen paa 100 % og skaermen
 * viser en indkommende transmission - det klarer skaermen selv.
 *
 * Et klip der spiller kan afbrydes ved at aflyse det: haendelsen forsvinder, og
 * skaermen tier og falder tilbage.
 */

import type { Adminoversigt, HaendelseIOversigt } from './typer.js';

export interface Lydpanel {
  opdater(oversigt: Adminoversigt): void;
  /** Henter listen over filer i lydmappen. */
  hentFiler(): Promise<void>;
}

export interface Lydafhaengigheder {
  readonly opret: (klip: Record<string, unknown>) => Promise<boolean>;
  readonly aflys: (id: string) => Promise<boolean>;
  readonly filer: () => Promise<{ mappe: string; filer: string[] } | null>;
  readonly meld: (tekst: string) => void;
  /** Serverens ur - se alarmpanelet for hvorfor det ikke er telefonens. */
  readonly serverNu: () => number;
}

/** Hvor laenge et fyret klip vises i listen. Svarer til serverens vindue. */
const VIS_FYRET_MS = 30 * 60_000;

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

const tilLokaltFelt = (ms: number): string => {
  const d = new Date(ms);
  const to = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${to(d.getMonth() + 1)}-${to(d.getDate())}T${to(d.getHours())}:${to(d.getMinutes())}`;
};

const medMaerkat = (maerkat: string, input: HTMLElement): HTMLElement => {
  const blok = el('label', 'felt');
  blok.append(el('span', 'legende', maerkat), input);
  return blok;
};

export const lavLydpanel = (
  vaert: HTMLElement,
  { opret, aflys, filer, meld, serverNu }: Lydafhaengigheder,
): Lydpanel => {
  const valg = el('select', 'vaerdifelt');
  const tid = el('input', 'vaerdifelt');
  tid.type = 'datetime-local';
  const navn = el('input', 'vaerdifelt');
  navn.type = 'text';
  navn.autocomplete = 'off';
  navn.value = 'UIDENTIFICERET SIGNAL';

  const hjaelp = el('p', 'aflaesning', '');
  const planknap = el('button', 'tast', 'Planlæg lydklip');
  planknap.type = 'button';
  const nuknap = el('button', 'tast', 'Afspil nu');
  nuknap.type = 'button';
  const opdaterknap = el('button', 'tast tast--lille', 'Opdater fil-listen');
  opdaterknap.type = 'button';
  const liste = el('div', 'lydliste');

  vaert.append(
    el('h2', 'legende', 'Lydklip (planlagt afspilning)'),
    medMaerkat('Fil', valg),
    opdaterknap,
    medMaerkat('Tidspunkt', tid),
    medMaerkat('Betegnelse på skærmen', navn),
    hjaelp,
    planknap,
    nuknap,
    liste,
  );

  let redigerer = false;
  let harFiler = false;
  let sidsteListe = '';

  tid.addEventListener('input', () => {
    redigerer = true;
  });

  const hentFiler = async (): Promise<void> => {
    const svar = await filer();
    if (!svar) return;

    const valgt = valg.value;
    valg.replaceChildren(
      ...svar.filer.map((f) => {
        const o = el('option', undefined, f);
        o.value = f;
        return o;
      }),
    );
    if (svar.filer.includes(valgt)) valg.value = valgt;

    harFiler = svar.filer.length > 0;
    planknap.disabled = !harFiler;
    nuknap.disabled = !harFiler;
    hjaelp.textContent = harFiler
      ? 'Mens klippet spiller, står dekrypteringen på 100 %. Kun udgående kommunikation kan høres.'
      : `Ingen lydfiler. Læg en .mp3 eller .wav i ${svar.mappe} og tryk "Opdater fil-listen".`;
  };

  const bygKlip = (naar: number): Record<string, unknown> => ({
    id: `lyd-${Date.now().toString(36)}`,
    type: 'LYD',
    at: new Date(naar).toISOString(),
    titel: navn.value.trim() || 'UIDENTIFICERET SIGNAL',
    lyd: 'ingen',
    fil: valg.value,
  });

  opdaterknap.addEventListener('click', () => void hentFiler());

  planknap.addEventListener('click', () => {
    const naar = Date.parse(tid.value);
    if (!Number.isFinite(naar)) {
      meld('Vælg et tidspunkt.');
      return;
    }
    void opret(bygKlip(naar)).then((ok) => {
      if (!ok) return;
      redigerer = false;
      meld('Lydklippet er planlagt.');
    });
  });

  nuknap.addEventListener('click', () => {
    void opret(bygKlip(serverNu())).then((ok) => {
      if (ok) meld('Lydklippet afspilles nu.');
    });
  });

  const tegnPost = (h: HaendelseIOversigt): HTMLElement => {
    const raekke = el('div', 'lydraekke');
    const fyret = h.status !== 'planlagt';
    const kl = new Date(fyret && h.fyretKl ? h.fyretKl : h.at).toLocaleTimeString('da-DK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    raekke.append(
      el('span', 'lydraekke__tekst', `${kl.replace('.', ':')} · ${String(h.felter['fil'] ?? '')}`),
    );
    const knap = el('button', 'tast tast--lille lydraekke__knap', fyret ? 'Stop' : 'Aflys');
    knap.type = 'button';
    knap.addEventListener('click', () => void aflys(h.id));
    raekke.append(knap);
    return raekke;
  };

  return {
    hentFiler,
    opdater: (o) => {
      const nu = serverNu();
      const klip = o.haendelser.filter(
        (h) =>
          h.type === 'LYD' &&
          (h.status === 'planlagt' ||
            (h.fyretKl !== null && nu - Date.parse(h.fyretKl) < VIS_FYRET_MS)),
      );

      // Genskriv kun listen naar den er aendret, ellers rammer et tryk ved siden af.
      const noegle = klip.map((h) => `${h.id}:${h.status}`).join('|');
      if (noegle !== sidsteListe) {
        sidsteListe = noegle;
        liste.replaceChildren(...klip.map(tegnPost));
      }

      if (!redigerer) tid.value = tilLokaltFelt(nu + 10 * 60_000);
      if (!harFiler && valg.options.length === 0) planknap.disabled = nuknap.disabled = true;
    },
  };
};
