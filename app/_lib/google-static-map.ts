const FALLBACK_KEY = "AIzaSyAU3EPk2RPf1uTGhbQtVIDBbQeNNpiPk2E";

const STYLE_PARAMS: string[] = [
  "visibility:off",
  "feature:administrative.neighborhood|visibility:simplified",
  "feature:landscape.man_made|visibility:on",
  "feature:landscape.natural|visibility:on",
  "feature:poi.park|visibility:on",
  "feature:poi.park|element:labels|visibility:off",
  "feature:road.arterial|visibility:simplified",
  "feature:road.local|visibility:simplified",
  "feature:road.local|element:labels.text|visibility:off",
  "feature:transit|visibility:on",
  "feature:transit.station|element:geometry|visibility:on",
  "feature:transit.station|element:labels.icon|visibility:off",
  "feature:transit.station|element:labels.text|visibility:on",
];

export type StaticMapCenter =
  | { latitude: number; longitude: number }
  | string;

export interface StaticMapOptions {
  /** Display width in CSS pixels. Default 480. */
  width?: number;
  /** Display height in CSS pixels. Default 360. */
  height?: number;
  /** Zoom level (Google scale). Default 15. */
  zoom?: number;
  /** 1 or 2 (Retina). Default 2. */
  scale?: 1 | 2;
}

export function googleStaticMapUrl(
  center: StaticMapCenter,
  options: StaticMapOptions = {},
): string {
  const { width = 480, height = 360, zoom = 15, scale = 2 } = options;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? FALLBACK_KEY;
  const centerParam =
    typeof center === "string"
      ? center
      : `${center.latitude},${center.longitude}`;

  const params = new URLSearchParams();
  params.set("key", key);
  params.set("center", centerParam);
  params.set("zoom", String(zoom));
  params.set("format", "png");
  params.set("maptype", "roadmap");
  params.set("size", `${width}x${height}`);
  params.set("scale", String(scale));
  for (const style of STYLE_PARAMS) {
    params.append("style", style);
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
