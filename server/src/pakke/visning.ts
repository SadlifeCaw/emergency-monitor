/**
 * Det man ser og goer ved opstart af Radar.exe: admin-link med QR-kode, skaermen
 * i fuldskaerm og en PC, der ikke gaar i dvale.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';

export interface Netadresse {
  readonly kort: string;
  readonly adresse: string;
}

/** Alle IPv4-adresser paa lokale netvaerkskort, undtagen loopback. */
export const lokaleAdresser = (): Netadresse[] =>
  Object.entries(networkInterfaces()).flatMap(([kort, liste]) =>
    (liste ?? [])
      .filter((n) => n.family === 'IPv4' && !n.internal)
      .map((n) => ({ kort, adresse: n.address })),
  );

/** Hjemmenet og hotspots foer alt andet (virtuelle kort giver sjaeldent mening). */
export const bedsteAdresse = (liste: readonly Netadresse[]): Netadresse | undefined =>
  liste.find((a) => /^192\.168\./.test(a.adresse)) ??
  liste.find((a) => /^10\./.test(a.adresse)) ??
  liste.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a.adresse)) ??
  liste[0];

export const adminLink = (adresse: string, port: number, token: string): string =>
  `http://${adresse}:${port}/admin/?token=${token}`;

/** Skriver admin-linket og en QR-kode, og gemmer linket i en fil. */
export const visAdminLink = async (rod: string, port: number, token: string): Promise<void> => {
  const adresser = lokaleAdresser();

  if (adresser.length === 0) {
    process.stdout.write(`
  Ingen netværksforbindelse fundet.
  Telefonen og PC'en skal være på det samme net. Det behøver ikke internet:
  et hotspot fra telefonen er nok. Skærmen selv bruger ikke netværket.
`);
    return;
  }

  const links = adresser.map((a) => adminLink(a.adresse, port, token));
  await writeFile(join(rod, 'admin-link.txt'), `${links.join('\n')}\n`, 'utf8');

  const bedste = bedsteAdresse(adresser);
  process.stdout.write('\n  ADMIN — scan QR-koden med instruktørens telefon (samme wifi):\n\n');
  if (bedste) {
    const qr = await QRCode.toString(adminLink(bedste.adresse, port, token), {
      type: 'terminal',
      small: true,
    });
    process.stdout.write(`${qr}\n`);
  }
  for (const [i, a] of adresser.entries()) {
    process.stdout.write(`  ${a.kort}\n    ${links[i]}\n`);
  }
  process.stdout.write('\n  Linket er også gemt i admin-link.txt.\n');
};

// ---------------------------------------------------------------- skaerm

const BROWSERE = [
  `${process.env['ProgramFiles'] ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)'] ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['LOCALAPPDATA'] ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)'] ?? ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env['ProgramFiles'] ?? ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
];

/** Aabner skaermen i fuldskaerm. Chrome startes, saa lyden armeres af sig selv. */
export const aabnSkaerm = (port: number): boolean => {
  const browser = BROWSERE.find((sti) => existsSync(sti));
  if (!browser) return false;

  spawn(
    browser,
    [
      '--kiosk',
      `http://localhost:${port}/`,
      `--user-data-dir=${join(tmpdir(), 'radar-browser')}`,
      '--no-first-run',
      '--disable-session-crashed-bubble',
      '--noerrdialogs',
      '--autoplay-policy=no-user-gesture-required',
    ],
    { detached: true, stdio: 'ignore' },
  ).unref();
  return true;
};

// ---------------------------------------------------------------- vaagen

const HOLD_VAAGEN = `
Add-Type -Namespace Radar -Name Strom -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
while ($true) { [Radar.Strom]::SetThreadExecutionState(0x80000003) | Out-Null; Start-Sleep -Seconds 30 }
`;

/** Holder PC'en og skaermen taendt, til programmet lukkes. */
export const holdVaagen = (): ChildProcess => {
  const barn = spawn(
    'powershell',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', HOLD_VAAGEN],
    { stdio: 'ignore', windowsHide: true },
  );
  process.on('exit', () => barn.kill());
  return barn;
};
