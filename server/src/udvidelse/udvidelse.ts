/**
 * Udvidelsespakken: signaltaarne.
 *
 * Et lag oven paa natvagten, der ikke roerer den eksisterende alarm. Er pakken
 * ikke aktiveret - eller taarnene ikke slaaet til - sender serveren ingenting
 * om den, og skaermen ser ud som foer.
 *
 * Taarnene staar paa kortet hele tiden: orange, til admin aktiverer dem, saa
 * groenne. Er ALLE taarne aktive, er der forbindelse, og lydklippet spilles.
 * Admin kan ogsaa loefte et taarns kode frem paa skaermen i KODE_SEK sekunder.
 *
 * Alt afledes af tidsstempler og uret - der er ingen tick, der skal huske
 * noget, og en genstart midt i et vindue giver samme svar som uden genstart.
 */

import { z } from 'zod';
import { afstandM, pejlingGrader, sektorFor } from '../motor/geo.js';
import { LYDFIL, ScenarieFejl } from '../motor/scenarie.js';
import type { Scenarie } from '../motor/typer.js';

/** Hvor laenge koden vises efter godkendelsen. */
export const KODE_SEK = 10;
/** Kodebilledet kan hentes lidt laengere, saa et langsomt netvaerk ikke taber det. */
export const KODE_HENT_SEK = KODE_SEK + 5;
export const STANDARD_TELEFON = '';
/** Hvor langt fra centrum et signaltaarn hoejst maa staa. */
export const TAARN_MAKS_M = 800;
/**
 * Sekunder med "synkronisering", foer stemmen kommer. Skal vaere det samme som
 * OPBYGNING_SEK paa skaermen (display/src/lydklipregler.ts) - en test holder dem ens.
 */
export const OPBYGNING_SEK = 10;

export const KODEFIL = /^[^\\/:*?"<>|]+\.(png|jpg|jpeg|webp)$/i;
const ID = /^[A-Za-z0-9_-]{1,60}$/;

/**
 * Et signaltaarn.
 *
 * Staar paa kortet hele tiden - orange, til det er sat korrekt, og groent,
 * naar det er aktiveret. Positionen traekkes inden for et vinkelspektrum
 * (pejling fra basen) og et afstandsinterval, og kan trækkes forfra.
 */
const taarnSkema = z.object({
  id: z.string().regex(ID),
  titel: z.string().trim().min(1).max(60),
  /** Pejling fra basen, 0-360. Er `til` mindre end `fra`, gaar spektret over nord. */
  vinkelFra: z.number().min(0).max(360).default(0),
  vinkelTil: z.number().min(0).max(360).default(360),
  minM: z.number().min(0).default(300),
  maksM: z.number().positive().max(TAARN_MAKS_M).default(TAARN_MAKS_M),
  lat: z.number().finite(),
  lon: z.number().finite(),
  kode: z.string().regex(KODEFIL).nullable().default(null),
  aktiv: z.boolean().default(false),
  aktiveretKl: z.string().nullable().default(null),
  /** Hvornaar admin sidst loeftede taarnets kode frem paa skaermen. */
  kodeKl: z.string().nullable().default(null),
});

const telefonSkema = z
  .string()
  .trim()
  .regex(/^[0-9 +]{0,20}$/);

export const udvidelseSkema = z.object({
  version: z.literal(1).default(1),
  aktiv: z.boolean().default(false),
  telefon: telefonSkema.default(STANDARD_TELEFON),
  taarne: z.array(taarnSkema).default([]),
  /**
   * Taarnene er skjult, til admin slaar dem til. Saa laenge de er slaaet fra,
   * sender serveren intet om dem - heller ikke at der ikke er forbindelse.
   */
  taarnAktiv: z.boolean().default(false),
  /** Lydklippet der spilles, mens alle taarne er aktive. Filnavn i lydmappen. */
  taarnLyd: z.string().regex(LYDFIL).nullable().default(null),
  /**
   * Hvornaar forbindelsen sidst blev oprettet. Sat, mens alle taarne er aktive
   * OG pakken og taarnene er slaaet til - altsaa mens klippet spiller. Null ellers.
   */
  forbundetKl: z.string().nullable().default(null),
  /**
   * Hvor mange sekunder af stemmen der allerede er spillet i tidligere
   * forbindelser. Mister forbindelsen og oprettes igen, fortsaetter klippet her.
   */
  afspilletSek: z.number().min(0).default(0),
  /**
   * Sat af "Nulstil lyd" mens forbindelsen staar: den igangvaerende afspilning
   * tæller ikke med, naar forbindelsen bryder - saa naeste forbindelse
   * starter forfra.
   */
  glemSession: z.boolean().default(false),
});

export type Taarn = z.infer<typeof taarnSkema>;
export type Udvidelse = z.infer<typeof udvidelseSkema>;

export const tomUdvidelse = (): Udvidelse => udvidelseSkema.parse({});

// ---------------------------------------------------------------- status

const sekSiden = (kl: string, nu: number): number => (nu - Date.parse(kl)) / 1000;

// ---------------------------------------------------------------- aendringer

const tolk = <T>(skema: z.ZodType<T>, raa: unknown, hvad: string): T => {
  const r = skema.safeParse(raa);
  if (r.success) return r.data;
  const f = r.error.issues[0];
  throw new ScenarieFejl(
    `${hvad}: ${f ? `${f.path.join('.') || 'felt'} - ${f.message}` : 'ugyldigt'}`,
  );
};

const kravAktiv = (u: Udvidelse): void => {
  if (!u.aktiv) throw new ScenarieFejl('Udvidelsespakken er ikke aktiveret.');
};

export const saetPakke = (
  u: Udvidelse,
  aendring: {
    aktiv?: boolean | undefined;
    telefon?: string | undefined;
    taarnLyd?: string | null | undefined;
    taarnAktiv?: boolean | undefined;
  },
  nu: number,
): Udvidelse => {
  const telefon =
    aendring.telefon === undefined ? u.telefon : tolk(telefonSkema, aendring.telefon, 'Telefonnummeret');
  const taarnLyd =
    aendring.taarnLyd === undefined
      ? u.taarnLyd
      : aendring.taarnLyd === null
        ? null
        : tolk(z.string().regex(LYDFIL), aendring.taarnLyd, 'Lydklippet');
  // Et andet lydklip er en ny besked: den starter forfra.
  const nyt: Udvidelse = {
    ...u,
    aktiv: aendring.aktiv ?? u.aktiv,
    telefon,
    taarnLyd,
    taarnAktiv: aendring.taarnAktiv ?? u.taarnAktiv,
    afspilletSek: taarnLyd === u.taarnLyd ? u.afspilletSek : 0,
  };
  return normaliser(nyt, nu);
};

// ---------------------------------------------------------------- taarne

export type Tilfaeldig = () => number;

const KLOT_M = 111_320;

const udenfor360 = (v: number): number => ((v % 360) + 360) % 360;

/** Ligger pejlingen inden for spektret? Spektret maa gaa over nord. */
const iSpektret = (pejling: number, fra: number, til: number): boolean => {
  if (til - fra >= 360) return true;
  const spor = udenfor360(til - fra);
  return udenfor360(pejling - fra) <= spor + 1e-9;
};

/** Traekker en position inden for spektret og afstandsintervallet. */
const spawn = (
  s: Scenarie,
  t: Pick<Taarn, 'vinkelFra' | 'vinkelTil' | 'minM' | 'maksM'>,
  tilfaeldig: Tilfaeldig,
): { lat: number; lon: number } => {
  const spor = t.vinkelTil - t.vinkelFra >= 360 ? 360 : udenfor360(t.vinkelTil - t.vinkelFra);
  const pejling = udenfor360(t.vinkelFra + tilfaeldig() * spor);
  const maks = Math.min(t.maksM, TAARN_MAKS_M, s.kort.maxRadiusM);
  const min = Math.min(t.minM, maks);
  // Kvadratroden gør fordelingen jævn over fladen, ikke klumpet ved basen.
  const afstand = Math.sqrt(min * min + tilfaeldig() * (maks * maks - min * min));
  const r = (pejling * Math.PI) / 180;
  return {
    lat: +(s.base.lat + (afstand * Math.cos(r)) / KLOT_M).toFixed(6),
    lon: +(
      s.base.lon +
      (afstand * Math.sin(r)) / (KLOT_M * Math.cos((s.base.lat * Math.PI) / 180))
    ).toFixed(6),
  };
};

const taarnIndskrivning = z.object({
  id: z.string().regex(ID).optional(),
  titel: taarnSkema.shape.titel,
  vinkelFra: taarnSkema.shape.vinkelFra,
  vinkelTil: taarnSkema.shape.vinkelTil,
  minM: taarnSkema.shape.minM.optional(),
  maksM: z.number().positive().optional(),
  kode: taarnSkema.shape.kode,
});

const kravTaarn = (u: Udvidelse, id: string): Taarn => {
  const t = u.taarne.find((x) => x.id === id);
  if (!t) throw new ScenarieFejl(`Signaltaarnet "${id}" findes ikke.`);
  return t;
};

/**
 * Forbindelse: alle taarne er aktive, og pakken og taarnene er slaaet til.
 *
 * Tidspunktet huskes, saa lydklippet har et id. Mistes forbindelsen, gemmes det
 * der er spillet af stemmen (uden synkroniseringen), saa den fortsaetter dér,
 * naar forbindelsen oprettes igen.
 */
const normaliser = (u: Udvidelse, nu: number): Udvidelse => {
  const spiller = u.aktiv && u.taarnAktiv && u.taarne.length > 0 && u.taarne.every((t) => t.aktiv);

  if (spiller) {
    return u.forbundetKl === null
      ? { ...u, forbundetKl: new Date(nu).toISOString(), glemSession: false }
      : u;
  }
  if (u.forbundetKl === null) return u;

  const spillet = u.glemSession ? 0 : Math.max(0, sekSiden(u.forbundetKl, nu) - OPBYGNING_SEK);
  return { ...u, forbundetKl: null, glemSession: false, afspilletSek: u.afspilletSek + spillet };
};

/**
 * Nulstil lyd: glemmer hvor langt beskeden er kommet, saa den starter forfra.
 *
 * Staar forbindelsen lige nu, begynder beskeden forfra med det samme - med et
 * nyt klip-id, saa skaermen genstarter synkroniseringen og stemmen. Ellers
 * starter den forfra, naar der naeste gang er forbindelse.
 */
export const nulstilLyd = (u: Udvidelse, nu: number): Udvidelse => ({
  ...u,
  afspilletSek: 0,
  glemSession: false,
  forbundetKl: u.forbundetKl === null ? null : new Date(nu).toISOString(),
});

const medTaarn = (u: Udvidelse, id: string, aendr: (t: Taarn) => Taarn): Udvidelse => ({
  ...u,
  taarne: u.taarne.map((t) => (t.id === id ? aendr(t) : t)),
});

const nytTaarnId = (u: Udvidelse): string => {
  let n = u.taarne.length + 1;
  while (u.taarne.some((t) => t.id === `taarn-${n}`)) n += 1;
  return `taarn-${n}`;
};

/** Opretter eller retter et taarn. Et rettet taarn bliver staaende, hvis det stadig er inden for spektret. */
export const gemTaarn = (
  u: Udvidelse,
  raa: unknown,
  s: Scenarie,
  nu: number,
  tilfaeldig: Tilfaeldig = Math.random,
): Udvidelse => {
  const ny = tolk(taarnIndskrivning, raa, 'Signaltaarnet');
  const minM = ny.minM ?? 300;
  if ((ny.maksM ?? 0) > TAARN_MAKS_M) {
    throw new ScenarieFejl(`Et signaltaarn maa hoejst staa ${TAARN_MAKS_M} m fra centrum.`);
  }
  const maksM = Math.min(ny.maksM ?? TAARN_MAKS_M, s.kort.maxRadiusM);
  if (minM >= maksM) {
    throw new ScenarieFejl(`Afstanden fra (${minM} m) skal vaere mindre end afstanden til (${maksM} m).`);
  }

  const id = ny.id ?? nytTaarnId(u);
  const findes = u.taarne.find((t) => t.id === id);
  const spek = { vinkelFra: ny.vinkelFra, vinkelTil: ny.vinkelTil, minM, maksM };

  let pos = findes ? { lat: findes.lat, lon: findes.lon } : spawn(s, spek, tilfaeldig);
  let flyttet = !findes;
  if (findes) {
    const afstand = afstandM(s.base, pos);
    const paa = iSpektret(pejlingGrader(s.base, pos), spek.vinkelFra, spek.vinkelTil);
    if (!paa || afstand < minM - 1 || afstand > maksM + 1) {
      pos = spawn(s, spek, tilfaeldig);
      flyttet = true;
    }
  }

  const taarn: Taarn = {
    id,
    titel: ny.titel,
    ...spek,
    ...pos,
    kode: ny.kode,
    // Et taarn der er flyttet, er ikke laengere sat korrekt.
    aktiv: flyttet ? false : (findes?.aktiv ?? false),
    aktiveretKl: flyttet ? null : (findes?.aktiveretKl ?? null),
    kodeKl: findes?.kodeKl ?? null,
  };

  return normaliser(
    {
      ...u,
      taarne: findes ? u.taarne.map((t) => (t.id === id ? taarn : t)) : [...u.taarne, taarn],
    },
    nu,
  );
};

export const sletTaarn = (u: Udvidelse, id: string, nu: number): Udvidelse => {
  kravTaarn(u, id);
  return normaliser({ ...u, taarne: u.taarne.filter((t) => t.id !== id) }, nu);
};

/** Trækker taarnet forfra inden for dets spektrum. Det er ikke aktivt bagefter. */
export const respawnTaarn = (
  u: Udvidelse,
  id: string,
  s: Scenarie,
  nu: number,
  tilfaeldig: Tilfaeldig = Math.random,
): Udvidelse => {
  const t = kravTaarn(u, id);
  const pos = spawn(s, t, tilfaeldig);
  return normaliser(
    medTaarn(u, id, (x) => ({ ...x, ...pos, aktiv: false, aktiveretKl: null })),
    nu,
  );
};

export const aktiverTaarn = (u: Udvidelse, id: string, nu: number): Udvidelse => {
  kravAktiv(u);
  kravTaarn(u, id);
  return normaliser(
    medTaarn(u, id, (t) => ({ ...t, aktiv: true, aktiveretKl: new Date(nu).toISOString() })),
    nu,
  );
};

export const deaktiverTaarn = (u: Udvidelse, id: string, nu: number): Udvidelse => {
  kravTaarn(u, id);
  return normaliser(medTaarn(u, id, (t) => ({ ...t, aktiv: false, aktiveretKl: null })), nu);
};

/** Loefter taarnets kode frem paa skaermen i KODE_SEK sekunder. */
export const visTaarnKode = (u: Udvidelse, id: string, nu: number): Udvidelse => {
  kravAktiv(u);
  if (!u.taarnAktiv) throw new ScenarieFejl('Signaltaarnene er ikke slaaet til.');
  const t = kravTaarn(u, id);
  if (t.kode === null) throw new ScenarieFejl(`"${t.titel}" har ingen kode. Vaelg et kodebillede foerst.`);
  return medTaarn(u, id, (x) => ({ ...x, kodeKl: new Date(nu).toISOString() }));
};

export const taarnKodenKanHentes = (t: Taarn, nu: number): boolean =>
  t.kode !== null && t.kodeKl !== null && sekSiden(t.kodeKl, nu) < KODE_HENT_SEK;

const taarnKodeRest = (t: Taarn, nu: number): number | null => {
  if (t.kodeKl === null || t.kode === null) return null;
  const rest = KODE_SEK - sekSiden(t.kodeKl, nu);
  return rest > 0 ? Math.max(1, Math.ceil(rest)) : null;
};

// ---------------------------------------------------------------- visninger

interface Punktdata {
  readonly lat: number;
  readonly lon: number;
  readonly afstandM: number;
  readonly pejlingGrader: number;
  readonly sektor: number;
}

const punktdata = (a: { lat: number; lon: number }, s: Scenarie): Punktdata => {
  const pejling = pejlingGrader(s.base, a);
  return {
    lat: a.lat,
    lon: a.lon,
    afstandM: Math.round(afstandM(s.base, a)),
    pejlingGrader: Math.round(pejling) % 360,
    sektor: sektorFor(pejling, s.kort.sektorer),
  };
};

export interface KodeVisning {
  readonly id: string;
  readonly titel: string;
  readonly sekunderTilbage: number;
  readonly billede: string;
}

export interface TaarnVisning extends Punktdata {
  readonly id: string;
  readonly titel: string;
  readonly aktiv: boolean;
}

/** Lydklippet der spilles, mens alle taarne er aktive. */
export interface ForbindelseVisning {
  readonly id: string;
  readonly titel: string;
  readonly fil: string;
  readonly sekunderSiden: number;
  /** Hvor langt inde i klippet stemmen starter: det der allerede er spillet. */
  readonly startSek: number;
}

export interface UdvidelseVisning {
  readonly telefon: string;
  readonly kode: KodeVisning | null;
  readonly taarne: readonly TaarnVisning[];
  readonly forbundet: boolean;
  readonly forbindelse: ForbindelseVisning | null;
}

/** Hvor laenge en forbindelse bliver ved med at vaere et "friskt" klip i skaermbilledet. */
const FORBINDELSE_VINDUE_SEK = 30 * 60;

const taarnVisninger = (u: Udvidelse, s: Scenarie): TaarnVisning[] =>
  u.taarne.map((t) => ({
    id: t.id,
    titel: t.titel,
    aktiv: t.aktiv,
    ...punktdata(t, s),
  }));

const forbindelseFra = (u: Udvidelse, nu: number): ForbindelseVisning | null => {
  if (!u.taarnAktiv || u.forbundetKl === null || u.taarnLyd === null) return null;
  const siden = Math.max(0, Math.floor(sekSiden(u.forbundetKl, nu)));
  if (siden > FORBINDELSE_VINDUE_SEK) return null;
  return {
    id: `forbindelse-${Date.parse(u.forbundetKl)}`,
    titel: 'SIGNALFORBINDELSE',
    fil: u.taarnLyd,
    sekunderSiden: siden,
    startSek: Math.floor(u.afspilletSek),
  };
};

export const bygVisning = (u: Udvidelse, s: Scenarie, nu: number): UdvidelseVisning | null => {
  if (!u.aktiv) return null;

  let kode: KodeVisning | null = null;

  // Et taarns kode er loeftet frem af admin og vises i KODE_SEK sekunder.
  for (const t of u.taarnAktiv ? u.taarne : []) {
    const rest = taarnKodeRest(t, nu);
    if (rest === null || t.kodeKl === null) continue;
    kode = {
      id: t.id,
      titel: t.titel,
      sekunderTilbage: rest,
      billede: `/api/udvidelse/kode/${encodeURIComponent(t.id)}?t=${Date.parse(t.kodeKl)}`,
    };
  }

  return {
    telefon: u.telefon,
    kode,
    taarne: u.taarnAktiv ? taarnVisninger(u, s) : [],
    forbundet: u.forbundetKl !== null,
    forbindelse: forbindelseFra(u, nu),
  };
};

export interface TaarnIOversigt extends Punktdata {
  readonly id: string;
  readonly titel: string;
  readonly vinkelFra: number;
  readonly vinkelTil: number;
  readonly minM: number;
  readonly maksM: number;
  readonly kode: string | null;
  readonly aktiv: boolean;
  readonly aktiveretKl: string | null;
  readonly sekunderKode: number | null;
}

export interface Udvidelsesoversigt {
  readonly aktiv: boolean;
  readonly telefon: string;
  readonly kodeSek: number;
  readonly taarne: readonly TaarnIOversigt[];
  readonly taarnLyd: string | null;
  readonly taarnAktiv: boolean;
  /** Alle taarne er aktive - ogsaa mens de er skjult. */
  readonly forbundet: boolean;
  /** Hvor mange sekunder af stemmen der er spillet i alt (til admin). */
  readonly afspilletSek: number;
}

export const bygOversigt = (u: Udvidelse, s: Scenarie, nu: number): Udvidelsesoversigt => ({
  aktiv: u.aktiv,
  telefon: u.telefon,
  kodeSek: KODE_SEK,
  taarnLyd: u.taarnLyd,
  taarnAktiv: u.taarnAktiv,
  forbundet: u.taarne.length > 0 && u.taarne.every((t) => t.aktiv),
  afspilletSek: Math.floor(u.afspilletSek),
  taarne: u.taarne.map((t) => ({
    id: t.id,
    titel: t.titel,
    vinkelFra: t.vinkelFra,
    vinkelTil: t.vinkelTil,
    minM: t.minM,
    maksM: t.maksM,
    kode: t.kode,
    aktiv: t.aktiv,
    aktiveretKl: t.aktiveretKl,
    sekunderKode: taarnKodeRest(t, nu),
    ...punktdata(t, s),
  })),
});
