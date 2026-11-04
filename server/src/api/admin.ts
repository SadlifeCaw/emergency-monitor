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
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { bygAdminoversigt } from '../drift/adminoversigt.js';
import type { Natvagt } from '../drift/natvagt.js';
import { LYDFIL, ScenarieFejl } from '../motor/scenarie.js';
import { KODEFIL, bygOversigt } from '../udvidelse/udvidelse.js';
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
  lydFra: z.boolean().optional(),
  signalfejl: z.boolean().optional(),
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
  /** Mappen lydklippene ligger i. */
  readonly lydmappe: string;
  /** Mappen kodebillederne ligger i. */
  readonly kodemappe: string;
}

/**
 * Et lydklip skal findes paa disken, foer haendelsen oprettes.
 *
 * Bedre en fejl paa telefonen kl. 19 end et klip, der ikke lyder kl. 02.
 */
const kravLydfil = (lydmappe: string, fil: unknown): void => {
  if (typeof fil !== 'string') return;
  if (LYDFIL.test(fil) && !existsSync(join(lydmappe, fil))) {
    throw new ScenarieFejl(`Lydfilen "${fil}" findes ikke i ${lydmappe}`);
  }
};

const erObjekt = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

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
  { natvagt, konfig, udsending, lydmappe }: AdminAfhaengigheder,
  oversigt: () => unknown,
): void => {
  /** Lydfilerne man kan vaelge imellem. */
  admin.get('/api/admin/lydfiler', async () => {
    let navne: string[] = [];
    try {
      navne = await readdir(lydmappe);
    } catch {
      // Mappen findes ikke endnu - listen er bare tom.
    }
    return { mappe: lydmappe, filer: navne.filter((n) => LYDFIL.test(n)).sort() };
  });

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
const registrerScenarieruter = (
  admin: FastifyInstance,
  natvagt: Natvagt,
  udfoer: Udfoer,
  lydmappe: string,
): void => {
  admin.post('/api/admin/haendelse', (req, reply) =>
    udfoer(reply, async () => {
      if (erObjekt(req.body) && req.body['type'] === 'LYD') kravLydfil(lydmappe, req.body['fil']);
      await natvagt.opretHaendelse(req.body);
    }),
  );

  admin.patch('/api/admin/haendelse/:id', (req, reply) => {
    const { id } = idSkema.parse(req.params);
    const aendringer = aendringSkema.parse(req.body ?? {});
    return udfoer(reply, async () => {
      kravLydfil(lydmappe, aendringer['fil']);
      await natvagt.retHaendelsen(id, aendringer);
    });
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
 * Udvidelsespakken: signaltaarne.
 *
 * Alle rute-svar er det opdaterede admin-overblik, ligesom resten af fladen.
 */
const registrerUdvidelsesruter = (
  admin: FastifyInstance,
  natvagt: Natvagt,
  udfoer: Udfoer,
  kodemappe: string,
  lydmappe: string,
): void => {
  const pakkeSkema = z.object({
    aktiv: z.boolean().optional(),
    telefon: z.string().max(20).optional(),
    taarnLyd: z.string().max(200).nullable().optional(),
    taarnAktiv: z.boolean().optional(),
  });

  /** Kodebillederne man kan vaelge imellem. */
  admin.get('/api/admin/koder', async () => {
    let navne: string[] = [];
    try {
      navne = await readdir(kodemappe);
    } catch {
      // Mappen findes ikke endnu - listen er bare tom.
    }
    return { mappe: kodemappe, filer: navne.filter((n) => KODEFIL.test(n)).sort() };
  });

  /** Kodebilledet skal findes paa disken, foer alarmen gemmes. */
  const kravKodefil = (kode: unknown): void => {
    if (typeof kode === 'string' && KODEFIL.test(kode) && !existsSync(join(kodemappe, kode))) {
      throw new ScenarieFejl(`Kodebilledet "${kode}" findes ikke i ${kodemappe}`);
    }
  };

  admin.post('/api/admin/udvidelse/pakke', (req, reply) => {
    const aendring = pakkeSkema.parse(req.body ?? {});
    return udfoer(reply, async () => {
      kravLydfil(lydmappe, aendring.taarnLyd);
      await natvagt.saetUdvidelsespakke(aendring);
    });
  });

  // --- signaltaarne ---
  admin.post('/api/admin/udvidelse/lyd/nulstil', (_req, reply) =>
    udfoer(reply, () => natvagt.nulstilLyd()),
  );

  admin.post('/api/admin/udvidelse/taarn', (req, reply) =>
    udfoer(reply, async () => {
      if (erObjekt(req.body)) kravKodefil(req.body['kode']);
      await natvagt.gemTaarn(req.body);
    }),
  );

  admin.delete('/api/admin/udvidelse/taarn/:id', (req, reply) => {
    const { id } = idSkema.parse(req.params);
    return udfoer(reply, () => natvagt.sletTaarn(id));
  });

  admin.post('/api/admin/udvidelse/taarn/:id/respawn', (req, reply) => {
    const { id } = idSkema.parse(req.params);
    return udfoer(reply, () => natvagt.respawnTaarn(id));
  });

  admin.post('/api/admin/udvidelse/taarn/:id/aktiver', (req, reply) => {
    const { id } = idSkema.parse(req.params);
    return udfoer(reply, () => natvagt.aktiverTaarn(id));
  });

  admin.post('/api/admin/udvidelse/taarn/:id/deaktiver', (req, reply) => {
    const { id } = idSkema.parse(req.params);
    return udfoer(reply, () => natvagt.deaktiverTaarn(id));
  });

  admin.post('/api/admin/udvidelse/taarn/:id/kode', (req, reply) => {
    const { id } = idSkema.parse(req.params);
    return udfoer(reply, () => natvagt.visTaarnKode(id));
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
  { natvagt, konfig, udsending, lydmappe, kodemappe }: AdminAfhaengigheder,
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

    const oversigt = () => {
      const nu = Date.parse(natvagt.skaermbillede().serverKl);
      return bygAdminoversigt(
        natvagt.scenarie(),
        natvagt.tilstand(),
        nu,
        bygOversigt(natvagt.udvidelse(), natvagt.scenarie(), nu),
      );
    };

    registrerLaeseruter(admin, { natvagt, konfig, udsending, lydmappe, kodemappe }, oversigt);

    registrerScenarieruter(admin, natvagt, udfoer, lydmappe);
    registrerStyreruter(admin, natvagt, udfoer);
    registrerUdvidelsesruter(admin, natvagt, udfoer, kodemappe, lydmappe);
  });
};
