import { Typography } from "@/components/ui/typography";
import { parseAvailability, type Apartment } from "@/lib/apartment";
import { cn } from "@/lib/utils";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export interface MoveInProps {
  apartment: Apartment;
}

function MoveIn({ apartment }: MoveInProps) {
  const availability = parseAvailability(apartment.offer);

  return (
    <section className="flex flex-1 flex-col gap-3.5 min-w-0">
      <Typography variant="h2" className="text-foreground">
        Move-in
      </Typography>
      {availability.kind === "immediate" ? (
        <ImmediateCard />
      ) : (
        <CalendarStrip date={availability.date} />
      )}
    </section>
  );
}

function ImmediateCard() {
  return (
    <div className="flex flex-col items-start gap-1 rounded-[20px] bg-surface-sunken p-4">
      <p className="text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-primary">
        Available immediately
      </p>
      <p className="text-[14px] font-normal leading-[18px] tracking-[-0.24px] text-secondary">
        Move in any day.
      </p>
    </div>
  );
}

function CalendarStrip({ date }: { date: Date }) {
  const dayInWeek = date.getDay(); // 0=Sun..6=Sat
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - dayInWeek);
  const startOfRange = new Date(startOfWeek);
  startOfRange.setDate(startOfWeek.getDate() - 7);

  const cells: Array<{ day: number; isStart: boolean }> = [];
  for (let i = 0; i < 21; i += 1) {
    const current = new Date(startOfRange);
    current.setDate(startOfRange.getDate() + i);
    cells.push({
      day: current.getDate(),
      isStart:
        current.getFullYear() === date.getFullYear() &&
        current.getMonth() === date.getMonth() &&
        current.getDate() === date.getDate(),
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="grid grid-cols-7 gap-x-[13px] py-[3px] text-center text-[12px] font-semibold leading-[14px] tracking-[-0.2px] text-secondary"
        aria-hidden
      >
        {DAY_INITIALS.map((letter, index) => (
          <span key={index}>{letter}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-x-[13px] gap-y-[13px] py-[3px]">
        {cells.map((cell, index) => (
          <DayCell key={index} day={cell.day} isStart={cell.isStart} />
        ))}
      </div>
    </div>
  );
}

function DayCell({ day, isStart }: { day: number; isStart: boolean }) {
  return (
    <div className="relative flex h-5 items-center justify-center">
      {isStart ? (
        <span
          aria-hidden
          className="absolute size-7 rounded-full bg-control-active"
        />
      ) : null}
      <span
        className={cn(
          "relative text-[12px] font-semibold leading-[14px] tracking-[-0.2px] tabular-nums",
          isStart ? "text-foreground" : "text-foreground",
        )}
      >
        {day}
      </span>
    </div>
  );
}

export { MoveIn };
