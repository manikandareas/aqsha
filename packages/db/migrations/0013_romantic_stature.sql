ALTER TABLE "chat_thread_events" ADD COLUMN "step_index" integer;--> statement-breakpoint
CREATE INDEX "chat_thread_events_thread_type_step" ON "chat_thread_events" USING btree ("thread_id","type","step_index");--> statement-breakpoint
-- Backfill step_index dari payload (Phase 3, fix C). 1×, idempoten via `step_index IS NULL`.
-- Guard regex `^[0-9]+$` → hanya cast nilai integer valid (stepIndex absen/null/non-numerik
-- dilewati tanpa error). Tabel sangat besar → boleh jalankan ber-batch manual; single UPDATE
-- ok untuk deploy terjadwal (append-only: insert baris baru tak konflik dgn update baris lama).
UPDATE "chat_thread_events"
SET "step_index" = ("payload" -> 'data' ->> 'stepIndex')::int
WHERE "step_index" IS NULL
  AND ("payload" -> 'data' ->> 'stepIndex') ~ '^[0-9]+$';