import { FadeImage } from "@/_components/ui/fade-image";
import { Icon } from "@/_components/ui/icon";
import { FavoriteHeart } from "@/_components/favorite-heart";
import { ShortlistRibbon } from "@/_components/shortlist-ribbon";
import {
	BathroomIcon,
	BedroomIcon,
	type Apartment,
	formatPrice,
	getBathroomCount,
	getBedroomCount,
	getDisplayName,
	getRepresentativeImage,
} from "@/_lib/apartment";
import { cn } from "@/_lib/utils";

export interface ApartmentCardProps {
	apartment?: Apartment;
	skeleton?: boolean;
	onSelect?: (id: Apartment["_id"]) => void;
	/** Index in the visible list — used to bias the first row toward eager loading. */
	index: number;
}

function ApartmentCard({
	apartment,
	skeleton = false,
	onSelect,
	index,
}: ApartmentCardProps) {
	const isSkeleton = skeleton || !apartment;
	const isHidden = apartment?.hidden === true;

	const handleSelect = () => {
		if (isSkeleton || !apartment || !onSelect) return;
		onSelect(apartment._id);
	};
	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (isSkeleton) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleSelect();
		}
	};

	return (
		<article
			role={isSkeleton ? undefined : "button"}
			tabIndex={isSkeleton ? -1 : 0}
			onClick={isSkeleton ? undefined : handleSelect}
			onKeyDown={isSkeleton ? undefined : handleKeyDown}
			aria-label={
				isSkeleton ? undefined : `Open ${getDisplayName(apartment!)} details`
			}
			aria-hidden={isSkeleton}
			data-apartment-card={isSkeleton ? undefined : ""}
			className={cn(
				"group/card squircle relative flex flex-col gap-1 overflow-hidden rounded-[40px] bg-card p-2",
				"shadow-card-1 outline-none",
				"transition duration-200 ease-[cubic-bezier(0.34,1.3,0.64,1)] will-change-transform",
				isSkeleton
					? "cursor-default"
					: "cursor-pointer hover:-translate-y-1 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				isHidden ? "opacity-60" : "opacity-100",
			)}
		>
			{isSkeleton ? (
				<SkeletonContent />
			) : (
				<>
					<CardContent apartment={apartment!} index={index} />
					{apartment!.status === "shortlist" ? <ShortlistRibbon /> : null}
				</>
			)}
		</article>
	);
}

function CardContent({
	apartment,
	index,
}: {
	apartment: Apartment;
	index: number;
}) {
	const image = getRepresentativeImage(apartment);
	const beds = getBedroomCount(apartment);
	const baths = getBathroomCount(apartment);
	const isPriority = index < 3;

	return (
		<>
			<div className="squircle relative aspect-[1920/1080] w-full overflow-hidden rounded-[24px] bg-muted shadow-card-1">
				{image?.url ? (
					<FadeImage
						src={image.url}
						alt={image.image.caption ?? ""}
						loading={isPriority ? "eager" : "lazy"}
						decoding="async"
						fetchPriority={isPriority ? "high" : "auto"}
						className="absolute inset-0 size-full object-cover"
					/>
				) : null}
			</div>

			<div className="flex flex-col gap-1 px-2 py-1.5">
				<div className="flex items-center justify-between gap-2">
					<h3 className="truncate text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-foreground">
						{getDisplayName(apartment)}
					</h3>
					<FavoriteHeart
						apartmentId={apartment._id}
						isFavorite={apartment.isFavorite === true}
						size={18}
						context="card"
					/>
				</div>
				<MetaRow price={apartment.offer.price} beds={beds} baths={baths} />
			</div>
		</>
	);
}

function SkeletonContent() {
	return (
		<>
			<div
				aria-hidden
				className="squircle aspect-[1920/1080] w-full animate-pulse rounded-[24px] bg-muted shadow-card-1"
			/>
			<div aria-hidden className="flex flex-col gap-2 px-2 py-1.5">
				<div className="h-[16px] w-2/3 animate-pulse rounded bg-muted" />
				<div className="h-[14px] w-1/2 animate-pulse rounded bg-muted" />
			</div>
		</>
	);
}

interface MetaRowProps {
	price: number | undefined;
	beds: number | undefined;
	baths: number | undefined;
}

function MetaRow({ price, beds, baths }: MetaRowProps) {
	const items: React.ReactNode[] = [];
	if (price !== undefined) {
		items.push(<span key="price">{formatPrice(price)}</span>);
	}
	if (beds !== undefined) {
		items.push(
			<span key="beds" className="flex items-center gap-0.5">
				<Icon glyph={BedroomIcon} size={14} />
				<span>{beds}</span>
			</span>,
		);
	}
	if (baths !== undefined) {
		items.push(
			<span key="baths" className="flex items-center gap-0.5">
				<Icon glyph={BathroomIcon} size={14} />
				<span>{baths}</span>
			</span>,
		);
	}

	if (items.length === 0) return null;

	return (
		<div className="flex items-center gap-1 text-[14px] font-medium leading-[16px] tracking-[-0.3px] text-secondary">
			{items.map((item, i) => (
				<span key={i} className="flex items-center gap-1">
					{i > 0 ? (
						<span
							aria-hidden
							className="block size-[2px] rounded-full bg-secondary/40"
						/>
					) : null}
					{item}
				</span>
			))}
		</div>
	);
}

export { ApartmentCard };
