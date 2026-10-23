import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/constants";

export const runtime = "edge";
export const alt = `${SITE_NAME} — Scam & phishing message checker`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview card, generated at build time. */
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
          padding: "80px",
          background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #059669 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "96px",
              height: "96px",
              borderRadius: "28px",
              background: "rgba(255,255,255,0.15)",
              fontSize: "56px",
            }}
          >
            🛡️
          </div>
          <div style={{ display: "flex", fontSize: "56px", fontWeight: 700 }}>
            {SITE_NAME}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "68px",
            fontWeight: 700,
            lineHeight: 1.1,
            maxWidth: "960px",
          }}
        >
          Not sure about a message? Let&apos;s look at it together.
        </div>

        <div style={{ display: "flex", fontSize: "34px", opacity: 0.9 }}>
          Spot scam, phishing and smishing in plain language.
        </div>
      </div>
    ),
    size,
  );
}
