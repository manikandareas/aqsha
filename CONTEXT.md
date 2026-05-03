# Aqsha

Aqsha adalah produk untuk research dan writing berbantuan AI. Konteks ini menjaga bahasa produk agar landing page, app UI, agent workflow, dan komunikasi marketing memakai istilah yang sama.

## Language

**AI Research and Writing App**:
Aplikasi untuk menulis, mengelola journal, berdiskusi dengan AI agent, dan menyusun hasil research berbasis evidence.
_Avoid_: Workspace, organization, assessment platform, quiz platform, lab assessment platform

**Academic Writer**:
Pengguna utama Aqsha yang sedang menulis karya akademik seperti proposal, skripsi, tesis, paper, atau research report.
_Avoid_: Generic writer, content creator, quiz maker

**Student-Friendly Academic Writing App**:
Arah pengalaman Aqsha yang academic-first, credible, dan evidence-aware, tetapi tetap mudah dipahami oleh mahasiswa yang sedang stuck menulis.
_Avoid_: Workspace, organization, library software, citation manager only, casual AI toy

**Student Researcher**:
Mahasiswa atau early-stage researcher yang perlu membaca sumber, menyusun argumen, dan menghasilkan tulisan akademik yang bisa dipertanggungjawabkan.
_Avoid_: Student participant, quiz taker, learner

**Primary Persona**:
Mahasiswa S1 akhir atau S2 yang sedang menyusun proposal, skripsi, tesis, atau literature review dan sudah memakai AI tetapi ragu dengan validitas sumber atau argumennya.
_Avoid_: All students, general productivity users

**Secondary Persona**:
Dosen pembimbing muda, research mentor, atau academic writing coach yang membantu mahasiswa membangun argumen dan memeriksa penggunaan evidence.
_Avoid_: School teacher, quiz administrator, generic manager

**Research-to-Writing Workflow**:
Alur dari mengumpulkan sumber, memahami evidence, menyusun claim, sampai menghasilkan draft akademik yang bisa direvisi.
_Avoid_: Generic chat workflow, note dumping, quiz generation

**Fragmented Research Stack**:
Kebiasaan pengguna berpindah antara search engine akademik, AI chat umum, paraphraser, dan editor dokumen untuk menyelesaikan satu tulisan akademik.
_Avoid_: Normal productivity workflow, single-tool workflow

**Responsible AI Use**:
Kondisi ketika pengguna dapat menjelaskan dan mempertanggungjawabkan bantuan AI yang masuk ke tulisan akademiknya.
_Avoid_: Blind AI writing, AI shortcut, asal pakai AI

**Responsible AI for Academic Writing**:
Education angle Aqsha yang mengajarkan cara memakai AI untuk menulis akademik tanpa mengorbankan evidence, citation accuracy, dan argument accountability.
_Avoid_: AI productivity tips, generic prompt hacks

**Academic Integrity Through Traceability**:
Cara Aqsha memposisikan integrity sebagai kemampuan melacak evidence di balik claim, bukan sekadar mengecek kemiripan teks.
_Avoid_: Plagiarism checker as main feature, Turnitin clone

**Argument Proof**:
Hubungan eksplisit antara claim dalam tulisan dan evidence yang mendukung claim tersebut.
_Avoid_: Unsupported claim, vague argument, citation afterthought

**Claim-Evidence Map**:
Representasi yang menghubungkan claim, evidence pendukung, sumber, kekuatan evidence, dan bagian draft yang memakai claim tersebut.
_Avoid_: Plain bibliography, source list only, citation dump

**Evidence Strength Label**:
Label kualitatif untuk menunjukkan kualitas dukungan evidence terhadap claim, seperti Strong evidence, Partial support, Needs stronger source, Citation mismatch, atau Unverified.
_Avoid_: Per-claim percentage score, fake precision

**Review Summary**:
Ringkasan agregat hasil pemeriksaan claim dan evidence, misalnya jumlah claim checked, strong, partial, atau unverified.
_Avoid_: Per-claim numeric score, proof score leaderboard

**Evidence-Aware AI**:
Bantuan AI yang memperlihatkan sumber, evidence, dan hubungan ke claim atau draft yang sedang dikerjakan.
_Avoid_: Generic AI assistant, black-box AI, citation-looking output

**Anti-Hallucination AI**:
Positioning phrase untuk AI research-writing workflow yang memverifikasi, menampilkan, dan membatasi claim berdasarkan evidence yang bisa dilacak.
_Avoid_: Zero-error AI, AI that is always correct, hallucination-proof guarantee

**Credible Academic Writing**:
Tulisan akademik yang argumen, struktur, dan rujukannya dapat diperiksa kembali oleh pembaca atau pembimbing.
_Avoid_: Fast AI writing, generic content generation

**Traceable Evidence**:
Evidence yang sumber, metadata, dan hubungannya ke claim dapat diperiksa kembali oleh pengguna.
_Avoid_: Citation decoration, unverified reference, hallucinated citation

**Research Trail**:
Jejak proses research yang menampilkan sumber yang dipakai, progress agent, evidence yang ditemukan, delegasi Research Sub-agent, dan alasan ringkas di balik hasil. Research Trail menampilkan compact audit/progress events, bukan full sub-agent transcript.
_Avoid_: Hidden AI thinking, black-box answer, raw chain-of-thought

**Audit Trail**:
Cara menjelaskan Research Trail sebagai catatan yang dapat diperiksa tentang sumber, evidence, claim lemah, dan citation verification.
_Avoid_: AI reasoning, exact AI thinking, raw chain-of-thought

**Whole-Draft Context**:
Konteks tulisan akademik lintas bagian atau bab yang dipakai agar bantuan AI tidak hanya menjawab dari potongan draft yang dikirim terakhir.
_Avoid_: Single-chapter context, pasted snippet only

**Journal**:
Dokumen kerja panjang milik pengguna yang dapat dibantu oleh AI untuk drafting, editing, dan revision.
_Avoid_: Quiz, lab, assignment

**Journal AI Panel**:
Panel AI di sisi kanan Journal yang muncul dari slash command atau aksi pada selection untuk membantu writing-in-context.
_Avoid_: Separate chatbot only, floating AI toy

**Selection Action**:
Aksi AI yang muncul setelah pengguna memilih text, paragraph, atau block, seperti paraphrase, expand, shorten, ask AI, atau explain.
_Avoid_: Auto rewrite, hidden transformation

**AI Suggestion**:
Hasil bantuan AI pada Journal yang muncul sebagai preview atau suggestion dan hanya masuk ke draft setelah pengguna memilih apply.
_Avoid_: Automatic overwrite, silent edit

**Claim-Changing Suggestion**:
AI Suggestion yang menambahkan, menghapus, atau mengubah claim akademik dalam draft.
_Avoid_: Treating all rewrites as style-only edits

**Research Thread**:
Halaman chat-style untuk focused research, tempat pengguna berdiskusi dengan AI agent di luar permukaan editor Journal.
_Avoid_: Journal editor, generic support chat

**Add to Journal**:
Tool yang memindahkan hasil Research Thread ke Journal melalui review step sebelum masuk ke draft.
_Avoid_: Direct paste into draft, hidden insertion

**Shared Journal**:
Journal yang dibagikan ke pengguna lain agar mereka dapat melakukan review atau edit sesuai akses yang diberikan.
_Avoid_: Generic team page, project board, classroom assignment

**Can review**:
Akses Shared Journal untuk membaca, memberi komentar atau saran, dan melihat evidence tanpa mengubah isi utama journal.
_Avoid_: Viewer, read-only collaborator

**Can edit**:
Akses Shared Journal untuk mengubah draft, menambahkan atau memperbaiki evidence, dan ikut menyusun tulisan.
_Avoid_: Admin, full owner

**Research Chat**:
Percakapan multi-turn milik pengguna dengan AI agent yang menyimpan messages, runs, dan progress events secara durable.
_Avoid_: Chatbot only, final-answer chat

**Deep Research Run**:
Proses research mendalam di dalam Research Chat yang berjalan dalam beberapa fase terstruktur untuk menghasilkan evidence ledger, research decision, visual artifact, dan final Markdown report berbasis sumber. V1 berjalan streaming-first melalui chat request aktif, sementara phase events tetap durable untuk reload dan audit.
_Avoid_: Separate public agent, generic chat answer, hidden autonomous research mode, automatic background resume as v1 promise

**Deep Research Phase**:
Checkpoint durable di dalam satu Deep Research Run untuk pekerjaan seperti scoping, source discovery and screening, evidence extraction, synthesis support, citation audit, delivery gate, rendering, upload, atau final assembly. Phase boleh dieksekusi oleh Astra langsung atau Research Sub-agent, tetapi hasilnya kembali ke parent sebagai compact summary, Ledger Source IDs, decision state, dan artifact references. Phase direkam sebagai progress/audit events di Research Trail, bukan sebagai objek user-facing terpisah.
_Avoid_: Public agent identity, separate Research Chat, full transcript handoff, separate phase record as product surface

**Research Sub-agent**:
Agen internal bernama/persona yang menerima delegasi tugas dari Astra untuk menjalankan satu atau beberapa Deep Research Phase dengan context window sendiri. Research Sub-agent boleh muncul di Research Trail sebagai aktivitas delegasi yang user-friendly, tetapi tidak menjadi agent utama yang dipilih atau diajak chat langsung oleh pengguna. V1 memakai fixed canonical set: Vektor, Prism, Quill, dan Sanctum.
_Avoid_: Separate public chat surface, user-selected agent, hidden delegation with no trail, generic unnamed worker when a persona improves clarity, dynamic persona invented per run

**Vektor**:
Research Sub-agent untuk source discovery dan source screening.
_Avoid_: Final synthesis owner, citation audit authority, user-selected agent

**Prism**:
Research Sub-agent untuk evidence extraction, claim mapping, dan contradiction mapping.
_Avoid_: Source search owner, final report owner, visual renderer

**Quill**:
Research Sub-agent untuk synthesis support dan report drafting support berdasarkan evidence yang sudah dikumpulkan.
_Avoid_: Unsupported prose generation, citation audit authority, direct final answer owner

**Sanctum**:
Research Sub-agent untuk citation audit, evidence validity gate, dan delivery safety checks.
_Avoid_: Source discovery owner, style rewriting owner, optional reviewer only, final user-facing answer owner

**Compact Phase Output**:
Output ringkas dari Deep Research Phase yang dikembalikan ke Astra dan disimpan di Research Trail. Output minimal berisi phase ID, phase name, persona, status, summary, Ledger Source IDs, claim IDs, artifact IDs, optional Research Decision recommendation, optional user confirmation flag, dan optional Failure Summary.
_Avoid_: Full sub-agent transcript in UI, raw tool log as parent context, prose-only handoff without stable IDs

**Evidence**:
Sumber atau artefak pendukung yang dipakai untuk memperkuat claim dalam jawaban atau tulisan.
_Avoid_: Reference decoration, citation filler

**Evidence Ledger**:
Catatan terstruktur dari Deep Research Run yang menyimpan sumber, claim, metric, verification status, dan hubungan evidence agar hasil research bisa diaudit.
_Avoid_: Final report, bibliography only, raw source dump

**Important Claim**:
Claim di final report yang menjadi dasar jawaban atau kesimpulan, termasuk factual, numeric, causal, comparative, legal, forecast, recommendation, kutipan langsung, tanggal, nama paper atau author, dan metric.
_Avoid_: Narrative transition, style framing, uncited key claim

**Visual Spec**:
Deklarasi visual artifact dari Deep Research Run yang menunjuk data terverifikasi di Evidence Ledger untuk kebutuhan renderer.
_Avoid_: New data source, generated plotting code, unsupported chart claim

**Artifact Manifest**:
Daftar artifact visual dari Deep Research Run yang boleh dirender, diaudit, dan ditampilkan di final Markdown report.
_Avoid_: Raw artifact inventory, private working files, all sandbox outputs

**Multi-visual Final Report**:
Final Markdown report yang dapat menampilkan lebih dari satu visual artifact, seperti chart, timeline, matrix, flow diagram, atau evidence map, selama setiap artifact lolos audit sendiri.
_Avoid_: Single-chart-only report, decorative visuals, embedding unaudited visuals

**Research Artifact Ownership**:
Kepemilikan artifact research oleh pengguna yang membuat Research Chat, dengan relasi audit ke thread, run, dan message terkait.
_Avoid_: Workspace ownership, organization ownership, file-only ownership

**Artifact Audit Snapshot**:
Snapshot ringkas pada artifact final yang menyimpan visual spec, status audit, ringkasan audit, dan source IDs yang dibutuhkan untuk replay dan audit.
_Avoid_: Pointer-only artifact, full evidence ledger copy, Markdown-only provenance

**Artifact Audit Status**:
Status audit artifact research: pending, passed, omitted, atau failed.
_Avoid_: Boolean audited flag, implicit artifact status

**Ledger Source ID**:
ID sumber seperti `S1` atau `S2` yang menjadi rujukan canonical di Evidence Ledger, Visual Spec, Artifact Manifest, dan final report.
_Avoid_: Database row ID as citation label, unstable source label

**Visual Omission**:
Keputusan untuk tidak menampilkan visual optional ketika data, render, atau upload tidak cukup aman, sambil tetap mengirim final report yang valid.
_Avoid_: Evidence audit failure, failed final report, silent broken chart

**Primary Visual Deliverable**:
Artifact visual yang secara eksplisit diminta pengguna sebagai hasil utama Deep Research Run. Jika render atau upload untuk artifact ini gagal, run gagal dengan Failure Summary singkat dan Research Failure Detail untuk development.
_Avoid_: Default visual artifact, optional chart, decorative report visual

**Omitted Visual Artifact**:
Artifact visual yang direncanakan tetapi tidak ditampilkan karena data, render, atau upload tidak cukup aman.
_Avoid_: Missing artifact, ignored artifact, successful artifact

**Research Failure Detail**:
Informasi kegagalan yang dikirim bersama run event atau explanation agar kegagalan audit, render, upload, dan omission bisa diperbaiki saat development.
_Avoid_: Silent failure, hidden internal error, generic failure only

**Research Error Class**:
Kategori stabil untuk kegagalan Deep Research Run atau Deep Research Phase: validation, sandbox, dependency, render, uploadthing, model_tool_misuse, canceled, atau unknown.
_Avoid_: Provider-specific exception name, raw stack trace, free-form error category

**Failure Summary**:
Ringkasan kegagalan yang aman ditampilkan kepada pengguna, terpisah dari detail internal untuk development.
_Avoid_: Raw stack trace as user copy, vague error message

**Artifact Publishing**:
Proses menerbitkan final visual artifact yang sudah lolos audit ke storage publik agar bisa di-embed di final Markdown report.
_Avoid_: Provider brand as domain term, raw file dump, automatic public upload for supporting files

**Orphan Published Artifact**:
File artifact yang sudah terbit ke public storage tetapi gagal dipersist sebagai artifact valid di Postgres. Sistem harus mencoba cleanup best-effort dan mencatat event bila cleanup gagal.
_Avoid_: Valid final artifact, silent storage leak, user-facing embed

**Default Visual Artifact**:
Visual artifact yang otomatis diupayakan untuk setiap final report Deep Research ketika Evidence Ledger memiliki data yang cukup.
_Avoid_: Opportunistic chart only, manual-only visual, unsupported visual

**Research Decision**:
Gate terstruktur di dalam Deep Research Run yang menentukan apakah research lanjut otomatis, perlu refinement, atau harus meminta user menyetujui pivot.
_Avoid_: Final answer, raw chain-of-thought, mandatory approval before every report

**Phase-aware Retry**:
Upaya menjalankan ulang Deep Research Phase yang gagal tanpa mengulang phase sebelumnya yang masih valid. V1 mendukung retry untuk render dan upload terlebih dahulu, memakai Evidence Ledger, Visual Spec, PNG checksum, dan Artifact Manifest yang sudah ada bila masih valid.
_Avoid_: Restart whole run, repeat source discovery by default, overwrite previous attempt

**Retry Attempt**:
Catatan percobaan ulang untuk visualId atau phase yang sama dengan attempt number baru, terhubung ke artifact atau phase asal agar audit trail tidak hilang.
_Avoid_: Mutating history in place, duplicate artifact with no lineage, hidden retry

**Automatic Retry Limit**:
Batas retry otomatis untuk kegagalan transient pada render atau upload. V1 hanya melakukan satu retry otomatis sebelum membutuhkan aksi eksplisit atau manual.
_Avoid_: Infinite retry, repeated source discovery, hidden retry loop

**Run Cancellation**:
Permintaan pengguna atau sistem untuk menghentikan Deep Research Run yang sedang berjalan. Cancellation harus dipropagasikan ke model stream, Research Sub-agent phase runner, Research Sandbox, renderer, dan upload client sejauh provider mendukung.
_Avoid_: UI-only stop, abandoned backend run, silent request abort

**Canceled Research Run**:
Deep Research Run yang selesai dengan status terminal canceled setelah cancellation berhasil diproses atau setelah sistem berhenti pada boundary yang aman.
_Avoid_: cancel_requested as final state, failed run caused by user stop, completed run after cancellation

**Derived Research Run**:
Deep Research Run baru yang dibuat dari konteks run sebelumnya setelah cancellation atau failure, tanpa menjanjikan resume otomatis di V1.
_Avoid_: Background resume, mutating canceled run, hidden continuation

**Failed Research Explanation**:
Pesan assistant yang menjelaskan kenapa Deep Research Run gagal audit tanpa menyajikannya sebagai final report.
_Avoid_: Failed final report, silent failed run, hidden audit failure

**Research Plan**:
Rencana terstruktur Deep Research Run setelah scope dipahami dan sebelum source discovery utama dimulai.
_Avoid_: Post-hoc plan, fixed outline before scoping, evidence ledger

**Source Library**:
Tempat menyimpan dan memakai ulang paper, PDF, link, citation, dan sumber lain yang menjadi fondasi evidence lintas Journal atau Research Thread.
_Avoid_: Zotero clone as headline, file dump, generic storage

**Source Input**:
Cara awal memasukkan sumber ke Source Library: PDF upload, URL atau DOI, dan manual citation.
_Avoid_: Promising Zotero/Mendeley import before supported

**Trusted Skill Script**:
Script repo-shipped di dalam `skills/**/scripts/*` dari registered skill root yang boleh dijalankan oleh Deep Research Run melalui allowlist atau manifest.
_Avoid_: Arbitrary path execution, user-uploaded code, model-generated code, free-form shell command

**Skill Script Manifest**:
Manifest per skill yang menjadi allowlist source of truth untuk **Trusted Skill Script** yang boleh dijalankan beserta runtime, arg limits, timeout, artifact outputs, dan policy eksekusinya.
_Avoid_: Global hardcoded script list, model-selected script path, implicit executable file discovery

**Bun Skill Script Runtime**:
Runtime tunggal untuk menjalankan **Trusted Skill Script** v1 di sandbox Deep Research dengan TypeScript atau JavaScript.
_Avoid_: Python host execution, mixed runtime by default, Go or Rust script toolchain

**Library-Rendered Visual Artifact**:
Visual artifact yang dibuat dari data dan visual spec terverifikasi memakai visualization library JavaScript, lalu dirender sebagai PNG final.
_Avoid_: Hand-written deterministic SVG generator, arbitrary generated plotting code, unsupported image

**Vega Visual Renderer**:
Default v1 renderer untuk **Library-Rendered Visual Artifact** yang mengubah visual spec deklaratif berbasis Vega-Lite atau Vega menjadi PNG final.
_Avoid_: Observable Plot default, Chart.js default, Mermaid default, one-off renderer per artifact

**Research Sandbox**:
Sandbox eksekusi terisolasi yang dibuat untuk satu **Deep Research Run** agar trusted script execution, artifact files, logs, dan cleanup tidak bercampur dengan run lain.
_Avoid_: Shared global sandbox, per-script sandbox by default, API host execution

**Research Sandbox Image**:
Prebuilt container image untuk **Research Sandbox** yang berisi **Bun Skill Script Runtime** dan dependency trusted script seperti Vega renderer.
_Avoid_: Installing dependencies during each research run, mutable ad-hoc sandbox setup, host dependency reliance

**Sandbox Image Reference**:
Immutable image reference, seperti `sha-<git-sha>`, yang disimpan pada run atau executor metadata untuk audit dan replay **Research Sandbox**.
_Avoid_: Production `latest` tag, untracked image drift, branch-only production reference

**Script Artifact Metadata**:
Metadata artifact yang dihasilkan **Trusted Skill Script**, seperti path, content type, byte size, checksum, role, dan status retrieval, tanpa memasukkan file bytes besar ke executor result JSON.
_Avoid_: Raw file bytes in executor JSON, untracked sandbox files, implicit artifact discovery

**Trusted Script Error Code**:
Kode error stabil dari trusted script execution yang membedakan unknown skill, unknown script, invalid script id, unsupported runtime, limit violation, timeout, sandbox failure, dependency failure, script failure, artifact failure, dan unknown failure.
_Avoid_: Free-form exception only, raw stack trace as contract, provider-specific error labels

**Offline Script Execution**:
Default policy **Trusted Skill Script** yang menjalankan audit atau render dari input files tanpa arbitrary outbound network access.
_Avoid_: Free network access by default, script-level web research, hidden dependency download

**Script Execution Event**:
Run event terstruktur yang mencatat start, completion, atau failure dari **Trusted Skill Script** beserta executor result, error code, sandbox image reference, dan artifact metadata yang relevan.
_Avoid_: Console-only execution log, unpersisted sandbox result, final answer only trace

**Local Script Executor**:
Development-only executor yang menjalankan **Trusted Skill Script** secara lokal dengan manifest, limits, output shape, dan error taxonomy yang sama dengan Daytona executor.
_Avoid_: Production local execution, test shortcut that bypasses policy, host execution by default

## Relationships

- Seorang **Academic Writer** dapat memiliki satu atau lebih **Journal**.
- Sebuah **Journal** dapat menjadi **Shared Journal** ketika pemilik membagikan akses review atau edit kepada pengguna lain.
- **Shared Journal** memakai dua permission awal: **Can review** dan **Can edit**.
- Sebuah **Research Chat** dimiliki langsung oleh pengguna yang membuat chat tersebut.
- Sebuah **Research Chat** dapat menghasilkan **Evidence** yang mendukung tulisan di **Journal**.
- Sebuah **Deep Research Run** menghasilkan **Evidence Ledger** sebagai dasar audit untuk source IDs, claims, visual metrics, dan artifact provenance.
- Setiap **Important Claim** di final report harus lolos citation/evidence audit; kegagalan audit pada claim seperti ini menggagalkan final delivery.
- Kegagalan audit **Important Claim** menghasilkan **Failed Research Explanation**, bukan final report yang tetap dikirim.
- Sebuah **Research Plan** dibuat setelah scope dipahami; reconnaissance ringan boleh terjadi sebelumnya, tetapi source discovery utama dimulai setelah plan ada.
- Sebuah **Visual Spec** hanya boleh menunjuk data yang sudah ada di **Evidence Ledger**; jika data visual belum tersedia, extraction harus diperbaiki sebelum visual dibuat.
- Sebuah **Artifact Manifest** berisi visual artifacts yang menjadi candidate atau final embed; raw/supporting files tidak otomatis masuk ke manifest ini.
- **Research Artifact Ownership** mengikuti pengguna pembuat **Research Chat**.
- Sebuah final visual artifact harus memiliki **Artifact Audit Snapshot**; snapshot ini tidak menggandakan seluruh **Evidence Ledger**.
- **Artifact Audit Snapshot** memakai **Ledger Source ID** sebagai source reference canonical dan boleh menyimpan persisted source refs tambahan untuk replay.
- **Multi-visual Final Report** boleh mengandung banyak final visual artifacts; setiap artifact final hanya boleh di-embed ketika **Artifact Audit Status** adalah `passed`.
- **Visual Spec** dan **Artifact Manifest** harus mendukung banyak visual/artifact dalam satu **Deep Research Run**.
- **Omitted Visual Artifact** tetap perlu muncul dalam audit/replay metadata tanpa dianggap final visual yang berhasil dikirim.
- **Omitted Visual Artifact** tidak disebut di final Markdown report; alasan omission hanya muncul di Research Trail, Artifact Manifest, audit metadata, dan developer detail.
- Sebuah **Deep Research Run** secara default mengupayakan **Default Visual Artifact** untuk final report jika data visual cukup.
- **Primary Visual Deliverable** yang gagal render atau upload menggagalkan **Deep Research Run**; **Default Visual Artifact** yang gagal boleh menjadi **Visual Omission** jika final report tetap valid.
- **Visual Omission** tidak menggagalkan **Deep Research Run** jika final report tetap valid dan visual bukan primary deliverable.
- **Visual Omission** dan hard failure harus menyimpan **Research Failure Detail** agar error dapat ditelusuri dan diperbaiki.
- **Research Failure Detail** harus dipasangkan dengan **Failure Summary** supaya error bisa dipahami user dan tetap berguna untuk development.
- Sebuah **Research Decision** boleh melanjutkan run otomatis untuk `proceed` atau scoped `refine`, tetapi harus meminta user saat `pivot` atau `userConfirmationRequired=true`.
- **Visual Spec** harus divalidasi sebelum **Research Sandbox** atau renderer dibuat; invalid spec menghasilkan **Research Error Class** `validation`.
- **Artifact Manifest** menjadi source of truth untuk visual yang boleh di-embed di final Markdown; URL ad hoc dari tool atau upload tidak cukup.
- **Artifact Publishing** hanya berlaku untuk final visual artifact yang lolos audit; raw dan supporting files tidak otomatis menjadi public artifact.
- Jika **Artifact Publishing** berhasil tetapi persist artifact gagal, sistem memperlakukan file sebagai **Orphan Published Artifact** dan mencoba cleanup best-effort.
- Artifact yang sudah persisted tetap valid sebagai history meskipun final stream delivery kemudian gagal.
- **Phase-aware Retry** boleh mengulang render atau upload tanpa mengulang source discovery ketika Evidence Ledger dan Visual Spec masih valid.
- **Retry Attempt** harus disimpan sebagai attempt baru yang terhubung ke artifact atau phase asal, bukan menimpa history.
- **Automatic Retry Limit** V1 adalah satu retry otomatis untuk kegagalan transient render atau upload.
- **Run Cancellation** memakai `cancel_requested` sebagai state transisi dan **Canceled Research Run** sebagai state terminal.
- **Run Cancellation** membersihkan temporary sandbox files, tetapi tidak diam-diam menghapus artifact audit record yang sudah persisted.
- **Canceled Research Run** tidak di-resume otomatis di V1; lanjutannya harus berupa **Derived Research Run** bila dibutuhkan.
- Event cancellation, retry, failed upload/render, omission, dan classified failure harus muncul ringkas di Research Trail dengan **Research Error Class** dan **Research Failure Detail** untuk development.
- **Journal AI Panel** membantu writing-in-context di dalam **Journal**.
- **Selection Action** memberi opsi seperti paraphrase, expand, shorten, ask AI, dan explain pada bagian draft yang dipilih.
- **Selection Action** menghasilkan **AI Suggestion** terlebih dahulu; perubahan tidak langsung mengganti isi Journal tanpa user apply.
- **Claim-Changing Suggestion** harus menyertakan evidence/citation atau ditandai belum verified; paraphrase dan shorten yang hanya mengubah gaya tidak wajib membawa evidence baru.
- **Research Thread** adalah permukaan focused research yang chat-style, terpisah dari **Journal**.
- **Deep Research Run** berlangsung di dalam **Research Chat** dan tetap muncul melalui **Astra** sebagai satu public agent surface.
- Sebuah **Deep Research Run** terdiri dari satu atau lebih **Deep Research Phase**.
- **Deep Research Phase** bukan public agent identity; pengguna tetap melihat Astra sebagai satu agent surface.
- Hasil **Deep Research Phase** harus cukup compact untuk parent context dan cukup durable untuk audit melalui run events, source IDs, decision state, dan artifact references.
- **Deep Research Phase** muncul dalam **Research Trail** melalui progress/audit events, bukan sebagai daftar objek phase terpisah yang harus dipahami pengguna.
- Astra boleh mendelegasikan **Deep Research Phase** ke **Research Sub-agent**.
- **Research Sub-agent** boleh terlihat di **Research Trail** sebagai named persona untuk membuat delegasi lebih mudah dipahami, tetapi pengguna tetap berinteraksi dengan Astra sebagai agent utama.
- V1 **Research Sub-agent** memakai fixed canonical set: **Vektor** untuk source discovery/screening, **Prism** untuk evidence extraction/contradiction mapping, **Quill** untuk synthesis/report drafting support, dan **Sanctum** untuk citation audit/validity gate.
- Astra tetap bertanggung jawab atas user-facing response; **Research Sub-agent** memberi delegated output, bukan final answer langsung ke pengguna.
- **Research Sub-agent** boleh merekomendasikan **Research Decision**, tetapi Astra yang meng-commit decision final di user-facing flow.
- **Sanctum** memiliki blocking authority untuk hard audit failure; ketika **Important Claim** gagal audit, Astra harus menyampaikan **Failed Research Explanation** alih-alih final report.
- Setiap **Deep Research Phase** yang selesai, gagal, atau blocked harus menghasilkan **Compact Phase Output**.
- Astra memakai **Compact Phase Output** sebagai parent-context handoff; full sub-agent transcript tidak ditampilkan di UI v1 dan tidak otomatis dimasukkan kembali ke parent context.
- **Research Trail** untuk **Research Sub-agent** menampilkan compact progress/audit events seperti delegation, screened source counts, kept/rejected sources, extracted claim counts, blocked claims, and failure summaries.
- V1 **Deep Research Run** berjalan streaming-first: jika stream aktif pengguna melihat progress, dan jika stream putus phase events yang sudah persisted tetap dapat dilihat setelah reload.
- V1 **Deep Research Run** belum menjanjikan automatic background resume dari phase terakhir setelah client disconnect.
- Minimal issue #21 path memiliki lima **Deep Research Phase** wajib: scoping oleh Astra, source discovery and screening oleh **Vektor**, evidence extraction oleh **Prism**, synthesis support oleh **Quill**, dan citation audit plus delivery gate oleh **Sanctum**.
- Rendering visual penuh, UploadThing artifact pipeline lanjutan, automatic background resume, retry per phase, dan visual planning persona terpisah bukan bagian wajib minimal issue #21 path.
- Minimal issue #21 path berjalan linear; parallel phase execution bukan bagian v1.
- Ketika **Sanctum** block delivery, Astra mengirim **Failed Research Explanation** yang menjelaskan claim yang gagal, evidence yang lemah, dan next step `REFINE` atau `PIVOT`.
- **Quill** tidak menulis final report langsung ke pengguna; Quill memberi synthesis/report drafting support, lalu Astra menyusun final user-facing answer berdasarkan delegated output dan **Sanctum** decision.
- **Add to Journal** menghubungkan **Research Thread** ke **Journal** melalui review step.
- **Source Library** adalah fondasi untuk evidence lintas **Journal** dan **Research Thread**, tetapi value utama yang terlihat tetap **Claim-Evidence Map**.
- **Source Input** awal adalah PDF upload, URL atau DOI, dan manual citation; Zotero/Mendeley import dapat menjadi roadmap tetapi bukan janji awal.
- **Trusted Skill Script** hanya boleh dijalankan sebagai bagian dari **Deep Research Run** ketika script berasal dari registered skill root dan lolos allowlist atau manifest.
- **Skill Script Manifest** mendeklarasikan **Trusted Skill Script** yang tersedia untuk satu skill; file script yang tidak tercantum di manifest tidak boleh dieksekusi.
- **Bun Skill Script Runtime** adalah satu-satunya runtime v1 untuk **Trusted Skill Script**.
- **Library-Rendered Visual Artifact** dibuat oleh **Trusted Skill Script** melalui **Bun Skill Script Runtime**, bukan dengan menjalankan kode plotting arbitrer dari model.
- **Library-Rendered Visual Artifact** tetap harus memakai data dari **Evidence Ledger** dan source references dari **Visual Spec**.
- **Vega Visual Renderer** adalah default v1 untuk membuat **Library-Rendered Visual Artifact** dari visual spec deklaratif.
- Satu **Deep Research Run** memiliki satu **Research Sandbox** v1.
- **Research Sandbox** menjalankan **Trusted Skill Script** melalui **Bun Skill Script Runtime** dan tidak menjadi source of truth durable.
- **Research Sandbox** dibuat dari **Research Sandbox Image** yang dipublish dari repo ke container registry.
- **Research Sandbox Image** harus dibangun ulang lewat CI ketika trusted script dependencies berubah.
- Setiap **Research Sandbox** harus menyimpan **Sandbox Image Reference** di executor result atau run metadata.
- Production **Sandbox Image Reference** harus immutable agar **Deep Research Run** bisa diaudit atau direplay dengan image yang sama.
- **Trusted Skill Script** menulis output file ke **Research Sandbox**, lalu executor mengembalikan **Script Artifact Metadata** sesuai output yang dideklarasikan di **Skill Script Manifest**.
- API layer memakai **Script Artifact Metadata** untuk mengambil file dari sandbox dan memutuskan upload atau persistence berikutnya.
- **Trusted Skill Script** failure harus diklasifikasikan dengan **Trusted Script Error Code**.
- **Trusted Skill Script** memakai **Offline Script Execution** secara default; network hanya boleh aktif melalui policy eksplisit.
- Setiap trusted script start, completion, atau failure harus menghasilkan **Script Execution Event** yang terkait dengan **Deep Research Run**.
- **Local Script Executor** hanya boleh dipakai untuk tests atau development dan tetap mengikuti **Skill Script Manifest**.
- **AI Research and Writing App** adalah kategori produk Aqsha; assessment atau quiz bukan kategori utama.
- **Academic Writer** dan **Student Researcher** adalah audience utama untuk positioning awal Aqsha.
- **Primary Persona** adalah mahasiswa S1 akhir atau S2 yang sedang menyusun proposal, skripsi, tesis, atau literature review.
- **Secondary Persona** adalah dosen pembimbing muda, research mentor, atau academic writing coach.
- Aqsha harus terasa seperti **Student-Friendly Academic Writing App**: serius soal evidence, tetapi tidak kaku seperti software perpustakaan.
- Education/content angle utama Aqsha adalah **Responsible AI for Academic Writing**.
- Integrity positioning Aqsha adalah **Academic Integrity Through Traceability**, bukan plagiarism checker.
- **Research-to-Writing Workflow** adalah use case utama awal Aqsha.
- **Traceable Evidence**, **Research Trail**, dan **Whole-Draft Context** adalah pembeda utama Aqsha dari AI chat umum.
- **Research Trail** harus diposisikan sebagai **Audit Trail**, bukan sebagai raw AI reasoning.
- Positioning utama Aqsha adalah membantu **Academic Writer** mengubah research lintas sumber menjadi **Credible Academic Writing** melalui **Traceable Evidence**, **Research Trail**, dan **Whole-Draft Context**.
- Competitive frame utama Aqsha adalah menggantikan **Fragmented Research Stack**, bukan hanya menggantikan notes app, editor dokumen, atau AI chat umum.
- Emotional core Aqsha adalah membantu pengguna menghindari kesan asal pakai AI, mengurangi kelelahan dari **Fragmented Research Stack**, dan membangun **Argument Proof** yang bisa dipertanggungjawabkan.
- Janji utama Aqsha harus progresif: membantu pengguna membangun tulisan akademik yang lebih kuat dengan **Evidence-Aware AI**. Risk reduction dipakai sebagai proof, bukan sebagai gaya utama brand.
- **Anti-Hallucination AI** boleh dipakai sebagai positioning phrase Aqsha selama dijelaskan sebagai workflow verifikasi evidence, bukan janji AI bebas salah.
- Proof mechanism utama untuk **Anti-Hallucination AI** adalah **Claim-Evidence Map**, bukan sekadar daftar referensi.
- Evidence quality tampil sebagai **Evidence Strength Label** di claim/source detail dan sebagai angka agregat hanya di **Review Summary**, bukan sebagai percentage score per claim.
- Collaboration Aqsha berarti **Shared Journal** untuk review dan edit akademik, bukan generic team productivity.

## Flagged ambiguities

- "Workspace" pernah dipakai sebagai kategori pengalaman produk dan container organisasi. Resolved: jangan gunakan workspace atau organization sebagai bahasa produk, UI, atau domain; gunakan ownership pengguna untuk **Journal**, **Research Chat**, dan artifact terkait.
- "Aqsha" pernah dipakai untuk menyebut platform assessment berbasis quiz di marketing site, tetapi kategori produk yang dipilih adalah **AI Research and Writing App**.
- "Trusted script" dapat berarti script repo-shipped atau path bebas yang diminta model. Resolved: gunakan **Trusted Skill Script** untuk script di `skills/**/scripts/*` dari registered skill root yang dipanggil lewat allowlist atau manifest.
- "Allowlist" dapat berarti daftar global di kode atau manifest milik skill. Resolved: gunakan **Skill Script Manifest** per skill sebagai allowlist source of truth.
- "Script runtime" dapat berarti Python, Bun, Node, atau banyak runtime sekaligus. Resolved: gunakan **Bun Skill Script Runtime** sebagai runtime tunggal v1 untuk trusted skill execution.
- "Visual renderer" dapat berarti manual SVG generator atau library visualization. Resolved: gunakan **Library-Rendered Visual Artifact** untuk visual final berbasis visualization library JavaScript.
- "Visualization library" dapat berarti Vega, Observable Plot, Chart.js, atau Mermaid. Resolved: gunakan **Vega Visual Renderer** sebagai default v1.
- "Sandbox scope" dapat berarti per script, per run, atau shared global. Resolved: gunakan **Research Sandbox** per **Deep Research Run** untuk v1.
- "Sandbox dependencies" dapat berarti install per run atau image prebuilt. Resolved: gunakan **Research Sandbox Image** yang dibangun CI dan dipublish ke registry.
- "Sandbox image tag" dapat berarti branch tag, latest, atau immutable SHA. Resolved: gunakan **Sandbox Image Reference** immutable untuk production dan audit.
- "Script output" dapat berarti stdout, JSON result, atau file artifact. Resolved: file artifact besar direpresentasikan sebagai **Script Artifact Metadata**, bukan bytes langsung di executor JSON.
- "Script error" dapat berarti thrown exception bebas atau contract stabil. Resolved: gunakan **Trusted Script Error Code** sebagai contract.
- "Sandbox network" dapat berarti bebas akses internet atau offline by default. Resolved: gunakan **Offline Script Execution** kecuali manifest/config mengizinkan network.
- "Local executor" dapat berarti production fallback atau dev/test backend. Resolved: gunakan **Local Script Executor** hanya untuk development dan tests.
- "Issue #20" dapat melebar ke full visual pipeline atau full Deep Research orchestration. Resolved: scope issue #20 adalah executor foundation; full **Vega Visual Renderer** pipeline dan full Deep Research orchestration dikerjakan pada issue terpisah.
- "Phase" dalam Deep Research dapat berarti UI step, internal agent, atau job terpisah. Resolved: gunakan **Deep Research Phase** sebagai checkpoint durable di dalam satu **Deep Research Run**, bukan public agent identity atau Research Chat baru.
- "Phase persistence" dapat berarti dedicated phase object atau durable progress events. Resolved: v1 merekam **Deep Research Phase** melalui progress/audit events di **Research Trail**, bukan sebagai objek user-facing terpisah.
- "Sub-agent" dapat berarti agent publik baru, worker internal generik, atau named persona. Resolved: gunakan **Research Sub-agent** sebagai named persona untuk delegasi internal yang boleh muncul di **Research Trail**, tetapi bukan agent utama yang dipilih atau diajak chat langsung oleh pengguna.
- "Sub-agent persona" dapat berarti daftar tetap atau nama dinamis per run. Resolved: v1 memakai fixed canonical set **Vektor**, **Prism**, **Quill**, dan **Sanctum** agar Research Trail, audit, dan tests tetap stabil.
- "Research decision authority" dapat berarti setiap sub-agent boleh memutuskan sendiri atau Astra menjadi control plane. Resolved: **Research Sub-agent** memberi recommendation, Astra meng-commit **Research Decision**, dan **Sanctum** boleh block final delivery ketika audit gagal.
- "Compact output" dapat berarti summary bebas atau contract minimal. Resolved: gunakan **Compact Phase Output** dengan stable IDs, status, summary, persona, optional recommendation, dan failure summary agar Astra tidak perlu membaca ulang full sub-agent transcript.
- "Sub-agent visibility" dapat berarti full transcript, hidden execution, atau compact Research Trail. Resolved: UI v1 menampilkan compact **Research Trail** untuk delegasi dan audit, bukan full sub-agent transcript, raw chain-of-thought, prompt detail, atau verbose tool logs.
- "Long-running run" dapat berarti streaming request aktif atau background resumable job. Resolved: issue #21 v1 memakai streaming-first **Deep Research Run** dengan durable phase events, belum automatic background resume.
- "Minimal phased path" dapat melebar ke semua Deep Research orchestration. Resolved: issue #21 v1 wajib hanya scoping, source discovery/screening, evidence extraction, synthesis support, dan citation audit/delivery gate.
- "Phase execution order" dapat berarti linear atau parallel. Resolved: issue #21 v1 berjalan linear; parallel execution ditunda sampai event contract dan Compact Phase Output stabil.
- "Quill output" dapat berarti final report langsung atau drafting support. Resolved: **Quill** hanya memberi synthesis/report drafting support; Astra tetap menyusun final user-facing answer.

## Example dialogue

> **Dev:** "Apakah landing page Aqsha harus menjual quiz generator untuk guru?"
> **Domain expert:** "Tidak. Aqsha harus diposisikan sebagai **AI Research and Writing App** untuk journal, writing, research chat, dan evidence-aware AI assistance."
>
> **Dev:** "Apakah copy Aqsha harus bicara ke semua knowledge worker?"
> **Domain expert:** "Belum. Positioning awal harus bicara langsung ke **Academic Writer** dan **Student Researcher** yang butuh research-to-writing workflow."
>
> **Dev:** "Apakah fitur utama yang harus dijual adalah AI chat?"
> **Domain expert:** "Bukan sebagai fitur standalone. AI chat harus dijelaskan sebagai bagian dari **Research-to-Writing Workflow**: dari sumber yang berantakan menuju draft akademik yang credible."
>
> **Dev:** "Apakah kita boleh bilang Aqsha menampilkan cara berpikir AI?"
> **Domain expert:** "Istilah yang lebih tepat adalah **Research Trail**: Aqsha menampilkan sumber, evidence, progress, dan alasan ringkas yang bisa diaudit, bukan raw chain-of-thought."
>
> **Dev:** "Kenapa editor Aqsha perlu tahu keseluruhan draft?"
> **Domain expert:** "Karena tulisan ilmiah harus konsisten lintas bab. Bantuan AI yang hanya membaca satu potongan draft berisiko memberi saran yang tidak nyambung dengan **Whole-Draft Context**."
>
> **Dev:** "Apa janji utama Aqsha?"
> **Domain expert:** "Aqsha membantu pengguna bergerak dari research yang tersebar menuju **Credible Academic Writing** dengan evidence yang bisa dilacak dan konteks draft yang utuh."
>
> **Dev:** "Kompetitor Aqsha itu Google Docs atau ChatGPT?"
> **Domain expert:** "Bukan satu tool saja. Aqsha menggantikan **Fragmented Research Stack**: Google Scholar, Consensus, Scite, AI chat umum, paraphraser, dan editor dokumen yang dipakai terpisah."
>
> **Dev:** "Apakah Aqsha harus terasa seperti software akademik yang formal?"
> **Domain expert:** "Tidak sepenuhnya. Aqsha harus menjadi **Student-Friendly Academic Writing App**: credible dan evidence-aware, tetapi tetap mudah didekati untuk mahasiswa."
>
> **Dev:** "Ketakutan apa yang harus disentuh landing page?"
> **Domain expert:** "Takut terlihat asal pakai AI, lelah berpindah tool, dan bingung membuktikan argumen. Aqsha harus menjawab itu lewat **Responsible AI Use** dan **Argument Proof**."
>
> **Dev:** "Apakah copy Aqsha harus menakut-nakuti soal sitasi palsu?"
> **Domain expert:** "Tidak. Fear itu insight, bukan tone utama. Aqsha harus terdengar progresif: membangun tulisan akademik lebih kuat dengan **Evidence-Aware AI**."
>
> **Dev:** "Bolehkah Aqsha memakai istilah anti-halusinasi?"
> **Domain expert:** "Boleh sebagai **Anti-Hallucination AI**, asalkan maknanya operasional: memverifikasi, menampilkan, dan membatasi claim berdasarkan evidence yang bisa dilacak, bukan menjanjikan AI selalu benar."
>
> **Dev:** "Bagaimana Aqsha membuktikan klaim anti-halusinasi?"
> **Domain expert:** "Dengan **Claim-Evidence Map**: setiap claim penting harus terhubung ke evidence, sumber, kekuatan evidence, dan bagian draft yang memakainya."
>
> **Dev:** "Apakah setiap claim perlu angka confidence?"
> **Domain expert:** "Tidak. Detail claim memakai **Evidence Strength Label**. Angka hanya boleh muncul sebagai agregat di **Review Summary**, misalnya 12 claims checked, 8 strong, 3 partial, 1 unverified."
>
> **Dev:** "Apakah Aqsha collaboration seperti Notion team space?"
> **Domain expert:** "Tidak. Collaboration utama Aqsha adalah **Shared Journal**: mahasiswa membagikan journal agar pembimbing atau collaborator bisa review dan edit tulisan akademik."
>
> **Dev:** "Role sharing apa yang perlu muncul di UI awal?"
> **Domain expert:** "Gunakan dua permission yang jelas: **Can review** untuk komentar/saran dan **Can edit** untuk ikut mengubah draft atau evidence."
>
> **Dev:** "Di mana pengguna berinteraksi dengan AI?"
> **Domain expert:** "Ada dua permukaan: **Journal AI Panel** untuk writing-in-context melalui slash command atau **Selection Action**, dan **Research Thread** untuk focused research dengan UI chat-style."
>
> **Dev:** "Apakah paraphrase atau expand langsung mengganti teks?"
> **Domain expert:** "Tidak. **Selection Action** menghasilkan **AI Suggestion** dulu, lalu pengguna memilih apply jika hasilnya sesuai."
>
> **Dev:** "Apakah semua AI Suggestion perlu citation?"
> **Domain expert:** "Tidak. Paraphrase atau shorten yang hanya mengubah bahasa tidak perlu evidence baru. Tetapi **Claim-Changing Suggestion** harus membawa evidence/citation atau ditandai belum verified."
>
> **Dev:** "Bagaimana hasil Research Thread masuk ke Journal?"
> **Domain expert:** "Gunakan **Add to Journal**. Hasil research masuk melalui review step, bukan langsung ditempel ke draft tanpa kontrol."
>
> **Dev:** "Apakah Astra boleh menjalankan script yang diminta model selama Deep Research?"
> **Domain expert:** "Tidak. Astra hanya boleh menjalankan **Trusted Skill Script** dari registered skill root yang lolos allowlist atau manifest."
>
> **Dev:** "Kalau ada file baru di folder scripts, apakah otomatis executable?"
> **Domain expert:** "Tidak. File itu baru boleh dieksekusi kalau dideklarasikan di **Skill Script Manifest**."
>
> **Dev:** "Runtime apa yang dipakai untuk trusted script di sandbox?"
> **Domain expert:** "Gunakan **Bun Skill Script Runtime** sebagai runtime tunggal v1 agar execution, dependency, dan testing tetap sederhana."
>
> **Dev:** "Apakah chart Deep Research dibuat dengan SVG manual?"
> **Domain expert:** "Tidak. Final chart harus menjadi **Library-Rendered Visual Artifact** dari data dan visual spec yang sudah diverifikasi."
>
> **Dev:** "Library visual apa yang menjadi default untuk v1?"
> **Domain expert:** "Gunakan **Vega Visual Renderer** agar visual spec deklaratif bisa divalidasi, dirender, disimpan, dan diaudit ulang."
>
> **Dev:** "Apakah setiap script call membuat sandbox baru?"
> **Domain expert:** "Tidak. Satu **Deep Research Run** memakai satu **Research Sandbox** agar artifact files dan logs tetap berada dalam konteks run yang sama."
>
> **Dev:** "Apakah sandbox menjalankan bun install setiap run?"
> **Domain expert:** "Tidak. Dependency trusted script harus sudah ada di **Research Sandbox Image** yang dipublish dari CI."
>
> **Dev:** "Bolehkah production menunjuk image tag latest?"
> **Domain expert:** "Tidak. Simpan **Sandbox Image Reference** immutable agar run bisa diaudit dan direplay."
>
> **Dev:** "Apakah PNG hasil renderer dikembalikan langsung di JSON executor?"
> **Domain expert:** "Tidak. Executor mengembalikan **Script Artifact Metadata**; API layer mengambil file dari sandbox dan menangani upload/persistence."
>
> **Dev:** "Apakah script renderer boleh melakukan web request untuk melengkapi data?"
> **Domain expert:** "Default-nya tidak. Gunakan **Offline Script Execution**; data harus berasal dari input yang sudah disiapkan oleh Deep Research."
>
> **Dev:** "Bagaimana UI dan developer tahu script mana yang gagal?"
> **Domain expert:** "Gunakan **Script Execution Event** dengan **Trusted Script Error Code**, bukan hanya pesan exception bebas."
>
> **Dev:** "Apakah executor lokal boleh dipakai production kalau Daytona bermasalah?"
> **Domain expert:** "Tidak. **Local Script Executor** hanya untuk development dan tests."

## Messaging directions

- Hero problem-led direction: "AI gave you an answer. Now prove it."
- Supporting message: Aqsha helps student researchers turn scattered sources into evidence-backed academic writing with **Anti-Hallucination AI**, **Claim-Evidence Map**, and **Whole-Draft Context**.
- Initial landing-page message order: hero problem, **Claim-Evidence Map**, **Research Trail**, **Whole-Draft Context**, then **Shared Journal** for review/edit.

## Competitive frame

- Direct benchmark: Jenni AI, because it is closest to Aqsha in academic writing, AI editor, citation management, source library, collaboration, and student/academic positioning.
- Adjacent UX/category reference: OpenNote, because it is closer to AI learning/notebook tools and student-friendly connected notes, but less direct on academic writing accountability.
- Indirect alternatives: ChatGPT, Claude, Gemini, Google Scholar, Consensus, Scite, Zotero/Mendeley, Grammarly, and QuillBot.
- Aqsha must not look like "Jenni but another editor"; differentiation should focus on **Anti-Hallucination AI**, **Claim-Evidence Map**, **Research Trail**, and **Whole-Draft Context**.
- Main wedge against Jenni: claim-level proof. Jenni helps users write with citations; Aqsha helps users prove which claims their citations actually support.

## Brand personality

- Calm: membantu pengguna merasa terarah saat research dan writing terasa berantakan.
- Rigorous: serius soal evidence, claim, citation, dan konteks draft.
- Guiding: membimbing pengguna memahami langkah berikutnya tanpa terasa menggurui.
- Quietly confident: percaya diri tanpa berlebihan, hype, atau klaim AI magic.
- Microcopy principle: firm on evidence, gentle to the writer.

_Avoid_: playful AI toy, neon AI magic, enterprise stiffness, fear-based scare copy.

## Language strategy

- Use English-first for core positioning and product terms: claim, evidence, citation, research trail, anti-hallucination AI, whole-draft context.
- Use Indonesian-friendly supporting copy when explaining value to Indonesian student researchers.
- Keep technical/domain labels stable in English across app UI, landing page, and marketing assets.
- Use Bahasa Indonesia for onboarding guidance, helper text, educational explanations, and local campaign copy when clarity matters.

_Avoid_: fully translating domain terms in ways that weaken precision, mixing languages inside one sentence without purpose.

## Visual identity direction

- Core direction: scholarly writing surface + evidence graph.
- Base feel: paper-like neutral, clean academic writing app, document-first.
- Accent feel: deep teal or scholarly green for trust and verification; muted blue for research/navigation.
- Visual motifs: source trails, claim-evidence connections, maps, structured reading/writing surfaces.
- UI feel: calm, readable, structured, audit-friendly.
- Hero product experience: show draft editor + **Claim-Evidence Map** + **Research Trail** together, so Aqsha does not look like a generic chatbot or document editor.

_Avoid_: Notion clone, purple-blue AI gradients, excessive sparkles, mascot-heavy brand, overly beige productivity aesthetic, dark enterprise dashboard.
