import type { FunctionReturnType } from "convex/server";
import {
  IconConciergeFill24,
  IconDishwasherFill24,
  IconDumbbellFill24,
  IconPawFill24,
  IconWashingMachineFill24,
  IconWifiFill24,
} from "nucleo-core-fill-24";
import {
  IconBathtubFillDuo18,
  IconBedDoubleFillDuo18,
  type IconProps as NucleoIconProps,
} from "nucleo-ui-fill-duo-18";
import type { ComponentType } from "react";
import { api } from "../../convex/_generated/api";

export type ApartmentList = FunctionReturnType<typeof api.apartments.list>;
export type Apartment = ApartmentList[number];
export type ApartmentImage = Apartment["images"][number];

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatPrice(price: number | undefined): string {
  if (typeof price !== "number" || Number.isNaN(price)) return "—";
  return USD.format(price);
}

export function formatStreetAddress(
  address: Apartment["apartment"]["address"],
): string | undefined {
  const raw = address?.streetAddress?.trim();
  if (!raw) return undefined;
  // Some importers concatenate locality/region into streetAddress
  // ("123 Main St, New York, NY"). Keep only the first segment so the
  // drawer subtitle stays a single line.
  return raw.split(",")[0]!.trim() || undefined;
}

export function formatFullAddress(
  address: Apartment["apartment"]["address"],
): string | undefined {
  if (!address) return undefined;
  const parts = [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
    address.addressCountry,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function getDisplayName(apartment: Apartment): string {
  return (
    apartment.apartment.name?.trim() ||
    formatStreetAddress(apartment.apartment.address) ||
    apartment.listing.name?.trim() ||
    "Untitled"
  );
}

export function getBedroomCount(apartment: Apartment): number | undefined {
  return apartment.apartment.numberOfBedrooms;
}

export function getBathroomCount(apartment: Apartment): number | undefined {
  const total = apartment.apartment.numberOfBathroomsTotal;
  if (typeof total === "number") return total;
  const full = apartment.apartment.numberOfFullBathrooms ?? 0;
  const partial = apartment.apartment.numberOfPartialBathrooms ?? 0;
  const sum = full + partial;
  return sum > 0 ? sum : undefined;
}

export function getRepresentativeImage(
  apartment: Apartment,
): ApartmentImage | undefined {
  const usable = apartment.images.filter((image) => image.url);
  const representative = usable.find(
    (image) =>
      image.kind === "photo" && image.image.representativeOfPage === true,
  );
  return representative ?? usable.find((image) => image.kind === "photo") ?? usable[0];
}

export type Availability = { kind: "immediate" } | { kind: "date"; date: Date };

export function parseAvailability(offer: Apartment["offer"]): Availability {
  const raw = offer.availabilityStarts?.trim();
  if (!raw) return { kind: "immediate" };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { kind: "immediate" };
  // Normalize to start of day in local time
  const local = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
  );
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  if (local.getTime() <= startOfToday.getTime()) {
    return { kind: "immediate" };
  }
  return { kind: "date", date: local };
}

type AmenityGlyph = ComponentType<NucleoIconProps>;

interface AmenitySpec {
  label: string;
  matchers: RegExp;
  glyph: AmenityGlyph;
}

const AMENITY_SPECS: AmenitySpec[] = [
  {
    label: "Laundry",
    matchers: /(laundry|washer|dryer|in-?unit)/i,
    glyph: IconWashingMachineFill24,
  },
  {
    label: "Dishwasher",
    matchers: /dishwash/i,
    glyph: IconDishwasherFill24,
  },
  {
    label: "Doorman",
    matchers: /(doorman|concierge|attended\s*lobby)/i,
    glyph: IconConciergeFill24,
  },
  {
    label: "Gym",
    matchers: /(gym|fitness)/i,
    glyph: IconDumbbellFill24,
  },
  {
    label: "Pet-friendly",
    matchers: /(pet|dog|cat)/i,
    glyph: IconPawFill24,
  },
  {
    label: "Wi-Fi",
    matchers: /(wi-?fi|internet)/i,
    glyph: IconWifiFill24,
  },
];

export interface PickedAmenity {
  label: string;
  glyph: AmenityGlyph;
}

export function pickAmenities(
  apartment: Apartment,
  limit: number,
): PickedAmenity[] {
  const features = apartment.apartment.amenityFeature ?? [];
  const matched: PickedAmenity[] = [];
  const seen = new Set<string>();

  for (const spec of AMENITY_SPECS) {
    if (matched.length >= limit) break;
    if (seen.has(spec.label)) continue;
    const hit = features.some((feature) => {
      if (!spec.matchers.test(feature.name)) return false;
      if (typeof feature.value === "boolean") return feature.value;
      return true;
    });
    if (hit) {
      matched.push({ label: spec.label, glyph: spec.glyph });
      seen.add(spec.label);
    }
  }

  // Pets are also surfaced via the top-level petsAllowed flag.
  if (
    matched.length < limit &&
    apartment.apartment.petsAllowed === true &&
    !seen.has("Pet-friendly")
  ) {
    matched.push({ label: "Pet-friendly", glyph: IconPawFill24 });
  }

  return matched.slice(0, limit);
}

export const BedroomIcon = IconBedDoubleFillDuo18;
export const BathroomIcon = IconBathtubFillDuo18;

export type MapCenter = { latitude: number; longitude: number } | string;

export function getMapCenter(apartment: Apartment): MapCenter | undefined {
  const geo = apartment.apartment.geo;
  if (geo?.latitude && geo?.longitude) {
    return { latitude: geo.latitude, longitude: geo.longitude };
  }
  return formatFullAddress(apartment.apartment.address);
}

function asDirectionsParam(value: MapCenter): string {
  return typeof value === "string"
    ? value
    : `${value.latitude},${value.longitude}`;
}

export function getCommuteHref(apartment: Apartment): string | undefined {
  const commute = apartment.assessment.commute;
  if (!commute) return undefined;

  const destGeo = commute.toLocation.geo;
  const dest: MapCenter | undefined =
    destGeo?.latitude && destGeo?.longitude
      ? { latitude: destGeo.latitude, longitude: destGeo.longitude }
      : formatFullAddress(commute.toLocation.address);
  if (!dest) return undefined;

  const origin = getMapCenter(apartment);

  const params = new URLSearchParams({ api: "1" });
  params.set("destination", asDirectionsParam(dest));
  if (origin) params.set("origin", asDirectionsParam(origin));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
