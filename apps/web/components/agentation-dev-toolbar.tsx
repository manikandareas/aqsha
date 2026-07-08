"use client";

import dynamic from "next/dynamic";

// Agentation = alat feedback visual dev-only (npm: `agentation`). User klik elemen
// di halaman, tambah catatan, lalu anotasinya mengalir ke server lokal
// `agentation-mcp` (default :4747) yang dibaca Claude Code lewat MCP.
//
// Di-load via next/dynamic (ssr:false) sehingga chunk-nya hanya diminta saat
// komponen benar-benar dirender. Di build produksi cabang di bawah statis `null`,
// jadi bundle-nya tak pernah ikut ke user.
const Agentation = dynamic(
  () => import("agentation").then((mod) => mod.Agentation),
  { ssr: false },
);

// Override opsional lewat env; default = server lokal MCP.
const AGENTATION_ENDPOINT =
  process.env.NEXT_PUBLIC_AGENTATION_ENDPOINT ?? "http://localhost:4747";

export function AgentationDevToolbar() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Agentation endpoint={AGENTATION_ENDPOINT} />;
}
