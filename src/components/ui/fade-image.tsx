import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type FadeImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

/**
 * <img> that starts at opacity 0 and fades to 100 once the underlying image
 * actually finishes decoding (via the load event). Handles the cached case
 * where `complete` is already true by the time the effect runs.
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

	// Reset when the source changes so a swapped image fades in again.
	useEffect(() => {
		setLoaded(false);
	}, [src]);

	// If the image is served from cache, `complete` may already be true before
	// React attaches the load listener — sync state in that case.
	useEffect(() => {
		const img = ref.current;
		if (img?.complete && img.naturalWidth > 0) setLoaded(true);
	}, [src]);

	return (
		<img
			ref={ref}
			src={src}
			onLoad={(event) => {
				setLoaded(true);
				onLoad?.(event);
			}}
			onError={(event) => {
				setLoaded(true);
				onError?.(event);
			}}
			className={cn(
				"transition-opacity duration-300 ease-out",
				loaded ? "opacity-100" : "opacity-0",
				className,
			)}
			{...rest}
		/>
	);
}

export { FadeImage };
