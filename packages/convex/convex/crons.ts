import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Recurring feed-refresh jobs. Per Convex guidelines only `crons.interval` /
// `crons.cron` are used (never the daily/weekly helpers), and each job is
// passed a `FunctionReference` from the generated `internal` object. Cron-driven
// fetches run on a service path (no authenticated user): they skip per-user
// credit consumption but still honour the global provider rate buckets.
const crons = cronJobs();

// Lane A — trending papers. OpenAlex list calls are cheap (~10 credits each)
// and the action caches per day, so an 8h cadence keeps the feed fresh without
// burning rate budget. Later waves add news (Exa), topics (GDELT) and
// fact-check claims (Google Fact Check) jobs here.
crons.interval(
  "feed:trending-papers",
  { hours: 8 },
  internal.feed.refreshTrendingPapers,
  {},
);

// Lane B — fact-check claims (science + health only). Google Fact Check API
// aggregates human verdicts (Mafindo / Cek Fakta / Tempo) via languageCode=id.
// Daily cadence is enough given maxAgeDays windows; results are 24h-cached.
crons.interval(
  "feed:factcheck-claims",
  { hours: 24 },
  internal.feed.claims.refreshFactCheckClaims,
  {},
);

// Lane C — trending topics (GDELT, free). Daily is plenty given the 3-month
// volume window.
crons.interval(
  "feed:gdelt-topics",
  { hours: 24 },
  internal.feed.sources.refreshTrendingTopics,
  {},
);

// Lane A (news) — science news (Exa, paid). Low cadence + capped results to
// control cost.
crons.interval(
  "feed:science-news",
  { hours: 12 },
  internal.feed.sources.refreshScienceNews,
  {},
);

// Bahasa Indonesia comprehension layer. Translates a bounded batch of feed
// items lacking an Indonesian title/TL;DR each run (shared across all users,
// so it runs on the service path without per-user credits).
crons.interval(
  "feed:backfill-id",
  { hours: 6 },
  internal.feed.bahasa.backfillIndonesian,
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
