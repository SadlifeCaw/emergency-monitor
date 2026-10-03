# 02 — Teknisk specifikation

## Designpræmis: natten må ikke fejle

Aktiviteten kan ikke køres om. Alt vælges efter, hvad der stadig virker kl. 03,
når wifi-forbindelsen er væk, skærmen har kørt i seks timer, og ingen kan fejlsøge.
Det betyder: **få dele, ingen netværksafhængighed, tilstand på disk, autonom genstart.**

## Arkitektur

```
        ADMIN (telefon)                    SKÆRM (projektor/TV)
              │                                    │
              │ HTTP over LAN                      │ kiosk-Chrome
              │ Bearer-token                       │ WebSocket
              ▼                                    ▼
        ┌───────────────────────────────────────────────────┐
        │   node-server (Fastify)  ·  lokal PC i lejren      │
        │                                                    │
        │   ┌───────────────┐   ┌──────────────────────┐     │
        │   │ scenarie-motor│──▶│ WebSocket-broadcast  │     │
        │   │ (tick 1 Hz)   │   └──────────────────────┘     │
        │   └───────┬───────┘                                │
        │           ▼                                        │
        │   state/runtime.json    scenarios/nat.json         │
        │   (skrives atomisk)     (redigeres af admin)       │
        │                                                    │
        │   static/  ← bygget frontend + vejle.pmtiles       │
        └───────────────────────────────────────────────────┘
```

Én proces. Ingen database. Ingen container. Ingen internetafhængighed i drift.

## Stak

| Lag | Valg | Begrundelse |
|---|---|---|
| Runtime | Node 24 (allerede installeret) | Én runtime til server og build |
| Server | Fastify + `ws` | Lille, hurtig, veldokumenteret. WebSocket til push. |
| Frontend | Vite + TypeScript, **uden framework** | KISS. Skærmen er 6 paneler og én tilstandsstrøm. Ingen framework-overraskelser kl. 03. |
| Kort | Leaflet + `protomaps-leaflet` + PMTiles | Ét `.pmtiles`-fil = hele kortet offline. Ingen tile-server. |
| Grafer | Canvas 2D, håndrullet | Tre strip-charts. Et diagrambibliotek er overkill og tungere at holde flydende. |
| Persistens | JSON-fil, atomisk skriv (`tmp` + `rename`) | Læsbar, kan i nødsfald rettes i Notepad |
| Test | Vitest + Playwright | Vitest til motoren, Playwright til skærmen |

**Ingen** React, ingen Tailwind-build-kæde, ingen CDN-referencer. Alt bundles lokalt.

## Mappestruktur

```
Emergency Monitor/
├── docs/
├── .claude/skills/               # hentede agent-skills, se docs/04-skills.md
├── server/
│   ├── src/
│   │   ├── index.ts              # opstart: Fastify, ruter, statiske filer
│   │   ├── konfig.ts             # miljoevariabler, token-validering
│   │   ├── motor/                # ren logik, ingen I/O
│   │   │   ├── typer.ts          # delte typer
│   │   │   ├── ur.ts             # injicerbart ur (muliggoer tidskomprimering)
│   │   │   ├── geo.ts            # afstand, pejling, DDM-format
│   │   │   ├── stoej.ts          # deterministisk hash-stoej
│   │   │   ├── scenarie.ts       # indlaes/valider scenariefil (zod)
│   │   │   ├── motor.ts          # ren tilstandsovergang: (tilstand, nu) -> tilstand'
│   │   │   ├── telemetri.ts      # sensoraflaesninger og logstroem
│   │   │   └── logpuljer.ts      # tekstpuljer (fase 8 udfylder disse)
│   │   ├── lager/
│   │   │   └── tilstandslager.ts # atomisk JSON-laes/skriv + sikkerhedskopi
│   │   ├── drift/
│   │   │   ├── natvagt.ts        # tick-loop: motor -> lager -> udsending
│   │   │   └── skaermbillede.ts  # visningsmodel til skaermen
│   │   ├── api/offentlig.ts      # /health, /api/state, /ws
│   │   └── ws/udsending.ts       # WebSocket-broadcast
│   └── test/                     # vitest, inkl. hele natten som integrationstest
├── display/
│   ├── index.html
│   └── src/
│       ├── main.ts               # WS-forbindelse, genforbindelse, lokal tid
│       ├── kontrakt.ts           # type-only genbrug af serverens Skaermbillede
│       ├── kort/                 # geometri, flavor, overlays, sweep, kort
│       └── panels/               # fase 4: header, log, charts, decrypt, alarm
├── admin/                        # fase 6
├── scenarios/
│   ├── nat.json                  # den rigtige nat
│   └── generalprove.json         # samme forloeb, koeres tidskomprimeret
├── state/runtime.json            # genereres i drift, ikke i git
├── assets/maps/vork.pmtiles      # offline-kortet, 2,2 MB, ligger i git
├── tools/pmtiles.exe             # hentet af hent-kort.mjs, ikke i git
└── scripts/
    ├── lav-token.mjs             # genererer admin-token
    ├── hent-kort.mjs             # fase 3
    ├── start-natvagt.ps1         # fase 7
    └── selvtest.mjs              # fase 7
```

## Datamodel

### Scenariefil (`scenarios/nat.json`)

```jsonc
{
  "version": 1,
  "navn": "Natvagt E26",
  "base": {
    "lat": 55.65831, "lon": 9.359385,
    "label": "STATION VORK",
    "verificeret": false          // saettes true naar koordinatet er tjekket i marken
  },
  "kort": {
    "startZoom": 15,
    "maxRadiusM": 800,            // haard graense: intet punkt maa ligge udenfor
    "sektorer": 8
  },
  "vagt": { "start": "2026-07-15T23:30:00+02:00", "slut": "2026-07-16T05:00:00+02:00" },
  "haendelser": [
    {
      "id": "anomali-1",
      "type": "ANOMALI",
      "at": "2026-07-16T01:12:00+02:00",
      "spredningMin": 20,        // faktisk tid trakkes i +/- 20 min omkring at
      "sektor": 3,
      "titel": "SVAGT SEISMISK UDSLAG",
      "tekst": "AFVENTER BEKRAEFTELSE",
      "autoOploesSek": 90,
      "lyd": "blip"
    },
    {
      "id": "dekryptering-2",
      "type": "DEKRYPTERING",
      "at": "2026-07-16T01:40:00+02:00",
      "procent": 68,
      "fragment": "...og den sovende skal vaekkes ved det sjette ..."
    },
    {
      "id": "alarm-hoved",
      "type": "ALARM",
      "at": "2026-07-16T02:14:00+02:00",
      "lat": 55.6601, "lon": 9.3648,
      "usikkerhedM": 40,
      "sektor": 7,
      "titel": "BEKRAEFTET AKTIVITET",
      "naermestePunkt": "P15 TREKANTSDEPOT",
      "instruks": "UDRYK STRAKS - MELD VED ANKOMST",
      "optrapningSek": 300,       // graferne begynder at reagere 5 min foer
      "lyd": "sirene"
    }
  ]
}
```

Hændelsestyper: `ANOMALI` · `DEKRYPTERING` · `MELDING` · `ALARM` · `AFSLUT`.

### Stemning: det der sker af sig selv

Anomalier og dekryptering står **ikke** i scenariefilen. De udledes af uret som
en ren funktion af (seed, tidspunkt) — se `motor/stemning.ts`.

Det giver tre ting, en liste af hændelser ikke kunne:

- **Der er intet, der vokser.** Systemet kan køre i syv døgn uden at samle
  tilstand op.
- **En genstart kl. 03** giver samme nat som den, der aldrig gik ned.
- **Der er ingen liste at vedligeholde.** Instruktørerne forholder sig kun til
  alarmen.

Natten deles i vinduer på 15 minutter. Hvert vindue trækker én gang: sker der
noget, hvornår inde i vinduet, hvor længe, i hvilken sektor og med hvilken tekst.
Alt uden for `nat`-vinduet er stille, og **under en alarm er der aldrig
anomalier** — sirenen har ordet.

### Udgået: spredning af planlagte hændelser

Tidligere kunne planlagte hændelser have `spredningMin` og få trukket et
tidspunkt. Det er fjernet: stemningsgeneratoren løser samme problem bedre, og
scenariet indeholder ikke længere andet end alarmer.

To ting må spredningen ikke ødelægge, og gør det ikke:

- **Alarmen.** Den kan ikke have spredning; det afvises i valideringen med en
  besked, der siger hvorfor. Tidspunkt og punkt er instruktørernes beslutning,
  og stille tilfældighed på netop den ville være en grim overraskelse.
- **Rækkefølgen.** Dekrypteringens fragmenter afslører kultens navn bid for bid;
  bytter to af dem plads, falder historien fra hinanden. Derfor trækkes tiderne,
  **sorteres, og gives tilbage i den oprindelige rækkefølge** — tiderne flytter
  sig, historien gør ikke.

Valideringen kræver at *hele* spredningsvinduet ligger inde i vagten, ikke kun
det tidspunkt der tilfældigvis blev trukket. Ellers ville gyldigheden afhænge af
held.

Uden `NATVAGT_TIDSSEED` trækkes et nyt seed hver gang. Det er med vilje: så
kender heller ikke instruktørerne de præcise tidspunkter. Sæt det, når en nat
skal kunne gentages nøjagtigt.

### Kørselstilstand (`state/runtime.json`)

```jsonc
{
  "scenarioId": "nat",
  "startetKl": "...",
  "fase": "ROLIG | OPTRAPNING | ALARM | AFSLUTTET",
  "fyrede": { "anomali-1": { "fyretKl": "...", "oploestKl": "..." } },
  "tvungne": { "alarm-hoved": "..." },   // fyret manuelt fra telefonen, til admin-visningen
  "aktivAlarm": { "haendelseId": "alarm-hoved", "fyretKl": "...", "kvitteretKl": null },
  "ravage": { "sloeretKort": false, "skjulKoordinat": false, "glitch": false },
  "vagthold": "B"
}
```

Skrives atomisk ved hver ændring. **Ved genstart genoptages natten præcis** —
allerede fyrede hændelser fyrer ikke igen, og en aktiv alarm forbliver aktiv.
Det er ikke en pæn detalje, men forskellen på en fejl og en katastrofe.

## Motoren

`motor/motor.ts` er en **ren funktion**: `(tilstand, scenarie, nu) → ny tilstand + udgående begivenheder`.
Ingen I/O, intet `Date.now()` indeni — uret injiceres. Derfor kan hele natten
testes deterministisk på millisekunder, og generalprøven kan køre 60 gange hurtigere
uden en eneste særregel i koden.

Immutabelt: motoren returnerer altid en ny tilstand og muterer aldrig sit input.

Tick: 1 Hz. Ved hvert tick sammenlignes vægur mod planlagte hændelser, auto-opløsning
af anomalier afgøres, og fasen genberegnes.

### Telemetri

Log- og sensorstrømmen genereres **deterministisk ud fra et seed**, ikke fra
`Math.random()`. Så ser generalprøven og den rigtige nat ens ud, og en fejl kan
reproduceres.

Værdierne kommer fra en *hash* af (seed, kanal, sekund) — ikke fra en
tilstandsbærende generator. Forskellen betyder noget i praksis: en skærm, der
genforbinder kl. 03, kan regne de samme værdier ud for de samme tidspunkter uden
at kende det, den gik glip af. Sensorværdier lægges sammen af:

`baseline-støj + døgnrytme (temp falder mod kl. 04) + hændelsespåvirkning`

Hændelsespåvirkning har en *rampe*, så optrapningen mod alarmen er synlig,
før alarmen falder.

## API

Alt under `/api/admin` kræver `Authorization: Bearer <token>`.
Token læses fra miljøvariablen `NATVAGT_ADMIN_TOKEN` ved opstart — serveren
**nægter at starte**, hvis den mangler eller er kortere end 16 tegn.
Ingen hemmeligheder i kildekoden.

| Metode | Sti | Formål |
|---|---|---|
| `GET` | `/api/state` | Offentlig. Nuværende tilstand til skærmen (WS-fallback). |
| `GET` | `/kort/vork.pmtiles` | Offentlig. Offline-kortet, med `Range`-understøttelse. |
| `WS` | `/ws` | Push af tilstand ved hver ændring + hjerteslag hvert 10. sek. |
| `POST` | `/api/admin/haendelse` | Opret hændelse (tidspunkt + koordinat) |
| `PATCH` | `/api/admin/haendelse/:id` | Ret tidspunkt, koordinat eller tekst |
| `DELETE` | `/api/admin/haendelse/:id` | Aflys planlagt hændelse |
| `POST` | `/api/admin/fyr/:id` | **Fyr nu** — ignorér planlagt tidspunkt |
| `POST` | `/api/admin/kvitter` | Marker alarm som modtaget |
| `POST` | `/api/admin/stop` | **PANIK-STOP** — ryd alle alarmer, tilbage til rolig |
| `POST` | `/api/admin/ravage` | Slå forstyrrelser til og fra (delvis krop tilladt) |
| `POST` | `/api/admin/nulstil` | Nulstil natten (kræver `?bekraeft=ja`) |
| `GET` | `/api/admin/helbred` | Skærmens forbindelsestid, urafvigelse, diskplads |

Validering med `zod` på alle indgående felter. Koordinater afvises, hvis de ligger
uden for `maxRadiusM` fra basen — et taste-slip kl. 02 må ikke kunne sende fire
teenagere mod Vejle Fjord.

Rate limit: 90 forespørgsler i minuttet pr. IP på admin-ruter. Grænsen er sat efter
den faktiske brug: telefonen henter overblikket hvert 4. sekund, så 30 var for lavt
og lukkede fladen ned midt i en nat.

## Admin-flade

Én side, bygget til **telefon i mørke med én hånd**. Den er en fjernbetjening,
ikke et dashboard: den bruges i fem til tyve sekunder ad gangen — og imens står
instruktøren blandt deltagere, der ikke må se hvad der sker.

Det sidste er den begrænsning, der styrer mest. Alarmtilstand markeres med **form
og placering, aldrig med en stor lys flade**: en smal farvet stribe i statusbjælken,
ikke en rød skærm der lyser instruktøren op i mørket.

Fire faste zoner, oppefra og ned:

| Zone | Indhold |
|---|---|
| Statusbjælke | Tilstand, nedtælling, serverens ur. Fast øverst. |
| Beskedbjælke | Kvittering eller fejl. Skjult når der ikke er noget at sige. |
| Rullefelt | Alarmpanelet, forstyrrelserne, listen over alarmer. |
| Greb | Den store handling. Fast nederst. |

**Grebet ligger fast i bunden.** Toppen af en høj telefon er det sværeste sted at
nå med tommelfingeren, og indholdet skifter med tilstanden — `Fyr alarm`, eller
`Kvittér` + `Stop alarm` — men pladsen gør ikke. Det, der ikke kan fortrydes,
kræver 2 sekunders langt tryk; resten gør ikke.

Rækkerne i gitteret tildeles **udtrykkeligt** (`grid-row: 1..4`). Beskedbjælken er
`hidden` det meste af tiden, og `display: none` fjerner et element helt fra
gitteret — med positionelle rækker rykkede alt derfor én op, rullefeltet voksede
frit, og grebet blev presset ned under skærmkanten.

Alarmpanelet opretter eller retter nattens alarm uden genstart, og viser afstand,
pejling, sektor og DDM live under koordinatfelterne, mens der tastes. Tiden regnes
mod **serverens** ur, ikke telefonens — ellers lander en alarm i fortiden og fyrer
med det samme.

### Forstyrrelser (ravage)

Tre kontakter, der sætter monitoren ud af drift. Kulten forstyrrer udstyret; det er
et virkemiddel, ikke en fejl.

| Kontakt | Virkning på skærmen |
|---|---|
| `sloeretKort` | Kortfliserne sløres, så terræn og veje ikke kan aflæses. Ringe, sektorlinjer, basemarkør og alarmpunkt bliver skarpe. |
| `skjulKoordinat` | Koordinatet flakker ud og erstattes af blokke. Afstand og pejling bliver stående. |
| `glitch` | Skærmen sætter ud med 7-26 sekunders mellemrum og kommer tilbage. Første udfald kommer efter 1-3 sek., så kontakten kvitterer for trykket. |

Kontakterne er tegnet som fysiske kontakter, ikke afkrydsningsfelter: knappen
bevæger sig, så man kan se hvad man gjorde uden at læse. De kræver ikke langt tryk
— en forstyrrelse kan altid slås fra igen.

Sløringen rammer kun `.leaflet-tile-pane`, så overlejringerne ikke går med.
Koordinatet withholdes **på serveren** (`ddmLat`/`ddmLon` bliver `null`), ikke bare
i CSS — ellers står det i klartekst i DOM'et. Alle tre respekterer
`prefers-reduced-motion`.

Adgang: `http://<pc-ip>:8477/admin/?token=…` — eller en QR-kode printet på forhånd.
LAN-only, aldrig eksponeret mod internettet.

## Offline-kort

`npm run hent-kort` gør det hele:

1. Henter `go-pmtiles`-binæren til `tools/` (ikke i git).
2. Finder det seneste daglige planet-build hos Protomaps (~138 GB).
3. Trækker en bbox omkring basen ud via **HTTP range-requests** — kun de nødvendige
   bytes hentes. Bbox udledes af `scenarios/nat.json`, så kortet følger basen.
4. Resultat: `assets/maps/vork.pmtiles`, zoom z0-z15.

**Størrelsen blev 2,2 MB**, ikke de 100-400 MB der oprindeligt stod her. Derfor
ligger kortet med i git: en klon kan køre uden hentetrin. Serveren udstiller filen
på `/kort/` med `Range`-understøttelse, og `protomaps-leaflet` henter kun de bytes,
den skal bruge. Farverne styles lokalt til fosfor-paletten — ikke en standard OSM-style.

**Fallback hvis kortdata mangler:** oprindeligt planlagt som et raster-udsnit lagt
på med `L.imageOverlay`. Det blev i stedet et **nødgitter**: ringe, sektorer,
basemarkør og alarmpunkt bliver stående, og skærmen siger tydeligt fra.

Begrundelsen er, at et vagthold navigerer på pejling og afstand, ikke på vejnavne,
og de tal står på skærmen uanset hvad kortet viser. Nødgitteret har ingen bevægelige
dele, der kan svigte. Prisen er, at terrænet ikke kan genkendes; viser generalprøven
i fase 9 et behov, kan et raster-udsnit lægges ind som ekstra lag.

## Robusthed — krav der skal verificeres

| Krav | Hvordan det opnås |
|---|---|
| Skærmen genopretter WS-forbindelsen | Eksponentiel backoff, maks 5 sek. Rød "FORBINDELSE TABT"-bjælke imens. |
| Skærmen overlever server-genstart | Klienten henter fuld tilstand igen ved reconnect |
| Serveren overlever genstart | Tilstand på disk, natten genoptages |
| Skærmen slukker ikke | `powercfg` sætter display-timeout til 0 + Screen Wake Lock API |
| Ingen pauseskærm eller opdateringsgenstart | Windows-opdateringer sættes på pause inden kurset |
| Browseren blokerer ikke alarmlyden | **Kritisk:** autoplay kræver ét brugerklik. Opstartsskærmen har en `ARMÉR SYSTEM`-knap, som trykkes ved opsætning, hvorefter lyden testes med det samme. |
| Ingen hukommelseslæk over 6 timer | Log og grafdata er ringbuffere med fast længde. Verificeres i soak-test. |
| Ur-afvigelse | Serveren er sandhed. Klienten beregner offset ved hvert hjerteslag. |

## Test

Følger husreglen om 80 % dækning.

- **Unit (Vitest):** motorens tilstandsovergange, auto-opløsning, faseberegning,
  geo-afstand og pejling mod kendte værdier, seed-determinisme, radius-validering.
- **Integration:** API-ruter inkl. afvisning uden token og uden for radius; atomisk
  persistens; genoptagelse efter genstart.
- **E2E (Playwright):** hele natten kørt på 30 sekunder med tidskomprimering —
  bekræft at alarmpanelet vises, punktet tegnes, og pejlingen er korrekt.
- **Soak:** 8 timer på den faktiske maskine. Måler hukommelse og billedrate.
- **Generalprøve i marken:** hele opsætningen på Vork, i mørke, med rigtige folk.

## Sikkerhed

Følger husreglerne i `security.md`:

- Ingen hemmeligheder i kildekoden. Token fra miljøvariabel, valideres ved opstart.
- Al indgående admin-data valideres med skema.
- Rate limiting på admin-ruter.
- Ingen brugerdata gemmes. Ingen deltagernavne i systemet.
- Serveren binder kun til LAN-interfacet.
- Fejlbeskeder på skærmen røber hverken stier eller stacktraces.
