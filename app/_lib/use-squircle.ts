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
 * @remarks
 * `autoEffects` is forced off. Lisse's default behaviour is to extract
 * the element's CSS `box-shadow` + `border` on mount and re-render them
 * as SVG effects so they trace the squircle exactly. That requires a
 * wrapper `<div>` for the SVG overlay — which the hook (vs. the
 * component) doesn't create — so the stripped shadows just vanish.
 * Disabling auto-extract leaves the CSS shadow on the element, which
 * also lets motion's `animate={{ boxShadow }}` and CSS transitions on
 * `box-shadow` continue working. The shadow's perimeter follows the
 * element's border-box (so set a matching `rounded-*` for a clean look)
 * rather than the squircle path, but the visual gap is small at the
 * shadow blurs we use.
 *
 * @param ref  the element to clip
 * @param radius  CSS pixels for all four corners
 */
function useSquircle(
	ref: RefObject<HTMLElement | null>,
	radius: number,
): void {
	useSmoothCorners(ref, { radius, smoothing: 0.6 }, { autoEffects: false });
}

export { useSquircle };
