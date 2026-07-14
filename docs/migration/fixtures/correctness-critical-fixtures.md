# Correctness-critical parity fixtures

Diekstrak read-only dari test + pure-logic source pada baseline `ec04389`. Semua nilai disalin verbatim dari assertion test. Tanpa secret/PII (ID `user_1`/`ws_1`/`org_9` = literal sintetis yang di-assert, dipertahankan apa adanya).

Root source:
- `apps/web` = `/Users/vitoandareasmanik/Development/project/aqsha/apps/web`
- `packages/chat-core`, `packages/services` = di bawah repo yang sama.

---

## Group 1 — Mastra timeline reducer + chat-core primitives

### 1a. Auth-gated thread/rate derivations
**Module:** `apps/web/features/thread-experience/utils/thread-experience-model.ts`
**Exports:** `deriveSelectedThread`, `deriveRateStatus`
**Test:** `thread-experience-model.test.ts`

Shared input literal:
```json
{ "cachedThread": { "id": "thr_prev", "title": "Previous user's thread", "workspaceId": "ws_prev", "status": "idle" },
  "cachedSendStatus": { "canSend": true, "reason": null, "retryAt": null } }
```

`deriveSelectedThread(input)` cases:
```jsonc
// auth ready + data present
IN  { "threadId":"thr_prev","authReady":true,"isLoading":false,"data":<cachedThread> }
OUT { "threadId":"thr_prev","title":"Previous user's thread","workspaceId":"ws_prev","status":"idle" }

// REGRESSION: signed-out but threadId lingers → must NOT leak cached data
IN  { "threadId":"thr_prev","authReady":false,"isLoading":false,"data":<cachedThread> }
OUT undefined

// blank title → placeholder
IN  { "threadId":"thr_prev","authReady":true,"isLoading":false,"data":{...cachedThread,"title":"   "} }
OUT.title === "Percakapan baru"

// resolved-but-missing
IN  { "threadId":"thr_x","authReady":true,"isLoading":false,"data":null }   → OUT null
// loading
IN  { "threadId":"thr_x","authReady":true,"isLoading":true,"data":null }    → OUT undefined
// nothing selected
IN  { "threadId":undefined,"authReady":true,"isLoading":false,"data":<cachedThread> } → OUT undefined
```

`deriveRateStatus(authReady, data)` cases:
```jsonc
IN  (true,  { canSend:true, reason:undefined, retryAt:undefined })
OUT { ok:true, serverTime:0, canSend:true, reason:undefined, retryAt:undefined }

IN  (false, <cachedSendStatus>)   → OUT undefined   // REGRESSION: stale send-status must not leak across sign-out
```
Note: `undefined` vs `null` load-bearing (undefined = neutral/resolving, null = not-found). Port yang menggabungnya, atau membaca cached query data sebelum auth gate, memunculkan kembali cross-account leak yang di-guard ini.

### 1b. chat-core shared primitives
**Module:** `packages/chat-core/src/index`
**Exports:** `normalizeAskQuestions`, `normalizeAskOtherOption`, `isOtherLikeOptionLabel`, `clerkClaimsToPrincipal`, `ownershipVerdict`, `messagePreview`, `parseCommandSegments`, `userMessageId`, `assistantMessageId`
**Test:** `packages/chat-core/test/chat-core.test.ts`

```jsonc
// normalizeAskOtherOption(options, allowOther) → folds "Lainnya"/"Other"-like into allowOther
IN  ([{label:"Teks"},{label:"Lainnya",description:"Tulis sendiri"}], true)
OUT { options:[{label:"Teks",...}], allowOther:true }
IN  ([{label:"A"},{label:"Lainnya…"}], false)  → OUT options=["A"], allowOther:true
IN  ([{label:"A"},{label:"B"}], false)          → OUT options length 2, allowOther:false

// isOtherLikeOptionLabel — TRUE set:
["Lainnya","Lainnya…","lainnya...","Other","others","Tulis sendiri","Lain-lain","Lainnya (sebutkan)","Other, specify"]
// FALSE set (concrete options that merely start with the sentinel word):
["Teks/dokumen","Data","Ringkasan","Other renewable sources","Lainnya energi terbarukan"]

// normalizeAskQuestions
IN  null                       → OUT []
IN  { questions: [] }          → OUT []
IN  [{prompt:""},{prompt:"Fokus?"}]  → OUT length 1, [0] matches {id:"q2",prompt:"Fokus?",kind:"single"}
IN  [{id:"scope",prompt:"Pilih",kind:"multi",options:["A",{label:"B",description:"d"},"Lainnya"]}]
OUT [0] matches {id:"scope",kind:"multi",allowOther:true}; options labels === ["A","B"]
IN  [{prompt:"Bebas"}]         → OUT [0] matches {kind:"single",options:[],allowOther:true}
IN  5×{prompt:"Qn"}, {max:3}   → OUT length 3   (no max → length 5)

// clerkClaimsToPrincipal
IN  {}                         → OUT null
IN  {sub:123}                  → OUT null   // non-string sub
IN  {sub:"user_1",email:"a@b.com",org_id:"org_9",iss:"https://clerk.example"}
OUT { principalId:"user_1", principalType:"user", authenticator:"clerk", subject:"user_1",
      issuer:"https://clerk.example", attributes:{email:"a@b.com",orgId:"org_9"} }
IN  {sub:"user_2"}
OUT { principalId:"user_2", principalType:"user", authenticator:"clerk", subject:"user_2", attributes:{} }

// ownershipVerdict(row, userId)
IN  (null,"user_1")                       → "not_found"
IN  ({ownerUserId:"user_1"},"user_1")     → "ok"
IN  ({ownerUserId:"user_2"},"user_1")     → "forbidden"

// messagePreview — collapse whitespace + clamp 160 chars with "…"
IN  "  halo   dunia\n\nastra "  → OUT "halo dunia astra"
IN  "x".repeat(300)            → OUT Array.from(out).length === 160, endsWith "…"

// parseCommandSegments
IN  "/matriks bab 2 tentang UMKM"
OUT [ {type:"command",matched:"/matriks"}, {type:"text",value:" bab 2 tentang UMKM"} ]
IN  "tolong pakai /sitasi untuk daftar ini"  → types ["text","command","text"], [1].matched="/sitasi"
IN  "/kuanti topik regresi"    → [0]={command,matched:"/kuanti"}, [0].command.id === "kuantitatif"
IN  "/kuantitatif topik"       → [0].matched === "/kuantitatif"  (alias prefix must not eat longer slug)
IN  "lihat https://x.co/matriks ya"  → OUT [{type:"text",value:"lihat https://x.co/matriks ya"}]
IN  "kata/matriks tanpa spasi"       → OUT [{type:"text",value:"kata/matriks tanpa spasi"}]
IN  "pakai /matriks, lalu lanjut"    → [1]={command,matched:"/matriks"}  (trailing punctuation ok)
IN  "/matriksx bukan command"        → OUT [{type:"text",value:"/matriksx bukan command"}]
IN  "halo dunia"               → OUT [{type:"text",value:"halo dunia"}]
IN  ""                         → OUT []

// deterministic message ids
userMessageId("s1","t1")            === "s1:t1:user"
assistantMessageId("s1","t1",5)     === "s1:t1:5:assistant"   // keyed by sequence
assistantMessageId(...,7) !== assistantMessageId(...,5)
```
Note: aturan slug-boundary `parseCommandSegments` (tolak URL/infix, presedensi alias-prefix) dan bentuk deterministik id = kontrak anti-collision yang jadi fondasi seluruh optimistic-timeline; port harus reproduksi persis.

### 1c. Mastra chunk reducer (BELUM ada unit test — tambah golden fixture)
**Module:** `apps/web/features/threads/lib/mastra-timeline.ts`
**Key pure exports:** `initialMastraTimeline(seed)`, `reduceMastraChunk(state, chunk)`, `reduceWorkflowChunk(state, chunk)`, `mastraMessagesToTimeline(messages)`, `startAssistantTurn`, `settleAssistantTurn`, `settleWorkflowTurn`, `reviveWorkflowTurn`, `seedWorkflowProgress`, `dropLastTurn`, `startRegenerate`, `wfStepLabel`, `lastStepAttempt`
**Kontrak (dari source):**
```jsonc
initialMastraTimeline([]) === { messages:[], approvals:[], status:"ready" }

// chunk.type dispatch (reduceMastraChunk):
"start"|"step-start"          → status "streaming", sets runId/activeRunId, ensures streaming assistant
"text-delta"                  → appends payload.text to text part id=payload.id
"reasoning-delta"/"-end"      → reasoning part text append / thinking=false
"tool-call"                   → upsert tool-row status "running"
"tool-result"|"tool-output"   → complete tool-row; propose_artifact success → artifact part
"tool-call-suspended"         → askGate {source:"tool",questions,...} (questions via normalizeAskQuestions)
"finish" reason==="tool-calls"→ state unchanged; else settleAssistantTurn (status→"ready")
"abort"                       → settleAssistantTurn (no error)
"error" with prior answer text→ settle + error "Jawaban terhenti sebelum selesai dan mungkin terpotong. Gunakan \"Buat ulang\" untuk mencoba lagi."
"error" without answer text   → settle + error = extractError(payload.error)
"tripwire"                    → settle + error = payload.reason || "Permintaan diblokir (kuota/kebijakan)."
default                       → state unchanged

// Workflow step label map (wfStepLabel), Indonesian, load-bearing for /deep stepper:
{"draft-clarify":"Menilai kebutuhan klarifikasi","clarify":"Menunggu klarifikasi","draft-plan":"Menyusun rencana",
 "approve-plan":"Menunggu persetujuan rencana","search-literature":"Menelaah literatur","counter-evidence":"Mencari bukti tandingan",
 "assign-citations":"Menomori sumber","analyze-sources":"Menganalisis bukti","verify-citations":"Memverifikasi sitasi",
 "synthesize":"Menulis sintesis","persist-report":"Menyimpan laporan"}

// wfStepStatusToTool: success→completed, failed→failed, suspended|waiting|paused→pending, else→running
```
Note: reducer ini SoT untuk "busy/Stop" chat + progress `/deep`. Immutable/pure, kandidat port verbatim, tapi BELUM ada test byte-locking → harness harus tambah golden fixture (drive dengan urutan chunk di atas, snapshot `MastraTimelineState`).

### 1d. deep-viz builders + injector
**Module:** `packages/chat-core/src/deep-viz`
**Exports:** `buildDeepVizBlocks`, `injectVizBlocks`, `parseDeepVizBlock`, `vizBlockToFence`
**Test:** `packages/chat-core/test/deep-viz.test.ts`

Source factory (test helper — reuse):
```js
src({n, ...over}) = { subQuestionIndex:0, title:`Paper ${n}`, authors:[], year:null, venue:null,
  citedByCount:null, evidenceStrength:"medium", stance:null, studyDesign:null, outcomes:[], topics:[], ...over }
input(over) = { subQuestions:["Apakah X meningkatkan Y?"], sources:[],
  subQuestionAnswerable:[{subQuestionIndex:0,answerable:true}], claims:[], openQuestions:[], ...over }
```
```jsonc
buildDeepVizBlocks(input())  → []   // empty in → no blocks

// consensus-meter: N≥5 AND ≥2 distinct stances; not_applicable excluded from N; dedupe unit n×subQ (first wins)
IN sources: [n1 stance:yes design:rct, n2 yes meta_analysis, n3 yes, n4 no observational, n5 mixed]
OUT block id:"consensus-q0", n:5, stances:{yes:3,possibly:0,mixed:1,no:1},
    designByStance.yes === {rct:1, meta_analysis:1, other:1}   // null design → "other"
IN same but only first 4 sources → NO consensus-meter block
IN 6× stance:yes (uniform) → NO block
IN [.., not_applicable, possibly] → n:5 (not_applicable not counted)
IN answerable:false → NO block

// results-timeline: ≥4 dated points AND ≥2 distinct years; sorted by year; nulls preserved
IN [n1 2020 cited:10, n2 2019, n3 2020 cited:3, n4 2024 cited:99, n5 year:null]
OUT points.map(p=>p.n) === [2,1,3,4]; points[0].citedByCount === null
IN 4× year:2020 (single year) → NO block

// top-contributors: authors/venues with ≥2 unique papers, top 3, tiebreak total citations
IN [n1 Alice,Bob/Nature cited:5, n2 Alice,Carol/Nature cited:7, n3 Bob/Science cited:100, n4 Dave/Science, n5 Eve]
OUT authors names === ["Bob","Alice"]; authors[0].papers === [1,3]; venues names === ["Science","Nature"]
IN single source → NO block

// claims-evidence: score = Σ(design weight × strength multiplier), clamp 10; ≥3 valid claims; label by threshold
// design weights: meta_analysis/systematic_review=full, rct≈1.875, observational=0.75, null→other 1.0
// strength multipliers: strong=full, medium=0.75, weak
IN papers [n1 meta_analysis+strong(3.0), n2 rct+medium(1.875), n3 observational+weak(0.75), n4 null(0.75)]
   claims [{K1 papers:[1,2,3]}, {K2 papers:[1,1,99]}, {K3 papers:[3,4]}, {K4 papers:[99]}]
OUT 3 claims:
   [0] {text:"K1", papers:[1,2,3], score:5.6,  label:"moderate"}
   [1] {text:"K2", papers:[1],     score:3,    label:"moderate"}   // dedupe + drop wild n=99
   [2] {text:"K3", papers:[3,4],   score:1.5,  label:"limited"}
   // K4 (no valid paper) dropped
IN 5× meta_analysis+strong, claim papers:[1..5] → score 15 clamp → {score:10, label:"strong"}
IN <3 valid claims → NO claims-evidence block

// gaps-matrix: ≥8 papers AND ≥2 rows; outcome rows (fallback topics), case-insensitive merge; design cols
IN 8 sources (Mortality/mortality merged, QoL, Cost via topics; designs rct/meta/obs/sysrev/review/null)
OUT rows === ["Mortality","Quality of life","Cost"]
    cols === ["meta_sysrev","rct","observational","other"]
    cells === [[2,2,0,0],[0,1,1,1],[0,0,0,2]]
IN 7 sources → NO block

// open-questions: pass-through 2–4; <2 drop; >4 cap at 4
IN 6× {question,why} → items.length === 4
IN 1 item → NO block
```
`injectVizBlocks(report, blocks[])` → `{report, placedIds, appendedIds, droppedIds, removedMarkerCount, strippedFenceCount}`:
```jsonc
// replace {{viz:id}} markers; unknown markers removed; duplicate marker → first wins; stamps figure numbers
IN report with markers [consensus-q0, tidak-dikenal, consensus-q0], blocks:[meterBlock]
OUT placedIds:["consensus-q0"], removedMarkerCount:2, report contains "```aqsha:viz", no "{{viz:",
    single fence, payload parses back to {...meterBlock, figure:1}

// anti-forgery: model-authored ```aqsha:viz fences stripped (incl. unclosed)
IN forged report with 2 aqsha:viz fences + valid {{viz:timeline}}, blocks:[timelineBlock]
OUT strippedFenceCount:2, report excludes "palsu"/"open-questions", keeps "Tengah.", single injected fence, placedIds:["timeline"]

// core blocks not placed → appended under "### Lampiran visual"; non-core dropped
IN "Laporan tanpa marker.", blocks:[meterBlock, claimsBlock, timelineBlock]
OUT appendedIds:["consensus-q0","claims"], droppedIds:["timeline"], report contains "### Lampiran visual", 2 fences

// figure numbering sequential by document order, appendix continues:
IN markers [timeline, claims], blocks:[meter, claims, timeline]
OUT payloads [id,figure] === [["timeline",1],["claims",2],["consensus-q0",3]]

// markers inside ```code fences (js / 4-backtick) NOT touched; idempotent on retry
IN raw "Isi.\n{{viz:claims}}\nAkhir." → injectVizBlocks(raw,[claims]) twice → identical report

// parseDeepVizBlock: corrupt JSON / v!=1 / unknown type → null; valid → block
parseDeepVizBlock("{bukan json") === null
parseDeepVizBlock(JSON.stringify({...timelineBlock, v:2})) === null
parseDeepVizBlock(JSON.stringify({...timelineBlock, type:"unknown"})) === null
parseDeepVizBlock(JSON.stringify(timelineBlock)) === timelineBlock
```
Note: `injectVizBlocks` = boundary anti-forgery (strip viz fence buatan model, hanya blok hasil server yang dirender) + marker replacement fence-aware. Port regex naif = forge-render atau corrupt code fence.

### 1e. stats-viz builders + markers
**Module:** `packages/chat-core/src/stats-viz`
**Exports:** `buildStatsGroup`, `parseStatsBlock`, `parseStatsGroup`, `referencedRunKeys`, `statsMarker`, `toRunKey`, `stripStatsMarkers`, `summarizeStatsGroup`, `statsAnalysisMeta`, `STATS_ANALYSIS_META`
**Test:** `packages/chat-core/test/stats-viz.test.ts`
```jsonc
// buildStatsGroup: block order table → decision → figure
IN { runKey:"call-1", analysis:"uji_validitas", title:"Uji validitas",
     result:{ analysis:"uji_validitas",
       tables:[{id:"item_total",title:"Item-Total Statistics",columns:["Item","r hitung","r tabel","Keputusan"],
                rows:[["X1.1",0.612,0.361,"Valid"],["X1.2",0.245,0.361,"Tidak Valid"]],notes:["a. df = n − 2"]}],
       decisions:[{id:"valid_x1_1",label:"Validitas X1.1",rule:"r hitung ≥ r tabel",value:0.612,cutoff:0.361,
                   verdict:"lolos",interpretation:"Item X1.1 valid."}] },
     charts:[{png:"AAAA",title:"Scatter",type:"scatter"}] }
OUT blocks types === ["stats-table","stats-decision","stats-figure"]
    table.table.rows[0] === ["X1.1",0.612,0.361,"Valid"]
    decision.title === "Kesimpulan Uji validitas"; decision.decisions[0].verdict === "lolos"
    figure.png === "AAAA"; figure.chartType === "scatter"

IN result {tables:[],decisions:[]}, charts:[] → null
IN decisions:[{id:"d",verdict:"ngawur"}], charts:[{png:""}]
OUT decision.decisions[0].verdict === "perhatian"  (unknown verdict fallback); no stats-figure (empty png dropped)

// markers
toRunKey("call_ABC.123:xyz") === "call-abc-123-xyz"
toRunKey("!!!") === "run"
statsMarker("call-1") === "{{stats:call-1}}"
referencedRunKeys("Lihat {{stats:a}} lalu {{stats:b}} dan lagi {{stats:a}}.") === ["a","b"]  // dedup, first order
referencedRunKeys("tanpa penanda") === []
stripStatsMarkers("Hasil uji {{stats:a}} sudah siap.") === "Hasil uji sudah siap."
stripStatsMarkers("tanpa penanda") === "tanpa penanda"

// catalog meta (no fabrication for unknown ids)
statsAnalysisMeta("uji_validitas").label === "Uji validitas"
statsAnalysisMeta("profile") === {label:"Profil dataset", credits:0}
statsAnalysisMeta("custom").credits === 10
statsAnalysisMeta("uji_ngarang") === undefined
statsAnalysisMeta("hasOwnProperty") === undefined    // prototype-safe lookup
// every STATS_ANALYSIS_META label has no "(" annotation; credits ≥ 0; heavy set:
Object.entries(STATS_ANALYSIS_META).filter(m.heavy).map(id).sort() === ["cb_sem","sem_pls","uji_mediasi"]

// summarizeStatsGroup: verdict tallies + counts
IN group with decisions verdicts [lolos, tidak_lolos, perhatian, perhatian], 1 table, 1 chart
OUT { verdicts:{lolos:1,tidak_lolos:1,perhatian:2}, tables:1, figures:1 }

// parse
parseStatsBlock(JSON.stringify({v:1,type:"stats-figure",id:"f",png:"AA",caption:""})).type === "stats-figure"
parseStatsBlock("{bukan json") === null
parseStatsBlock(JSON.stringify({v:2,type:"stats-figure"})) === null
parseStatsGroup({...group, toolCallId:"call-1", ignored:true}) → runKey "k", strips toolCallId (undefined)
parseStatsGroup({v:1,runKey:"k"}) === null
```

---

## Group 2 — Citation export (bytes / filename / format)

### 2a. FE export-model
**Module:** `apps/web/features/citations/export-model.ts`
**Exports:** `resolveExportContent`, `exportFileExtension`, `exportFileName`, `exportBlobType`
**Test:** `apps/web/features/citations/export-model.test.ts`
```jsonc
// resolveExportContent(data): string | Response | parsed-JSON → string
resolveExportContent("@article{smith2020,\n  title = {A Study},\n}\n") === (same string, verbatim)
resolveExportContent("TY  - JOUR\nAU  - Smith, J.\nER  -\n") === (same string)
resolveExportContent(new Response("TY  - JOUR\nER  -\n")) === "TY  - JOUR\nER  -\n"   // via .text()
// csl-json auto-parsed array/object → JSON.stringify(data, null, 2)  (2-SPACE indent, load-bearing)
resolveExportContent([{id:"smith2020",type:"article-journal",title:"A Study",DOI:"10.1/x"},{id:"doe2021",type:"book",title:"A Book"}])
   → typeof string; JSON.parse(out) deep-equals input array
resolveExportContent({id:"solo",type:"webpage",title:"Solo"}) → JSON.parse(out) equals input

// filename & mime per format — exact:
"bibtex"   → ext "bib",  fileName "sitasi.bib",  blobType "text/plain;charset=utf-8"
"ris"      → ext "ris",  fileName "sitasi.ris",  blobType "text/plain;charset=utf-8"
"csl-json" → ext "json", fileName "sitasi.json", blobType "application/json;charset=utf-8"
```
Note: cabang csl-json = regresi bug download riil — Eden auto-parse `application/json`, jadi `Response.text()` naif melempar `TypeError`. Port harus `JSON.stringify(data, null, 2)` untuk array/object hasil-parse dan set mime `application/json` hanya untuk csl-json.

### 2b. Services citation-format (byte-exact bibliography rendering)
**Module:** `packages/services/src/citations/citation-format`
**Exports:** `exportCitations`, `renderBibliography`, `renderBibliographyEntries`
**Also:** `citation-parse` → `parseBibliographyFile`, `sniffBibliographyFormat`; `citation-normalize` → `cslItemToColumns`
**Test:** `packages/services/test/citations-parse-format.test.ts`

Shared CSL items:
```json
[
 { "id":"lecun","type":"article-journal","title":"Deep learning",
   "author":[{"family":"LeCun","given":"Yann"},{"family":"Bengio","given":"Yoshua"},{"family":"Hinton","given":"Geoffrey"}],
   "container-title":"Nature","volume":"521","issue":"7553","page":"436-444",
   "issued":{"date-parts":[[2015]]},"DOI":"10.1038/nature14539" },
 { "id":"moleong","type":"book","title":"Metodologi penelitian kualitatif",
   "author":[{"family":"Moleong","given":"Lexy J."}],"publisher":"Remaja Rosdakarya",
   "publisher-place":"Bandung","issued":{"date-parts":[[2017]]} }
]
```
Byte-exact `renderBibliographyEntries(items, style)[i].text`:
```text
apa-7 [0]  LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444. https://doi.org/10.1038/nature14539
apa-7 [1]  Moleong, L. J. (2017). Metodologi penelitian kualitatif. Remaja Rosdakarya.
ieee [0]   [1] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436–444, 2015, doi: 10.1038/nature14539.
vancouver [0]  1. LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436–44. doi:10.1038/nature14539
chicago-author-date [0]  LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. 2015. "Deep Learning." Nature 521 (7553): 436–44. https://doi.org/10.1038/nature14539.
```
(Perhatikan en-dash `–` pada page range, curly quotes `" "`, dan perbedaan trailing period antar-style — semua byte-significant. IEEE/Chicago di source memakai curly quotes literal.)
```jsonc
// renderBibliography(items,"apa-7", sortMode) — first line:
sort "author" → line0 contains "LeCun"
sort "title"  → line0 contains "Deep learning"
sort "year"   → line0 contains "Moleong"   // 2017 > 2015

// sniffBibliographyFormat — by content, not extension:
mendeley.bib → "bibtex";  zotero.ris → "ris";  "halo dunia" → null

// parseBibliographyFile(content, format) → {entries, errors}
mendeley.bib → 6 entries, 0 errors; "Enquête…" author family "Müller"; doi "10.1234/tal.2019.60213";
               "Global tuberculosis…" author literal "World Health Organization"
zotero.bib   → 5 entries, 0 errors; chapter title contains "プライバシー"
mendeley.ris → 5 records; broken "Entry rusak" → cslItemToColumns.publishedYear === null (non-numeric PY, no crash)
// malformed bibtex entry → per-entry diagnostic, other entries survive (titles include "Entry Baik","Buku Baik")

// exportCitations(items, format) — item {id:"x",type:"article-journal",title:"Judul Uji",author:[{family:"Doe",given:"J."}],issued:{"date-parts":[[2020]]},"container-title":"Jurnal",DOI:"10.1/x"}
"bibtex"   → content contains "@article", extension "bib"
"ris"      → content contains "TY  - JOUR"
"csl-json" → JSON.parse(content)[0].title === "Judul Uji"
// round-trip bibtex→parse: cols.title "Judul Uji", cols.doi "10.1/x", cols.publishedYear 2020
```
Note: 4 style ini dirender via citeproc dari style string vendored; port harus byte-identik (dash/quote/DOI) atau bibliografi existing berubah terlihat. Fixture `.bib/.ris` di `packages/services/test/fixtures/citations/`.

### 2c. Research references (deep-report reference list)
**Module:** `packages/services/src/research/references`
**Exports:** `formatApa7Reference`, `formatBibtex`, `formatRis`, `dedupeReferenceSources`, `sortForReferenceList`
**Test:** `packages/services/test/references.test.ts`

Source factory:
```js
src(over) = { citationNumber:null, origin:"doi", title:"Attention is all you need",
  locator:"10.5555/3295222", url:"https://doi.org/10.5555/3295222", doi:"10.5555/3295222",
  arxivId:null, authors:["Ashish Vaswani","Noam Shazeer"], year:2017,
  venue:"Advances in Neural Information Processing Systems", ...over }
```
```jsonc
// formatApa7Reference — *italic venue* markdown
src({}) → "Vaswani, A., & Shazeer, N. (2017). Attention is all you need. *Advances in Neural Information Processing Systems*. https://doi.org/10.5555/3295222"
authors ["A Satu","B Dua","C Tiga"] → contains "Satu, A., Dua, B., & Tiga, C., et al."
authors:[],year:null,venue:null,doi:null,url:"https://contoh.id/a",locator:"https://contoh.id/a",origin:"web"
   → "(t.t.). Attention is all you need. https://contoh.id/a"
doi:null,venue:null,arxivId:"1706.03762",url:null,locator:"1706.03762" → contains "arXiv." and "https://arxiv.org/abs/1706.03762"
authors ["Suharto"] (mononym) → startsWith "Suharto. (2017)."   // not forced to initials

// dedupeReferenceSources
[a=src({authors:[],year:null,citationNumber:3}), b=src({authors:["Ashish Vaswani"],year:2017})]  // same DOI
   → length 1; citationNumber 3; authors ["Ashish Vaswani"]; year 2017   // null metadata filled from dup
[a=src({doi:null,locator:"https://a.id",origin:"web"}), b=src({doi:null,locator:"https://b.id",origin:"web"})]
   → length 2   // different locator, no DOI → not merged

// sortForReferenceList — by first author family, fallback title
[z(authors:["Zed Akhir"],title:"Zzz"), m(authors:["Budi Maulana"],title:"Mmm"), a(authors:[],title:"Awal tanpa penulis")]
   → titles order ["Zzz","Awal tanpa penulis","Mmm"]   // keys: "akhir" < "awal tanpa penulis" < "maulana"

// formatBibtex
[src({})] → startsWith "@article{vaswani2017attention,"; contains
   "author = {Vaswani, Ashish and Shazeer, Noam}", "journal = {Advances in Neural Information Processing Systems}", "doi = {10.5555/3295222}"
[a,a] authors ["A Satu","B Dua","C Tiga"] → contains "and others", "@article{satu2017attention,", "@article{satu2017attentionb,"  // collision suffix
web no-DOI → startsWith "@misc{"; contains "url = {https://contoh.id/a}"; NOT "journal"

// formatRis
[src({})] → startsWith "TY  - JOUR"; contains "AU  - Vaswani, Ashish", "DO  - 10.5555/3295222"; trimEnd endsWith "ER  -"
web       → startsWith "TY  - ELEC"; contains "UR  - https://contoh.id/a"
```

### 2d. Citation import service (deterministic dedupe/commit contract)
**Module:** `packages/services/src/citations/citation-import.service` (`.preview`/`.commit`), `citation.service` (`.createManual`/`.get`)
**Test:** `packages/services/test/citations-import.test.ts`
Bukan pure (sentuh repo), tapi logika keputusan deterministik. `OWNER="user_1"`, `WS="ws_1"`. `BIB`=3 entri (a1 doi:10.1/dup, a2 no-doi, a3 doi:10.1/dup dup-of-a1). Row library existing `canonicalKey:"doi:10.1/dup"`.
```jsonc
// preview: mark duplicate vs library AND intra-batch
preview.format === "bibtex"; records.length === 3
r1.duplicateOfId === "cit_existing"; r2.duplicateOfId === null;
r3.duplicateOfId === "cit_existing"; r3.duplicateInBatch === true
preview.counts === { total:3, valid:1, incomplete:0, duplicate:2, error:0 }
// non-bib/ris file → AppError code "citation_import_invalid"

// commit(selectedIndexes:[0,1,2], duplicatePolicy):
"skip"   → { created:1, merged:0, skipped:2 }; inserted titles ["Entry Dua"], source "import"; batch status "committed", recordsJson null
"merge"  → created:1, merged:2; patch fills existing null fields: publishedYear 2020, venue "Jurnal A"
"import" → { created:3, merged:0, skipped:0 }; insertMany 3 rows
// already committed batch → "citation_batch_committed"; batch of other workspace → "citation_batch_not_found"

// CitationService.createManual duplicate → "citation_duplicate" (insert NOT called); allowDuplicate:true → insert once
// CitationService.get on other-workspace citation → "citation_not_found"
```

---

## Group 3 — Workspace upload state machine

### 3a. Upload orchestration
**Module:** `apps/web/features/workspaces/utils/workspace-file-upload.ts` (+ re-exports `@/lib/artifact-upload-policy`)
**Exports:** `MAX_WORKSPACE_UPLOAD_FILES` (=20), `WORKSPACE_UPLOAD_CONCURRENCY` (=3), `UPLOAD_REJECTED_MESSAGE`, `WORKSPACE_UPLOAD_ACCEPT`, `validateWorkspaceUploadBatch`, `runLimitedConcurrency`, `uploadWorkspaceFiles`, `getFailedWorkspaceUploadFiles`, `isAllowedWorkspaceUploadFile`
**Test:** `apps/web/features/workspaces/workspace-file-upload.test.ts`
```jsonc
MAX_WORKSPACE_UPLOAD_FILES === 20; WORKSPACE_UPLOAD_CONCURRENCY === 3
UPLOAD_REJECTED_MESSAGE === "Tipe file tidak didukung. Unggah PDF, DOCX, TXT, Markdown, CSV, atau JSON."

// validateWorkspaceUploadBatch
20 files → no throw;  21 files → throws Error "Maksimal 20 file dalam satu upload."

// runLimitedConcurrency(items9, 3, worker) → observed maxActive === 3

// uploadWorkspaceFiles — per-file status event sequence:
one allowed file, uploadFile resolves → onFileChange statuses === ["processing","complete"]
// (progress binary: processing progress:0 → complete progress:100; no byte-progress "uploading")

// resilience: one file throws, others continue
files [ok-a.txt, bad.txt(throws), ok-b.txt] → results.ok === [true,false,true]
   getFailedWorkspaceUploadFiles(results).name === ["bad.txt"]

// type gating BEFORE upload — disallowed never calls uploadFile
files [ok.pdf, logo.svg(image/svg+xml)] → results.ok === [true,false]
   failed[0] error === UPLOAD_REJECTED_MESSAGE; uploaded (reached uploadFile) === ["ok.pdf"]

// getFailedWorkspaceUploadFiles filters ok:false
[{ok:true,file:ok},{ok:false,file:failed,error:"Upload gagal."}] → ["failed.txt"]
```
**Allowed-type policy** (`apps/web/lib/artifact-upload-policy.ts`, `isAllowedWorkspaceUploadFile`):
```jsonc
UPLOAD_ALLOWED_EXTENSIONS === [".pdf",".docx",".txt",".md",".markdown",".csv",".json"]
UPLOAD_ALLOWED_MIME_TYPES === ["application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain","text/markdown","text/csv","application/json"]
// logic: allow if name(lowercased) ends with allowed extension, ELSE if normalized mime (before ";") in mime set
isAllowedWorkspaceUploadFile("paper.pdf") true; "notes.md" true; "data.csv" true; "data.json" true
File("export", type:"application/json") true    // allowed by MIME even w/ unfamiliar extension
File("logo.svg","image/svg+xml") false; File("page.html","text/html") false; File("script.py","text/x-python") false
```

### 3b. Upload toast summary model (BELUM ada test — tambah golden fixture)
**Module:** `apps/web/features/workspaces/components/workspace-upload-toast-model.ts`
**Exports:** `getStatusText`, `getUploadSummary`, `isRetryableUploadItem` (`MAX_UPLOAD_BYTES = 50 * 1024 * 1024`)
```jsonc
// getStatusText(item) by status:
queued→"Menunggu", uploading→"Mengunggah", processing→"Memproses", complete→"Selesai", failed→item.error ?? "Gagal"

// getUploadSummary(items): progress = round(complete/total*100)
active===0 && failed>0 → { tone:"failed",     title:`${failed} dari ${total} file gagal`, completeCount, failedCount, total, progress }
total>0 && complete===total → { tone:"complete", title:`${total} file tersimpan`, ..., progress:100 }
otherwise → { tone:"processing", title:`Memproses ${total} file`, ..., progress }

// isRetryableUploadItem: status==="failed" && file.size <= 52428800
```
Note: model status dua-fase sengaja binary (`processing`→`complete`) karena PUT tak punya byte progress; port yang menampilkan "uploading %" palsu menyimpang. Type-gating harus sebelum `uploadFile` agar file ditolak tak pernah presign.

---

## Group 4 — Marquee selection geometry
**Module:** `apps/web/features/workspaces/utils/workspace-marquee-selection.ts`
**Exports:** `normalizeMarqueeRect`, `rectsIntersect`, `intersectingTargetIds`, `applyMarqueeSelection`
**Test:** `apps/web/features/workspaces/workspace-marquee-selection.test.ts` (`MAX_CONTEXT_ARTIFACTS = 12`)
```jsonc
// normalizeMarqueeRect(start, current) — any drag direction → normalized rect + width/height
IN ({x:80,y:60},{x:20,y:10}) → { left:20, top:10, right:80, bottom:60, width:60, height:50 }

// rectsIntersect(a,b) — strict overlap (edge-touch = false)
({left:0,top:0,right:40,bottom:40},{left:20,top:20,right:60,bottom:60}) → true
({left:0,top:0,right:40,bottom:40},{left:40,top:40,right:60,bottom:60}) → false   // shared edge only

// intersectingTargetIds(selectionRect, targets)
IN ({left:0,top:0,right:50,bottom:50}, [{id:"a",rect:{10,10,30,30}},{id:"b",rect:{60,10,80,30}}])
OUT ["a"]

// applyMarqueeSelection({currentIds, hitIds, visibleIds, mode})
add:    { current:["hidden","a"], hit:["b","c"], visible:["a","b","c","d"] } → ["hidden","a","b","c"]
toggle: { current:["hidden","a","b"], hit:["b","c"], visible:["a","b","c","d"] } → ["hidden","a","c"]
// cap at MAX_CONTEXT_ARTIFACTS(12) in visible order:
add ids length 14 (all hit+visible) → ids.slice(0,12)
```
Note: `rectsIntersect` strict `<`/`>` (edge tak menyeleksi); seleksi di-cap 12 dalam urutan visible sambil pertahankan id "hidden" off-screen — port yang membuang hidden id atau cap by hit-order mengubah artifact yang jadi context agent.

---

## Group 5 — Workspace library model + panel URL codec

### 5a. Library model
**Module:** `apps/web/features/workspaces/utils/workspace-library-model.ts`
**Exports:** `groupArtifactsByFolder`, `getMoveTargetOptions`, `getWorkspaceMoveTargetOptions`, `getUploadTargetFolderId`, `getFolderView`, `resolveActiveFolderId`, `applyWorkspaceArtifactControls`, `expectArtifactsReturnToRootAfterFolderDelete`, `ROOT_FOLDER_LABEL`
**Test:** `apps/web/features/workspaces/workspace-library-model.test.ts`

Fixtures:
```json
folders = [ {"_id":"folder-b","name":"Reading","status":"active","updatedAt":20},
            {"_id":"folder-a","name":"Drafts","status":"active","updatedAt":10} ]
artifacts = [
  {"_id":"artifact-root","title":"Root note","artifactType":"markdown","status":"active","createdAt":1,"updatedAt":1},
  {"_id":"artifact-folder","folderId":"folder-a","title":"Folder note","artifactType":"markdown","status":"active","createdAt":2,"updatedAt":3},
  {"_id":"artifact-orphan","folderId":"missing-folder","title":"Orphan note","artifactType":"url","status":"active","createdAt":3,"updatedAt":4} ]
```
```jsonc
groupArtifactsByFolder({folders,artifacts}):
  group ids === ["root","folder-a","folder-b"]   // root first, then folders sorted by name (Drafts<Reading)
  groups[0].artifacts ids === ["artifact-orphan","artifact-root"]   // orphan (missing folder) → root
  groups[1].artifacts ids === ["artifact-folder"]

getMoveTargetOptions(folders) === [ {value:"root",label:ROOT_FOLDER_LABEL},
                                    {value:"folder-a",label:"Drafts"}, {value:"folder-b",label:"Reading"} ]
getWorkspaceMoveTargetOptions([{_id:"workspace-a",name:"Current"},{_id:"workspace-b",name:"Target"}], "workspace-a")
   === [ {value:"workspace-b",label:"Target"} ]   // active workspace excluded
getUploadTargetFolderId("root") === undefined;  getUploadTargetFolderId("folder-a") === "folder-a"

getFolderView({groups, activeFolderId:"root"}):
  activeFolderId "root"; folders ids ["folder-a","folder-b"]; folders[0].artifactCount 1
  artifacts ids ["artifact-orphan","artifact-root"]; breadcrumb [{id:"root",label:ROOT_FOLDER_LABEL}]
getFolderView({groups(sort:"title-asc"), activeFolderId:"root"}).artifacts ids === ["artifact-orphan","artifact-root"]
getFolderView({groups, activeFolderId:"folder-a"}):
  folders []; artifacts ids ["artifact-folder"]; breadcrumb [{root,ROOT_FOLDER_LABEL},{id:"folder-a",label:"Drafts"}]
resolveActiveFolderId({activeFolderId:"missing",groups}) === "root"
getFolderView({activeFolderId:"missing"}).activeFolderId === "root"

expectArtifactsReturnToRootAfterFolderDelete({before:artifacts, after:folder-a children→folderId undefined, deletedFolderId:"folder-a"}) === true

// applyWorkspaceArtifactControls({artifacts, query, types, sort})
types:["url"]                    → ["artifact-orphan"]
sort:"title-asc"                 → ["artifact-folder","artifact-orphan","artifact-root"]  // "Folder note"<"Orphan note"<"Root note"
sort:"created-asc"               → ["artifact-root","artifact-folder","artifact-orphan"]  // createdAt 1,2,3
query:"cognitive" (+artifact-preview with plainTextPreview "Cognitive load and multimedia notes")
                                 → ["artifact-preview"]   // searches title AND preview text
```
Note: root-first, orphan→root fallback, folder sorted-by-name, dan search atas `plainTextPreview` = kontrak stabil grid; sort key (`title-asc`, `created-asc`, `updated-desc`) harus cocok persis.

### 5b. Panel URL codec
**Module:** `apps/web/features/workspaces/utils/workspace-panel-model.ts`
**Exports:** `serializeWorkspacePanelMode`, `parseWorkspacePanelMode`, `workspacePanelTabOf`, `isWorkspacePanelOpen`, `parseAsWorkspacePanelMode`, `CLOSED_WORKSPACE_PANEL`
**Test:** `apps/web/features/workspaces/utils/workspace-panel-model.test.ts`
```jsonc
CLOSED_WORKSPACE_PANEL === { kind:"closed" }

// round-trip serialize→parse (split on FIRST ":" so ids containing ":" survive)
{kind:"chat"}                                → serialize "chat"            → parse {kind:"chat"}
{kind:"citations"}                           → serialize "cite"            → parse {kind:"citations"}
{kind:"citations",citationId:"abc:def"}      → serialize "cite:abc:def"    → parse {kind:"citations",citationId:"abc:def"}

serializeWorkspacePanelMode({kind:"closed"}) === null       // absent param = closed
parseWorkspacePanelMode("apalah") === {kind:"closed"}
parseWorkspacePanelMode("") === {kind:"closed"}
parseWorkspacePanelMode("cite:") === {kind:"citations"}     // truncated link → list view

workspacePanelTabOf({kind:"chat"}) === "chat"
workspacePanelTabOf({kind:"citations",citationId:"x"}) === "citations"
workspacePanelTabOf({kind:"closed"}) === null
```
Note: `"cite:<id>"` split pada colon PERTAMA (citationId boleh mengandung colon, mis. `abc:def`); id kosong / raw tak dikenal degrade ke view aman — port `split(":")` naif akan truncate id.

---

## Group 6 — BlockNote artifact-editor-model + explore citation

### 6a. Artifact editor model (autosave FSM + BlockNote text)
**Module:** `apps/web/features/workspaces/utils/artifact-editor-model.ts`
**Exports:** `parseBlockNoteJson`, `blockNotePlainText`, `autosaveReducer`, types `AutosaveState`/`AutosaveEvent`
**Test:** `apps/web/features/workspaces/artifact-editor-model.test.ts`
```jsonc
// parseBlockNoteJson(value): only arrays pass; invalid → []
parseBlockNoteJson('[{"type":"paragraph","content":"A"}]')  → length 1
parseBlockNoteJson("{bad json")                             → []
parseBlockNoteJson('{"type":"paragraph"}')                  → []   // object, not array

// blockNotePlainText — nested children flattened, joined "\n", collapse \n{3,}→\n\n, trim
IN [ {type:"paragraph", content:[{type:"text",text:"Parent"}],
      children:[{type:"bulletListItem", content:[{type:"text",text:"Child"}]}]},
     {type:"paragraph", content:"Tail"} ]
OUT "Parent\nChild\nTail"

// autosaveReducer(state, event) — initial {status:"idle",lastSavedJson:"[]",pendingJson:"[]",error:null}
changed json:"[1]"                      → status "dirty"
then saving                             → status "saving"
then saved json:"[1]"                   → status "saved"
// edited-while-saving then a stale save lands:
saving --changed "[1,2]"--> then saved "[1]" → { status:"dirty", lastSavedJson:"[1]", pendingJson:"[1,2]" }
saved --failed "offline"-->             → { status:"failed", error:"offline" }
// (also: changed with json===lastSavedJson → status "saved"; reset → idle with both json = event.json)
```
Note: cabang "saved-while-dirty" (save selesai tapi `pendingJson` sudah pindah → tetap `dirty`, simpan `pendingJson` terbaru) = guard lost-edits; port harus bandingkan `pendingJson !== event.json`, bukan langsung ke `saved`.

### 6b. Explore citation formatter
**Module:** `apps/web/features/artifacts/utils/citation.ts`
**Export:** `formatCitation`
**Test:** `apps/web/features/artifacts/utils/citation.test.ts`

Fixture paper:
```json
{ "key":"doi:10.1000/example","title":"Learning Analytics in Practice","snippet":"Snippet",
  "url":"https://example.edu/paper","doi":"10.1000/example","provider":"OpenAlex","sourceLabel":"OpenAlex",
  "authors":["Ayu Santoso","Bima Putra","Citra Dewi"],"year":2025,
  "venue":"Journal of Learning","topics":["Learning Analytics"] }
```
```jsonc
formatCitation(paper,"plain")    === "Ayu Santoso et al. (2025). Learning Analytics in Practice. Journal of Learning. https://doi.org/10.1000/example"
formatCitation(paper,"markdown") === "Ayu Santoso et al. (2025). [Learning Analytics in Practice](https://example.edu/paper), Journal of Learning."
formatCitation(paper,"bibtex")   contains "@article{santoso2025learning," AND "doi = {10.1000/example}"
```
Note: collapsing `et al.` (>2 authors → first + "et al."), link `https://doi.org/…` di plain, dan markdown link ke `url` (bukan DOI) = kontrak copy persis — divergensi mengubah apa yang di-paste user ke paper mereka.

---

## Harness notes untuk port

- **Byte-exact groups (risiko regresi tertinggi, snapshot dulu):** 2b/2c bibliography strings (dash/curly-quote/DOI), 2a csl-json `JSON.stringify(…, null, 2)`, 1d/1e viz+stats fence injection, 6b citation strings.
- **Belum ada `.test.ts` (baca dari source, tambah golden fixture saat port):** 1c `mastra-timeline.ts` reducer, 3b `workspace-upload-toast-model.ts`.
- **File fixture eksternal (copy verbatim bila perlu):** `packages/services/test/fixtures/citations/{mendeley,zotero}.{bib,ris}`.
- **Konstanta wajib cocok:** `MAX_WORKSPACE_UPLOAD_FILES=20`, `WORKSPACE_UPLOAD_CONCURRENCY=3`, `MAX_CONTEXT_ARTIFACTS=12`, `MAX_UPLOAD_BYTES=52428800`.
