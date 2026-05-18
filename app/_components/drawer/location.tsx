import { useState } from "react";
import { IconMinusFill18, IconPlusFill18 } from "nucleo-ui-fill-18";
import { Button } from "@/_components/ui/button";
import { FadeImage } from "@/_components/ui/fade-image";
import { Icon } from "@/_components/ui/icon";
import { Typography } from "@/_components/ui/typography";
import { googleStaticMapUrl } from "@/_lib/google-static-map";
import {
  getCommuteHref,
  getMapCenter,
  type Apartment,
} from "@/_lib/apartment";

export interface LocationProps {
  apartment: Apartment;
}

const DEFAULT_ZOOM = 15;
const MIN_ZOOM = 13;
const MAX_ZOOM = 17;

function Location({ apartment }: LocationProps) {
  // Reset per Location instance — drawer unmount/remount on apartment change
  // throws this state away, so each open starts at DEFAULT_ZOOM.
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const mapCenter = getMapCenter(apartment);
  if (!mapCenter) return null;

  const commuteHref = getCommuteHref(apartment);
  const mapUrl = googleStaticMapUrl(mapCenter, {
    width: 480,
    height: 360,
    zoom,
  });
  const canZoomIn = zoom < MAX_ZOOM;
  const canZoomOut = zoom > MIN_ZOOM;

  return (
    <section className="flex flex-1 flex-col gap-3.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <Typography variant="h2" className="text-foreground">
          Location
        </Typography>
        {commuteHref ? (
          <a
            href={commuteHref}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[14px] font-medium leading-[16px] tracking-[-0.3px] text-secondary underline underline-offset-2 hover:text-foreground"
          >
            Commute
          </a>
        ) : null}
      </div>
      <div className="relative h-[168px] w-full overflow-hidden rounded-[24px]">
        <FadeImage
          src={mapUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover mix-blend-luminosity"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "rgba(251, 224, 204, 0.2)" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 rounded-[inherit]"
          style={{ boxShadow: "inset 0 0 19.8px 11px white" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "#745238",
            boxShadow:
              "inset 0 0 0 2.22px #fff, 0 1.78px 3.56px rgba(0, 0, 0, 0.25)",
          }}
        />
        <div className="absolute right-2 bottom-2 flex flex-col gap-1">
          <Button
            aria-label="Zoom in"
            size="icon"
            variant="raised"
            disabled={!canZoomIn}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
          >
            <Icon glyph={IconPlusFill18} size={14} />
          </Button>
          <Button
            aria-label="Zoom out"
            size="icon"
            variant="raised"
            disabled={!canZoomOut}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
          >
            <Icon glyph={IconMinusFill18} size={14} />
          </Button>
        </div>
      </div>
    </section>
  );
}

export { Location };
