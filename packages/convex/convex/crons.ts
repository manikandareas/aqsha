import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Recurring jobs. Per Convex guidelines only `crons.interval` / `crons.cron`
// are used (never the daily/weekly helpers), and each job is passed a
// `FunctionReference` from the generated `internal` object. Cron-driven fetches
// run on a service path (no authenticated user): they skip per-user credit
// consumption but still honour the global provider rate buckets.
const crons = cronJobs();

// Feed hydration — a single 3h cron that fans the lanes out with staggered
// scheduler.runAfter calls (trending papers → GDELT topics → Google News →
// fact-check claims → Google News enrichment). Consolidating the five former
// feed crons into one orchestrator avoids a thundering herd and keeps each
// provider within its rate budget; see internal.feed.hydrateCycle for the
// per-lane stagger. The Bahasa Indonesia backfill lane
// (internal.feed.bahasa.backfillIndonesian) is intentionally not scheduled for
// now — the Google News lane is already hl=id — and can be re-added later by
// appending one runAfter to the orchestrator.
crons.interval(
  "feed:hydrate-cycle",
  { hours: 3 },
  internal.feed.hydrateCycle,
  {},
);

// SDK agent backend watchdog (plan §4.3): runs stuck in queued/running with
// no heartbeat (run events bump updatedAt) flip to failed so the user can
// retry; waiting_hitl is user-paced and never swept.
crons.interval(
  "agent:watchdog",
  { minutes: 5 },
  internal.agent.watchdogSweep,
  {},
);

export default crons;
