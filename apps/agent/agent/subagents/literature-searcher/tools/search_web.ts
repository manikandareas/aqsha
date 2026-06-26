// Re-export root tool into this subagent's namespace (Slice 7.1). Declared subagents
// inherit no tools, but a 1-line re-export is explicit authoring → eve registers it as
// the subagent's `search_web`. Zero logic duplication; the root module's own relative
// imports resolve against agent/tools/. `.ts` ext required (node v25 native TS).
export { default } from "../../../tools/search_web.ts";
