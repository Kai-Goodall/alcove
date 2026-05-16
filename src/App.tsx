import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  IconArchiveDownloadFill18,
  IconCircleInfoFill18,
} from "nucleo-ui-fill-18";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedTabs, type SegmentItem } from "@/components/ui/segmented-tabs";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Typography } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

const workshopSpec = {
  tabs: [
    { value: "tab-1", label: "Tab 1" },
    { value: "tab-2", label: "Tab 2" },
    { value: "tab-3", label: "Tab 3" },
  ] satisfies SegmentItem[],
  body:
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
};

function loadWorkshopSpec() {
  return Promise.resolve(workshopSpec);
}

function App() {
  const [activeTab, setActiveTab] = useState("tab-1");
  const { data = workshopSpec } = useQuery({
    queryKey: ["workshop-ui-kit"],
    queryFn: loadWorkshopSpec,
    staleTime: Infinity,
  });

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={0}>
      <main className="min-h-screen bg-background text-foreground">
        <section className="mx-auto min-h-[930px] w-full max-w-[620px] px-7 py-5">
          <div className="flex items-start gap-[42px]">
            <ColorSwatches />
            <ShadowRamp />
          </div>

          <section className="mt-[62px] max-w-[400px]">
            <Typography variant="h1">Heading 1</Typography>
            <Typography className="mt-1" variant="h2">
              Heading 2
            </Typography>
            <Typography className="mt-1" variant="h3">
              Heading 3
            </Typography>
            <Typography className="mt-2">{data.body}</Typography>
          </section>

          <section className="mt-[76px] space-y-4">
            <ButtonRow variant="raised" />
            <ButtonRow variant="quiet" />
          </section>

          <section className="mt-10 pl-2">
            <SegmentedTabs
              items={data.tabs}
              value={activeTab}
              onValueChange={setActiveTab}
              aria-label="Apartment database views"
            />
          </section>

          <section className="mt-8 grid max-w-[518px] grid-cols-1 gap-4 pl-2 sm:grid-cols-2">
            <Input placeholder="Placeholder" />
            <Input defaultValue="Lorem ipsum" />
          </section>

          <section className="mt-[38px] flex items-center gap-2 pl-2">
            <Switch aria-label="Off state" />
            <Switch aria-label="On state" defaultChecked />
          </section>

          <section className="mt-[54px] grid max-w-[338px] grid-cols-[200px_98px] gap-[36px]">
            <TooltipSample variant="rich" />
            <TooltipSample variant="compact" />
          </section>
        </section>
      </main>
    </TooltipProvider>
  );
}

function ColorSwatches() {
  const swatches = [
    "bg-swatch-dark",
    "bg-swatch-gray",
    "bg-swatch-white ring-1 ring-black/[0.08]",
    "bg-swatch-coral",
    "bg-swatch-gold",
  ];

  return (
    <div className="grid w-[88px] grid-cols-3 gap-2">
      {swatches.map((swatch) => (
        <span
          key={swatch}
          className={cn("size-6 rounded-[4px] shadow-swatch", swatch)}
        />
      ))}
    </div>
  );
}

function ShadowRamp() {
  return (
    <div className="flex gap-6">
      {["shadow-card-1", "shadow-card-2", "shadow-card-3"].map((shadow) => (
        <span
          key={shadow}
          className={cn(
            "block h-[63px] w-16 rounded-[14px] bg-card ring-1 ring-black/[0.08]",
            shadow,
          )}
        />
      ))}
    </div>
  );
}

function ButtonRow({ variant }: { variant: "raised" | "quiet" }) {
  const icon = <IconArchiveDownloadFill18 aria-hidden />;

  return (
    <div className="flex flex-wrap items-center gap-[11px]">
      <Button variant={variant}>Download</Button>
      <Button variant={variant}>
        {icon}
        Download
      </Button>
      <Button aria-label="Download archive" size="icon" variant={variant}>
        {icon}
      </Button>
    </div>
  );
}

function TooltipSample({ variant }: { variant: "rich" | "compact" }) {
  const compact = variant === "compact";
  const shouldReduceMotion = useReducedMotion();
  const pressProps = shouldReduceMotion
    ? {}
    : {
        animate: { transform: "scale(1)" },
        initial: false,
        transition: { type: "spring" as const, duration: 0.14, bounce: 0 },
        whileTap: { transform: "scale(0.96)" },
      };

  return (
    <div className="flex flex-col items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            aria-label={`${compact ? "Compact" : "Rich"} tooltip preview`}
            className="relative mb-2 inline-flex size-[18px] items-center justify-center rounded-full text-muted-foreground outline-none before:absolute before:-inset-0.75 before:pointer-events-none before:content-[''] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            type="button"
            {...pressProps}
          >
            <IconCircleInfoFill18 aria-hidden className="size-[18px]" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent align="center" compact={compact} side="bottom">
          {compact ? (
            "Tooltip title"
          ) : (
            <div>
              <div className="font-semibold leading-[18px]">Tooltip title</div>
              <p className="mt-1 text-pretty text-muted-foreground">
                Here&apos;s a long tooltip description.
              </p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export default App;
