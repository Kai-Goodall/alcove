import { type ComponentType, useRef } from "react";
import type { IconProps as NucleoIconProps } from "nucleo-ui-fill-18";
import { Icon } from "@/_components/ui/icon";
import {
	BathroomIcon,
	BedroomIcon,
	pickAmenities,
	type Apartment,
} from "@/_lib/apartment";
import { useSquircle } from "@/_lib/use-squircle";

export interface StatCardsProps {
	apartment: Apartment;
}

function StatCards({ apartment }: StatCardsProps) {
	const beds = apartment.apartment.numberOfBedrooms;
	const baths =
		apartment.apartment.numberOfBathroomsTotal ??
		apartment.apartment.numberOfFullBathrooms;

	const amenities = pickAmenities(apartment, 2);

	const hasPair = beds !== undefined || baths !== undefined;

	return (
		<div className="-mx-4 flex items-stretch gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
			{hasPair ? (
				<PairCard>
					{beds !== undefined ? (
						<StatItem
							glyph={BedroomIcon}
							label={`${beds} ${beds === 1 ? "bed" : "beds"}`}
						/>
					) : null}
					{beds !== undefined && baths !== undefined ? (
						<span aria-hidden className="w-px self-stretch bg-border/60" />
					) : null}
					{baths !== undefined ? (
						<StatItem
							glyph={BathroomIcon}
							label={`${baths} ${baths === 1 ? "bath" : "baths"}`}
						/>
					) : null}
				</PairCard>
			) : null}
			{amenities.map((amenity) => (
				<SingleStat
					key={amenity.label}
					glyph={amenity.glyph}
					label={amenity.label}
				/>
			))}
		</div>
	);
}

function PairCard({ children }: { children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	useSquircle(ref, 20);
	return (
		<div
			ref={ref}
			className="flex shrink-0 items-stretch rounded-[20px] bg-surface-sunken"
		>
			{children}
		</div>
	);
}

interface StatItemProps {
	glyph: ComponentType<NucleoIconProps>;
	label: string;
}

function StatItem({ glyph, label }: StatItemProps) {
	return (
		<div className="flex flex-col items-start gap-1.5 p-4">
			<Icon glyph={glyph} size={20} className="text-secondary" />
			<span className="text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-primary">
				{label}
			</span>
		</div>
	);
}

function SingleStat({ glyph, label }: StatItemProps) {
	const ref = useRef<HTMLDivElement>(null);
	useSquircle(ref, 20);
	return (
		<div
			ref={ref}
			className="flex w-[135px] shrink-0 flex-col items-start justify-center gap-1.5 rounded-[20px] bg-surface-sunken p-4"
		>
			<Icon glyph={glyph} size={20} className="text-secondary" />
			<span className="text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-primary">
				{label}
			</span>
		</div>
	);
}

export { StatCards };
