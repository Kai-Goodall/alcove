import { useEffect, useRef, useState } from "react";
import { cn } from "@/_lib/utils";

export type FadeImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

/**
 * <img> that fades in once it's fully decoded. We use `HTMLImageElement.decode()`
 * rather than the `load` event because:
 *   - `load` fires when the bytes are fetched, *before* decode completes — so
 *     attaching to it can still produce a jank-y reveal.
 *   - For HTTP-cached images, `load` can fire before React attaches the
 *     listener, leaving us stuck at opacity:0 forever.
 * `decode()` resolves in a microtask after both fetch + decode, which also
 * guarantees the initial opacity:0 paints once before we flip to opacity:1
 * (giving CSS the previous-value it needs to transition from).
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
		const img = ref.current;
		if (!img || !src) return;
		setLoaded(false);
		let cancelled = false;
		img
			.decode()
			.catch(() => {
				/* decode can reject for broken images; settle anyway so we don't
				   sit blank forever. */
			})
			.finally(() => {
				if (!cancelled) setLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, [src]);

	return (
		<img
			ref={ref}
			src={src}
			onLoad={onLoad}
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
