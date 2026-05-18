import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/_lib/utils";

type MotionSafeImgProps = Omit<
	React.ImgHTMLAttributes<HTMLImageElement>,
	"onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart"
>;

export type FadeImageProps = MotionSafeImgProps;

/**
 * <img> that fades from opacity 0 → 1 once the underlying image is ready.
 *
 * Implementation uses motion's JS-driven animation instead of a CSS
 * `transition-opacity` class. Why: with a class-driven transition, if React
 * commits the initial `opacity:0` render and the eventual `opacity:1` render
 * inside the same paint cycle (which happens for cached or near-instant
 * loads), the browser never sees a "previous" opacity value and the
 * transition silently no-ops — that's the splat. Motion emits its own
 * animation frames so the value always interpolates from `initial` to
 * `animate`, regardless of React's render timing.
 */
function FadeImage({
	className,
	onLoad,
	onError,
	src,
	...rest
}: FadeImageProps) {
	const [loaded, setLoaded] = useState(false);
	const ref = useRef<HTMLImageElement>(null);

	useEffect(() => {
		setLoaded(false);
		// Handle the cached case: if the browser already has the image, no
		// `load` event will fire after the listener attaches. Re-check once
		// the new src has settled into the DOM.
		const id = requestAnimationFrame(() => {
			const img = ref.current;
			if (img?.complete && img.naturalWidth > 0) setLoaded(true);
		});
		return () => cancelAnimationFrame(id);
	}, [src]);

	return (
		<motion.img
			ref={ref}
			src={src}
			initial={{ opacity: 0 }}
			animate={{ opacity: loaded ? 1 : 0 }}
			transition={{ duration: 0.3, ease: "easeOut" }}
			onLoad={(event) => {
				setLoaded(true);
				onLoad?.(event);
			}}
			onError={(event) => {
				// Settle on error so the slot doesn't sit blank forever.
				setLoaded(true);
				onError?.(event);
			}}
			className={cn(className)}
			{...rest}
		/>
	);
}

export { FadeImage };
