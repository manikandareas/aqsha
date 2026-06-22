// Re-export root tool into this subagent's namespace (Slice 7.2). 1-line re-export is
// explicit authoring → eve registers it as the subagent's `verify_identifiers`. Zero
// logic duplication. `.ts` ext required (node v25 native TS).
export { default } from "../../../tools/verify_identifiers.ts";
