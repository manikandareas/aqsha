import { v } from "convex/values";
import { action } from "./_generated/server";
import { astra } from "./agent";
import { authComponent } from "./auth";

export const sendPrompt = action({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx, { prompt }) => {
    const user = await authComponent.getAuthUser(ctx);
    const { threadId } = await astra.createThread(ctx, {
      userId: user._id,
      title: "Astra smoke test",
    });
    const result = await astra.generateText(
      ctx,
      { threadId, userId: user._id },
      { prompt },
    );

    return {
      threadId,
      text: result.text,
    };
  },
});
