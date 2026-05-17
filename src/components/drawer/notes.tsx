import { Typography } from "@/components/ui/typography";
import type { Apartment } from "@/lib/apartment";

export interface NotesProps {
  apartment: Apartment;
}

function getNotesBody(apartment: Apartment): string | undefined {
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
  const body = getNotesBody(apartment);
  if (!body) return null;

  return (
    <section className="flex flex-1 flex-col gap-3.5 min-w-0">
      <Typography variant="h2" className="text-foreground">
        Notes
      </Typography>
      <div className="rounded-[20px] bg-surface-sunken p-4">
        <p className="whitespace-pre-line text-pretty text-[14px] font-normal leading-[18px] tracking-[-0.24px] text-primary">
          {body}
        </p>
      </div>
    </section>
  );
}

export { Notes };
