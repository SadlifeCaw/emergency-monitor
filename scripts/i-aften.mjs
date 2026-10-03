#!/usr/bin/env node
/**
 * Flytter natten til i aften - eller til om lidt.
 *
 * `scenarios/nat.json` er dateret til den rigtige nat i juli. Koerer man den
 * paa en anden dato, ligger alle tidspunkter i fortiden, motoren indhenter dem
 * paa foerste tick, og man staar med en skaerm i fasen AFSLUTTET og ingen alarm
 * tilbage at fyre. Det er ikke en fejl - det er scenariet, der er skrevet til
 * en bestemt nat - men det goer det umuligt at proeve noget af.
 *
 * Scriptet skriver en kopi med forskudte tidspunkter og starter serveren paa
 * den. Planen roeres ikke.
 *
 * Brug:
 *   npm run i-aften           # perioden begynder nu, uret gaar normalt
 *   npm run i-aften -- nat    # ... og uret stilles til lige foer nattevinduet
 *   npm run i-aften -- nat 60 # ... og natten koerer 60 gange for hurtigt
 *   npm run i-aften -- +5     # perioden begynder om 5 minutter
 *
 * "nat" er den nyttigste til at proeve noget af: uden den staar man i
 * dagtimerne, hvor der med vilje ikke sker noget.
 */

import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROD = resolve(import.meta.dirname, '..');
const PLAN = resolve(ROD, 'scenarios/nat.json');
const KOPI = resolve(ROD, 'scenarios/i-aften.json');
const TILSTAND = resolve(ROD, 'state');

const [naar = 'nu', hastighed = '1'] = process.argv.slice(2);

const plan = JSON.parse(await readFile(PLAN, 'utf8'));
const gammelStart = new Date(plan.vagt.start);

const nyStart = naar.startsWith('+')
  ? new Date(Date.now() + Number(naar.slice(1)) * 60_000)
  : new Date();

/**
 * Uret stilles til fem minutter foer nattevinduet.
 *
 * Uden det staar man midt i dagtimerne, hvor der med vilje ikke sker noget -
 * og saa ser skaermen ud som om den er gaaet i staa.
 */
const foerNatten = () => {
  const [t, m] = plan.nat.fra.split(':').map(Number);
  const maal = new Date();
  maal.setHours(t, m, 0, 0);
  maal.setMinutes(maal.getMinutes() - 5);
  if (maal <= new Date()) maal.setDate(maal.getDate() + 1);
  return maal;
};

const virtuelStart = naar === 'nat' ? foerNatten() : null;

if (Number.isNaN(nyStart.getTime())) {
  process.stderr.write(`\n  Forstod ikke "${naar}". Brug "i-aften" eller fx "+5".\n\n`);
  process.exit(1);
}

const forskyd = nyStart.getTime() - gammelStart.getTime();
const flyt = (iso) => new Date(new Date(iso).getTime() + forskyd).toISOString();

/**
 * Alarmen laegges ti minutter frem i stedet for at blive forskudt med resten.
 *
 * Perioden er en hel uge, saa en proportional forskydning ville lande alarmen
 * flere doegn ude i fremtiden - og saa er der ingenting at proeve af. Ti
 * minutter er langt nok til at naa at kigge, kort nok til at man gider vente.
 * Den kan altid fyres i forvejen fra telefonen.
 */
const ALARM_OM_MIN = 10;

const kopi = {
  ...plan,
  navn: `${plan.navn} (flyttet)`,
  _note:
    'GENERERET af scripts/i-aften.mjs. Ret ikke i denne fil - ret i nat.json og koer scriptet igen.',
  vagt: { start: flyt(plan.vagt.start), slut: flyt(plan.vagt.slut) },
  haendelser: plan.haendelser.map((h) =>
    h.type === 'ALARM'
      ? {
          ...h,
          at: new Date(
            (virtuelStart ?? nyStart).getTime() + ALARM_OM_MIN * 60_000,
          ).toISOString(),
        }
      : { ...h, at: flyt(h.at) },
  ),
};

await writeFile(KOPI, `${JSON.stringify(kopi, null, 2)}\n`, 'utf8');

// Den gemte nat hoerer til det gamle scenarie. Bliver den staaende, koerer
// serveren videre paa de gamle tidspunkter og ignorerer den nye fil.
await rm(TILSTAND, { recursive: true, force: true });

const kl = (iso) =>
  new Date(iso).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });

const alarm = kopi.haendelser.find((h) => h.type === 'ALARM');

process.stdout.write(`
  NATTEN ER FLYTTET

  Perioden begynder ${kl(kopi.vagt.start)}${virtuelStart ? `
  Uret starter paa    ${kl(virtuelStart.toISOString())}` : ''}
  Alarmen falder    ${kl(alarm.at)}   (kan altid fyres i forvejen fra telefonen)
  Nattevindue       ${kopi.nat.fra} - ${kopi.nat.til}, ca. ${kopi.nat.anomalierPrNat} udslag pr. nat
  Hastighed         ${hastighed}x

  Skaermen          http://localhost:${process.env.NATVAGT_PORT ?? 8477}
  Styringen         npm run adminlink

`);

process.env.NATVAGT_SCENARIE = 'scenarios/i-aften.json';
process.env.NATVAGT_HASTIGHED = hastighed;
if (virtuelStart) process.env.NATVAGT_VIRTUEL_START = virtuelStart.toISOString();

await import('../server/src/index.ts');
