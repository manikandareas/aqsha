// Satu titik setel worker pdfjs (versi worker selalu = pdfjs-dist terpasang). Diimpor
// oleh semua surface PDF (pdf-thumb kartu Explore, pdf-artifact-viewer workspace) supaya
// path worker tak pernah desync saat pdfjs-dist di-bump. Re-export Document/Page agar
// pemanggil cukup satu import. Hanya dievaluasi klien — semua pemanggil `dynamic(ssr:false)`,
// jadi `import.meta.url` aman.

import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export { Document, Page, pdfjs };
