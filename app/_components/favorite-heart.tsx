import { useMutation } from "convex/react";
import { motion } from "motion/react";
import { IconHeartFill18 } from "nucleo-ui-fill-18";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon } from "@/_components/ui/icon";
import { cn } from "@/_lib/utils";

export interface FavoriteHeartProps {
  apartmentId: Id<"apartments">;
  isFavorite: boolean;
  size?: 18 | 24;
  /**
   * `card` reveals the outline heart on group hover (when the card is
   * hovered); `drawer` shows it persistently.
   */
  context?: "card" | "drawer";
  className?: string;
}

function FavoriteHeart({
  apartmentId,
  isFavorite,
  size = 18,
  context = "drawer",
  className,
}: FavoriteHeartProps) {
  const setFavorite = useMutation(
    api.apartments.setFavorite,
  ).withOptimisticUpdate((localStore, args) => {
    const lists = localStore.getAllQueries(api.apartments.list);
    for (const { args: listArgs, value } of lists) {
      if (!value) continue;
      localStore.setQuery(
        api.apartments.list,
        listArgs,
        value.map((apt) =>
          apt._id === args.id ? { ...apt, isFavorite: args.isFavorite } : apt,
        ),
      );
    }
    const detail = localStore.getQuery(api.apartments.get, { id: args.id });
    if (detail) {
      localStore.setQuery(
        api.apartments.get,
        { id: args.id },
        { ...detail, isFavorite: args.isFavorite },
      );
    }
  });

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    void setFavorite({ id: apartmentId, isFavorite: !isFavorite });
  };

  // Extend the visible hit target via a pseudo-element so the icon stays
  // small while keyboard / pointer interaction has a comfortable area.
  return (
    <motion.button
      type="button"
      onClick={handleClick}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full outline-none",
        "before:absolute before:-inset-2 before:content-['']",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "transition-[color,opacity] duration-200 ease-ui-out",
        isFavorite
          ? "text-swatch-coral opacity-100"
          : context === "card"
            ? "text-secondary opacity-0 group-hover/card:opacity-30 hover:opacity-60 focus-visible:opacity-60"
            : "text-secondary opacity-30 hover:opacity-60",
        className,
      )}
      initial={false}
      animate={{ transform: "scale(1)" }}
      whileTap={{ transform: "scale(0.9)" }}
      transition={{ type: "spring", duration: 0.18, bounce: 0 }}
    >
      <Icon glyph={IconHeartFill18} size={size} />
    </motion.button>
  );
}

export { FavoriteHeart };
