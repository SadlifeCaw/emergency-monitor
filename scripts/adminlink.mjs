#!/usr/bin/env node
/**
 * Finder adressen til admin-fladen.
 *
 * "Hvad er PC'ens IP?" er den slags spoergsmaal, der koster ti minutter i en
 * lade med daarligt lys. Scriptet svarer paa det, og skriver linket ud i den
 * form, telefonen skal bruge - med token, saa der ikke skal tastes noget.
 *
 * Brug:
 *   npm run adminlink            # laeser token fra .env eller miljoeet
 *   npm run adminlink -- <token>
 */

import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const ROD = resolve(import.meta.dirname, '..');

const laesEnv = async (navn) => {
  if (process.env[navn]) return process.env[navn];
  try {
    const linjer = (await readFile(resolve(ROD, '.env'), 'utf8')).split('\n');
    const fundet = linjer.find((l) => l.trim().startsWith(`${navn}=`));
    return fundet ? fundet.slice(fundet.indexOf('=') + 1).trim() : '';
  } catch {
    return '';
  }
};

/** Alle IPv4-adresser paa lokale netvaerkskort, undtagen loopback. */
const lokaleAdresser = () =>
  Object.entries(networkInterfaces()).flatMap(([kort, liste]) =>
    (liste ?? [])
      .filter((n) => n.family === 'IPv4' && !n.internal)
      .map((n) => ({ kort, adresse: n.address })),
  );

const token = process.argv[2] ?? (await laesEnv('NATVAGT_ADMIN_TOKEN'));
const port = (await laesEnv('NATVAGT_PORT')) || '8477';
const adresser = lokaleAdresser();

if (adresser.length === 0) {
  process.stdout.write(`
  Ingen netvaerksforbindelse fundet.

  Telefonen og maskinen skal vaere paa det samme lokale net. Det net behoever
  ikke internet - et hotspot fra telefonen er nok. Skaermen selv bruger ikke
  netvaerket; den koerer paa localhost.
`);
  process.exit(0);
}

process.stdout.write('\n  ADMIN-FLADEN\n\n');

for (const { kort, adresse } of adresser) {
  const url = `http://${adresse}:${port}/admin/`;
  process.stdout.write(`  ${kort}\n    ${url}${token ? `?token=${token}` : ''}\n\n`);
}

if (!token) {
  process.stdout.write(
    '  Intet token fundet. Lav et med "npm run token", og laeg det i .env.\n\n',
  );
}

process.stdout.write(`  Skaermen selv: http://localhost:${port}

  Virker linket ikke fra telefonen, er det naesten altid Windows Firewall.
  Tillad Node.js paa private netvaerk - eller afproev det i god tid.

`);
