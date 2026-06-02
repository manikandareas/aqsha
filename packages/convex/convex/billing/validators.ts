import { v } from "convex/values";

export const productKeyValidator = v.union(
  v.literal("starterMonthly"),
  v.literal("starterYearly"),
  v.literal("plusMonthly"),
  v.literal("plusYearly"),
);
