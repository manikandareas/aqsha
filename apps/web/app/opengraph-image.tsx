import { ImageResponse } from "next/og";
import { backgroundColor, ogImage, siteName, themeColor } from "@/lib/seo-config";

export const alt = `${siteName} — ${ogImage.title}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "88px",
          background: themeColor,
          color: backgroundColor,
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.01em" }}>
          {siteName}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
            {ogImage.title}
          </div>
          <div style={{ fontSize: 38, opacity: 0.72 }}>{ogImage.subtitle}</div>
        </div>
      </div>
    ),
    size,
  );
}
