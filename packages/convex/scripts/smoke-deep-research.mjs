#!/usr/bin/env node
// Headless deep-research smoke gate (Slice R0). Drives the dev-only harness in
// convex/agent/evals/devHarness.ts against the dev deployment via `npx convex
// run`, polls the run, auto-resolves HITL pauses, and asserts the scenario's
// exit conditions. Exit code = gate result, so this can ride CI later.
//
// Usage (from packages/convex, dev deployment configured in .env.local):
//   AQSHA_HARNESS_OWNER=<userId> node scripts/smoke-deep-research.mjs \
//     --scenario=happy [--prompt="..."] [--save-baseline] [--timeout-min=15]
//
// Prerequisite: `npx convex env set AQSHA_DEV_HARNESS 1` on the dev deployment.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const SCENARIOS = ["happy", "hitl-resume", "verifier-fail", "cancel-midrun"];

function parseArgs(argv) {
  const args = { scenario: "happy", timeoutMin: 15, saveBaseline: false };
  for (const arg of argv) {
    if (arg.startsWith("--scenario=")) args.scenario = arg.slice("--scenario=".length);
    else if (arg.startsWith("--owner=")) args.owner = arg.slice("--owner=".length);
    else if (arg.startsWith("--prompt=")) args.prompt = arg.slice("--prompt=".length);
    else if (arg.startsWith("--timeout-min=")) args.timeoutMin = Number(arg.slice("--timeout-min=".length));
    else if (arg === "--save-baseline") args.saveBaseline = true;
    else if (arg.startsWith("--save-baseline=")) {
      args.saveBaseline = true;
      args.baselinePath = arg.slice("--save-baseline=".length);
    }
  }
  return args;
}

function convexRun(fn, payload) {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(payload)], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const trimmed = out.trim();
  if (!trimmed || trimmed === "null") return null;
  return JSON.parse(trimmed);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message) {
  process.stdout.write(`[smoke] ${new Date().toISOString()} ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[smoke] FAIL: ${message}\n`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

// planRound is intentionally omitted: in the native deep flow the plan is proposed
// via the inline plan-approval tool (not a workflow step), so its agentRunSteps row
// stays "pending" by design. These are the steps the workflow actually completes.
const EXPECTED_V1_STEP_KEYS = [
  "discoverRoundCandidates",
  "readRoundSources",
  "synthesize",
  "persistArtifact",
  "finalizeThread",
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(SCENARIOS.includes(args.scenario), `unknown scenario "${args.scenario}" (expected ${SCENARIOS.join("|")})`);
  const owner = args.owner ?? process.env.AQSHA_HARNESS_OWNER;
  assert(owner, "missing harness owner: pass --owner=<userId> or set AQSHA_HARNESS_OWNER");

  log(`scenario=${args.scenario} owner=${owner}`);
  const started = convexRun("agent/evals/devHarness:startSmokeRun", {
    ownerUserId: owner,
    ...(args.prompt ? { prompt: args.prompt } : {}),
  });
  assert(started?.runId, "startSmokeRun did not return a runId");
  log(`started threadId=${started.threadId} runId=${started.runId}`);

  const deadline = Date.now() + args.timeoutMin * 60_000;
  let status = null;
  let resolveCount = 0;
  let canceled = false;

  // The deep path's TRUE terminal state is owned by the workflow: finalizeThread
  // sets currentStep="finalizeThread" + the artifact, failRun sets "failed",
  // markCanceled sets "canceled". The plan-approval resume sets a TRANSIENT
  // "completed" (no artifact, no finalize step) while the workflow keeps running
  // — so a bare status==="completed" is NOT terminal; require the finalize
  // signal (artifact present) to call a run done.
  const isTerminal = (s) => {
    if (s.status === "failed" || s.status === "canceled") return true;
    if (s.status === "completed" && (s.artifactId || s.currentStep === "finalizeThread")) return true;
    return false;
  };

  while (Date.now() < deadline) {
    status = convexRun("agent/evals/devHarness:getSmokeStatus", {
      ownerUserId: owner,
      runId: started.runId,
    });
    assert(status, "getSmokeStatus returned null (wrong owner or run vanished)");
    log(
      `status=${status.status} step=${status.currentStep ?? "-"} rounds=${status.roundCount}/${status.maxRounds} ` +
        `sources=${status.sourceCount} events=${status.eventCount} artifact=${status.artifactId ? "yes" : "no"} verification=${status.verificationStatus}`,
    );

    if (isTerminal(status)) break;

    if (status.status === "waiting" || status.status === "waiting_hitl") {
      log("HITL pause detected — resolving approvals");
      const resolved = convexRun("agent/evals/devHarness:resolvePendingApprovals", {
        ownerUserId: owner,
        threadId: started.threadId,
      });
      resolveCount += resolved?.resolved ?? 0;
      log(`resolved=${resolved?.resolved ?? 0} resumed=${resolved?.resumed ?? false}`);
    }

    // cancel-midrun: once the loop has completed at least one round (roundCount
    // is bumped per round by updateLoopProgress — the run's sourceCount only
    // populates at persist time), cancel between rounds and assert a graceful
    // stop (the next round's ensureNotCanceled check aborts the action).
    if (args.scenario === "cancel-midrun" && !canceled && status.status === "running" && status.roundCount >= 1) {
      log("cancel-midrun: issuing cancel");
      convexRun("agent/evals/devHarness:cancelSmokeRun", { ownerUserId: owner, runId: started.runId });
      canceled = true;
    }

    await sleep(10_000);
  }

  assert(status, "no status read before timeout");
  assert(isTerminal(status), `timed out after ${args.timeoutMin} min in status=${status.status} (step=${status.currentStep ?? "-"}, artifact=${status.artifactId ? "yes" : "no"})`);

  // ── Scenario assertions ─────────────────────────────────────────────────────
  if (args.scenario === "cancel-midrun") {
    assert(canceled, "cancel-midrun never reached a cancellable state (no sources before terminal)");
    assert(status.status === "canceled", `expected canceled, got ${status.status}`);
    log("cancel-midrun: graceful stop confirmed");
  } else if (args.scenario === "verifier-fail") {
    // A verifier outage must degrade, never fail the run: completed with a
    // non-passed verification (and, post-R1d, a "verification incomplete"
    // marker) is the pass condition.
    assert(status.status === "completed", `expected completed despite verifier failure, got ${status.status}: ${status.errorMessage ?? ""}`);
    assert(status.verificationStatus !== "passed", "verifier-fail scenario unexpectedly passed verification");
    assert(status.artifactId, "report artifact missing");
    log("verifier-fail: run degraded gracefully (no run failure)");
  } else {
    // happy + hitl-resume
    assert(status.status === "completed", `expected completed, got ${status.status}: ${status.errorMessage ?? ""}`);
    assert(resolveCount > 0, "no HITL approval was resolved (plan approval is mandatory on the deep path)");
    assert(status.artifactId, "report artifact missing");
    assert(status.sourceCount > 0, "no sources recorded");
    const stepStatuses = Object.fromEntries(status.steps.map((s) => [s.stepKey, s.status]));
    for (const key of EXPECTED_V1_STEP_KEYS) {
      assert(stepStatuses[key] === "completed", `step ${key} not completed (got ${stepStatuses[key] ?? "missing"})`);
    }
    const budget = status.budgetJson ? JSON.parse(status.budgetJson) : null;
    assert(budget, "budgetJson missing");
    log(`happy-path assertions passed (citations=${status.citationStatuses.length}, computations=${status.computationCheckCount})`);
  }

  if (args.saveBaseline) {
    const baselinePath =
      args.baselinePath ??
      path.resolve(import.meta.dirname, "..", "tests", "fixtures", `smoke-baseline-${args.scenario}.json`);
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    const baseline = {
      scenario: args.scenario,
      capturedAt: new Date().toISOString(),
      status: status.status,
      roundCount: status.roundCount,
      maxRounds: status.maxRounds,
      sourceCount: status.sourceCount,
      artifactCount: status.artifactCount,
      citationCheckCount: status.citationCheckCount,
      citationStatuses: status.citationStatuses,
      computationCheckCount: status.computationCheckCount,
      sufficiencyStatus: status.sufficiencyStatus,
      verificationStatus: status.verificationStatus,
      steps: status.steps,
      stepEvents: status.stepEvents,
      budgetJson: status.budgetJson,
    };
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    log(`baseline saved to ${baselinePath}`);
  }

  log(`scenario ${args.scenario}: PASS`);
}

main().catch((error) => {
  fail(error?.stack ?? String(error));
});
