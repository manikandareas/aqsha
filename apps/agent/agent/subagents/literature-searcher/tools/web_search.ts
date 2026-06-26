import { disableTool } from "eve/tools";

// Matikan `web_search` bawaan (provider-defined tool) sama seperti root — lihat
// `agent/tools/web_search.ts`. Subagent mewarisi default framework eve, jadi tanpa
// stub ini `web_search` ikut terekspos ke model deepseek (openai.chat) → AI SDK warn
// "tool type: provider not supported" tiap step lalu strip-nya = banjir log + tool mati
// yang dilihat model. Pencarian web subagent lewat `search_web` (Firecrawl, in-process).
export default disableTool();
