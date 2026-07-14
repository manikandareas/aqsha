# Phase 5 decision record — onboarding & settings (account lifecycle)

> Bagian dari **Phase 5** (§10 [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md)).
> Tanggal: 2026-07-14. Melanjutkan [`apps-svelte-phase4-decision-record.md`](apps-svelte-phase4-decision-record.md).
> Bahasa Indonesia; nama package/API/simbol tetap English (AGENTS.md).

Surface PRODUK ber-auth di dalam app shell: onboarding state machine + 7 route settings + billing +
Clerk security (password/2FA/reverification/sessions) + provider integrations + delete/sign-out.
**Bukan** thread/chat (Phase 6/7) atau explore/workspace (Phase 8/9).
Ledger: [`apps-svelte-parity-ledger.md`](apps-svelte-parity-ledger.md) ONB-1/2, SET-1..8 = **done**.

---

## 1. Struktur yang dibangun (§5.1)

| Area | File | Catatan |
|---|---|---|
| Onboarding pure | `src/lib/features/onboarding/lib/{onboarding-options,onboarding-machine}.ts` (+ `.spec`) | Data + step machine (pure, framework-agnostik, contract-tested). |
| Onboarding state | `.../onboarding/state.svelte.ts` | `createOnboardingFlow()` runes `$state` + `createMutation`. |
| Onboarding UI | `.../onboarding/{OnboardingPage,components/*}.svelte` (Layout/StepIndicator/SelectableOption/InterestChip/StepHeading/Welcome/Background/Interests/Source/Finish) | Motion `{#key}`+fly. |
| Onboarding route | `src/routes/onboarding/+page.svelte` | Ganti stub Phase 3. |
| Settings lib | `src/lib/features/settings/lib/{types,integrations,settings-menu,billing-derived,format}.ts` (+ `settings.spec.ts`) | Mirror pure-data + selektor (§4.1, no services import). |
| Settings API | `.../settings/api.ts` | Hooks `create*` (query/mutation), padanan web `features/settings/api.ts`. |
| Settings shell | `.../settings/components/{SettingsShell,SettingsRail,SettingsHeader,settings-card(+8 panel),CreditMeter,UsageChart}.svelte` | SettingsRail `variant="flush"`. |
| Settings pages | `.../settings/pages/{Overview,Account,Appearance,Personalization,UsageBilling,Integrations,Security,ProviderCard,ApiKeyConnectDialog,PreferenceSelect}.svelte` | 1:1 web. |
| Security | `.../settings/security/{PasswordPanel,ActiveDevicesPanel,TwoFactorPanel}.svelte`, `clerk-error.ts` | Clerk frontend SDK. |
| Settings routes | `src/routes/app/settings/{+layout.svelte,+page.server.ts,<7 section>/+page.svelte}` | Shell + redirect + 7 section. |
| Auth seam (+) | `src/lib/auth/{reverification.ts, context.svelte.ts (+getClerkUser/getReverification/getSignOut)}` | Reverification + user + signOut. |
| Shared | `src/lib/components/ConfirmDialog.svelte` | Port `components/confirm-dialog.tsx`. |
| Routing | `src/routes/app/(product)/**` (moved), `eslint.config.js` (+settings override) | Group `(product)` (§7). |

## 2. Keputusan terkunci

1. **Routing: introduce `(product)` group agar settings punya shell sendiri (§7).** Web punya
   `app/app/layout.tsx` (gate saja) → `(product)/layout.tsx` (AppShell) + `settings/layout.tsx`
   (SettingsShell terpisah). Phase 3 sementara menaruh AppShell di `routes/app/+layout.svelte` (belum
   ada settings). Phase 5 memenuhi §7: AppShell + stub produk (`+page`/`explore`/`threads`) dipindah ke
   `routes/app/(product)/`, `routes/app/settings/+layout.svelte` = SettingsShell (di bawah root layout,
   TIDAK mewarisi AppShell). Gate auth/onboarding tetap di `hooks.server.ts` (FND-8) — berlaku semua
   `/app` apa pun grup. Param-route resolve di `(product)/+page.svelte` di-update ke id ber-prefix grup
   (`/app/(product)/threads/[threadId]`); route statis (`/app`,`/app/explore`) tetap via pathname
   overload. Phase 6/7/8 melanjutkan di `(product)`.

2. **Onboarding: FEATURE version yang di-port, bukan `onboarding-wizard.tsx`.** Web punya DUA impl:
   `app/onboarding/onboarding-wizard.tsx`+`options.ts` (**dead code**, hanya di-refer diri sendiri) dan
   `features/onboarding/**` (yang di-wire `app/onboarding/page.tsx`). Diaudit dgn `rg` → port yang wired.
   Pure step machine diekstrak lebih dulu (§3.6): `onboarding-machine.ts` (STEPS, QUESTION_STEPS,
   BACK_TARGET, ADVANCE_TARGET, PRIMARY/STEP_LABEL, isStepValid, buildCompletePayload) + contract test,
   SEBELUM UI. Completion → **`/app/explore`** (mirror web `HOME_AFTER_ONBOARDING`, BUKAN `/app` seperti
   ringkasan tugas — code > plan). Server gate FND-8 + client overlay SHL-9 TIDAK diduplikasi; flow
   `onSuccess` set cache `onboarding.status={completed:true}` agar overlay tak memantul step finish.

3. **Form: TanStack mutation (default §2), BUKAN sveltekit-superforms.** Semua form settings + onboarding
   memakai `createMutation`/`createQuery` (satu sumber kebenaran; API contract + toast + error
   normalization sudah hidup di layer itu). superforms SPA-mode dievaluasi untuk onboarding multi-step
   tapi TIDAK dipakai: state machine cukup runes `$state` + pure validator (`isStepValid`), dan menambah
   superforms akan menggandakan sumber mutation (dilarang §2). Draft-null-shows-server pattern
   (account/personalization) = runes `$derived`, timing/error-copy identik web.

4. **Clerk security seam (svelte-clerk TAK punya `useReverification`/`useUser`).** `svelte-clerk@1.1.10`
   hanya ekspor `useClerkContext()`. Ditambah ke `$lib/auth`:
   - `getClerkUser()` → reaktif `{isLoaded, user}` (padanan web `useUser`; `user`=clerk-js `UserResource`
     dgn `passwordEnabled`/`totpEnabled`/`updatePassword`/`createTOTP`/…).
   - `runWithReverification(clerk, op)` (pure, `reverification.ts`) = port `@clerk/shared`
     `createReverificationHandler`: jalankan op → jika sinyal reverification → buka modal Clerk built-in
     via `clerk.__internal_openReverification({afterVerification,afterVerificationCancelled})` (metode
     internal yg SAMA di-wire React `useReverification` sebagai `openUIComponent`) → tunggu → retry sekali.
     `getReverification()` (runes) menangkap ctx di init, baca `ctx.clerk` FRESH tiap call.
   - `getSignOut()` = signOut stabil (tangkap ctx di init, baca clerk fresh) → aman dipanggil dari event
     handler. **Bonus fix:** `NavUser.svelte` sebelumnya panggil `getClerk()?.signOut()` DI DALAM handler
     — `useClerkContext()`→`getContext()` hanya boleh init → latent bug; diganti `getSignOut()` (capture-at-init).

5. **2FA panel di-port PENUH tapi COMMENTED OUT di SecurityPage = parity web.** Web `security-page.tsx`
   me-comment `TwoFactorPanel` (import + usage) → live web hanya Password + ActiveDevices. Svelte meniru
   PERSIS: `TwoFactorPanel.svelte` ada lengkap (TOTP enroll frontend SDK — Clerk Backend tak punya
   generate-secret+verify — QR `@svelte-put/qr@2.1.3`, verify, backup codes, disable, semua di-`reverify`)
   tapi import+markup di SecurityPage di-comment. Konsekuensi: `@svelte-put/qr` TIDAK masuk client bundle
   (panel tak di-mount → tree-shaken; sama seperti `qrcode.react` web). SET-6 terpenuhi (panel jadi, QR
   spike, reverification) sambil parity live. Mengaktifkan = uncomment di KEDUA app (perubahan 2-app,
   bukan divergensi senyap). E2E password/2FA = OWNER (Clerk test-instance).

6. **QR = `@svelte-put/qr@2.1.3` (pin exact), API SVG component.** `import QR from '@svelte-put/qr/svg/QR.svelte'`
   → `<QR data={totp.uri} width={160} height={160} />` (padanan web `<QRCodeSVG value size={160} />`).
   Props = `QRConfig`(`data`) + `SVGAttributes`. Ledger §6.1: MIT, Svelte 5 native, headless-qr engine,
   SSR-safe (hanya di-mount client via panel), fallback = qrcode SVG string builder bawaan package.

7. **Settings selectors browser-safe (§4.1).** `types`/`integrations`/`settings-menu`/`billing-derived`/
   `format` = mirror pure-data manual (pola `features/citations/types`), TANPA `@aqsha/services`/`db`.
   Usage/billing lewat API (`billing.*`); `billing-derived` (isCreditsLow/deepRunsQuota, sentinel
   `MAX_SAFE_INTEGER`) + `format` (formatIdr/Credits/Reset) di-contract-test. Icon settings-menu =
   `IconSvgElement` (glyph DATA) bukan React component.

8. **`no-navigation-without-resolve` OFF untuk `features/settings/**`.** SettingsRail data-driven
   (`settingsMenu[i].href` → `<a href={item.href}>`); resolve() tak bisa inline per-link (butuh literal,
   gotcha Phase 3). Semua route settings statis + deploy root (base kosong → resolve no-op) + web pakai
   `<Link href={item.href}>` verbatim → literal href = port 1:1 bersih. Preseden `ui/**` + `marketing/**`.
   Link shell→settings (AppSidebar/NavUser) di LUAR folder → rule TETAP ON + `resolve()` inline.

## 3. Gotcha & temuan reusable (untuk fase berikut)

- **svelte-clerk `useClerkContext()`=`getContext()` (init-only).** Panggil `getClerk()`/`useClerkContext()`
  di dalam event handler → error runtime. Seam yg dipakai di handler (signOut/reverify) WAJIB tangkap ctx
  di init lalu baca `ctx.clerk` fresh saat call (pola `getSignOut`/`getReverification`).
- **`clerk.__internal_openReverification(props?)`** ada di `@clerk/shared/types` `Clerk` interface; props
  `{level?, afterVerification?, afterVerificationCancelled?}` (semua opsional). Type seam JANGAN sertakan
  `level` (kontravarian: `level?: unknown` bikin method clerk tak assignable) — cukup 2 callback.
- **bits-ui `Select` ≠ Radix.** Tak ada `<Select.Value>`; `Select.Root` butuh `type="single"`; Trigger
  render label terpilih sendiri (`options.find(o=>o.id===value)?.label`). Item = `<Select.Item value label>`.
- **createQuery arg reaktif utk param yg berubah**: `useUsageActivity(days: () => number)` — bungkus param
  sbg getter, baca `days()` di dalam `createQuery(() => ({queryKey:[...days()], ...}))` → refetch saat ganti.
- **`createMutation`/`createQuery` boleh dipanggil dari `.ts` biasa** (bukan `.svelte.ts`) selama dieksekusi
  saat component init (mereka baca Svelte context internal). Hooks `api.ts` = fungsi dipanggil di `<script>`.
- **`mutation.mutate(vars, { onSuccess })`** (opsi per-call) didukung svelte-query v6 → reset draft form
  di onSuccess (personalization/prefs).
- **`{@each ... as _, i}` unused `_`** kena `no-unused-vars` (beda dari arg fungsi `^_`). Pakai index array
  (`{#each [0,1,2,3] as i (i)}`) utk skeleton loop.
- **`{@attach (node) => node.focus()}` = autofocus lint-safe** (attribute `autofocus` = a11y warning →
  gagal gate 0-warning). Attachment di-forward lewat komponen yg spread `{...restProps}` (Input).
- **`<script module>` immutable const aman utk shuffle sekali/load** (SourceStep) — bukan mutable module
  state (§3.5); SourceStep tak pernah SSR (page loader sampai status resolve) → tak ada hydration mismatch.
- **Route group ubah RouteId param.** Setelah `(product)`, `resolve('/app/threads/[threadId]', …)` →
  `resolve('/app/(product)/threads/[threadId]', …)`. Statis tetap via pathname overload (URL grup-stripped).
- **`data-active={false}` = SEMUA sidebar item ter-highlight (bug shared primitive, difix Phase 5).**
  Golden CSS meng-compile Tailwind `data-active:bg-sidebar-accent` jadi selektor **PRESENSI** `[data-active]`
  (bukan `[data-active="true"]`); Svelte me-render `data-active={false}` sebagai string `"false"` (atribut
  HADIR) — beda dari React yg meng-OMIT-nya — sehingga `[data-active]` cocok di setiap `SidebarMenuButton`
  (AppSidebar + SettingsRail + NavUser semua "aktif"). Fix di `sidebar-menu-{button,sub-button}.svelte`:
  `'data-active': isActive || undefined` (omit saat inaktif → presensi hanya match yang benar-benar aktif,
  sama efektif dgn React). Regression test `sidebar-menu-button.svelte.spec.ts` (vitest-browser-svelte)
  mengunci: aktif→`data-active="true"`, inaktif→atribut absen. **Berlaku umum**: atribut boolean-`false`
  yg dipakai selektor presensi Tailwind (`data-*:`) WAJIB `|| undefined` di Svelte.

## 4. Gate Phase 5 (§10) — HIJAU

| Cek | Perintah / bukti | Hasil |
|---|---|---|
| Typecheck | `bun run --filter @aqsha/svelte typecheck` | **0 errors / 0 warnings** |
| Lint | `bun run --filter @aqsha/svelte lint` | Prettier clean + ESLint 0 |
| Test | `bun run --filter @aqsha/svelte test` | **23 files / 131 tests pass** (clean exit) |
| Build | `bun run --filter @aqsha/svelte build` | OK (adapter-node) |
| Boot + auth gate | `node --env-file=.env build` + fetch | `/` 200; **`/onboarding`→303→`/sign-in`**; SEMUA `/app/settings/*` (+`/app/settings` redirect) →**303**→`/sign-in` |
| Boundary client | grep `.svelte-kit/output/client` | **no React/Radix-React/Lucide**; **`@svelte-put/qr` ABSEN** (2FA panel unmounted, tree-shaken = parity web) |

Contract tests baru correctness-critical: `onboarding-machine.spec.ts` (question steps/transitions/
isStepValid/toggleInterest/buildCompletePayload), `settings.spec.ts` (billing-derived isCreditsLow +
deepRunsQuota sentinel, format Idr/Credits/Count, settingsItemForPath exact/nested/fallback, provider meta).

## 5. Yang TIDAK dikerjakan / ditunda (di luar Phase 5)

- **E2E riil Clerk test-instance** (password change + reverification modal + 2FA enroll/disable + session
  revoke) + **billing/provider fixtures** (checkout/portal/change/cancel, Mendeley OAuth, Zotero API-key
  callback) = **OWNER** (butuh backend + Clerk test instance live). Mekanisme code-complete.
- **Aktifkan TwoFactorPanel** = keputusan 2-app (uncomment web + svelte) saat owner ingin 2FA live.
- **Eyeball visual per-viewport/theme** (§9.3, non-blocking) = OWNER: onboarding + 7 settings di
  390/768/1280/1536 + light/dark + reduced-motion. Verifikasi fungsional (boot/route/auth-gate/build) HIJAU.
- **Upload source-map Sentry** = OPS (Phase 2).
