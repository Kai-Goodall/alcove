import { useEffect, useRef, useState } from "react";
import {
	motion,
	useMotionTemplate,
	useMotionValue,
	useScroll,
	useTransform,
	type MotionValue,
} from "motion/react";
import { IconArrowLeftFill18, IconArrowRightFill18 } from "@/_components/ui/icons";
import { Button } from "@/_components/ui/button";
import { Icon } from "@/_components/ui/icon";
import { cn } from "@/_lib/utils";

export interface ScrollContainerProps {
	children: React.ReactNode;
	className?: string;
	/** Inner scroll padding + fade width on each end. Default 16. */
	padding?: number;
	/** Pixels scrolled per arrow click. Default 160. */
	scrollStep?: number;
	/** Show nav arrows when content overflows. Default true. */
	arrows?: boolean;
	/** Gap between children (Tailwind size unit). Default 2 (8px). */
	gap?: number;
}

function ScrollContainer({
	children,
	className,
	padding = 16,
	scrollStep = 160,
	arrows = true,
	gap = 2,
}: ScrollContainerProps) {
	const scrollerRef = useRef<HTMLDivElement>(null);
	const maxScrollMV = useMotionValue(0);
	const [hasOverflow, setHasOverflow] = useState(false);

	// Recompute the max scrollable distance whenever the scroller resizes or
	// its children change (added/removed/resized). The motion value is what the
	// transform graph subscribes to — keeping it as a MV avoids re-renders.
	useEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		const update = () => {
			const max = Math.max(0, el.scrollWidth - el.clientWidth);
			maxScrollMV.set(max);
			setHasOverflow(max > 0);
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		const mo = new MutationObserver(update);
		mo.observe(el, { childList: true, subtree: true });
		return () => {
			ro.disconnect();
			mo.disconnect();
		};
	}, [maxScrollMV]);

	const { scrollX } = useScroll({ container: scrollerRef, axis: "x" });

	// Each fade grows 0 → `padding` as the user scrolls away from that edge.
	const leftFade = useTransform(scrollX, (s) =>
		Math.max(0, Math.min(padding, s)),
	);
	const rightFade = useTransform([scrollX, maxScrollMV], (values) => {
		const [s, m] = values as [number, number];
		return Math.max(0, Math.min(padding, m - s));
	});

	// CSS mask: opaque interior, transparent edges that grow as we scroll.
	const maskImage = useMotionTemplate`linear-gradient(to right, transparent 0px, #000 ${leftFade}px, #000 calc(100% - ${rightFade}px), transparent 100%)`;

	// Arrow opacity tracks the fade — visible exactly when its edge is fading.
	const leftArrowOpacity = useTransform(leftFade, [0, padding], [0, 1]);
	const rightArrowOpacity = useTransform(rightFade, [0, padding], [0, 1]);

	const scrollByStep = (direction: -1 | 1) => {
		scrollerRef.current?.scrollBy({
			left: direction * scrollStep,
			behavior: "smooth",
		});
	};

	return (
		<div className={cn("relative", className)}>
			<motion.div
				ref={scrollerRef}
				style={{
					maskImage,
					WebkitMaskImage: maskImage,
					paddingInline: padding,
					gap: `calc(var(--spacing) * ${gap})`,
				}}
				className="flex overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{children}
			</motion.div>

			{arrows && hasOverflow ? (
				<>
					<ArrowButton
						direction="left"
						opacity={leftArrowOpacity}
						onClick={() => scrollByStep(-1)}
					/>
					<ArrowButton
						direction="right"
						opacity={rightArrowOpacity}
						onClick={() => scrollByStep(1)}
					/>
				</>
			) : null}
		</div>
	);
}

interface ArrowButtonProps {
	direction: "left" | "right";
	opacity: MotionValue<number>;
	onClick: () => void;
}

function ArrowButton({ direction, opacity, onClick }: ArrowButtonProps) {
	const glyph =
		direction === "left" ? IconArrowLeftFill18 : IconArrowRightFill18;
	return (
		<motion.div
			style={{ opacity }}
			className={cn(
				"absolute top-1/2 -translate-y-1/2",
				direction === "left" ? "left-1" : "right-1",
			)}
		>
			<Button
				aria-label={direction === "left" ? "Scroll left" : "Scroll right"}
				size="icon"
				variant="raised"
				onClick={onClick}
			>
				<Icon glyph={glyph} size={14} />
			</Button>
		</motion.div>
	);
}

export { ScrollContainer };
