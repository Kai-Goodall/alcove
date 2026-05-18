import type { Metadata } from "next";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type ApartmentWithImages = NonNullable<
  FunctionReturnType<typeof api.apartments.get>
>;

export function pickTitle(apartment: ApartmentWithImages): string {
  const street = apartment.apartment.address?.streetAddress?.trim();
  const name =
    apartment.apartment.name?.trim() || apartment.listing.name?.trim();
  const locality = apartment.apartment.address?.addressLocality?.trim();
  const primary = street || name || "Apartment";
  return locality && !primary.includes(locality)
    ? `${primary}, ${locality}`
    : primary;
}

export function pickDescription(apartment: ApartmentWithImages): string {
  const beds = apartment.apartment.numberOfBedrooms;
  const baths = apartment.apartment.numberOfBathroomsTotal;
  const sqft = apartment.apartment.floorSize?.value;
  const price = apartment.offer.price;

  const parts: string[] = [];
  if (typeof price === "number") {
    parts.push(`$${Math.round(price).toLocaleString("en-US")}/mo`);
  }
  if (typeof beds === "number") parts.push(`${beds} bd`);
  if (typeof baths === "number") parts.push(`${baths} ba`);
  if (typeof sqft === "number")
    parts.push(`${Math.round(sqft).toLocaleString("en-US")} sqft`);

  const summary =
    apartment.apartment.description?.trim() ||
    apartment.listing.description?.trim() ||
    apartment.assessment.rawNotes?.trim() ||
    "";
  const headline = parts.join(" · ");
  if (headline && summary)
    return `${headline} — ${truncate(summary, 160 - headline.length - 3)}`;
  if (headline) return headline;
  if (summary) return truncate(summary, 160);
  return "Apartment listing on Alcove.";
}

export function pickPhotos(apartment: ApartmentWithImages, max: number) {
  const usable = apartment.images.filter((i) => i.url);
  const rank = (i: ApartmentWithImages["images"][number]) =>
    i.kind === "photo" && i.image.representativeOfPage
      ? 0
      : i.kind === "photo"
        ? 1
        : i.kind === "building"
          ? 2
          : 3;
  return [...usable].sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

export function buildMetadata(
  apartment: ApartmentWithImages | null,
  id: string,
): Metadata {
  if (!apartment) return { title: "Alcove" };
  const title = pickTitle(apartment);
  const description = pickDescription(apartment);
  const ogImageUrl = `/api/og?apartment=${id}`;
  return {
    title: `${title} · Alcove`,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Alcove",
      url: `/?apartment=${id}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    alternates: { canonical: `/?apartment=${id}` },
  };
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
