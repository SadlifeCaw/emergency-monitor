/**
 * Taarnpanelet: signaltaarnene.
 *
 * Taarnene staar paa kortet hele tiden - orange, til de er sat korrekt, og
 * groenne, naar admin har aktiveret dem. Er ALLE taarne aktive, er der
 * forbindelse, og lydklippet (talebeskeden) spilles paa skaermen. Bliver ét
 * taarn deaktiveret, tier klippet igen.
 *
 * Admin kan:
 *  - angive det vinkelspektrum (og afstandsinterval) et taarn spawner inden for
 *  - tilfoeje flere taarne
 *  - respawne et taarn - det trækkes forfra og er ikke aktivt bagefter
 *  - loefte et taarns kode frem paa skaermen i 10 sekunder
 *  - aktivere et taarn, naar det er sat korrekt
 *
 * Alt der kan ses fra skaermen kraever langt tryk. Raekkerne bygges kun om, naar
 * listen aendrer sig: en knap der genskabes, mens den holdes inde, kan aldrig
 * naa at udloese.
 */

import { lavLangtryk } from './langtryk.js';
import type { Adminoversigt } from './typer.js';

type Pakke = NonNullable<Adminoversigt['udvidelse']>;
type Taarn = Pakke['taarne'][number];

export interface Taarnpanel {
  opdater(oversigt: Adminoversigt): void;
}

export interface Taarnafhaengigheder {
  readonly gem: (taarn: Record<string, unknown>) => Promise<boolean>;
  readonly slet: (id: string) => Promise<boolean>;
  readonly respawn: (id: string) => Promise<boolean>;
  readonly aktiver: (id: string) => Promise<boolean>;
  readonly deaktiver: (id: string) => Promise<boolean>;
  readonly kode: (id: string) => Promise<boolean>;
  readonly saetLyd: (fil: string | null) => Promise<boolean>;
  readonly saetTil: (til: boolean) => Promise<boolean>;
  readonly lydNulstil: () => Promise<boolean>;
  readonly koder: () => Promise<{ filer: string[] } | null>;
  readonly lydfiler: () => Promise<{ filer: string[] } | null>;
  readonly meld: (tekst: string) => void;
}

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

const medMaerkat = (maerkat: string, input: HTMLElement): HTMLElement => {
  const blok = el('label', 'felt');
  blok.append(el('span', 'legende', maerkat), input);
  return blok;
};

const tast = (tekst: string): HTMLButtonElement => {
  const knap = el('button', 'tast tast--lille signal__knap', tekst);
  knap.type = 'button';
  return knap;
};

const tal = (input: HTMLInputElement): number => Number(input.value.replace(',', '.'));

const talfelt = (vaerdi: string): HTMLInputElement => {
  const i = el('input', 'vaerdifelt');
  i.type = 'text';
  i.inputMode = 'decimal';
  i.value = vaerdi;
  return i;
};

const valgmuligheder = (filer: string[], tom: string, valgt: string): HTMLOptionElement[] => [
  new Option(filer.length ? '— vælg —' : tom, ''),
  ...filer.map((f) => new Option(f, f)),
  ...(valgt && !filer.includes(valgt) ? [new Option(valgt, valgt)] : []),
];

interface Raekke {
  readonly vaert: HTMLElement;
  readonly status: HTMLElement;
  readonly spektrum: HTMLElement;
  readonly sted: HTMLElement;
  readonly aktiver: HTMLButtonElement;
  readonly deaktiver: HTMLButtonElement;
  readonly kode: HTMLButtonElement;
}

export const lavTaarnpanel = (vaert: HTMLElement, afh: Taarnafhaengigheder): Taarnpanel => {
  vaert.append(el('h2', 'legende', 'Signaltårne'));

  // Kontakten: taarnene er usynlige paa skaermen, til den slaas til.
  const kontakt = el('button', 'kontakt');
  kontakt.type = 'button';
  kontakt.setAttribute('role', 'switch');
  kontakt.setAttribute('aria-checked', 'false');
  const spor = el('span', 'kontakt__spor');
  spor.append(el('span', 'kontakt__knap'));
  const kontaktTekst = el('span', 'kontakt__tekst');
  kontaktTekst.append(
    el('span', 'kontakt__navn', 'Vis signaltårne på skærmen'),
    el(
      'span',
      'kontakt__forklaring',
      'Slået fra: skærmen viser intet om tårne eller forbindelse. Du kan stadig forberede dem her.',
    ),
  );
  kontakt.append(spor, kontaktTekst);
  kontakt.addEventListener('click', () => {
    const til = kontakt.getAttribute('aria-checked') !== 'true';
    kontakt.setAttribute('aria-checked', String(til));
    void afh.saetTil(til);
  });
  vaert.append(kontakt);

  const forbindelse = el('p', 'aflaesning', '');
  const lydvalg = el('select', 'vaerdifelt');
  const liste = el('div', 'signal__liste');

  // ------------------------------------------------ formular
  const titel = el('input', 'vaerdifelt');
  titel.type = 'text';
  titel.autocomplete = 'off';
  titel.placeholder = 'fx TÅRN 5';
  const fra = talfelt('0');
  const til = talfelt('90');
  const minM = talfelt('300');
  const maksM = talfelt('800');
  const kode = el('select', 'vaerdifelt');
  const gemknap = el('button', 'tast', 'Tilføj signaltårn');
  gemknap.type = 'button';
  const annuller = el('button', 'tast tast--lille', 'Annullér rettelse');
  annuller.type = 'button';
  annuller.hidden = true;
  const aflaesning = el('p', 'aflaesning', '');

  const vinkler = el('div', 'par');
  vinkler.append(medMaerkat('Vinkel fra (°)', fra), medMaerkat('Vinkel til (°)', til));
  const afstande = el('div', 'par');
  afstande.append(medMaerkat('Afstand fra (m)', minM), medMaerkat('Afstand til (m)', maksM));

  const formOverskrift = el('h3', 'legende', 'Nyt signaltårn');
  const formular = el('div', 'signal__formular');
  formular.append(
    formOverskrift,
    medMaerkat('Navn', titel),
    vinkler,
    afstande,
    aflaesning,
    medMaerkat('Kodebillede (PNG)', kode),
    gemknap,
    annuller,
  );

  const afspilStatus = el('p', 'aflaesning', '');
  const forfra = el('button', 'tast tast--lille', 'Nulstil lyd');
  forfra.type = 'button';
  forfra.addEventListener('click', () => {
    void afh.lydNulstil().then((ok) => {
      if (ok) afh.meld('Lyden er nulstillet. Beskeden starter forfra.');
    });
  });

  vaert.append(
    forbindelse,
    medMaerkat('Lydklip når alle tårne er aktive', lydvalg),
    afspilStatus,
    forfra,
    liste,
    formular,
  );

  // ------------------------------------------------ tilstand
  let redigerer: string | null = null;
  let senesteListe: readonly Taarn[] = [];
  let listeNoegle = '';
  const raekker = new Map<string, Raekke>();
  let hentet = false;
  let lydValgt = '';

  const sig = (tekst: string, slags: 'ok' | 'fejl'): boolean => {
    aflaesning.textContent = tekst;
    aflaesning.dataset['slags'] = slags;
    return slags === 'ok';
  };

  const efterproev = (): boolean => {
    const f = tal(fra);
    const t = tal(til);
    const a = tal(minM);
    const b = tal(maksM);
    if (![f, t, a, b].every(Number.isFinite)) return sig('Alle felter skal være tal.', 'fejl');
    if (f < 0 || f > 360 || t < 0 || t > 360) {
      return sig('Vinklerne skal ligge mellem 0° og 360°.', 'fejl');
    }
    if (b > 800) return sig('Et signaltårn må højst stå 800 m fra centrum.', 'fejl');
    if (a >= b) return sig('Afstand fra skal være mindre end afstand til.', 'fejl');
    const bredde = t >= f ? t - f : t + 360 - f;
    return sig(
      `Spawner mellem ${f}° og ${t}° (${bredde}° bredt), ${a}–${b} m fra centrum.${t < f ? ' Går over nord.' : ''}`,
      'ok',
    );
  };

  const hentFiler = async (): Promise<void> => {
    const [k, l] = await Promise.all([afh.koder(), afh.lydfiler()]);
    const k0 = kode.value;
    kode.replaceChildren(...valgmuligheder(k?.filer ?? [], '— ingen filer i assets/koder —', k0));
    kode.value = k0;
    lydvalg.replaceChildren(
      ...valgmuligheder(l?.filer ?? [], '— ingen filer i assets/lyd —', lydValgt),
    );
    lydvalg.value = lydValgt;
    hentet = true;
  };

  const tilbageTilNy = (): void => {
    redigerer = null;
    formOverskrift.textContent = 'Nyt signaltårn';
    gemknap.textContent = 'Tilføj signaltårn';
    annuller.hidden = true;
    titel.value = '';
    kode.value = '';
    efterproev();
  };

  const rediger = (t: Taarn): void => {
    redigerer = t.id;
    formOverskrift.textContent = `Ret: ${t.titel}`;
    gemknap.textContent = 'Gem ændringer';
    annuller.hidden = false;
    titel.value = t.titel;
    fra.value = String(t.vinkelFra);
    til.value = String(t.vinkelTil);
    minM.value = String(t.minM);
    maksM.value = String(t.maksM);
    if (t.kode && ![...kode.options].some((o) => o.value === t.kode)) {
      kode.append(new Option(t.kode, t.kode));
    }
    kode.value = t.kode ?? '';
    efterproev();
    formular.scrollIntoView({ block: 'nearest' });
  };

  for (const i of [fra, til, minM, maksM]) i.addEventListener('input', () => efterproev());
  annuller.addEventListener('click', tilbageTilNy);

  lydvalg.addEventListener('change', () => {
    lydValgt = lydvalg.value;
    void afh.saetLyd(lydvalg.value === '' ? null : lydvalg.value).then((ok) => {
      if (ok) afh.meld('Lydklippet er gemt.');
    });
  });

  gemknap.addEventListener('click', () => {
    if (titel.value.trim() === '') return void sig('Giv signaltårnet et navn.', 'fejl');
    if (!efterproev()) return;

    const retter = redigerer;
    void afh
      .gem({
        ...(retter ? { id: retter } : {}),
        titel: titel.value.trim(),
        vinkelFra: tal(fra),
        vinkelTil: tal(til),
        minM: tal(minM),
        maksM: tal(maksM),
        kode: kode.value === '' ? null : kode.value,
      })
      .then((ok) => {
        if (!ok) return;
        afh.meld(retter ? 'Signaltårnet er gemt.' : 'Signaltårnet er oprettet og spawnet.');
        tilbageTilNy();
      });
  });

  // ------------------------------------------------ raekkerne
  const byggRaekke = (t: Taarn): Raekke => {
    const raekke = el('article', 'signal__post');
    const hoved = el('div', 'post');
    const status = el('span', 'post__status');
    hoved.append(el('span', 'post__navn', t.titel), status);

    const spektrum = el('p', 'aflaesning signal__maal');
    const sted = el('p', 'aflaesning signal__tid');

    const aktiver = tast('Aktivér (hold)');
    const deaktiver = tast('Deaktivér');
    const respawn = tast('Respawn (hold)');
    const kodeknap = tast('Vis kode (hold)');
    const ret = tast('Ret spektrum');
    const slet = tast('Slet (hold)');

    lavLangtryk({ knap: aktiver, udfoer: () => void afh.aktiver(t.id) });
    lavLangtryk({ knap: respawn, udfoer: () => void afh.respawn(t.id) });
    lavLangtryk({ knap: kodeknap, udfoer: () => void afh.kode(t.id) });
    lavLangtryk({ knap: slet, udfoer: () => void afh.slet(t.id) });
    deaktiver.addEventListener('click', () => void afh.deaktiver(t.id));
    ret.addEventListener('click', () => {
      const nu = senesteListe.find((x) => x.id === t.id);
      if (nu) rediger(nu);
    });

    const knapper = el('div', 'signal__knapper');
    knapper.append(aktiver, deaktiver, respawn, kodeknap, ret, slet);
    raekke.append(hoved, spektrum, sted, knapper);
    return { vaert: raekke, status, spektrum, sted, aktiver, deaktiver, kode: kodeknap };
  };

  const tegnListe = (taarne: readonly Taarn[]): void => {
    senesteListe = taarne;

    const noegle = taarne.map((t) => `${t.id}:${t.titel}`).join('|');
    if (noegle !== listeNoegle) {
      listeNoegle = noegle;
      raekker.clear();
      liste.replaceChildren(
        ...(taarne.length
          ? taarne.map((t) => {
              const r = byggRaekke(t);
              raekker.set(t.id, r);
              return r.vaert;
            })
          : [el('p', 'tom', 'Ingen signaltårne endnu. Tilføj dem nedenfor.')]),
      );
    }

    for (const t of taarne) {
      const r = raekker.get(t.id);
      if (!r) continue;
      r.vaert.dataset['status'] = t.aktiv ? 'GODKENDT' : 'AKTIV';
      r.status.textContent = t.aktiv ? 'aktiv (grøn)' : 'inaktiv (orange)';
      r.spektrum.textContent = `Spektrum ${t.vinkelFra}°–${t.vinkelTil}° · ${t.minM}–${t.maksM} m · kode: ${t.kode ?? 'MANGLER'}`;
      r.sted.textContent =
        t.sekunderKode !== null
          ? `Koden vises i ${t.sekunderKode} s`
          : `Står ${t.afstandM} m · ${String(t.pejlingGrader).padStart(3, '0')}° · sektor ${t.sektor}`;
      r.aktiver.disabled = t.aktiv;
      r.deaktiver.disabled = !t.aktiv;
      r.kode.disabled = t.kode === null;
    }
  };

  return {
    opdater: (o) => {
      const u = o.udvidelse;
      vaert.toggleAttribute('hidden', u === null || !u.aktiv);
      if (!u || !u.aktiv) return;

      if (!hentet) void hentFiler();
      if (u.taarnLyd !== null && lydvalg.value !== u.taarnLyd && document.activeElement !== lydvalg) {
        lydValgt = u.taarnLyd;
        if (![...lydvalg.options].some((x) => x.value === u.taarnLyd)) {
          lydvalg.append(new Option(u.taarnLyd, u.taarnLyd));
        }
        lydvalg.value = u.taarnLyd;
      }
      if (formOverskrift.textContent === 'Nyt signaltårn' && aflaesning.textContent === '') {
        efterproev();
      }

      kontakt.setAttribute('aria-checked', String(u.taarnAktiv));
      const aktive = u.taarne.filter((t) => t.aktiv).length;
      forbindelse.textContent = u.taarne.length
        ? `${u.taarnAktiv ? '' : 'SKJULT PÅ SKÆRMEN · '}${aktive} / ${u.taarne.length} aktive · ${u.forbundet ? (u.taarnAktiv ? 'FORBUNDET — talebeskeden spiller' : 'alle aktive — spiller først, når tårnene vises') : 'ikke forbundet'}`
        : 'Ingen signaltårne.';
      forbindelse.dataset['slags'] = u.forbundet ? 'ok' : '';

      afspilStatus.textContent =
        u.afspilletSek > 0
          ? `Husker ${u.afspilletSek} s af beskeden. Mistes forbindelsen, fortsætter den her. Nulstil lyd får den til at starte forfra.`
          : 'Intet gemt: beskeden starter forfra.';

      tegnListe(u.taarne);
    },
  };
};
