import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import rag from "@convex-dev/rag/convex.config";
import polar from "@convex-dev/polar/convex.config";

const app = defineApp();

// @convex-dev/workflow was removed in the Step 6 cutover — it backed only the
// legacy deep-research/computation runtime (now deleted); the SDK backend
// orchestrates durable deep research in apps/agents over the agentRuns2 +
// researchPhaseStates tables. The `agent` component stays mounted for its
// legacy thread/message data until the irreversible 6f unmount.
app.use(agent);
app.use(rag);
app.use(rateLimiter);
app.use(polar);

export default app;
