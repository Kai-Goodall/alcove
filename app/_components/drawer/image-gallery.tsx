import { useEffect, useRef, useState } from "react";
import { FadeImage } from "@/_components/ui/fade-image";
import { ScrollContainer } from "@/_components/ui/scroll-container";
import type { Apartment } from "@/_lib/apartment";
import { cn } from "@/_lib/utils";

export interface ImageGalleryProps {
  apartmentId: Apartment["_id"];
  images: Apartment["images"];
  /** When true, render a swipable horizontal strip of full-size images. */
  isMobile?: boolean;
}

function ImageGallery({ apartmentId, images, isMobile = false }: ImageGalleryProps) {
  const usable = images.filter((image) => image.url);
  const [activeIndex, setActiveIndex] = useState(0);
  const mobileScrollerRef = useRef<HTMLDivElement>(null);

  // Reset to first image when the apartment changes.
  useEffect(() => {
    setActiveIndex(0);
    mobileScrollerRef.current?.scrollTo({ left: 0, behavior: "instant" as ScrollBehavior });
  }, [apartmentId]);

  if (usable.length === 0) {
    return (
      <div
        aria-hidden
        className="squircle aspect-[1920/1080] w-full rounded-[32px] bg-muted shadow-card-1"
      />
    );
  }

  if (isMobile) {
    return (
      <div
        ref={mobileScrollerRef}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {usable.map((image) => (
          <div
            key={image._id}
            className="squircle relative aspect-[1920/1080] w-[calc(100vw-2rem)] shrink-0 snap-center overflow-hidden rounded-[32px] bg-muted shadow-card-1"
          >
            {image.url ? (
              <FadeImage
                src={image.url}
                alt={image.image.caption ?? ""}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  const active = usable[Math.min(activeIndex, usable.length - 1)];

  return (
    <div className="flex flex-col gap-4">
      <div className="squircle relative aspect-[1920/1080] w-full overflow-hidden rounded-[32px] bg-muted shadow-card-1">
        <FadeImage
          key={active.url ?? "active"}
          src={active.url ?? undefined}
          alt={active.image.caption ?? ""}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      </div>

      <ScrollContainer padding={16} scrollStep={160}>
        {usable.map((image, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={image._id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Show photo ${index + 1}`}
              aria-current={isActive}
              className={cn(
                "squircle relative h-[90px] w-[142px] shrink-0 overflow-hidden rounded-[28px] bg-surface-sunken",
                "shadow-card-1 outline-none transition-opacity",
                !isActive && "opacity-80 hover:opacity-100",
              )}
            >
              {image.url ? (
                <FadeImage
                  src={image.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : null}
            </button>
          );
        })}
      </ScrollContainer>
    </div>
  );
}

export { ImageGallery };
