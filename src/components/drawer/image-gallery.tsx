import { useEffect, useState } from "react";
import { FadeImage } from "@/components/ui/fade-image";
import { ScrollContainer } from "@/components/ui/scroll-container";
import type { Apartment } from "@/lib/apartment";
import { cn } from "@/lib/utils";

export interface ImageGalleryProps {
  apartmentId: Apartment["_id"];
  images: Apartment["images"];
}

function ImageGallery({ apartmentId, images }: ImageGalleryProps) {
  const usable = images.filter((image) => image.url);
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset to first image when the apartment changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [apartmentId]);

  if (usable.length === 0) {
    return (
      <div
        aria-hidden
        className="aspect-[1920/1080] w-full rounded-[20px] bg-muted shadow-card-1"
      />
    );
  }

  const active = usable[Math.min(activeIndex, usable.length - 1)];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[1920/1080] w-full overflow-hidden rounded-[20px] bg-muted shadow-card-1">
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
                "relative h-[90px] w-[142px] shrink-0 overflow-hidden rounded-[16px] bg-surface-sunken",
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
