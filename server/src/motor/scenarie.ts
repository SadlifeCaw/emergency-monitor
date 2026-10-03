/**
 * Indlaesning og validering af et scenarie.
 *
 * Filen her er sidste chance for at fange en fejl, mens der stadig er lys og
 * kaffe. Derfor er den streng, og derfor er fejlbeskederne skrevet til et
 * menneske og ikke til en logfil.
 */

import { z } from 'zod';
import { afstandM } from './geo.js';
import type { Haendelse, Scenarie } from './typer.js';

export class ScenarieFejl extends Error {
  constructor(besked: string) {
    super(besked);
    this.name = 'ScenarieFejl';
  }
}

const MAX_FEJLTEKST = 500;

const tidspunkt = z
  .string()
  .refine((s) => Number.isFinite(Date.parse(s)), 'skal vaere et ISO 8601-tidspunkt');

const lyd = z.enum(['ingen', 'blip', 'alert', 'sirene']);

const faelles = {
  id: z.string().min(1),
  at: tidspunkt,
  titel: z.string().min(1),
  lyd,
};


const anomaliSkema = z.object({
  ...faelles,
  type: z.literal('ANOMALI'),
  sektor: z.number().int().min(1),
  tekst: z.string().min(1),
  autoOploesSek: z.number().int().min(1).max(3600),
}).strict();

const dekrypteringSkema = z.object({
  ...faelles,
  type: z.literal('DEKRYPTERING'),
  procent: z.number().min(0).max(100),
  fragment: z.string().min(1),
}).strict();

const meldingSkema = z.object({
  ...faelles,
  type: z.literal('MELDING'),
  tekst: z.string().min(1),
}).strict();

const alarmSkema = z.object({
  ...faelles,
  type: z.literal('ALARM'),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  usikkerhedM: z.number().min(0).max(1000),
  naermestePunkt: z.string().min(1),
  instruks: z.string().min(1),
  optrapningSek: z.number().int().min(0).max(3600),
}).strict();

const afslutSkema = z.object({
  ...faelles,
  type: z.literal('AFSLUT'),
  tekst: z.string().min(1),
}).strict();

/**
 * Felter der begynder med _ er dokumentation og ignoreres.
 *
 * Skemaerne er strikse, saa et taste-slip fra admin bliver afvist frem for
 * fjernet i stilhed. Men gruppeudvalget skal stadig kunne skrive en note ind i
 * scenariefilen uden at den holder op med at kunne laeses.
 */
const udenNoter = (raa: unknown): unknown => {
  if (typeof raa !== 'object' || raa === null || Array.isArray(raa)) return raa;
  return Object.fromEntries(
    Object.entries(raa as Record<string, unknown>).filter(([n]) => !n.startsWith('_')),
  );
};

const haendelseSkema = z.discriminatedUnion('type', [
  anomaliSkema,
  dekrypteringSkema,
  meldingSkema,
  alarmSkema,
  afslutSkema,
]);

const scenarieSkema = z.object({
  version: z.literal(1),
  navn: z.string().min(1),
  seed: z.number().int(),
  base: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    label: z.string().min(1),
    verificeret: z.boolean(),
  }),
  kort: z.object({
    startZoom: z.number().int().min(1).max(22),
    maxRadiusM: z.number().min(50).max(5000),
    sektorer: z.number().int().min(1).max(36),
  }),
  nat: z
    .object({
      fra: z.string().regex(/^\d{1,2}:\d{2}$/, 'skal vaere et klokkeslaet som "23:00"'),
      til: z.string().regex(/^\d{1,2}:\d{2}$/, 'skal vaere et klokkeslaet som "05:00"'),
      anomalierPrNat: z.number().min(0).max(60),
    })
    .default({ fra: '23:00', til: '05:00', anomalierPrNat: 4 }),
  haendelser: z.array(z.preprocess(udenNoter, haendelseSkema)),
});

const formaterZodfejl = (fejl: z.ZodError): string => {
  const linjer = fejl.issues
    .slice(0, 6)
    .map((i) => `${i.path.join('.') || '(rod)'}: ${i.message}`);
  const tekst = linjer.join('; ');
  return tekst.length > MAX_FEJLTEKST ? `${tekst.slice(0, MAX_FEJLTEKST)}...` : tekst;
};

const kraevUnikkeIder = (haendelser: readonly Haendelse[]): void => {
  const set = new Set<string>();
  for (const h of haendelser) {
    if (set.has(h.id)) {
      throw new ScenarieFejl(`Ugyldigt scenarie: haendelses-id "${h.id}" bruges mere end en gang`);
    }
    set.add(h.id);
  }
};

const kraevGyldigeSektorer = (scenarie: Scenarie): void => {
  for (const h of scenarie.haendelser) {
    if (!('sektor' in h)) continue;
    if (h.sektor > scenarie.kort.sektorer) {
      throw new ScenarieFejl(
        `Ugyldigt scenarie: haendelsen "${h.id}" peger paa sektor ${h.sektor}, men kortet har kun ${scenarie.kort.sektorer} sektorer`,
      );
    }
  }
};

/**
 * Ingen alarm maa pege uden for det rekognoscerede omraade.
 * Det er den vigtigste regel i hele filen.
 */
const kraevAlarmerIndenforRadius = (scenarie: Scenarie): void => {
  const { maxRadiusM } = scenarie.kort;
  for (const h of scenarie.haendelser) {
    if (h.type !== 'ALARM') continue;
    const afstand = Math.round(afstandM(scenarie.base, h));
    if (afstand > maxRadiusM) {
      throw new ScenarieFejl(
        `Ugyldigt scenarie: alarmen "${h.id}" ligger ${afstand} m fra basen, men graensen er ${maxRadiusM} m`,
      );
    }
  }
};

const kronologisk = (a: Haendelse, b: Haendelse): number => Date.parse(a.at) - Date.parse(b.at);

/**
 * Laeser og validerer et scenarie. Haendelserne returneres altid kronologisk
 * sorteret, saa motoren og admin-listen viser samme raekkefoelge som filen laeses i.
 */
export const laesScenarie = (raa: unknown): Scenarie => {
  const resultat = scenarieSkema.safeParse(raa);
  if (!resultat.success) {
    throw new ScenarieFejl(`Ugyldigt scenarie: ${formaterZodfejl(resultat.error)}`);
  }

  const scenarie: Scenarie = {
    ...resultat.data,
    haendelser: [...resultat.data.haendelser].sort(kronologisk),
  };

  kraevUnikkeIder(scenarie.haendelser);
  kraevGyldigeSektorer(scenarie);
  kraevAlarmerIndenforRadius(scenarie);

  return scenarie;
};
