import { ImageResponse } from "next/og";

// Default Open Graph image for the site (shown when sharing the home page).
// Individual apartment links override this with a photo collage via /api/og.
export const runtime = "nodejs";
export const alt = "Alcove — apartment search, organized";
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
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #F6EEE6 0%, #EFE3D6 100%)",
          color: "#2E2A26",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 132,
            height: 132,
            borderRadius: 32,
            background: "#fff",
            boxShadow: "0 8px 28px rgba(116, 82, 56, 0.18)",
            marginBottom: 36,
          }}
        >
          <svg width="76" height="76" viewBox="0 0 24 24" fill="none">
            <path
              d="M11.3 2.6a1 1 0 0 1 1.4 0l8 7.4a1 1 0 0 1 .3.74V20a1.5 1.5 0 0 1-1.5 1.5h-4.5V15h-5v6.5H5.5A1.5 1.5 0 0 1 4 20v-9.26a1 1 0 0 1 .3-.74l7-6.4Z"
              fill="#745238"
            />
            <circle cx="17.2" cy="16.8" r="3.4" fill="#fff" stroke="#745238" strokeWidth="1.6" />
            <line x1="19.7" y1="19.3" x2="22" y2="21.6" stroke="#745238" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>
          Alcove
        </div>
        <div style={{ fontSize: 34, color: "#8A7E72", marginTop: 6 }}>
          Apartment search, organized.
        </div>
      </div>
    ),
    size,
  );
}
