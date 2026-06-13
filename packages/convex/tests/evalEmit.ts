import { appendFileSync } from "node:fs";

// Test-only sink for golden-set eval metrics. When EVAL_METRICS_FILE is set (CI),
// each block is appended to that file so the workflow can publish it to
// $GITHUB_STEP_SUMMARY; locally it just logs to stdout.
export function emitMetrics(markdown: string): void {
  const out = process.env.EVAL_METRICS_FILE;
  if (out) {
    appendFileSync(out, markdown + "\n\n");
  } else {
    // eslint-disable-next-line no-console
    console.log("\n" + markdown + "\n");
  }
}
