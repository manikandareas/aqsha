import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import betterAuth from "@convex-dev/better-auth/convex.config";
import rag from "@convex-dev/rag/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import polar from "@convex-dev/polar/convex.config";

const app = defineApp();

app.use(betterAuth);
app.use(agent);
app.use(rag);
app.use(rateLimiter);
app.use(workflow);
app.use(polar);

export default app;
