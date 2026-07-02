import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ConvexHttpClient } from "convex/browser";
import { alcoveConfig } from "../../../alcove.config.mjs";
import { api } from "../../../convex/_generated/api";

// The assistant streams from Anthropic and can browse listing data; keep it on
// the Node runtime with headroom for long conversations.
export const runtime = "nodejs";
export const maxDuration = 120;

type ChatMessage = { role: "user" | "assistant"; content: string };

type AssistantBody = {
  apiKey?: string;
  messages?: ChatMessage[];
  webSearch?: boolean;
};

/** Lets the client know whether AI features work without pasting a key. */
export async function GET() {
  return NextResponse.json({ hasServerKey: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(request: Request) {
  let body: AssistantBody;
  try {
    body = (await request.json()) as AssistantBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim() || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No Anthropic API key. Paste one into the assistant panel (stored only in your browser) or set ANTHROPIC_API_KEY on the server.",
      },
      { status: 401 },
    );
  }

  const messages = (body.messages ?? []).filter(
    (m): m is ChatMessage =>
      Boolean(m) &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length > 0,
  );
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Send at least one user message." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey });
  const model =
    process.env.ANTHROPIC_MODEL ?? alcoveConfig.anthropicModel ?? "claude-sonnet-4-6";
  const system = await buildSystemPrompt();

  const baseRequest = {
    model,
    max_tokens: 4000,
    system,
    tools:
      body.webSearch === false
        ? undefined
        : [
            {
              type: "web_search_20260209" as const,
              name: "web_search" as const,
              max_uses: 5,
              user_location: {
                type: "approximate" as const,
                city: alcoveConfig.location.city,
                region: alcoveConfig.location.region,
                country: alcoveConfig.location.country,
                timezone: alcoveConfig.location.timezone,
              },
            },
          ],
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Server-side web search can pause the turn; continue up to 3 times so
        // long searches still finish within one HTTP response.
        let turnMessages: Anthropic.MessageParam[] = messages;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const messageStream = client.messages.stream({
            ...baseRequest,
            messages: turnMessages,
          });
          for await (const event of messageStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const final = await messageStream.finalMessage();
          if (final.stop_reason !== "pause_turn") break;
          turnMessages = [
            ...turnMessages,
            { role: "assistant", content: final.content },
          ];
        }
        controller.close();
      } catch (error) {
        const message =
          error instanceof Anthropic.APIError
            ? `Anthropic API error (${error.status}): ${error.message}`
            : error instanceof Error
              ? error.message
              : "Assistant failed.";
        controller.enqueue(encoder.encode(`\n\n[error] ${message}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * The assistant grounds its advice in the live listing data: it reads the
 * current apartments from Convex and the user's search profile from
 * alcove.config.mjs, so answers reference real rows ("the unit at 275 Larch"),
 * not generic advice. Trimmed to the most relevant ~60 rows to stay compact.
 */
async function buildSystemPrompt(): Promise<string> {
  const listings = await loadListings();
  const profile = {
    city: alcoveConfig.location.city,
    region: alcoveConfig.location.region,
    commuteTarget: alcoveConfig.commuteTarget?.name ?? null,
    neighborhoods: alcoveConfig.neighborhoods,
    mustHaves: alcoveConfig.mustHaves,
    furnitureFit: alcoveConfig.furnitureFit,
    budgets: alcoveConfig.budgets,
  };

  return [
    `You are the ${alcoveConfig.appName} assistant — a decision partner for the user's apartment hunt. The user tracks candidate apartments in this dashboard; your job is to help them compare options, spot caveats, decide what to tour, and figure out what's missing.`,
    "",
    "Guidelines:",
    "- Ground every claim in the listing data below or a web search result; never invent details about a listing.",
    "- Refer to listings by name and mention price/beds when comparing.",
    '- Rows with freshness "unverified" are scraped leads — remind the user to verify before touring.',
    "- Use web search when the user asks about neighborhoods, commute realities, building reputations, or anything not in the data.",
    "- Be concise and direct. Give a recommendation when asked, with the two or three factors that drive it.",
    "",
    `User's search profile:\n${JSON.stringify(profile)}`,
    "",
    `Current listings (${listings.length}):\n${JSON.stringify(listings)}`,
  ].join("\n");
}

async function loadListings() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) return [];
  try {
    const convex = new ConvexHttpClient(convexUrl);
    const apartments = await convex.query(api.apartments.list, {});
    return apartments
      .filter((a) => a.status !== "archived" && a.hidden !== true)
      .sort(
        (a, b) =>
          Number(b.isFavorite === true) - Number(a.isFavorite === true) ||
          Number(b.status === "shortlist") - Number(a.status === "shortlist") ||
          (a.rank ?? 9999) - (b.rank ?? 9999),
      )
      .slice(0, 60)
      .map((a) => ({
        name: a.listing.name ?? a.apartment.name,
        provider: a.listing.provider,
        url: a.listing.url,
        status: a.status,
        track: a.track,
        favorite: a.isFavorite === true || undefined,
        tourStatus: a.tourStatus,
        price: a.offer.price,
        currency: a.offer.priceCurrency,
        bedrooms: a.apartment.numberOfBedrooms,
        bathrooms: a.apartment.numberOfBathroomsTotal,
        address: a.apartment.address?.streetAddress,
        neighborhood: a.apartment.address?.addressLocality,
        amenities: a.apartment.amenityFeature?.map((f) => f.name),
        availabilityStarts: a.offer.availabilityStarts,
        commute: a.assessment.commute?.notes,
        freshness: a.assessment.verification.freshness,
        caveats: a.assessment.caveats,
        notes: a.assessment.rawNotes,
        userNotes: a.userNotes,
        score: a.score,
      }));
  } catch {
    // Assistant still works without listing context.
    return [];
  }
}
