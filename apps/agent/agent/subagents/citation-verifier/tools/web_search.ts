import { disableTool } from "eve/tools";

// Matikan `web_search` bawaan (provider-defined tool) sama seperti root — lihat
// `agent/tools/web_search.ts`. citation-verifier tak mencari web sama sekali, tapi tetap
// mewarisi `web_search` dari default framework → AI SDK warn "tool type: provider not
// supported" tiap step (deepseek/openai.chat) lalu strip-nya = banjir log + tool mati.
export default disableTool();
