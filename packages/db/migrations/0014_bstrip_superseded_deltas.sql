-- B-strip data migration 1× (Phase 6, fix C storage) — kosongkan payload delta `*.appended` LAMA
-- yang SUDAH disusul, sisakan delta TERAKHIR per (thread, turn, type, step). Baris TETAP
-- (event_index tak berubah) → cursor resume valid (nol risiko). Idempoten via
-- `payload->>'stripped' IS NULL` (re-runnable; aman bila interupsi). EXISTS(delta tipe sama yang
-- lebih baru di grup yang sama) = "tersusul"; pakai index `(thread_id, type, step_index)`.
--
-- Reasoning AMAN: delta TERAKHIR tiap (type, step) tak punya "later" → tak di-strip → reasoning
-- final + teks final tetap utuh (`reasoning.completed` di-emit 0× oleh agent kita, jadi final
-- HANYA ada di delta terakhir — jangan sampai ke-strip).
--
-- Tabel SANGAT besar → boleh dijalankan ber-batch manual per thread (tambah `AND e.thread_id =
-- '<id>'`); single statement ok untuk deploy terjadwal (append-only: insert baris baru tak konflik
-- dgn update baris lama). Deploy fase ini ATOMIC bersama redeploy agent-v2.
UPDATE "chat_thread_events" e
SET "payload" = '{"stripped":true}'::jsonb
WHERE e."type" IN ('message.appended', 'reasoning.appended')
  AND e."payload" ->> 'stripped' IS NULL
  AND EXISTS (
    SELECT 1 FROM "chat_thread_events" l
    WHERE l."thread_id" = e."thread_id"
      AND l."turn_id" IS NOT DISTINCT FROM e."turn_id"
      AND l."step_index" IS NOT DISTINCT FROM e."step_index"
      AND l."type" = e."type"
      AND l."event_index" > e."event_index"
  );
