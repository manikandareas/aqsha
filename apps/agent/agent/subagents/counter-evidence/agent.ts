import { defineAgent } from "eve";
import { liteModel } from "../../lib/model.ts";

/**
 * Subagent `counter-evidence` (Slice 7.1) — declared subagent (inherit NOTHING).
 * Adversarial: parent men-`message` inventaris bukti, subagent mencari bukti yang
 * MELEMAHKAN kesimpulan. Pola sama `literature-searcher`. Model + escape hatch
 * context-window dari `lib/model.ts` (sama root).
 */
export default defineAgent({
  description:
    "Adversarially searches for evidence AGAINST the emerging conclusions of an evidence inventory — failed/non-replications, contradicting studies, methodological critiques, retractions, dissenting reviews.",
  ...liteModel,
});
