"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ApartmentDrawer } from "@/_components/drawer/apartment-drawer";
import { ApartmentGrid } from "@/_components/apartment-grid";
import { FilterBar, type TrackFilter } from "@/_components/filter-bar";
import {
  DEFAULT_FILTER_VALUES,
  type FilterValues,
} from "@/_components/filter-menu";
import { Header } from "@/_components/header";
import {
  formatStreetAddress,
  getBathroomCount,
  getDisplayName,
  type Apartment,
} from "@/_lib/apartment";
import { useApartmentSelection } from "@/_lib/use-apartment-selection";

const COLUMN_WIDTH = 800;
const DRAWER_WIDTH = 525;
// Grid + drawer treated as one block (zero gap matches the 1440px baseline,
// where the grid's right edge meets the drawer's left edge).
const COMBINED_WIDTH = COLUMN_WIDTH + DRAWER_WIDTH;
const MIN_SIDE_MARGIN = 32;

function parsePrice(value: string): number | undefined {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length === 0) return undefined;
  return Number(digits);
}

function useContainerLayout() {
  const [width, setWidth] = useState<number>(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const sideMargin = Math.max(MIN_SIDE_MARGIN, (width - COMBINED_WIDTH) / 2);
  const viewportShift = Math.max(0, (width - COLUMN_WIDTH) / 2 - sideMargin);
  return { sideMargin, viewportShift };
}

function HomePage() {
  const apartments = useQuery(api.apartments.list, {});
  const [track, setTrack] = useState<TrackFilter>("all");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTER_VALUES);
  const [isDrawerHovered, setIsDrawerHovered] = useState(false);
  // Locks the page in its dimmed state when the drawer opens. Hover only
  // starts driving the dim *after* the user's pointer has entered the drawer
  // and then left it at least once for the current selection.
  const [hasEnteredDrawer, setHasEnteredDrawer] = useState(false);
  // Once apartments first land, seed the cost range with the actual min/max
  // so the user opens the filter to a populated range they can narrow.
  const filtersSeededRef = useRef(false);
  useEffect(() => {
    if (filtersSeededRef.current || apartments === undefined) return;
    if (apartments.length === 0) return;
    filtersSeededRef.current = true;
    const maxPrice = apartments.reduce((max, apartment) => {
      const price = apartment.offer.price;
      return typeof price === "number" && price > max ? price : max;
    }, 0);
    setFilters((prev) => ({
      ...prev,
      costMin: "0",
      costMax: maxPrice > 0 ? String(maxPrice) : "",
    }));
  }, [apartments]);

  const [selectedId, setSelectedId] = useApartmentSelection();
  const { sideMargin, viewportShift } = useContainerLayout();

  // Only re-arm the dim lock when the drawer transitions from CLOSED to
  // OPEN. Switching apartments while the drawer is already open carries
  // over the existing hover-driven dim state, so the page doesn't snap
  // back to dimmed under a cursor that's still outside the drawer.
  const prevSelectedIdRef = useRef(selectedId);
  useEffect(() => {
    const prev = prevSelectedIdRef.current;
    prevSelectedIdRef.current = selectedId;
    if (prev === null && selectedId !== null) {
      setHasEnteredDrawer(false);
      setIsDrawerHovered(false);
    }
  }, [selectedId]);

  const handleDrawerHoverChange = (hovered: boolean) => {
    setIsDrawerHovered(hovered);
    if (hovered) setHasEnteredDrawer(true);
  };

  // Lock page scroll while the pointer is over the drawer. The drawer's
  // own `overflow-y-auto` container still scrolls; only the body is pinned.
  useEffect(() => {
    if (!isDrawerHovered) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerHovered]);

  const updateFilters = (patch: Partial<FilterValues>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const filtersActive = useMemo(() => {
    if (filters.favoritesOnly) return true;
    if (filters.touredOnly) return true;
    if (filters.bathroomsMin > 0) return true;
    const min = parsePrice(filters.costMin);
    if (min !== undefined && min > 0) return true;
    const userMax = parsePrice(filters.costMax);
    if (userMax !== undefined && apartments) {
      const dataMax = apartments.reduce((m, a) => {
        const p = a.offer.price;
        return typeof p === "number" && p > m ? p : m;
      }, 0);
      if (userMax < dataMax) return true;
    }
    return false;
  }, [filters, apartments]);

  const visible = useMemo(() => {
    if (apartments === undefined) return undefined;
    const trimmed = query.trim().toLowerCase();
    const costMin = parsePrice(filters.costMin);
    const costMax = parsePrice(filters.costMax);

    const filtered = apartments.filter((apartment) => {
      if (apartment.status === "archived") return false;
      if (track !== "all" && apartment.track !== track) return false;
      if (filters.favoritesOnly && apartment.isFavorite !== true) return false;
      if (filters.touredOnly && apartment.tourStatus !== "toured") return false;
      const price = apartment.offer.price;
      if (costMin !== undefined && (price === undefined || price < costMin))
        return false;
      if (costMax !== undefined && (price === undefined || price > costMax))
        return false;
      if (filters.bathroomsMin > 0) {
        const baths = getBathroomCount(apartment);
        if (baths === undefined || baths < filters.bathroomsMin) return false;
      }
      if (trimmed.length > 0) {
        const haystack = [
          getDisplayName(apartment),
          formatStreetAddress(apartment.apartment.address),
          apartment.listing.provider,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(trimmed)) return false;
      }
      return true;
    });

    if (filters.sort === "newest") {
      return [...filtered].sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      );
    }

    // "relevant": favorites first, then model shortlist, then everything
    // else. Array.sort is stable, so the server's rank/lastVerifiedAt order
    // is preserved within each group.
    const priority = (apartment: Apartment): number => {
      if (apartment.isFavorite === true) return 0;
      if (apartment.status === "shortlist") return 1;
      return 2;
    };
    return [...filtered].sort((a, b) => priority(a) - priority(b));
  }, [apartments, track, query, filters]);

  const initialSelected = useMemo<Apartment | undefined>(() => {
    if (!selectedId || !apartments) return undefined;
    return apartments.find((apartment) => apartment._id === selectedId);
  }, [apartments, selectedId]);

  const isDrawerOpen = initialSelected !== undefined;
  // The page is always shifted aside while the drawer is open. The dim
  // (opacity + blur) is held until the user has entered the drawer once;
  // after that, it tracks pointer hover.
  const isDimmed =
    isDrawerOpen && (!hasEnteredDrawer || isDrawerHovered);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-background">
      <motion.div
        animate={{
          transform: isDrawerOpen
            ? `translateX(${-viewportShift}px)`
            : "translateX(0px)",
          opacity: isDimmed ? 0.6 : 1,
          filter: isDimmed ? "blur(4px)" : "blur(0px)",
        }}
        transition={{ type: "spring", duration: 0.34, bounce: 0 }}
        className="mx-auto w-full max-w-[800px] px-4 py-16"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3.5">
            <Header />
            <FilterBar
              track={track}
              onTrackChange={setTrack}
              query={query}
              onQueryChange={setQuery}
              filters={filters}
              onFiltersChange={updateFilters}
              filtersActive={filtersActive}
            />
          </div>
          <ApartmentGrid
            apartments={visible}
            filterKey={`${track}|${query.trim().toLowerCase()}`}
            onSelect={setSelectedId}
          />
        </div>
      </motion.div>

      <AnimatePresence>
        {initialSelected ? (
          <ApartmentDrawer
            key="drawer"
            initialApartment={initialSelected}
            onClose={() => setSelectedId(null)}
            onHoverChange={handleDrawerHoverChange}
            rightOffset={sideMargin}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export { HomePage };
