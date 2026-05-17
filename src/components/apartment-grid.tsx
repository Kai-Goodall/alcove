import { AnimatePresence } from "motion/react";
import { ApartmentCard } from "@/components/apartment-card";
import type { Apartment } from "@/lib/apartment";

const MIN_LOADING_CARDS = 6;

export interface ApartmentGridProps {
	apartments: Apartment[] | undefined;
	/**
	 * Serialized filter state. Included in each card's key so that changing
	 * filters remounts every visible card, triggering exit + enter animations
	 * for the entire set — not just items that actually entered/left the
	 * filtered subset.
	 */
	filterKey: string;
	onSelect: (id: Apartment["_id"]) => void;
}

function ApartmentGrid({
	apartments,
	filterKey,
	onSelect,
}: ApartmentGridProps) {
	if (apartments !== undefined && apartments.length === 0) {
		return (
			<div className="flex min-h-[240px] w-full flex-col items-center justify-center text-center text-secondary">
				<p className="text-[14px] font-medium tracking-[-0.2px]">
					No apartments match those filters.
				</p>
			</div>
		);
	}

	const isLoading = apartments === undefined;
	const slots: (Apartment | undefined)[] = isLoading
		? Array.from({ length: MIN_LOADING_CARDS })
		: apartments;

	return (
		<GridShell>
			<AnimatePresence mode="popLayout">
				{slots.map((apartment, index) => (
					<ApartmentCard
						key={`${filterKey}:${index}`}
						apartment={apartment}
						skeleton={apartment === undefined}
						onSelect={onSelect}
						index={index}
					/>
				))}
			</AnimatePresence>
		</GridShell>
	);
}

function GridShell({ children }: { children: React.ReactNode }) {
	return <div className="grid w-full grid-cols-3 gap-3">{children}</div>;
}

export { ApartmentGrid };
