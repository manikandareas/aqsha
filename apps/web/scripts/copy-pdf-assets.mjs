// Copies pdf.js cMaps + standard fonts into public/pdf so the PDF viewer can
// resolve CJK encodings and the 14 standard PDF fonts at runtime. Kept out of
// git (see .gitignore) and refreshed on predev/prebuild so the assets always
// match the installed pdfjs-dist version.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const publicPdf = join(process.cwd(), "public", "pdf");

mkdirSync(publicPdf, { recursive: true });

for (const asset of ["cmaps", "standard_fonts"]) {
  const from = join(pdfjsRoot, asset);
  const to = join(publicPdf, asset);
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
    console.log(`[pdf:assets] copied ${asset} -> public/pdf/${asset}`);
  } else {
    console.warn(`[pdf:assets] missing ${from} (skipped)`);
  }
}
