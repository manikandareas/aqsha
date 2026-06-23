import { disableTool } from "eve/tools";

// Matikan `web_search` bawaan (provider-defined tool) sama seperti root — lihat
// `agent/tools/web_search.ts`. Tanpa stub ini subagent mewarisi `web_search` dari default
// framework → AI SDK warn "tool type: provider not supported" tiap step (deepseek/openai.chat)
// lalu strip-nya = banjir log + tool mati. Pencarian web subagent lewat `search_web`.
export default disableTool();
