import { useRef } from "react";
import { IconCalendarFillDuo18 } from "nucleo-ui-fill-duo-18";
import { Icon } from "@/_components/ui/icon";
import { Typography } from "@/_components/ui/typography";
import { parseAvailability, type Apartment } from "@/_lib/apartment";
import { useSquircle } from "@/_lib/use-squircle";
import { cn } from "@/_lib/utils";

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
	const today = new Date();
	const month = today.toLocaleString("en-US", { month: "short" }).toUpperCase();
	const day = today.getDate();
	// Spotlight at top-right that fades the decorative date down + left.
	const maskGradient =
		"radial-gradient(120% 100% at 100% 0%, #000 0%, #000 30%, transparent 80%)";
	const ref = useRef<HTMLDivElement>(null);
	useSquircle(ref, 20);

	return (
		<div
			ref={ref}
			className="relative flex flex-1 min-h-[168px] flex-col items-start justify-end overflow-hidden bg-surface-sunken p-6"
		>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 flex select-none flex-col items-end pr-5 pt-3 text-primary opacity-20"
				style={{
					maskImage: maskGradient,
					WebkitMaskImage: maskGradient,
				}}
			>
				<span className="text-[38px] font-medium leading-none tracking-[-0.24px]">
					{month}
				</span>
				<span className="text-[84px] font-bold leading-[0.9] tracking-[-0.05em]">
					{day}
				</span>
			</div>
			<Icon
				glyph={IconCalendarFillDuo18}
				size={24}
				className="text-secondary"
			/>
			<p className="mt-1.5 text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-primary">
				Available now
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
					"relative text-[12px] font-semibold leading-[14px] tracking-[-0.2px]",
					isStart ? "text-foreground" : "text-foreground",
				)}
			>
				{day}
			</span>
		</div>
	);
}

export { MoveIn };
