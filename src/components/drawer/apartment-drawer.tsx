import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ImageGallery } from "@/components/drawer/image-gallery";
import { StatCards } from "@/components/drawer/stat-cards";
import { MoveIn } from "@/components/drawer/move-in";
import { Location } from "@/components/drawer/location";
import { Notes } from "@/components/drawer/notes";
import { FavoriteHeart } from "@/components/favorite-heart";
import { Typography } from "@/components/ui/typography";
import {
  formatPrice,
  formatStreetAddress,
  getDisplayName,
  type Apartment,
} from "@/lib/apartment";

export interface ApartmentDrawerProps {
  /** The initially-loaded apartment passed from the grid; renders instantly. */
  initialApartment: Apartment;
  onClose: () => void;
  /** Notified when the pointer enters or leaves the drawer. */
  onHoverChange?: (hovered: boolean) => void;
}

function ApartmentDrawer({
  initialApartment,
  onClose,
  onHoverChange,
}: ApartmentDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Convex pushes updates on this query — keeps the drawer fresh if the doc
  // changes (e.g. status flips elsewhere) while preserving the initial paint.
  const refreshed = useQuery(api.apartments.get, { id: initialApartment._id });
  const apartment = refreshed ?? initialApartment;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Click outside the drawer closes it — except when the click lands on
  // another apartment card, in which case the parent swaps the content.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (drawerRef.current?.contains(target)) return;
      if (target.closest("[data-apartment-card]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  // Reset scroll to top when the displayed apartment changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: "instant" as ScrollBehavior,
    });
  }, [apartment._id]);

  return (
    <motion.aside
      ref={drawerRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${getDisplayName(apartment)} details`}
      initial={{ transform: "translateX(32px)", opacity: 0 }}
      animate={{ transform: "translateX(0px)", opacity: 1 }}
      exit={{ transform: "translateX(32px)", opacity: 0 }}
      transition={{ type: "spring", duration: 0.34, bounce: 0 }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      className="pointer-events-auto fixed top-16 bottom-16 right-8 z-30 w-[525px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[36px] bg-card shadow-card-2"
    >
      <div
        ref={scrollRef}
        className="h-full max-h-full overflow-y-auto rounded-[inherit] [scrollbar-width:thin]"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={apartment._id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col gap-6 p-4"
          >
            <ImageGallery
              apartmentId={apartment._id}
              images={apartment.images}
            />
            <div className="flex flex-col gap-5 px-4 pb-4">
              <ApartmentSummary apartment={apartment} />
              <StatCards apartment={apartment} />
              <div className="flex items-start gap-5">
                <MoveIn apartment={apartment} />
                <Location apartment={apartment} />
              </div>
              <Notes apartment={apartment} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}

function ApartmentSummary({ apartment }: { apartment: Apartment }) {
  const street = formatStreetAddress(apartment.apartment.address);
  const listingHref = apartment.listing.url;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Typography
          variant="h1"
          className="truncate text-foreground"
          title={getDisplayName(apartment)}
        >
          {getDisplayName(apartment)}
        </Typography>
        <FavoriteHeart
          apartmentId={apartment._id}
          isFavorite={apartment.isFavorite === true}
          size={24}
          context="drawer"
        />
      </div>
      <div className="flex items-center gap-2.5">
        {apartment.offer.price !== undefined ? (
          <span className="text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-foreground tabular-nums">
            {formatPrice(apartment.offer.price)}
          </span>
        ) : null}
        {apartment.offer.price !== undefined && street ? (
          <span
            aria-hidden
            className="block size-1 rounded-full bg-secondary/50"
          />
        ) : null}
        {street ? (
          listingHref ? (
            <a
              href={listingHref}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-secondary underline underline-offset-2 hover:text-foreground"
            >
              {street}
            </a>
          ) : (
            <span className="text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-secondary">
              {street}
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}

export { ApartmentDrawer };
