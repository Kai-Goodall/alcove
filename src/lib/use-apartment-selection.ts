import { useCallback, useEffect, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

const PARAM = "apartment";

function readFromLocation(): Id<"apartments"> | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(PARAM);
  return value ? (value as Id<"apartments">) : null;
}

export function useApartmentSelection(): [
  Id<"apartments"> | null,
  (next: Id<"apartments"> | null) => void,
] {
  const [selected, setSelected] = useState<Id<"apartments"> | null>(
    readFromLocation,
  );

  useEffect(() => {
    const onPop = () => setSelected(readFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setUrlAndState = useCallback((next: Id<"apartments"> | null) => {
    const url = new URL(window.location.href);
    if (next) {
      url.searchParams.set(PARAM, next);
    } else {
      url.searchParams.delete(PARAM);
    }
    window.history.pushState({}, "", url.toString());
    setSelected(next);
  }, []);

  return [selected, setUrlAndState];
}
