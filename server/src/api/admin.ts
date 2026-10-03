/**
 * Admin-ruterne: dem telefonen bruger.
 *
 * Fire spaerringer staar mellem et uheld og en oedelagt nat:
 *  - token, sammenlignet i konstant tid
 *  - skemavalidering paa alt indgaaende
 *  - rate limit, saa en telefon i lommen ikke kan hamre paa serveren
 *  - og vigtigst: enhver scenarieaendring skal bestaa den samme validering som
 *    filen paa disken, saa et koordinat uden for det rekognoscerede omraade
 *    aldrig kan naa skaermen
 *
 * Fejlbeskeder gaar videre ordret til telefonen, fordi de er skrevet til et
 * menneske. Uventede fejl gør ikke: de logges og besvares med en neutral tekst,
 * saa hverken stier eller stakspor havner paa en skaerm.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { bygAdminoversigt } from '../drift/adminoversigt.js';
import type { Natvagt } from '../drift/natvagt.js';
import { ScenarieFejl } from '../motor/scenarie.js';
import type { Konfig } from '../konfig.js';
import type { Udsending } from '../ws/udsending.js';

/**
 * Forespoergsler i minuttet pr. IP.
 *
 * Admin-fladen henter overblikket hvert 4. sekund og helbredet hvert 8., altsaa
 * ca. 22 i minuttet. Loftet skal ligge over det med god margin, for det er ikke
 * normal brug, det skal stoppe - det er en telefon i en lomme eller en klient,
 * der er gaaet i loop.
 */
const MAKS_PR_MINUT = 90;

const idSkema = z.object({ id: z.string().min(1).max(200) });
const aendringSkema = z.record(z.string(), z.unknown());

const ravageSkema = z.object({
  sloeretKort: z.boolean().optional(),
  skjulKoordinat: z.boolean().optional(),
  glitch: z.boolean().optional(),
  maalingsfejl: z.boolean().optional(),
});

/**
 * Konstanttidssammenligning.
 *
 * Begge tokens hashes foerst, saa `timingSafeEqual` altid faar lige lange
 * buffere - ellers kaster den, og laengden ville i sig selv kunne laekke.
 */
const tokenPasser = (givet: string, forventet: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(givet).digest(),
    createHash('sha256').update(forventet).digest(),
  );

const laesToken = (req: FastifyRequest): string => {
  const raa = req.headers.authorization ?? '';
  return raa.startsWith('Bearer ') ? raa.slice('Bearer '.length).trim() : '';
};

interface AdminAfhaengigheder {
  readonly natvagt: Natvagt;
  readonly konfig: Konfig;
  readonly udsending: Udsending;
}

/** Oversaetter en fejl til noget, der kan staa paa en telefonskaerm. */
const svarPaaFejl = (app: FastifyInstance, reply: FastifyReply, fejl: unknown): FastifyReply => {
  if (fejl instanceof ScenarieFejl || fejl instanceof RangeError) {
    return reply.code(400).send({ fejl: fejl.message });
  }
  app.log.error({ fejl }, 'Uventet fejl i admin-rute');
  return reply.code(500).send({ fejl: 'Serveren kunne ikke gennemfoere handlingen.' });
};

/** Ruter der kun ser paa noget. De aendrer intet og gaar ikke gennem kommandokoeen. */
const registrerLaeseruter = (
  admin: FastifyInstance,
  { natvagt, konfig, udsending }: AdminAfhaengigheder,
  oversigt: () => unknown,
): void => {
  admin.get('/api/admin/oversigt', () => oversigt());

  admin.get('/api/admin/helbred', () => ({
    serverKl: natvagt.skaermbillede().serverKl,
    skaermeForbundet: udsending.antalKlienter(),
    sidsteTilslutning: udsending.sidsteTilslutning(),
    scenarie: natvagt.scenarie().navn,
    fase: natvagt.tilstand().fase,
    hastighed: konfig.hastighed,
  }));
};

type Udfoer = (reply: FastifyReply, handling: () => Promise<void>) => Promise<unknown>;

/** Ruter der retter i scenariet: opret, ret og aflys alarmer. */
const registrerScenarieruter = (admin: FastifyInstance, natvagt: Natvagt, udfoer: Udfoer): void => {
  admin.post('/api/admin/haendelse', (req, reply) =>
    udfoer(reply, () => natvagt.opretHaendelse(req.body)),
  );

  admin.patch('/api/admin/haendelse/:id', (req, reply) => {
    const { id } = idSkema.parse(req.params);
    const aendringer = aendringSkema.parse(req.body ?? {});
    return udfoer(reply, () => natvagt.retHaendelsen(id, aendringer));
  });

  admin.delete('/api/admin/haendelse/:id', (req, reply) => {
    const { id } = idSkema.parse(req.params);
    return udfoer(reply, () => natvagt.aflysHaendelse(id));
  });
};

/** Ruter der styrer natten mens den koerer: fyr, kvitter, stop, ravage, nulstil. */
const registrerStyreruter = (admin: FastifyInstance, natvagt: Natvagt, udfoer: Udfoer): void => {
  admin.post('/api/admin/fyr/:id', (req, reply) => {
    const { id } = idSkema.parse(req.params);
    return udfoer(reply, () => natvagt.fyrHaendelse(id));
  });

  admin.post('/api/admin/kvitter', (_req, reply) => udfoer(reply, () => natvagt.kvitterAlarm()));

  admin.post('/api/admin/stop', (_req, reply) => udfoer(reply, () => natvagt.stopAlarm()));

  /**
   * Ravage: forstyrrelser af skaermen.
   *
   * Kun de felter der sendes med, aendrer sig - saa telefonen kan sende ét
   * knaptryk ad gangen uden at skulle kende resten af tilstanden.
   */
  admin.post('/api/admin/ravage', (req, reply) => {
    const aendringer = ravageSkema.parse(req.body ?? {});
    return udfoer(reply, () => natvagt.saetRavagen(aendringer));
  });

  /**
   * Nulstil natten.
   *
   * Kraever `?bekraeft=ja`. Handlingen kan ikke fortrydes, og den er den
   * eneste i fladen, der kan slette en nat, der er i gang.
   */
  admin.post('/api/admin/nulstil', (req, reply) => {
    const { bekraeft } = z.object({ bekraeft: z.string().optional() }).parse(req.query);
    if (bekraeft !== 'ja') {
      return reply.code(400).send({ fejl: 'Nulstilling kraever bekraeftelse. Send ?bekraeft=ja.' });
    }
    return udfoer(reply, () => natvagt.nulstilNatten());
  });
};

/**
 * Spaerringerne foran alle admin-ruter: rate limit og token.
 *
 * Rate limitten er ikke mod normal brug - den er mod en telefon i en lomme
 * eller en klient, der er gaaet i loop.
 */
const beskyt = async (admin: FastifyInstance, konfig: Konfig): Promise<void> => {
  await admin.register(rateLimit, {
    max: MAKS_PR_MINUT,
    timeWindow: '1 minute',
    // Statuskoden skal med i objektet. Uden den ser Fastify svaret som en
    // ukendt fejl og returnerer 500 i stedet for 429.
    errorResponseBuilder: () => ({
      statusCode: 429,
      fejl: 'For mange forespoergsler. Vent et oejeblik.',
    }),
  });

  admin.addHook('onRequest', async (req, reply) => {
    if (!tokenPasser(laesToken(req), konfig.adminToken)) {
      await reply.code(401).send({ fejl: 'Forkert eller manglende adgangstoken.' });
    }
  });
};

export const registrerAdminRuter = async (
  app: FastifyInstance,
  { natvagt, konfig, udsending }: AdminAfhaengigheder,
): Promise<void> => {
  await app.register(async (admin) => {
    await beskyt(admin, konfig);

    /** Kalder en kommando og svarer med det opdaterede overblik. */
    const udfoer = async (reply: FastifyReply, handling: () => Promise<void>) => {
      try {
        await handling();
      } catch (fejl: unknown) {
        return svarPaaFejl(app, reply, fejl);
      }
      return reply.send(oversigt());
    };

    const oversigt = () =>
      bygAdminoversigt(
        natvagt.scenarie(),
        natvagt.tilstand(),
        Date.parse(natvagt.skaermbillede().serverKl),
      );

    registrerLaeseruter(admin, { natvagt, konfig, udsending }, oversigt);

    registrerScenarieruter(admin, natvagt, udfoer);
    registrerStyreruter(admin, natvagt, udfoer);
  });
};
