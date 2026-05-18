import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { HomePage } from "@/_components/home-page";
import { buildMetadata } from "@/_lib/apartment-meta";

type SearchParams = Promise<{ apartment?: string }>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { apartment: id } = await searchParams;
  if (!id) return { title: "Alcove" };

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return { title: "Alcove" };

  try {
    const client = new ConvexHttpClient(convexUrl);
    const apartment = await client.query(api.apartments.get, {
      id: id as Id<"apartments">,
    });
    return buildMetadata(apartment, id);
  } catch {
    return { title: "Alcove" };
  }
}

export default function Page() {
  return <HomePage />;
}
