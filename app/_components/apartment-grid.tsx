import { motion } from "motion/react";
import { ApartmentCard } from "@/_components/apartment-card";
import type { Apartment } from "@/_lib/apartment";

const MIN_LOADING_CARDS = 6;

export interface ApartmentGridProps {
	apartments: Apartment[] | undefined;
	onSelect: (id: Apartment["_id"]) => void;
}

function ApartmentGrid({ apartments, onSelect }: ApartmentGridProps) {
	if (apartments !== undefined && apartments.length === 0) {
		return (
			<div className="flex min-h-[240px] w-full flex-col items-center justify-center text-center text-secondary">
				<p className="text-[14px] font-medium tracking-[-0.2px]">
					No apartments match those filters.
				</p>
			</div>
		);
	}

	return (
		<motion.div
			className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			{apartments === undefined
				? Array.from({ length: MIN_LOADING_CARDS }).map((_, index) => (
						<motion.div
							key={`skeleton-${index}`}
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								duration: 0.32,
								ease: "easeOut",
								delay: index * 0.04,
							}}
						>
							<ApartmentCard skeleton index={index} />
						</motion.div>
					))
				: apartments.map((apartment, index) => (
						<ApartmentCard
							key={apartment._id}
							apartment={apartment}
							onSelect={onSelect}
							index={index}
						/>
					))}
		</motion.div>
	);
}

export { ApartmentGrid };
