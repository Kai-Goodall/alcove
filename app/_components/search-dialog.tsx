"use client";

import { type FormEvent, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import { IconHouseSearchFill24 } from "@/_components/ui/icons";
import { Button } from "@/_components/ui/button";
import { Icon } from "@/_components/ui/icon";
import { Input } from "@/_components/ui/input";
import { Switch } from "@/_components/ui/switch";
import { Typography } from "@/_components/ui/typography";
import { useAnthropicKey } from "@/_lib/use-anthropic-key";
import { cn } from "@/_lib/utils";

const SOURCES: { id: string; label: string; note?: string }[] = [
  { id: "kijiji", label: "Kijiji" },
  { id: "zillow", label: "Zillow" },
  { id: "bamboo", label: "Bamboo Housing" },
  { id: "craigslist", label: "Craigslist" },
  { id: "reddit", label: "Reddit", note: "best effort" },
  { id: "rentals_ca", label: "Rentals.ca", note: "best effort" },
  { id: "custom", label: "My sites", note: "from config" },
];

const DEFAULT_SOURCES = ["kijiji", "zillow", "bamboo", "craigslist", "custom"];

type AddedListing = {
  name?: string;
  url?: string;
  provider?: string;
  price?: number;
  priceCurrency?: string;
};

type SearchResult = {
  count: number;
  imagesAttached?: number;
  summary?: string;
  sourcesSearched?: string[];
  blindSpots?: string[];
  added?: AddedListing[];
  error?: string;
};

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const [city, setCity] = useState("");
  const [minBeds, setMinBeds] = useState("1");
  const [maxBeds, setMaxBeds] = useState("3");
  const [maxPrice, setMaxPrice] = useState("");
  const [near, setNear] = useState("");
  const [radius, setRadius] = useState("15");
  const [sources, setSources] = useState<string[]>(DEFAULT_SOURCES);
  const [ai, setAi] = useState(false);
  const { key: apiKey, setKey: setApiKey } = useAnthropicKey();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleSource = (id: string) =>
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: city.trim() || undefined,
          minBedrooms: numOrUndefined(minBeds),
          maxBedrooms: numOrUndefined(maxBeds),
          maxPrice: numOrUndefined(maxPrice),
          near: near.trim() || null,
          radiusKm: numOrUndefined(radius),
          sources,
          ai,
          apiKey: ai && apiKey ? apiKey : undefined,
          import: true,
        }),
      });
      const data = (await response.json()) as SearchResult;
      if (!response.ok) {
        setError(data.error ?? "Search failed.");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              {/*
                Centering is done entirely with motion's x/y. Tailwind's
                -translate-x/y utilities must NOT be combined with a motion
                `y` animation: Tailwind v4 emits the CSS `translate` property
                while motion writes `transform`, and the two stack — the
                dialog ends up shifted a full half-height off screen.
              */}
              <motion.div
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-40px)] w-[min(520px,calc(100vw-32px))] flex-col overflow-y-auto rounded-[28px] bg-card p-6 shadow-button"
                initial={{ opacity: 0, scale: 0.96, x: "-50%", y: "-46%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.96, y: "-46%" }}
                transition={{ type: "spring", duration: 0.32, bounce: 0 }}
              >
                <VisuallyHidden.Root>
                  <DialogPrimitive.Title>Search apartments</DialogPrimitive.Title>
                  <DialogPrimitive.Description>
                    Scrape rental sources for listings matching your criteria
                    and import them into Alcove.
                  </DialogPrimitive.Description>
                </VisuallyHidden.Root>

                <div className="mb-4 flex items-center gap-2">
                  <Icon glyph={IconHouseSearchFill24} size={20} />
                  <Typography variant="h2" className="text-foreground">
                    Search apartments
                  </Typography>
                </div>

                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                  <Field label="City">
                    <Input
                      placeholder='e.g. "Waterloo, ON" — defaults to your config'
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </Field>

                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Min beds">
                      <Input
                        inputMode="numeric"
                        value={minBeds}
                        onChange={(e) => setMinBeds(e.target.value)}
                      />
                    </Field>
                    <Field label="Max beds">
                      <Input
                        inputMode="numeric"
                        value={maxBeds}
                        onChange={(e) => setMaxBeds(e.target.value)}
                      />
                    </Field>
                    <Field label="Max rent">
                      <Input
                        inputMode="numeric"
                        placeholder="any"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                      />
                    </Field>
                  </div>

                  <Field label="Near (address or landmark)">
                    <Input
                      placeholder="e.g. your office or campus"
                      value={near}
                      onChange={(e) => setNear(e.target.value)}
                    />
                  </Field>

                  <Field label="Radius (km)">
                    <Input
                      inputMode="numeric"
                      value={radius}
                      onChange={(e) => setRadius(e.target.value)}
                    />
                  </Field>

                  <div className="flex flex-col gap-2">
                    <Label>Sources</Label>
                    <div className="flex flex-wrap gap-2">
                      {SOURCES.map((source) => {
                        const active = sources.includes(source.id);
                        return (
                          <button
                            key={source.id}
                            type="button"
                            onClick={() => toggleSource(source.id)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                              active
                                ? "border-transparent bg-foreground text-background"
                                : "border-border bg-transparent text-muted-foreground hover:bg-button-ghost-hover",
                            )}
                          >
                            {source.label}
                            {source.note ? (
                              <span className="ml-1 opacity-60">({source.note})</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 rounded-2xl bg-background px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <Typography variant="body" className="text-foreground">
                          AI deep search
                        </Typography>
                        <Typography variant="caption" className="text-muted-foreground">
                          Discover more sources & rank results with Claude
                        </Typography>
                      </div>
                      <Switch checked={ai} onCheckedChange={setAi} />
                    </div>
                    {ai ? (
                      <Field label="Anthropic API key (stored in this browser only)">
                        <Input
                          type="password"
                          autoComplete="off"
                          placeholder="sk-ant-… (blank to use the server key)"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                        />
                      </Field>
                    ) : null}
                  </div>

                  {error ? (
                    <Typography variant="caption" className="text-danger">
                      {error}
                    </Typography>
                  ) : null}

                  {result ? (
                    <div className="flex flex-col gap-1 rounded-2xl bg-background px-3 py-2.5">
                      <Typography variant="body" className="text-foreground">
                        Added {result.count} listing(s)
                        {result.imagesAttached
                          ? ` · ${result.imagesAttached} images`
                          : ""}
                      </Typography>
                      {result.summary ? (
                        <Typography variant="caption" className="text-muted-foreground">
                          {result.summary}
                        </Typography>
                      ) : null}
                      {result.added?.length ? (
                        <ul className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto">
                          {result.added.slice(0, 30).map((listing, i) => (
                            <li key={listing.url ?? i} className="flex items-baseline gap-1.5">
                              <Typography
                                variant="caption"
                                className="shrink-0 text-muted-foreground"
                              >
                                {listing.provider}
                              </Typography>
                              {listing.url ? (
                                <a
                                  href={listing.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate text-[13px] text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                                >
                                  {listing.name ?? listing.url}
                                </a>
                              ) : (
                                <span className="truncate text-[13px] text-foreground">
                                  {listing.name}
                                </span>
                              )}
                              {listing.price != null ? (
                                <Typography
                                  variant="caption"
                                  className="ml-auto shrink-0 text-muted-foreground"
                                >
                                  {formatPrice(listing.price, listing.priceCurrency)}
                                </Typography>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {result.blindSpots?.length ? (
                        <Typography variant="caption" className="text-muted-foreground">
                          Blind spots: {result.blindSpots.join("; ")}
                        </Typography>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-1 flex items-center justify-end gap-2">
                    {submitting ? (
                      <Typography variant="caption" className="mr-auto text-muted-foreground">
                        Scraping sources — this can take a minute or two…
                      </Typography>
                    ) : null}
                    <Button
                      type="button"
                      variant="quiet"
                      onClick={() => onOpenChange(false)}
                    >
                      {result ? "Done" : "Cancel"}
                    </Button>
                    <Button type="submit" disabled={submitting || sources.length === 0}>
                      {submitting ? "Searching…" : "Search"}
                    </Button>
                  </div>
                </form>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" className="text-muted-foreground">
      {children}
    </Typography>
  );
}

function numOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function formatPrice(price: number, currency?: string) {
  return `$${price.toLocaleString("en-US")}${currency && currency !== "USD" ? ` ${currency}` : ""}`;
}

export { SearchDialog };
