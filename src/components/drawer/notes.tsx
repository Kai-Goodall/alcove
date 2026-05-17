import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../convex/_generated/api";
import { Separator } from "@/components/ui/separator";
import { Typography } from "@/components/ui/typography";
import type { Apartment } from "@/lib/apartment";
import { cn } from "@/lib/utils";

export interface NotesProps {
  apartment: Apartment;
}

function getAssessmentBody(apartment: Apartment): string | undefined {
  const a = apartment.assessment;
  const candidates = [
    a.rawNotes,
    a.mustHaveEvidence,
    a.furnitureFit,
    a.daylight,
    a.kitchen,
    a.bathroom,
    a.floorPlan,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function formatAddedAt(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years >= 1) return RELATIVE_FORMATTER.format(-years, "year");
  if (months >= 1) return RELATIVE_FORMATTER.format(-months, "month");
  if (days >= 1) return RELATIVE_FORMATTER.format(-days, "day");
  if (hours >= 1) return RELATIVE_FORMATTER.format(-hours, "hour");
  if (minutes >= 1) return RELATIVE_FORMATTER.format(-minutes, "minute");
  return "just now";
}

function Notes({ apartment }: NotesProps) {
  const aiBody = getAssessmentBody(apartment);
  const persistedUserNotes = apartment.userNotes ?? "";
  const [userNotes, setUserNotes] = useState(persistedUserNotes);
  // Opened automatically if persisted notes exist; otherwise opens on click.
  const [isEditorOpen, setIsEditorOpen] = useState(
    persistedUserNotes.length > 0,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Re-sync if the apartment changes underneath us (drawer content swap).
  useEffect(() => {
    setUserNotes(persistedUserNotes);
    setIsEditorOpen(persistedUserNotes.length > 0);
  }, [apartment._id, persistedUserNotes]);

  const setUserNotesMutation = useMutation(api.apartments.setUserNotes);

  // Debounced save while typing.
  useEffect(() => {
    if (userNotes === persistedUserNotes) return;
    const id = window.setTimeout(() => {
      void setUserNotesMutation({ id: apartment._id, userNotes });
    }, 400);
    return () => window.clearTimeout(id);
  }, [userNotes, persistedUserNotes, apartment._id, setUserNotesMutation]);

  // Focus the textarea when the editor first opens.
  useEffect(() => {
    if (!isEditorOpen) return;
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isEditorOpen]);

  const handleContainerClick = () => {
    if (!isEditorOpen) setIsEditorOpen(true);
  };

  if (!aiBody && !isEditorOpen && persistedUserNotes.length === 0) {
    // Nothing to show and nothing to do — collapse the section entirely so the
    // drawer stays clean for apartments with no notes.
    return null;
  }

  return (
    <section className="flex flex-1 flex-col gap-3.5 min-w-0">
      <Typography variant="h2" className="text-foreground">
        Notes
      </Typography>
      <div className="flex flex-col gap-2">
        <div
          onClick={handleContainerClick}
          className={cn(
            "squircle flex flex-col overflow-hidden rounded-[32px] bg-surface-sunken transition-colors",
            !isEditorOpen && "cursor-pointer hover:bg-muted",
          )}
        >
          <div className="flex flex-col overflow-visible p-4">
            <AnimatePresence initial={false}>
              {isEditorOpen ? (
                <motion.div
                  key="user-editor"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2.5">
                    <AutoGrowTextarea
                      ref={textareaRef}
                      value={userNotes}
                      onChange={setUserNotes}
                      onBlur={() => {
                        if (userNotes.trim().length === 0) {
                          setIsEditorOpen(false);
                        }
                      }}
                      placeholder="Add your notes…"
                    />
                    {aiBody ? <Separator /> : null}
                  </div>
                  {aiBody ? <div className="h-2.5" aria-hidden /> : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {aiBody ? (
              <p
                className={cn(
                  "whitespace-pre-line text-pretty text-[14px] font-normal leading-[18px] tracking-[-0.24px]",
                  // AI body reads as the primary content unless the user has
                  // added their own notes — then it steps back to secondary.
                  userNotes.trim().length > 0
                    ? "text-secondary"
                    : "text-primary",
                )}
              >
                {aiBody}
              </p>
            ) : null}
          </div>
        </div>
        <p className="px-4 text-[14px] font-medium leading-[16px] tracking-[-0.3px] text-secondary">
          Added {formatAddedAt(apartment.createdAt)}
        </p>
      </div>
    </section>
  );
}

interface AutoGrowTextareaProps {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}

/**
 * Single-source-of-truth growing textarea using the grid-stacked-mirror
 * trick: the visible textarea and an invisible sizing div share a grid cell;
 * the cell sizes to the larger of the two, so the textarea inherits the
 * mirror's natural height as the user types. No layout-thrashing JS, no
 * `field-sizing` browser dependency.
 */
const AutoGrowTextarea = ({
  ref,
  value,
  onChange,
  onBlur,
  placeholder,
}: AutoGrowTextareaProps & {
  ref?: React.Ref<HTMLTextAreaElement>;
}) => {
  const textClasses =
    "text-[14px] font-normal leading-[18px] tracking-[-0.24px]";
  return (
    <div className="relative grid w-full">
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          // Capture Escape: blur the field and stop the drawer's window-
          // level Escape listener from also firing and closing the drawer.
          if (event.key === "Escape") {
            event.stopPropagation();
            event.currentTarget.blur();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className={cn(
          "col-start-1 row-start-1 w-full resize-none border-0 bg-transparent p-0 outline-none",
          textClasses,
          "text-primary placeholder:text-secondary",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "col-start-1 row-start-1 pointer-events-none invisible w-full whitespace-pre-wrap break-words",
          textClasses,
        )}
      >
        {/* Always render at least one space so the mirror has a 1-line baseline. */}
        {value.length > 0 ? value : " "}
        {value.endsWith("\n") ? " " : ""}
      </div>
    </div>
  );
};

export { Notes };
