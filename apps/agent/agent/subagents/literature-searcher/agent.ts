import { defineAgent } from "eve";
import { liteModel } from "../../lib/model.ts";

/**
 * Subagent `literature-searcher` (Slice 7.1) — declared subagent (inherit NOTHING dari
 * root). Punya instructions + tools sendiri di bawah dir ini; `build.externalDependencies`
 * di root `agent/agent.ts` berlaku GLOBAL → tool re-export yang mengimpor `@aqsha/services`
 * tetap ter-externalize. Model + escape hatch context-window dari `lib/model.ts` (sama root).
 *
 * Delegasi: parent men-`message` SATU sub-pertanyaan + set `outputSchema` (mode task) agar
 * temuan balik terstruktur. Subagent TIDAK melihat history parent.
 */
export default defineAgent({
  description:
    "Searches the literature for one sub-question and extracts the strongest evidence with citations. Run one per sub-question; independent sub-questions may run in parallel.",
  ...liteModel,
});
