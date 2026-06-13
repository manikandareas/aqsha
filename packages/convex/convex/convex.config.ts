import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import rag from "@convex-dev/rag/convex.config";
import polar from "@convex-dev/polar/convex.config";

const app = defineApp();

// Step 6 cutover complete: @convex-dev/agent and @convex-dev/workflow are
// unmounted. The agent runtime now lives in apps/agents (Claude Agent SDK) on
// first-party tables (chatThreads/chatMessages/agentRuns/agentRunEvents/
// pendingInteractions/researchPhaseStates). Unmounting the agent component
// permanently dropped its legacy in-component thread/message data (decision D7).
// rag/rateLimiter/polar remain — used product-wide and by the new surface.
app.use(rag);
app.use(rateLimiter);
app.use(polar);

export default app;
