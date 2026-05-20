import { useEffect, useRef, useState } from "react";
import { FadeImage } from "@/_components/ui/fade-image";
import { ScrollContainer } from "@/_components/ui/scroll-container";
import type { Apartment } from "@/_lib/apartment";
import { useSquircle } from "@/_lib/use-squircle";
import { cn } from "@/_lib/utils";

export interface ImageGalleryProps {
  apartmentId: Apartment["_id"];
  images: Apartment["images"];
  /** When true, render a swipable horizontal strip of full-size images. */
  isMobile?: boolean;
}

function ImageGallery({
  apartmentId,
  images,
  isMobile = false,
}: ImageGalleryProps) {
  const usable = images.filter((image) => image.url);
  const [activeIndex, setActiveIndex] = useState(0);
  const mobileScrollerRef = useRef<HTMLDivElement>(null);

  // Reset to first image when the apartment changes.
  useEffect(() => {
    setActiveIndex(0);
    mobileScrollerRef.current?.scrollTo({
      left: 0,
      behavior: "instant" as ScrollBehavior,
    });
  }, [apartmentId]);

  if (usable.length === 0) {
    return <Placeholder />;
  }

  if (isMobile) {
    return (
      <div
        ref={mobileScrollerRef}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {usable.map((image) => (
          <MobileSlide key={image._id} image={image} />
        ))}
      </div>
    );
  }

  const active = usable[Math.min(activeIndex, usable.length - 1)];

  return (
    <div className="flex flex-col gap-4">
      <Hero image={active} />
      <ScrollContainer padding={16} scrollStep={160}>
        {usable.map((image, index) => (
          <Thumbnail
            key={image._id}
            image={image}
            isActive={index === activeIndex}
            onClick={() => setActiveIndex(index)}
            index={index}
          />
        ))}
      </ScrollContainer>
    </div>
  );
}

function Placeholder() {
  const ref = useRef<HTMLDivElement>(null);
  useSquircle(ref, 20);
  return (
    <div
      ref={ref}
      aria-hidden
      className="aspect-[1920/1080] w-full bg-muted shadow-card-1"
    />
  );
}

function Hero({ image }: { image: Apartment["images"][number] }) {
  const ref = useRef<HTMLDivElement>(null);
  useSquircle(ref, 20);
  return (
    <div
      ref={ref}
      className="relative aspect-[1920/1080] w-full overflow-hidden bg-muted shadow-card-1"
    >
      <FadeImage
        key={image.url ?? "active"}
        src={image.url ?? undefined}
        alt={image.image.caption ?? ""}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
    </div>
  );
}

function MobileSlide({ image }: { image: Apartment["images"][number] }) {
  const ref = useRef<HTMLDivElement>(null);
  useSquircle(ref, 20);
  return (
    <div
      ref={ref}
      className="relative aspect-[1920/1080] w-[calc(100vw-2rem)] shrink-0 snap-center overflow-hidden bg-muted shadow-card-1"
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
  );
}

interface ThumbnailProps {
  image: Apartment["images"][number];
  isActive: boolean;
  onClick: () => void;
  index: number;
}

function Thumbnail({ image, isActive, onClick, index }: ThumbnailProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useSquircle(ref, 16);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={`Show photo ${index + 1}`}
      aria-current={isActive}
      className={cn(
        "relative h-[90px] w-[142px] shrink-0 overflow-hidden bg-surface-sunken",
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
}

export { ImageGallery };
