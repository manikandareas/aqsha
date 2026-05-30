"use client";

import {
  ScrollMode,
  SpecialZoomLevel,
  Viewer,
  Worker,
} from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import { useTheme } from "next-themes";
import { useMemo } from "react";

const pdfWorkerUrl = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url,
).toString();

export function PdfArtifactViewer({
  url,
  fileName,
}: {
  url: string;
  fileName: string;
}) {
  const { resolvedTheme } = useTheme();
  const defaultLayoutPluginInstance = useMemo(
    () =>
      defaultLayoutPlugin({
        toolbarPlugin: {
          getFilePlugin: {
            fileNameGenerator: () => fileName,
          },
        },
      }),
    [fileName],
  );

  return (
    <div className="h-full min-h-[640px] w-full overflow-hidden">
      <Worker workerUrl={pdfWorkerUrl}>
        <Viewer
          defaultScale={SpecialZoomLevel.PageWidth}
          fileUrl={url}
          plugins={[defaultLayoutPluginInstance]}
          scrollMode={ScrollMode.Vertical}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
        />
      </Worker>
    </div>
  );
}
