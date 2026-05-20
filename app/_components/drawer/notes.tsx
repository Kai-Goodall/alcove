import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../convex/_generated/api";
import { Separator } from "@/_components/ui/separator";
import { Typography } from "@/_components/ui/typography";
import type { Apartment } from "@/_lib/apartment";
import { useSquircle } from "@/_lib/use-squircle";
import { cn } from "@/_lib/utils";

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

function Notes({ apartment }: NotesProps) {
  const aiBody = getAssessmentBody(apartment);
  const persistedUserNotes = apartment.userNotes ?? "";
  const [userNotes, setUserNotes] = useState(persistedUserNotes);
  // Opened automatically if persisted notes exist; otherwise opens on click.
  const [isEditorOpen, setIsEditorOpen] = useState(
    persistedUserNotes.length > 0,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Tracks whether the editor was opened by an explicit user click — only
  // then do we autofocus. Auto-opens from persisted notes (initial render
  // or apartment swap) leave focus alone.
  const shouldFocusOnOpenRef = useRef(false);
  useSquircle(bodyRef, 20);

  // Re-sync only when the drawer swaps to a different apartment. We must NOT
  // depend on `persistedUserNotes` here: typing triggers a debounced save,
  // Convex echoes the new value back through `apartment.userNotes`, and that
  // would clobber whatever the user has typed since the last save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setUserNotes(persistedUserNotes);
    setIsEditorOpen(persistedUserNotes.length > 0);
  }, [apartment._id]);

  const setUserNotesMutation = useMutation(api.apartments.setUserNotes);

  // Debounced save while typing.
  useEffect(() => {
    if (userNotes === persistedUserNotes) return;
    const id = window.setTimeout(() => {
      void setUserNotesMutation({ id: apartment._id, userNotes });
    }, 400);
    return () => window.clearTimeout(id);
  }, [userNotes, persistedUserNotes, apartment._id, setUserNotesMutation]);

  // Focus only when the editor opens in response to a user click.
  useEffect(() => {
    if (!isEditorOpen) return;
    if (!shouldFocusOnOpenRef.current) return;
    shouldFocusOnOpenRef.current = false;
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isEditorOpen]);

  const handleContainerClick = () => {
    if (!isEditorOpen) {
      shouldFocusOnOpenRef.current = true;
      setIsEditorOpen(true);
    }
  };

  if (!aiBody && !isEditorOpen && persistedUserNotes.length === 0) {
    // Nothing to show and nothing to do — collapse the section entirely so the
    // drawer stays clean for apartments with no notes.
    return null;
  }

  return (
    <section className="flex min-w-0 flex-col gap-3.5">
      <Typography variant="h2" className="text-foreground">
        Notes
      </Typography>
      <div className="flex flex-col gap-2">
        <div
          ref={bodyRef}
          onClick={handleContainerClick}
          className={cn(
            "flex flex-col overflow-hidden rounded-[20px] bg-surface-sunken transition-colors",
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
