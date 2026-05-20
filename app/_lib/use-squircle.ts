"use client";

import { useSmoothCorners } from "@lisse/react";
import type { RefObject } from "react";

/**
 * Apply a Figma-quality squircle clip-path to a referenced element. Uses
 * the @lisse/react smooth-corners hook with Figma's standard smoothing
 * factor (0.6) so the rendered curvature matches what designers draw,
 * meaning the `radius` value passed here is what shows up visually — no
 * compensation bump needed (unlike CSS `corner-shape: squircle`, which
 * reads ~4–8px tighter than Figma at the same numeric radius).
 *
 * @param ref  the element to clip
 * @param radius  CSS pixels for all four corners
 */
function useSquircle(
	ref: RefObject<HTMLElement | null>,
	radius: number,
): void {
	useSmoothCorners(ref, { radius, smoothing: 0.6 });
}

export { useSquircle };
