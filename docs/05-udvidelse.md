# Udvidelsespakken — signaltårne

Emergency Monitor Extended er den oprindelige natvagt med ét lag ovenpå.
Alt det gamle virker uændret. Indtil pakken og tårnene slås til i admin,
sender serveren **intet** om dem, og skærmen ser ud præcis som før.

## Historien

### Indledende: signal fra radar

Forbindelsen til deltagerne bryder sammen — *»Vi kan ikke komme i kontakt med
dig grundet afbrud på signallinjen.«* En talebesked bliver opfanget af radaren:
et kultmedlem og en muldvarp på arbejde diskuterer stedet for det ritual, der
skal vække Egtvedpigen til live igen — og går mod den latterlige gruppe VASE,
som vil bevare arkæologien intakt.

### Kidnapningen og Ravningbroen

Når deltagerne er kidnappet, beskriver nogle beskeder, at det er omkring
**Ravningbroen**. Når de kommer derud, starter de radiosystemet og modtager
vanvittigt mange alarmer, som leder til steder, de ikke kan bruge til noget.
Radaren bekræfter kun et sted, hvis gruppen deler sin lokation med
arbejdstelefonen.

### Muldvarpen (til fortælleren)

Muldvarpen taler i telefon, og man kan fornemme, at han godt kan skaffe de
koder, der viser stedet, selv om børnene har taget dem fra ham:

- Nogle af kodeudgaverne havde de glemt at tage med, selv om de havde fundet dem.
- Et andet sæt kan han stjæle fra kufferten.
- Et tredje har han allerede skaffet.

Det passer til koderne i `assets/koder/`.

## Sådan virker det

Signaltårne står på kortet **hele tiden**:

| Tilstand | Farve på kortet |
|---|---|
| Ikke sat korrekt (inaktiv) | **Orange** |
| Aktiveret af admin | **Grøn** |

- Der er **4 tårne** fra start (`scenarios/signaltaarne.json`), og admin kan
  tilføje flere.
- Hvert tårn **spawner** inden for et **vinkelspektrum** (pejling fra
  centrum, fx 0°–90°) og et afstandsinterval (standard 300–800 m; **højst 800 m** fra centrum). Et spektrum
  kan gå over nord (fx 330°–30°).
- Hvert tårn har en **stiplet linje** ud fra centrum, og kortet **zoomer ind**,
  så centrum og alle tårne er i billedet.
- **Forbindelse:** er *alle* tårne aktive, spilles talebeskeden (lydklippet
  valgt i admin, standard `Mulvappe kommunikation.m4a`) på skærmen med den
  samme opbygning som et almindeligt lydklip. Deaktiveres ét tårn, tier klippet.
  Hvert nyt forbindelsesforløb afspiller klippet forfra.

### Forløbet i praksis

1. Admin slår tårnene til. De dukker op som orange punkter med afstand og pejling.
2. Gruppen sender signalmandskab ud, som sætter signalpinden ved tårnet og
   deler sin lokation med det aftalte telefonnummer. Det er ikke en del af radaren.
3. Admin aktiverer tårnet (**Aktivér**, hold), når det er sat korrekt. Det
   bliver grønt.
4. Er alle grønne, er der forbindelse, og lydklippet spiller.
5. Admin kan, uafhængigt, løfte et tårns **kode** frem på skærmen i 10 sekunder.

## Fra admin

Tre grupper nederst på adminboardet:

| Gruppe | Indhold |
|---|---|
| **Udvidelsespakke** | Kontakten *Aktivér udvidelsespakken* |
| **Signaltårne** | Kontakten *Vis signaltårne på skærmen*, listen over tårne, formularen og valg af lydklip |
| **Lydklip (planlagt afspilning)** | De almindelige planlagte lydklip |

De to sidste vises kun, når pakken er slået til.

| Handling | Betydning |
|---|---|
| **Vinkel fra/til, afstand fra/til** | Spektret tårnet spawner inden for. *Ret spektrum* flytter kun tårnet, hvis det ligger uden for det nye |
| **Tilføj signaltårn** | Opretter et tårn og spawner det med det samme |
| **Respawn (hold)** | Trækker tårnet forfra inden for spektret. Tårnet er ikke aktivt bagefter |
| **Aktivér (hold)** | Tårnet er sat korrekt: orange bliver grøn |
| **Deaktivér** | Tilbage til orange; afbryder forbindelsen |
| **Vis kode (hold)** | Tårnets kodebillede vises på skærmen i 10 sekunder |
| **Lydklip når alle tårne er aktive** | Hvilken fil i `assets/lyd/` der spiller |

### Skjult til du slår dem til

Slås *Vis signaltårne på skærmen* fra, sender serveren intet om tårne,
forbindelsesstatus eller lyd — så man kan heller ikke se, at der ikke er
forbindelse. Tårnene kan forberedes i admin imens. Er alle tårne aktive, mens
de er skjult, spiller klippet først, når de slås til.

## Kodebillederne

Læg PNG-filer (også jpg/webp) i `assets/koder/`. Filnavnet vælges pr. tårn i admin.

```bash
npm run lav-koder        # 5 pladsholdere: kode-1.png ... kode-5.png
npm run lav-koder -- 8   # 8 stk.
```

Pladsholderne er **ikke** de rigtige koder — erstat dem med egne filer med samme
navn. Mappen kan flyttes med `NATVAGT_KODEMAPPE`.

Kodebilledet står aldrig i det, serveren sender ud på skærmen. Skærmen henter
det fra `/api/udvidelse/kode/:id`, som kun udleverer billedet, mens koden skal
være synlig (10 s + 5 s til langsomt net). Før og efter er svaret 404.

## Flyt centrum

```bash
node scripts/flyt-base.mjs 55.674928 9.347811 RAVNINGBROEN
npm run hent-kort
```

Flytter basen i `nat.json` og `generalprove.json`, genskaber de fire tårne
omkring det nye centrum og henter et kort, der dækker området.

## Tekniske noter

| Ting | Hvor |
|---|---|
| Logik og tilstand (rene funktioner) | `server/src/udvidelse/udvidelse.ts` |
| Lager (`state/udvidelse.json`, atomisk) og plan | `server/src/udvidelse/lager.ts`, `scenarios/signaltaarne.json` |
| Admin-ruter `/api/admin/udvidelse/*`, `/api/admin/koder` | `server/src/api/admin.ts` |
| Kodebillede til skærmen | `server/src/api/offentlig.ts` |
| Tårne på kortet, linjer og zoom | `display/src/kort/overlays.ts`, `display/src/kort/kort.ts` |
| Forbindelsespanel og kode | `display/src/paneler/signal.ts` |
| Admin | `admin/src/signalpanel.ts`, `admin/src/taarnpanel.ts` |
| Tests | `server/test/taarn.test.ts` |

Tilstand afledes af tidsstempler og serverens ur. Der er ingen timere, der kan
gå i stå: en genstart midt i et vindue giver det samme svar som uden genstart.
*Nulstil natten* bringer tårnene tilbage til planen.

Telefonnummeret kan ændres via `POST /api/admin/udvidelse/pakke`
`{"telefon":"..."}` eller i `scenarios/signaltaarne.json`.
