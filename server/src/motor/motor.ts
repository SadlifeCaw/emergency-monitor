/**
 * Scenarie-motoren.
 *
 * Hjertet i hele systemet, og med vilje det kedeligste modul: rene funktioner,
 * ingen I/O, intet Date.now(). Tiden kommer altid udefra som `nu`.
 *
 * Det giver tre ting, natten afhaenger af:
 *  - hele forloebet kan afspilles paa millisekunder i en test
 *  - generalproeven kan koere 60 gange hurtigere uden en eneste saerregel
 *  - en genstart kl. 03 genoptager natten praecis, fordi tilstanden er ren data
 */

import { tomRavage } from './ravage.js';
import type {
  Anomali,
  Fase,
  Haendelse,
  Scenarie,
  Tickresultat,
  Tilstand,
  UdgaaendeBegivenhed,
} from './typer.js';

/** Hvor laenge en alarm staar paa skaermen, foer den slukker selv. */
export const ALARM_VARIGHED_MS = 5 * 60 * 1000;

const iso = (nu: number): string => new Date(nu).toISOString();

const erFyret = (tilstand: Tilstand, id: string): boolean => id in tilstand.fyrede;

/** Anomalier der er fyret og endnu ikke afskrevet. Telemetrien laener sig op ad denne. */
export const aabneAnomalier = (scenarie: Scenarie, tilstand: Tilstand): readonly Anomali[] =>
  scenarie.haendelser.filter(
    (h): h is Anomali =>
      h.type === 'ANOMALI' && erFyret(tilstand, h.id) && tilstand.fyrede[h.id]?.oploestKl === null,
  );

/** Alarmer der endnu ikke er fyret. Bruges til optrapningsvinduet. */
const ventendeAlarmer = (scenarie: Scenarie, tilstand: Tilstand) =>
  scenarie.haendelser.filter((h) => h.type === 'ALARM' && !erFyret(tilstand, h.id));

const harAfsluttet = (scenarie: Scenarie, tilstand: Tilstand): boolean =>
  scenarie.haendelser.some((h) => h.type === 'AFSLUT' && erFyret(tilstand, h.id));

/**
 * Fasen udledes altid af tilstanden - den gemmes aldrig som en selvstaendig sandhed.
 * Saa kan den ikke komme ud af trit med resten efter en genstart.
 */
export const beregnFase = (scenarie: Scenarie, tilstand: Tilstand, nu: number): Fase => {
  if (harAfsluttet(scenarie, tilstand)) return 'AFSLUTTET';
  if (tilstand.aktivAlarm) return 'ALARM';

  const iOptrapning = ventendeAlarmer(scenarie, tilstand).some((h) => {
    const at = Date.parse(h.at);
    const vinduesstart = at - ('optrapningSek' in h ? h.optrapningSek : 0) * 1000;
    return nu >= vinduesstart && nu < at;
  });

  return iOptrapning ? 'OPTRAPNING' : 'ROLIG';
};

export const nyTilstand = (scenarie: Scenarie, nu: number): Tilstand => ({
  scenarioId: scenarie.navn,
  startetKl: iso(nu),
  fase: 'ROLIG',
  fyrede: {},
  tvungne: {},
  aktivAlarm: null,
  dekrypteringProcent: 0,
  dekrypteringFragment: null,
  vagthold: 'A',
  ravage: tomRavage(),
});

/** Anvender én haendelse paa tilstanden. Returnerer altid en ny tilstand. */
const anvendFyring = (tilstand: Tilstand, haendelse: Haendelse, nu: number): Tilstand => {
  const medFyring: Tilstand = {
    ...tilstand,
    fyrede: { ...tilstand.fyrede, [haendelse.id]: { fyretKl: iso(nu), oploestKl: null } },
  };

  switch (haendelse.type) {
    case 'ALARM':
      return {
        ...medFyring,
        aktivAlarm: { haendelseId: haendelse.id, fyretKl: iso(nu), kvitteretKl: null },
      };
    case 'DEKRYPTERING':
      return {
        ...medFyring,
        dekrypteringProcent: haendelse.procent,
        dekrypteringFragment: haendelse.fragment,
      };
    case 'AFSLUT':
      // Natten er slut. En alarm, ingen naaede at stoppe, skal ikke blive haengende.
      return { ...medFyring, aktivAlarm: null };
    default:
      return medFyring;
  }
};

/** Lukker de anomalier, hvis frist er udloebet. */
const afskrivForfaldneAnomalier = (
  scenarie: Scenarie,
  tilstand: Tilstand,
  nu: number,
): { tilstand: Tilstand; udgaaende: UdgaaendeBegivenhed[] } => {
  const udgaaende: UdgaaendeBegivenhed[] = [];
  let fyrede = tilstand.fyrede;

  for (const anomali of aabneAnomalier(scenarie, tilstand)) {
    const post = tilstand.fyrede[anomali.id];
    if (!post) continue;
    if (nu < Date.parse(post.fyretKl) + anomali.autoOploesSek * 1000) continue;

    fyrede = { ...fyrede, [anomali.id]: { ...post, oploestKl: iso(nu) } };
    udgaaende.push({ slags: 'ANOMALI_OPLOEST', haendelseId: anomali.id, kl: iso(nu) });
  }

  return { tilstand: fyrede === tilstand.fyrede ? tilstand : { ...tilstand, fyrede }, udgaaende };
};

/** Slukker en alarm, der har staaet i ALARM_VARIGHED_MS. Hændelsen forbliver fyret. */
const afskrivForfaldenAlarm = (
  tilstand: Tilstand,
  nu: number,
): { tilstand: Tilstand; udgaaende: UdgaaendeBegivenhed[] } => {
  const alarm = tilstand.aktivAlarm;
  if (!alarm || nu < Date.parse(alarm.fyretKl) + ALARM_VARIGHED_MS) {
    return { tilstand, udgaaende: [] };
  }
  return {
    tilstand: { ...tilstand, aktivAlarm: null },
    udgaaende: [{ slags: 'ALARM_STOPPET', haendelseId: alarm.haendelseId, kl: iso(nu) }],
  };
};

/** Saetter fasen og udsender et FASE_SKIFT, hvis den faktisk aendrede sig. */
const afslutTick = (
  scenarie: Scenarie,
  foer: Fase,
  tilstand: Tilstand,
  udgaaende: readonly UdgaaendeBegivenhed[],
  nu: number,
): Tickresultat => {
  const fase = beregnFase(scenarie, tilstand, nu);
  const skift: UdgaaendeBegivenhed[] =
    fase === foer ? [] : [{ slags: 'FASE_SKIFT', fra: foer, til: fase, kl: iso(nu) }];

  return { tilstand: { ...tilstand, fase }, udgaaende: [...udgaaende, ...skift] };
};

const kronologisk = (a: Haendelse, b: Haendelse): number => Date.parse(a.at) - Date.parse(b.at);

/**
 * Ét skridt frem i tiden.
 *
 * Haendelser, der forfaldt mens serveren var nede, fyrer ved naeste tick i
 * kronologisk raekkefoelge. Det er med vilje: natten skal indhente sig selv,
 * ikke springe over.
 */
export const tick = (scenarie: Scenarie, tilstand: Tilstand, nu: number): Tickresultat => {
  const forfaldne = scenarie.haendelser
    .filter((h) => !erFyret(tilstand, h.id) && Date.parse(h.at) <= nu)
    .sort(kronologisk);

  const udgaaende: UdgaaendeBegivenhed[] = [];
  let arbejde = tilstand;

  for (const haendelse of forfaldne) {
    arbejde = anvendFyring(arbejde, haendelse, nu);
    udgaaende.push({ slags: 'HAENDELSE_FYRET', haendelse, kl: iso(nu) });
  }

  const afskrevet = afskrivForfaldneAnomalier(scenarie, arbejde, nu);
  const alarmSlut = afskrivForfaldenAlarm(afskrevet.tilstand, nu);

  return afslutTick(scenarie, tilstand.fase, alarmSlut.tilstand, [
    ...udgaaende,
    ...afskrevet.udgaaende,
    ...alarmSlut.udgaaende,
  ], nu);
};

/**
 * Live-trigger fra telefonen: fyr en haendelse nu i stedet for paa det planlagte
 * tidspunkt. Registreres i `tvungne`, saa admin kan se, at den blev fyret manuelt.
 */
export const fyrNu = (
  scenarie: Scenarie,
  tilstand: Tilstand,
  haendelseId: string,
  nu: number,
): Tickresultat => {
  const haendelse = scenarie.haendelser.find((h) => h.id === haendelseId);
  if (!haendelse) {
    throw new RangeError(`Ukendt haendelse "${haendelseId}"`);
  }
  if (erFyret(tilstand, haendelseId)) {
    throw new RangeError(
      `Haendelsen "${haendelseId}" er allerede fyret kl. ${tilstand.fyrede[haendelseId]?.fyretKl}`,
    );
  }

  const fyret: Tilstand = {
    ...anvendFyring(tilstand, haendelse, nu),
    tvungne: { ...tilstand.tvungne, [haendelseId]: iso(nu) },
  };

  return afslutTick(
    scenarie,
    tilstand.fase,
    fyret,
    [{ slags: 'HAENDELSE_FYRET', haendelse, kl: iso(nu) }],
    nu,
  );
};

/** Admin har set alarmen. Sirenen tier; punktet og pejlingen bliver staaende. */
export const kvitter = (tilstand: Tilstand, nu: number): Tickresultat => {
  const alarm = tilstand.aktivAlarm;
  if (!alarm || alarm.kvitteretKl !== null) {
    return { tilstand, udgaaende: [] };
  }

  return {
    tilstand: { ...tilstand, aktivAlarm: { ...alarm, kvitteretKl: iso(nu) } },
    udgaaende: [{ slags: 'ALARM_KVITTERET', haendelseId: alarm.haendelseId, kl: iso(nu) }],
  };
};

/**
 * Panikstoppet. Rydder alarmen og lukker alle aabne anomalier, saa skaermen
 * falder til ro med ét tryk. Haendelserne bliver staaende som fyrede og
 * genfyrer derfor aldrig.
 */
export const stop = (scenarie: Scenarie, tilstand: Tilstand, nu: number): Tickresultat => {
  const udgaaende: UdgaaendeBegivenhed[] = [];

  if (tilstand.aktivAlarm) {
    udgaaende.push({
      slags: 'ALARM_STOPPET',
      haendelseId: tilstand.aktivAlarm.haendelseId,
      kl: iso(nu),
    });
  }

  let fyrede = tilstand.fyrede;
  for (const anomali of aabneAnomalier(scenarie, tilstand)) {
    const post = tilstand.fyrede[anomali.id];
    if (!post) continue;
    fyrede = { ...fyrede, [anomali.id]: { ...post, oploestKl: iso(nu) } };
    udgaaende.push({ slags: 'ANOMALI_OPLOEST', haendelseId: anomali.id, kl: iso(nu) });
  }

  return afslutTick(scenarie, tilstand.fase, { ...tilstand, fyrede, aktivAlarm: null }, udgaaende, nu);
};
