/**
 * Det Radar.exe goer for brugeren ved opstart: admin-link med QR-kode, skaermen
 * i fuldskaerm og en PC, der ikke gaar i dvale. Intet af det skriver til en konsol.
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

export interface Admininfo {
  /** Et link pr. netvaerkskort. Det foerste er det, QR-koden peger paa. */
  readonly links: readonly string[];
  /** QR-koden som SVG, klar til at staa paa en side. Null uden netvaerk. */
  readonly qrSvg: string | null;
}

/** Admin-linkene og en QR-kode til det bedste af dem. Gemmer ogsaa linket i en fil. */
export const adminInfo = async (rod: string, port: number, token: string): Promise<Admininfo> => {
  const adresser = lokaleAdresser();
  if (adresser.length === 0) return { links: [], qrSvg: null };

  const bedste = bedsteAdresse(adresser) ?? adresser[0];
  const links = [
    ...(bedste ? [adminLink(bedste.adresse, port, token)] : []),
    ...adresser
      .filter((a) => a.adresse !== bedste?.adresse)
      .map((a) => adminLink(a.adresse, port, token)),
  ];
  await writeFile(join(rod, 'admin-link.txt'), `${links.join('\n')}\n`, 'utf8');

  const foerste = links[0];
  const qrSvg = foerste ? await QRCode.toString(foerste, { type: 'svg', margin: 1 }) : null;
  return { links, qrSvg };
};

/** Aabner en adresse i brugerens egen browser - uden at et konsolvindue blinker forbi. */
export const aabnIBrowser = (url: string): void => {
  spawn('cmd.exe', ['/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
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
