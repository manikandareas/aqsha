import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "../_generated/api";

export const researchWorkflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 6,
  },
});
