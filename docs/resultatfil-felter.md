# Felt i resultatfilen

MTS-lab skriver fire faner: **Data**, **Parametere**, **Hendelser** og **Oppsummering**. Tall lagres som tall. Enheter står i feltnavnet (`_ms`). Eksisterende norske feltnavn er beholdt. Nye felt er lagt til.

Filnavnet bærer betingelsen:

| Prosedyre | Filnavn |
| --- | --- |
| Forsinket, 0 sekunder | `DMTS_0_<deltakernummer>.xlsx` |
| Forsinket, N sekunder | `DMTS_<N>_<deltakernummer>.xlsx` |
| Simultan | `SMTS_0_<deltakernummer>.xlsx` |

`0` i `SMTS_0` er den effektive forsinkelsen. Simultan matching bruker ikke `par_forsinkelse_s`, selv om feltet fortsatt står i oppsettet. CSV-filen og hendelsesfilen bruker samme stamme.

Eksemplet `docs/eksempel-resultatfil.xlsx` er en syntetisk økt (deltaker 90001, studie `eksempel`). Den inneholder ingen data fra gamle resultatfiler.

## Profilen «Gamle engelske kolonnenavn»

På oppsettssiden, feltet **Eksportprofil**. Standard er norske navn. Profilen `gamle_navn` bytter bare forsøkskolonnene i Data og CSV. `par_`-kolonnene, relasjonstypene og faseverdiene (`trening`, `test`, `forhåndstest`) er de samme. Verdiene blir ikke `Scripting` eller `Mixed`.

## Forsøkskolonner

Gammelt navn er kolonnen i Results-fanen fra 2019. Tomme gamle kolonner som programmet ikke støtter, er ikke tatt med.

| Gammelt felt | MTS-lab (standard) | Profil `gamle_navn` | Innhold |
| --- | --- | --- | --- |
| Cycle | — | — | Var tom. Ikke med. |
| Block | `blokk` | `Block` | Blokknummer. Gjentakelse etter mistet kriterium får nytt nummer. `blokk_gjentakelse` / `Block_repetition` sier hvilken gjennomgang det var. |
| Trial | `forsøk_nr` | `Trial` | Løpenummer i økten. `blokkforsøk_nr` / `Trial_in_block` er nummeret inne i blokken. |
| Training/Test | `fase` | `Training/Test` | `forhåndstest`, `trening` eller `test`. |
| Correct/Incorrect | `riktig` | `Correct/Incorrect` | 1 eller 0, som tall. |
| Sample | `utvalg` | `Sample` | Stimuluskode, for eksempel `A1`. |
| Comparison | `riktig_stimulus` | `Comparison` | S+, ikke listen over alle sammenligninger. |
| Selected | `valgt_stimulus` | `Selected` | Valgt sammenligning. |
| Relational type | `relasjonstype` | `Relational type` | `baseline`, `symmetri`, `transitivitet`, `ekvivalens` eller `refleksivitet`. |
| — | `relasjon` | `Relation` | For eksempel `A1-B1`. |
| Node | — | — | Var tom. Ikke med. |
| RT sample | `rt_utvalg_ms` | `RT_sample_ms` | Millisekunder til observasjonsresponsen er fullført. 0 når utvalg og sammenligninger vises samtidig. |
| RT comparison | `rt_sammenligning_ms` | `RT_comparison_ms` | Millisekunder fra sammenligningene vises til klikk. |
| Delay comparison | `forsinkelse_ms` | `Delay_comparison_ms` | Programmert forsinkelse i millisekunder. 0 ved simultan, også når oppsettet har et sekundtall stående. Alltid et tall, ikke tom celle. |
| ITI | `iti_ms` | `ITI_ms` | Intervall etter forsøket, millisekunder. |
| Programmed consequence | `tilbakemeldingsord` | `Programmed consequence` | Ordet som ble vist. Tomt når ingen tilbakemelding ble gitt. `tilbakemelding_gitt` / `Feedback_given` er 1 eller 0. |
| Consequence probability | `nedtrapping_prosent` | `Consequence probability` | 100, 75, 50, 0, eller det oppsettet sier. 0 i test. |
| Repeat | `korreksjonsforsøk` | `Repeat` | 1 på korreksjonsforsøk, ellers 0. |
| Sample presentation [ms] | `utvalg_presentasjon_ms` | `Sample_presentation_ms` | Tid utvalget sto alene, før sammenligningene, i millisekunder. Lik `rt_utvalg_ms` når det kreves klikk på utvalget. 0 når utvalg og sammenligninger kommer samtidig. Ved simultan matching blir utvalget stående under valget; den tiden ligger i `rt_sammenligning_ms`, ikke her. |
| Sample off [ms] | `utvalg_av_ms` | `Sample_off_ms` | Målt tid fra utvalget slukkes til sammenligningene vises. Pauser er trukket fra (de ligger i Hendelser). 0 når utvalget ikke slukkes. Kan avvike fra `forsinkelse_ms` hvis ventetiden ikke løp ferdig. |
| LHTS [ms] | — | — | Ikke med. Se under. |
| LHTC [ms] | — | — | Ikke med. |
| Prompt correct [ms] | — | — | Ikke med. |
| Unscheduled responses | — | — | Ikke med. |
| Position 1–8 | `Position 1` … `Position 8` | samme | Se kartet under. |
| — | `start_ms` | `Trial_start_ms` | Forsøksstart, millisekunder fra øktstart. Brukes til responser per minutt. |
| — | `svar_ms` | `Response_timestamp_ms` | Tidspunkt for valget, millisekunder fra øktstart. |
| — | `valgt_posisjon` | `Selected_position` | Hjørnekode for valget: `øv`, `øh`, `nv`, `nh`. |
| — | `s_pluss_hjørne` | `S_plus_corner` | Hjørne for S+. |
| — | `tomt_hjørne` | `Empty_corner` | Hjørne uten sammenligning. |
| — | `sammenligninger_og_posisjoner` | `Comparisons_and_positions` | Pakket form `stimulus@hjørne`, med `tom@hjørne` for det tomme hjørnet. |
| — | `klikk_på_utvalg` | `Observing_responses` | Antall klikk på utvalget. |
| — | `fanebytter_hittil` | `Tab_switches` | Fanebytter så langt i økten. |

`Position 1`–`Position 8` finnes i begge profiler, med de navnene, slik at eldre lesing kan slå opp kolonnen direkte. De andre norske navnene finnes bare i standardprofilen.

### Position 1–8

Sammenligningene står i hjørnene. Utvalget står i midten og er ikke med i disse kolonnene. Cellene inneholder stimuluskoden, eller er tomme.

| Kolonne | Hjørne | Skjerm |
| --- | --- | --- |
| Position 1 | `øv` | øvre venstre |
| Position 2 | `øh` | øvre høyre |
| Position 3 | `nv` | nedre venstre |
| Position 4 | `nh` | nedre høyre |
| Position 5–8 | — | alltid tomme |

MTS-lab har fire hjørner. Med tre klasser er ett hjørne tomt. Med to klasser er to tomme. Med fire klasser er alle fire i bruk. `tom@hjørne` i den pakkede strengen blir en tom posisjonscelle, ikke ordet «tom».

## Parametere

Fanen har to kolonner, `parameter` og `verdi`. Hvert felt i øktoppsettet har en rad. Mestringskriteriet står som `par_mestring` = `17/18`, og i tillegg som `par_mestring_teller` og `par_mestring_nevner`. Standardverdien er ikke endret.

| Oppsett | Rad i Parametere |
| --- | --- |
| Versjon | `par_versjon` |
| Studie-ID | `par_studie_id` |
| Gruppekode | `par_gruppekode` |
| Språk | `par_sprak` |
| Instruksjoner | `instruksjon_no`, `instruksjon_en` |
| Klasser og medlemmer | `par_klasser`, `par_medlemmer` |
| Struktur | `par_struktur` (`LS`, `OTM`, `MTO`) |
| Trial-multiplikator | `par_trial_multiplikator` |
| Mestringskriterium | `par_mestring`, `par_mestring_teller`, `par_mestring_nevner` |
| Nedtrapping | `par_nedtrapping`, for eksempel `100/75/50/0` |
| Tilbakemeldingsord | `tilbakemeldingsord`, `tilbakemeldingsord_en` |
| Tilbakemelding, varighet | `par_tilbakemelding_ms` |
| Ved feil | `par_feil_svar` |
| Korreksjon | `par_korreksjon`, `par_korreksjon_maks` |
| MTS-type | `par_mts_type` (`simultaneous` eller `delayed`) |
| Forsinkelse | `par_forsinkelse_s` |
| ITI | `par_iti_s` |
| Klikk på utvalg | `par_klikk_utvalg` |
| Inaktivitet | `par_inaktivitet_min` |
| Posisjonsregel | `par_posisjon`, `par_maks_splus_rad` |
| Testflagg | `par_test_symmetri`, `par_test_transitivitet`, `par_test_ekvivalens`, `par_test_baseline`, `par_test_refleksivitet`, `par_refleksivitet_forhandstest` |
| Test-multiplikator | `par_test_multiplikator` |
| Gradvis innføring | `par_gradvis_innforing` |
| Stimulusmodus | `par_stimulusmodus`, `par_bildemedlem` |
| Symboler | `symboltilordning` |
| Utelatte symboler | `utelatte_symboler` |
| Egne bilder | `tilpassede_stimuli` (bare stimuluskodene, ikke bildefilene) |
| Eksportprofil | `par_eksportprofil` |
| Treningsrekkefølge | `treningsrekkefolge` |
| Hele protokollen | `manus` |
| Filnavn | `resultatfil` |

`manus` er protokollen slik økten er satt opp: struktur, mestring 17/18, innføringsblokker, blandede treningsblokker med nedtrapping, og testrelasjoner. Rekkefølgen inne i en blokk trekkes på nytt for hver blokk og står derfor ikke som en fast liste. `treningsrekkefolge` er den samme rekkefølgen på én linje, for eksempel `AB@100 > BC@100 > blandet:AB+BC@100 > test:BA+CB+AC+CA`.

Lange tekster (instruksjon, symboler, manus) ligger i Parametere. De gjentas ikke på hver rad i Data, så CSV-filen ikke blir full av samme tekst. Alle korte `par_`-felt, inkludert `par_mestring`, ligger både i Parametere og på hver forsøksrad.

Bildefiler i `customStimuli` skrives ikke inn i resultatfilen. `tilpassede_stimuli` sier hvilke koder som hadde et eget bilde.

`par_tilbakemelding_ms` er hvor lenge ordet blir stående (standard 2000). Ved litteraturinnstillingen vises «Feil» i 2000 ms uansett. Det er ikke avklart om *Feedback Delay* i den gamle programvaren var ventetid før ordet, eller varighet. Feltet her er varighet.

## Oppsummering

Nøkkel og verdi. Tidligere rader er med (forsøkstall, fanebytter, treff per relasjonstype, treff per S+-hjørne). I tillegg, for hver blokk:

| Nøkkel | Verdi |
| --- | --- |
| `mestringskriterium` | `17/18` |
| `blokk_<n>_<fase>_riktige` | `riktige/programmerte`, for eksempel `5/6` |
| `blokk_<n>_<fase>_prosent` | Prosent som tall, tre desimaler |
| `blokk_<n>_<fase>_responser_per_minutt` | Tall |

Fase er `trening`, `test` eller `forhåndstest`. Nøyaktigheten bruker programmerte forsøk, ikke korreksjonsforsøk. Responser per minutt teller hvert valg i blokken, også korreksjon. Tiden går fra første forsøksstart (`start_ms`) til siste valg (`svar_ms`), pluss tilbakemeldingen og ITI etter siste valg. Pauser inngår i klokketiden. For test- og forhåndstestblokker kommer også `blokk_<n>_<fase>_<relasjonstype>` som `riktige/n`.

## Ikke med ennå

Limited hold, prompt og uskjemalagte responser er ikke kolonner. De skal ikke inn før det er avklart at prosedyren skal brukes.
