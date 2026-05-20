import { type FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { IconHouseSearchFill24 } from "nucleo-core-fill-24";
import { IconChevronLeftFill18 } from "nucleo-ui-fill-18";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/_components/ui/button";
import { Icon } from "@/_components/ui/icon";
import { Input } from "@/_components/ui/input";
import { Typography } from "@/_components/ui/typography";
import { useSquircle } from "@/_lib/use-squircle";
import { cn } from "@/_lib/utils";

type ImportJob = {
  _id: Id<"apartmentImportJobs">;
  status:
    | "queued"
    | "fetching_source"
    | "researching"
    | "extracting"
    | "upserting"
    | "uploading_images"
    | "completed"
    | "failed";
  statusMessage?: string;
  events: { at: number; status: ImportJob["status"]; message: string }[];
  apartmentId?: Id<"apartments">;
  error?: string;
  sourceUrl: string;
  normalizedUrl: string;
};

export interface AddApartmentDrawerProps {
  onClose: () => void;
  onApartmentAdded: (apartmentId: Id<"apartments">) => void;
  rightOffset: number;
  onHoverChange?: (hovered: boolean) => void;
  /** When true, render as a full-screen sheet with a back chevron. */
  isMobile?: boolean;
}

function stripUrlPrefix(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "");
}

function AddApartmentDrawer({
  onClose,
  onApartmentAdded,
  rightOffset,
  onHoverChange,
  isMobile = false,
}: AddApartmentDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useSquircle(drawerRef, isMobile ? 0 : 36);
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<Id<"apartmentImportJobs"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const completedJobRef = useRef<Id<"apartmentImportJobs"> | null>(null);

  const createJob = useMutation(api.apartmentImports.createFromUrl);
  const job = useQuery(
    api.apartmentImports.get,
    jobId ? { jobId } : "skip",
  ) as ImportJob | null | undefined;

  useEffect(() => {
    if (
      !job ||
      job.status !== "completed" ||
      !job.apartmentId ||
      completedJobRef.current === job._id
    ) {
      return;
    }
    completedJobRef.current = job._id;
    onApartmentAdded(job.apartmentId);
  }, [job, onApartmentAdded]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      const target = event.target as Element | null;
      if (target?.closest("[data-overlay-content]")) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (isMobile) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (drawerRef.current?.contains(target)) return;
      if (target.closest("[data-overlay-content]")) return;
      if (target.closest("[data-add-apartment-trigger]")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose, isMobile]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    completedJobRef.current = null;
    try {
      const nextJobId = await createJob({ url });
      setJobId(nextJobId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not start import.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const hasJob = jobId !== null;
  const isFailed = job?.status === "failed";
  const displayUrl = job ? stripUrlPrefix(job.sourceUrl) : "";

  return (
    <motion.aside
      ref={drawerRef}
      role="dialog"
      aria-modal={isMobile ? "true" : "false"}
      aria-label="Add apartment"
      initial={
        isMobile
          ? { transform: "translateX(100%)", opacity: 1 }
          : { transform: "translateX(32px)", opacity: 0 }
      }
      animate={{ transform: "translateX(0px)", opacity: 1 }}
      exit={
        isMobile
          ? { transform: "translateX(100%)", opacity: 1 }
          : { transform: "translateX(32px)", opacity: 0 }
      }
      transition={{ type: "spring", duration: 0.34, bounce: 0 }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      style={isMobile ? undefined : { right: rightOffset }}
      className={cn(
        "pointer-events-auto fixed z-30 flex flex-col overflow-hidden bg-card",
        isMobile
          ? "inset-0 rounded-none"
          : "top-16 bottom-16 w-[525px] max-w-[calc(100vw-32px)] rounded-[36px] shadow-card-2-clip",
      )}
    >
      {isMobile ? (
        <button
          type="button"
          aria-label="Close add apartment"
          onClick={onClose}
          className="absolute top-3 left-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-card/85 text-foreground shadow-card-1 backdrop-blur-md outline-none transition-colors hover:bg-button-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Icon glyph={IconChevronLeftFill18} size={18} />
        </button>
      ) : null}
      {hasJob ? (
        <div className="flex flex-col gap-6 p-4">
          <div className="flex flex-col gap-3 px-6 pt-6">
            <Icon
              glyph={IconHouseSearchFill24}
              size={24}
              className="text-foreground"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-[26px] font-medium leading-[30px] tracking-[-0.38px] text-foreground">
                {isFailed ? "Import failed" : "Adding apartment..."}
              </h1>
              {displayUrl ? (
                <a
                  href={job!.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={job!.sourceUrl}
                  className="block w-[320px] truncate text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-secondary underline underline-offset-2 hover:text-foreground"
                >
                  {displayUrl}
                </a>
              ) : null}
            </div>
          </div>
          <div className="h-px w-full bg-border" />
          <EventList
            events={job?.events ?? []}
            isComplete={job?.status === "completed" || isFailed}
          />
          {job?.error ? (
            <div className="px-6">
              <Typography variant="caption" className="text-destructive">
                {job.error}
              </Typography>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-4">
          <div className="flex flex-col gap-3 px-6 pt-6">
            <Icon
              glyph={IconHouseSearchFill24}
              size={24}
              className="text-foreground"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-[26px] font-medium leading-[30px] tracking-[-0.38px] text-foreground">
                Add apartment
              </h1>
              <Typography variant="body" className="text-secondary">
                Paste a listing link to import it.
              </Typography>
            </div>
          </div>
          <div className="h-px w-full bg-border" />
          <form
            className="flex flex-col gap-3 px-6 pb-6"
            onSubmit={handleSubmit}
          >
            <Input
              autoFocus
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                if (error) setError(null);
              }}
              placeholder="Apartment link"
              type="url"
              inputMode="url"
              invalid={Boolean(error)}
              disabled={submitting}
            />
            <div className="flex items-center justify-between gap-3">
              <Typography
                variant="caption"
                className="min-h-4 flex-1 truncate text-muted-foreground"
              >
                {error ?? ""}
              </Typography>
              <Button
                type="submit"
                disabled={submitting || url.trim().length === 0}
              >
                Run
              </Button>
            </div>
          </form>
        </div>
      )}
    </motion.aside>
  );
}

interface EventListProps {
  events: { at: number; status: string; message: string }[];
  isComplete: boolean;
}

function EventList({ events, isComplete }: EventListProps) {
  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {events.map((event, index) => {
          const isLatest = index === events.length - 1;
          const isPending = isLatest && !isComplete;
          return (
            <motion.div
              key={event.at}
              layout
              initial={{ opacity: 0, y: 4, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="overflow-hidden px-6"
            >
              <motion.div
                animate={
                  isPending
                    ? { opacity: [1, 0.45, 1] }
                    : { opacity: 1 }
                }
                transition={
                  isPending
                    ? {
                        duration: 1.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }
                    : { duration: 0.4, ease: "easeOut" }
                }
              >
                <Typography
                  variant="h3"
                  className={isLatest ? "text-foreground" : "text-secondary"}
                >
                  {event.message}
                </Typography>
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export { AddApartmentDrawer };
