import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL. Run `npx convex dev` to configure it.");
}

export const convex = new ConvexReactClient(convexUrl);
