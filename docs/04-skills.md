# 04 — Agent-skills til projektet

Research foretaget 5. september 2026. Samme fremgangsmåde som i VASE-drejebogen,
der allerede bruger `fiction-writing-story-development` fra `alt-code-ai/agent`.

**Vigtigt om tillid:** Skills er instruktionsfiler, som en agent følger. Stjernetal
er skrevet ind nedenfor, netop fordi flere af de relevante skills ligger i meget små
repos. Læs `SKILL.md` igennem, før noget installeres — og installér projektlokalt i
`.claude/skills/`, ikke globalt.

## Installeret (5. september 2026)

Ligger i `.claude/skills/` og er registreret i sessionen. Undtaget fra ESLint,
fordi de indeholder tredjeparts p5.js-eksempler.

```
algorithmic-art  canvas-design  fiction-writing-story-development
frontend-design  skill-creator  theme-factory  webapp-testing
```

## Oversigt

| Skill | Kilde | Tillid | Bruges i |
|---|---|---|---|
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills) | Officiel | **Fase 4** |
| `theme-factory` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills) | Officiel | Fase 4 |
| `canvas-design` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills) | Officiel | Fase 3-4 |
| `algorithmic-art` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills) | Officiel | Fase 3-4 |
| `webapp-testing` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills) | Officiel | **Fase 9** |
| `skill-creator` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills) | Officiel | Fase 8 |
| `fiction-writing-story-development` | [alt-code-ai/agent](https://github.com/alt-code-ai/agent/blob/main/skills/fiction-writing-story-development/SKILL.md) | ⚠ 1 stjerne, men allerede brugt til drejebogen | **Fase 8** |

### Hvorfor hver enkelt

**`frontend-design`** — den vigtigste af dem. Skillen er skrevet specifikt for at
undgå, at AI-genererede flader lander på de samme fem defaults. Den navngiver dem
direkte, bl.a. *Dark & Bold* (næsten-sort baggrund med skarp accentfarve) og
*Template Chrome* (spærret VERSALT-labels, midterprikker, monospace datalabels).

Det er præcis den fælde, en "hacker-terminal" falder i uden videre. Skillen bruges
til at træffe det valg *bevidst* — vi vil have institutionel 1988-arkæologiterminal,
ikke generisk cyberpunk. Se æstetikafsnittet i `docs/01-koncept.md`.

**`theme-factory`** — gør fosfor/rav/signalrød-paletten til et sammenhængende
token-sæt i stedet for spredte hex-koder. Passer med `tokens.css` i specen.

**`canvas-design` + `algorithmic-art`** — radar-sweep, scanlines, strip-charts og
glitch-effekter. Alt er canvas-tegning, som er præcis det, de to dækker.
`algorithmic-art` er p5.js-orienteret; vi låner teknikken, ikke biblioteket.

**`webapp-testing`** — Playwright. Bruges til E2E-testen, der spiller hele natten
igennem på 30 sekunder og kontrollerer, at alarmpanelet, kortpunktet og pejlingen er rigtige.

**`skill-creator`** — brug den til at bygge én **projektlokal skill**,
`.claude/skills/vase-fiktion/SKILL.md`, som indeholder VASE-sproget, personerne
(Liv Berg, Morten Ravn, inspektør Holm), sagsnummer 26-017, tonen og de faste regler
fra drejebogen. Så bliver de 200-300 loglinjer i fase 8 konsistente med søndagens
materiale i stedet for at drive væk fra det. **Det giver mest værdi af alt på listen.**

**`fiction-writing-story-development`** — allerede brugt til drejebogen. Genbrug den
til dramaturgien over natten: rolig → anomalier → optrapning → alarm. Bemærk at repoet
har 1 stjerne; den er reelt vurderet gennem brug, ikke gennem popularitet.

---

## Overvej: hentes ved behov

| Skill / samling | Kilde | Tillid | Note |
|---|---|---|---|
| `awesome-gamedev-agent-skills` | [gamedev-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | 834 stjerner | 67 skills. Relevante undermoduler om *game feel* og pacing — brugbart til optrapningen mod alarmen. Ignorér engine-delene. |
| `claude-game-design-suite` | [baxatron-git](https://github.com/baxatron-git/claude-game-design-suite) | ⚠ 13 stjerner | 22 skills om spildesign-livscyklus. Kan hjælpe med at strukturere oplevelsen, men er stor og uafprøvet. Læs før brug. |
| `websocket-realtime-expert` | [curiositech/port-daddy](https://github.com/curiositech/port-daddy) | ⚠ 2 stjerner | Dækker WebSocket/SSE/reconnect. Vores WS-behov er lille nok til at klare sig uden. Kun hvis reconnect-logikken driller. |

## Skal ikke bruges

- **FastAPI-skills** — vi kører Node, ikke Python.
- **Cloudflare/Workers-skills** (dine egne i `~/.claude/skills/`) — irrelevante så
  længe driften er offline-first. Bliver relevante, hvis I senere vil have en
  cloud-backup af admin-fladen.
- **React/Tailwind-skills** — specen fravælger begge dele bevidst.
- **`web-perf`** (din egen) — kan bruges i fase 7 mod hukommelseslæk, men soak-testen
  er den egentlige måling.

## Hvor man finder flere

- [anthropics/skills](https://github.com/anthropics/skills) — de officielle, autoritativ kilde
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) — største kuraterede liste
- [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills)
- [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- [skills.sh](https://skills.sh) — søgbart katalog på tværs af økosystemet

## Installation (projektlokalt)

Sådan blev de hentet — kør det igen for at opdatere:

```bash
mkdir -p .claude/skills
git clone --depth 1 https://github.com/anthropics/skills /tmp/anthropic-skills
cp -r /tmp/anthropic-skills/skills/{frontend-design,theme-factory,canvas-design,algorithmic-art,webapp-testing,skill-creator} .claude/skills/

git clone --depth 1 https://github.com/alt-code-ai/agent /tmp/altcode-agent
cp -r /tmp/altcode-agent/skills/fiction-writing-story-development .claude/skills/
```

Bemærk: `frontend-design` findes både i `anthropics/skills` og som plugin i
`anthropics/claude-code`. Den installerede er fra `anthropics/skills`.

Læg `.claude/skills/` i git, så resten af gruppeudvalget arbejder med samme opsætning.
