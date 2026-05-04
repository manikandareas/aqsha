ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_status_check";--> statement-breakpoint
DROP INDEX "agent_runs_active_thread_unique_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_active_thread_unique_idx" ON "agent_runs" USING btree ("chat_thread_id") WHERE "agent_runs"."status" in ('queued', 'running', 'cancel_requested');--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status_check" CHECK ("agent_runs"."status" in ('queued', 'running', 'completed', 'failed', 'cancel_requested', 'canceled'));