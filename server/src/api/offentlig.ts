/**
 * Offentlige ruter: dem skaermen bruger.
 *
 * Ingen godkendelse - skaermen staar paa det samme lokalnet som serveren, og
 * der er intet fortroligt i et skaermbillede. Admin-ruterne i fase 6 er en
 * anden sag.
 */

import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { taarnKodenKanHentes } from '../udvidelse/udvidelse.js';
import type { Natvagt } from '../drift/natvagt.js';
import type { Udsending } from '../ws/udsending.js';

export interface OffentligeRuterAfhaengigheder {
  readonly natvagt: Natvagt;
  readonly udsending: Udsending;
  /** Mappen med kodebilleder. Mangler den, kan ingen kode vises. */
  readonly kodemappe?: string;
}

export const registrerOffentligeRuter = (
  app: FastifyInstance,
  { natvagt, udsending, kodemappe }: OffentligeRuterAfhaengigheder,
): void => {
  /** Bruges af selvtesten og af kiosk-scriptet, foer browseren startes. */
  app.get('/health', () => ({
    status: 'ok',
    skaermeForbundet: udsending.antalKlienter(),
    fase: natvagt.tilstand().fase,
  }));

  /** Fuldt skaermbillede. Skaermen henter det ved opstart og ved hver genforbindelse. */
  app.get('/api/state', () => natvagt.skaermbillede());

  /**
   * Kodebilledet til et signaltaarn, mens koden vises.
   *
   * Udleveres kun mens koden skal vaere synlig. Filnavnet staar aldrig i
   * skaermbilledet, saa en kode ikke kan hentes foer eller efter sit vindue.
   */
  const TYPER: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };

  app.get<{ Params: { id: string } }>('/api/udvidelse/kode/:id', async (req, reply) => {
    const u = natvagt.udvidelse();
    const taarn = u.aktiv && u.taarnAktiv ? u.taarne.find((t) => t.id === req.params.id) : undefined;
    const nu = Date.parse(natvagt.skaermbillede().serverKl);

    const fil = taarn && taarnKodenKanHentes(taarn, nu) ? taarn.kode : null;

    if (!kodemappe || fil === null) {
      return reply.code(404).send({ fejl: 'Ingen kode.' });
    }

    try {
      const bytes = await readFile(join(kodemappe, fil));
      return await reply
        .header('Cache-Control', 'no-store')
        .type(TYPER[extname(fil).toLowerCase()] ?? 'application/octet-stream')
        .send(bytes);
    } catch {
      return reply.code(404).send({ fejl: 'Ingen kode.' });
    }
  });

  app.get('/ws', { websocket: true }, (forbindelse) => {
    udsending.tilfoej(forbindelse);

    // Send med det samme, saa skaermen ikke staar tom i op til et sekund.
    forbindelse.send(JSON.stringify(natvagt.skaermbillede()));

    forbindelse.on('close', () => udsending.fjern(forbindelse));
    forbindelse.on('error', () => udsending.fjern(forbindelse));
  });
};
