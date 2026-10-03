#!/usr/bin/env node
/**
 * Laver et admin-token til NATVAGT_ADMIN_TOKEN.
 *
 * Tokenet skrives kun ud - det gemmes aldrig i repoet. Laeg det i .env paa den
 * maskine, der skal koere natten, og ingen andre steder.
 */
import { randomBytes } from 'node:crypto';

const token = randomBytes(24).toString('base64url');

process.stdout.write(`
Admin-token:

  ${token}

Laeg det i .env paa driftsmaskinen:

  NATVAGT_MILJOE=drift
  NATVAGT_ADMIN_TOKEN=${token}

`);
