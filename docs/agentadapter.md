# Agentadapter i MTS-lab

Agenten kjører i nettleseren, i samme `Session` som en deltaker (`src/session.ts`). `AgentDriver` (`src/agents/driver.ts`) klikker utvalg, sender `trial_request` og legger svaret inn med `clickComparison`. Menneskeøkten er uendret: agentmodus er av til den velges, og bare når lagringsmappen er Boter-AI.

Jon (27.10.2026, endret 29.10): testforsøk teller i agentens minnehistorikk, mastery er 17/18 i én blokk, stimuli i agentøkter er faste krusseduller (ikke navngitte tegn), og agenten skal kjøre uten installasjon. MTS-lab er ikke koblet til noe undervisningsverktøy.

## Hva som følger med

| Agent | Id | Merknad |
|---|---|---|
| Tilfeldig | `tilfeldig` | Jevnt trekk. Stoppes av `maxBlocks` / `maxTrials` med `ikke_mestret`. |
| Perfekt lærer | `perfekt` | Lærer av tilbakemelding og lukker klassene med union-find. |
| Perfekt uten avledning | `perfekt-ikke-deriverer` | Lærer bare direkte par. Avledede forsøk er tilfeldige. |
| SEIAIA-PS | `seiaia_ps` | `src/agents/seiaia/agent.js`, med `test_in_history: true`. |

Tempo `rask` kaller `completeWait()` uten ventetid (`par_klokke` = virtuell). `sanntid` venter ITI og tilbakemelding. Standard er rask.

Symbolsettet `abstrakte` er valgbart på oppsettet og er standard bare i agentøkter. Menneskeøkter starter fortsatt på de innebygde figurene. Settet er tolv faste SVG-kurver, generert med seed `20261030` (`npm run stimuli:squiggles`) og sjekket inn. Generatoren forkaster kurver som i en av fire rotasjoner ligger nær en gjengitt glyf A–Z, a–z eller 0–9. Det dekker A–C og klasse 1–4. SEIAIA-PS krever 3×3. `glyph` i protokollen er tom for dette settet, så agenten ikke får et tegnnavn. `symbol_id` er `k01`–`k12`.

## Protokoll `mts-agent/1`

Meldingene ligger i `src/agents/protocol.ts`. Agentens `decide` får bare det deltakeren ser: utvalg, sammenligninger i leserekkefølge (øv → øh → nv → nh, tomt hjørne hoppes over), forrige utfall og eventuelt `correction` hvis det er slått på. `observer` (fase, relasjon, riktig posisjon) bygges for visningen og eksporten, og strippes med `agentVisibleRequest` før `decide`.

`previous.correct` er `true` eller `false` bare når tilbakemelding ble gitt. Ellers er den `null`.

`session_end.reason` er `finished`, `not_mastered`, `aborted` eller `agent_error`. Laboratoriets avslutningsårsak er norsk: `ferdig`, `ikke_mestret`, `avbrutt`, `agent_feil`. `stopped_by` i sammendraget bruker den norske teksten, og er `null` når økten ble ferdig.

Ugyldig `position` eller uenighet mellom `position` og `corner` spørres på nytt inntil tre ganger. Deretter logges forsøket som `agent_ugyldig` = 1 og `riktig` = 0. Tre slike forsøk på rad gir `agent_feil`.

`history_in_request` er `none` i denne versjonen. Adapteret sender bare forrige utfall. Agenten holder selv historikken.

## Egen agent

Implementer `AgentPlugin` i `src/agents/protocol.ts`. Registrer fabrikken i `src/agents/custom.ts` og valget i `src/agents/launch.ts` (`registerAgentChoice`). `decide` skal tåle å bli kalt på nytt for samme `trial_nr` hvis svaret var ugyldig. Ikke les `observer`.

`noteStage({ training })` er et tillegg for modeller som må vite om forsøket er trening eller slutt-test. Det sendes ikke i JSON-en til en senere språkmodell. SEIAIA-PS bruker det: `training: false` i test, og `feedback(null)` når nedtrappingen ikke ga tilbakemelding.

## Eksport

`buildExport` er uendret for menneskeøkter, bortsett fra kolonnen `par_stimulussett` (standard `innebygd`). Agentkall får i tillegg `agent_valg_posisjon`, `agent_latens_ms`, `agent_ugyldig`, `agent_forsok_nr`, `par_agent_*`, `par_seed`, `par_klokke`, `par_avslutning`, `par_mappe` = `Boter-AI`, og et ark `Agent`. Nedlasting på maskinen: xlsx, csv, hendelser, `_agent.json` og `_agentspor.jsonl`.

Er eksperimentatoren innlogget, registreres en kode og resultatet lastes opp med `middle: Boter-AI` gjennom den eksisterende `submit`. `apps-script/Code.gs` er ikke endret.

## Det som ikke er bygget

Mofrad EPS/E-EPS og en LLM-bot er ikke med. De trenger Python eller en API-nøkkel, og Jon skal ikke installere Python for denne versjonen. Samme JSON kan senere sendes til en lokal prosess:

1. Bind serveren til `127.0.0.1`.
2. Krev et engangstoken og sjekk `Origin`.
3. `POST /session` med `session_start`, `POST /decide` med objektet fra `agentVisibleRequest` (uten `observer`), `POST /end` med `session_end`, `POST /reset` med `reset`.
4. Svar med `trial_response` (`position` 1–n, valgfri `corner` som må stemme).
5. Server gjerne MTS-lab fra samme opprinnelse (`dist/` eller `dist-offline/index.html`), slik at nettleseren ikke må kalle `http://127.0.0.1` fra GitHub Pages.

Mofrad-wrapperen bør ligge utenfor originalkoden og kalle `trial_preprocess`, `action_selection` og oppdateringen forsøk for forsøk. Læring skal bruke `previous.correct` og `previous.feedback_given`, ikke fasit. Nedtrappingen i MTS-lab (100/75/50/0, med forsøk uten tilbakemelding) er ikke den samme som Mofrads løp. Det må avklares før en wrapper skrives. Se kravdokumentets kapittel 7.

LLM-wrapperen kan senere få bildet av krussedullen, ikke et tegnnavn. `glyph` er tom. Historikk er `none` / siste N / full i wrapperen, og nøkkelen ligger bare på serversiden. Ingen nøkkel i frontend, `dist/` eller git. `notice` er `null` her. MTS-lab har ingen fasetekster av typen «PHASE CHANGE».

## Forslag til Apps Script, ikke gjort

`Code.gs` er ikke endret. Dette er det som ville trenges senere, og det krever ny versjon og Jons godkjenning før eventuell OAuth:

- Ta imot `agentJson` og `agentSpor` (tekst) og lagre `<deltakernr>_agent.json` og `<deltakernr>_agentspor.jsonl` ved siden av regnearket. I dag ligger sporet i xlsx-fanen `Agent` og i nedlastingen. `submit_` leser `rows`, `events`, `parameters`, `csv`, `eventsCsv` og `xlsxBase64`. Ekstra kolonner i `rows` skrives, fordi `writeObjects_` bruker nøklene i første rad.
- Sjekkpunkt: `uploadResults(..., final: false)` finnes på klientsiden og setter ikke `completed` (`if (body.final) setCompleted_`). Kall det ved blokkslutt for lange økter. `handle_` tar `LockService.waitLock(20000)` for alle handlinger, så frekvensen må holdes lav.
- Koder: `OPEN_TTL_MS_` og `CODE_TTL_MS` er 6 timer fra første åpning (`redeem` / `stampOpen_`). En agentopplasting som bare bruker `register` + `submit` uten `redeem` starter ikke det vinduet (`isOpenExpired_` er usann når `openedAt` er tom). Hvis koden senere åpnes som deltaker, gjelder 6 timer. En egen, lengre grense for Boter-AI er aktuell hvis LLM-økter skal gå over flere dager og koden skal åpnes.
- Kvoter og kjøretid i Apps Script er ikke kontrollert mot Googles gjeldende tabell.

## Kontrollert mot kravdokumentets [USIKKERT]

| Punkt | Status |
|---|---|
| Hjørner i stedet for posisjon 1–3 | Bekreftet i `positions.ts`. Adapteret mapper leserekkefølge. |
| Ingen grense på blokkgjentakelse | Bekreftet: `decideBlockEnd` returnerer `repeat-block`. Adapteret stopper med `ikke_mestret`. |
| Kode utløper etter 6 timer | Bekreftet i `Code.gs` og `codes.ts`. Ikke endret. |
| Opplasting bare ved slutt | Bekreftet i `participant.ts` (`final: true`). Sjekkpunkt er ikke bygget. |
| `submit_` tar ikke egne agentfiler | Bekreftet. Spor ligger i xlsx og nedlasting. |
| `LockService.waitLock(20000)` på alle handlinger | Bekreftet i `handle_`. |
| Korreksjon i MTS-lab | Bekreftet i `decideNext`. Om SEIAIA-P-runneren har korreksjon, er fortsatt ukjent. Runneren ligger ikke i dette repoet. |
| Symbolene ◆▲● fantes ikke, og er tatt ut igjen | Krussedullene er generert og sjekket inn. Kontaktark i `docs/`. |
| Mastery 17/18 i én blokk | Bekreftet i `criteria.ts` og `decideBlockEnd`. Ikke 16/18 over to blokker. |
| `analyze_mts.py` tåler nye kolonner | Bekreftet. Skriptet leser navngitte kolonner. Enhetstesten kjører det på en agent-CSV. |
| Lokal nettverkstillatelse i Chrome, Pyodide, Apps Script-kvoter | Ikke testet. HTTP-agent og Pyodide er ikke bygget. |
| Paritet JS mot Python (240 økter) | Kjørte i porten 27.10.2026 ifølge den medfølgende README. Python-pakken er ikke i dette repoet, så den er ikke kjørt på nytt. Enhetstesten låser JS-fingeravtrykket for seed 1. |
