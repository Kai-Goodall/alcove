import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { IconChevronLeftFill18 } from "nucleo-ui-fill-18";
import { api } from "../../../convex/_generated/api";
import { ImageGallery } from "@/_components/drawer/image-gallery";
import { StatCards } from "@/_components/drawer/stat-cards";
import { MoveIn } from "@/_components/drawer/move-in";
import { Location } from "@/_components/drawer/location";
import { Notes } from "@/_components/drawer/notes";
import { FavoriteHeart } from "@/_components/favorite-heart";
import { TourSelect } from "@/_components/tour-select";
import { Icon } from "@/_components/ui/icon";
import {
	formatPrice,
	formatStreetAddress,
	getDisplayName,
	type Apartment,
} from "@/_lib/apartment";
import { cn } from "@/_lib/utils";

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("en", {
	numeric: "auto",
});

export interface ApartmentDrawerProps {
	/** The initially-loaded apartment passed from the grid; renders instantly. */
	initialApartment: Apartment;
	onClose: () => void;
	/** Notified when the pointer enters or leaves the drawer. */
	onHoverChange?: (hovered: boolean) => void;
	/** Distance from the viewport's right edge, in px. */
	rightOffset: number;
	/** When true, render as a full-screen sheet with a back chevron. */
	isMobile?: boolean;
}

function ApartmentDrawer({
	initialApartment,
	onClose,
	onHoverChange,
	rightOffset,
	isMobile = false,
}: ApartmentDrawerProps) {
	const drawerRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Convex pushes updates on this query — keeps the drawer fresh if the doc
	// changes (e.g. status flips elsewhere) while preserving the initial paint.
	const refreshed = useQuery(api.apartments.get, { id: initialApartment._id });
	const apartment = refreshed ?? initialApartment;

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			// If an inner overlay (select, popover) or a focused field already
			// claimed Escape, let it close just that layer and leave the drawer.
			if (event.defaultPrevented) return;
			const target = event.target as Element | null;
			if (target?.closest("[data-overlay-content]")) return;
			event.preventDefault();
			onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	// Click outside the drawer closes it — except when the click lands on
	// another apartment card OR inside a portaled overlay (select menu,
	// popover) whose content is rendered outside the drawer DOM tree. On
	// mobile the drawer is a full sheet, so there is no "outside" — skip.
	useEffect(() => {
		if (isMobile) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target) return;
			if (drawerRef.current?.contains(target)) return;
			if (target.closest("[data-apartment-card]")) return;
			if (target.closest("[data-overlay-content]")) return;
			onClose();
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [onClose, isMobile]);

	// Reset scroll to top when the displayed apartment changes.
	useEffect(() => {
		scrollRef.current?.scrollTo({
			top: 0,
			behavior: "instant" as ScrollBehavior,
		});
	}, [apartment._id]);

	return (
		<motion.aside
			ref={drawerRef}
			role="dialog"
			aria-modal={isMobile ? "true" : "false"}
			aria-label={`${getDisplayName(apartment)} details`}
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
				"pointer-events-auto fixed z-30 overflow-hidden bg-card",
				isMobile
					? "inset-0 rounded-none"
					: "squircle top-16 bottom-16 w-[525px] max-w-[calc(100vw-32px)] rounded-[48px] shadow-card-2",
			)}
		>
			{isMobile ? (
				<button
					type="button"
					aria-label="Close apartment details"
					onClick={onClose}
					className="absolute top-3 left-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-card/85 text-foreground shadow-card-1 backdrop-blur-md outline-none transition-colors hover:bg-button-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
				>
					<Icon glyph={IconChevronLeftFill18} size={18} />
				</button>
			) : null}
			<div
				ref={scrollRef}
				className="h-full max-h-full overflow-y-auto [scrollbar-width:thin]"
			>
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.div
						key={apartment._id}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
						className="flex flex-col gap-6 p-4"
					>
						<ImageGallery
							apartmentId={apartment._id}
							images={apartment.images}
							isMobile={isMobile}
						/>
						<div className="flex flex-col gap-5 px-4 pb-4">
							<ApartmentSummary apartment={apartment} />
							<StatCards apartment={apartment} />
							<div className="flex flex-col gap-5 sm:flex-row sm:items-stretch">
								<MoveIn apartment={apartment} />
								<Location apartment={apartment} />
							</div>
							<div className="flex flex-col gap-3.5">
								<Notes apartment={apartment} />
								<DrawerFooter apartment={apartment} />
							</div>
						</div>
					</motion.div>
				</AnimatePresence>
			</div>
		</motion.aside>
	);
}

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

function DrawerFooter({ apartment }: { apartment: Apartment }) {
	const isHidden = apartment.hidden === true;
	const setHidden = useMutation(api.apartments.setHidden).withOptimisticUpdate(
		(localStore, args) => {
			const lists = localStore.getAllQueries(api.apartments.list);
			for (const { args: listArgs, value } of lists) {
				if (!value) continue;
				localStore.setQuery(
					api.apartments.list,
					listArgs,
					value.map((apt) =>
						apt._id === args.id ? { ...apt, hidden: args.hidden } : apt,
					),
				);
			}
			const detail = localStore.getQuery(api.apartments.get, { id: args.id });
			if (detail) {
				localStore.setQuery(
					api.apartments.get,
					{ id: args.id },
					{ ...detail, hidden: args.hidden },
				);
			}
		},
	);

	return (
		<div className="flex items-center justify-between gap-4 px-4 text-[14px] font-medium leading-[16px] tracking-[-0.3px] text-secondary">
			<p>Added {formatAddedAt(apartment.createdAt)}</p>
			<button
				type="button"
				aria-pressed={isHidden}
				onClick={() => {
					void setHidden({ id: apartment._id, hidden: !isHidden });
				}}
				className="rounded-full outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
			>
				{isHidden ? "Unhide" : "Hide"}
			</button>
		</div>
	);
}

function ApartmentSummary({ apartment }: { apartment: Apartment }) {
	const street = formatStreetAddress(apartment.apartment.address);
	const listingHref = apartment.listing.url;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-5">
				<div className="flex min-w-0 flex-1 items-center gap-1.5">
					<h1 className="min-w-0 truncate text-[26px] font-medium leading-[30px] tracking-[-0.38px] text-foreground">
						{getDisplayName(apartment)}
					</h1>
					<FavoriteHeart
						apartmentId={apartment._id}
						isFavorite={apartment.isFavorite === true}
						size={24}
						context="drawer"
						className="shrink-0"
					/>
				</div>
				<TourSelect
					apartmentId={apartment._id}
					tourStatus={apartment.tourStatus}
				/>
			</div>
			<div className="flex items-center gap-2.5">
				{apartment.offer.price !== undefined ? (
					<span className="text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-foreground">
						{formatPrice(apartment.offer.price)}
					</span>
				) : null}
				{apartment.offer.price !== undefined && street ? (
					<span
						aria-hidden
						className="block size-1 rounded-full bg-secondary/50"
					/>
				) : null}
				{street ? (
					listingHref ? (
						<a
							href={listingHref}
							target="_blank"
							rel="noreferrer noopener"
							className="text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-secondary underline underline-offset-2 hover:text-foreground"
						>
							{street}
						</a>
					) : (
						<span className="text-[16px] font-medium leading-[18px] tracking-[-0.1px] text-secondary">
							{street}
						</span>
					)
				) : null}
			</div>
		</div>
	);
}

export { ApartmentDrawer };
