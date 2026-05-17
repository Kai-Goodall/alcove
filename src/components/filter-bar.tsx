import { IconFilterFillDuo18 } from "nucleo-ui-fill-duo-18";
import { FilterMenu, type FilterValues } from "@/components/filter-menu";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SegmentedTabs,
  type SegmentItem,
} from "@/components/ui/segmented-tabs";
import { cn } from "@/lib/utils";

export type TrackFilter = "all" | "1br" | "2br" | "3br";

const TRACK_ITEMS: SegmentItem[] = [
  { value: "all", label: "All" },
  { value: "1br", label: "1 bed" },
  { value: "2br", label: "2 beds" },
  { value: "3br", label: "3 beds" },
];

export interface FilterBarProps {
  track: TrackFilter;
  onTrackChange: (next: TrackFilter) => void;
  query: string;
  onQueryChange: (next: string) => void;
  filters: FilterValues;
  onFiltersChange: (next: Partial<FilterValues>) => void;
}

function FilterBar({
  track,
  onTrackChange,
  query,
  onQueryChange,
  filters,
  onFiltersChange,
}: FilterBarProps) {
  return (
    <div className="flex items-center justify-between">
      <SegmentedTabs
        items={TRACK_ITEMS}
        value={track}
        onValueChange={(value) => onTrackChange(value as TrackFilter)}
        aria-label="Filter by bedrooms"
      />
      <div className="flex w-[250px] items-center gap-[10px]">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Open filters"
              className={cn(
                "inline-flex size-[18px] items-center justify-center rounded-full text-secondary outline-none",
                "transition-colors hover:text-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <Icon glyph={IconFilterFillDuo18} size={18} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" sideOffset={10}>
            <FilterMenu values={filters} onChange={onFiltersChange} />
          </PopoverContent>
        </Popover>
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Search"
          aria-label="Search apartments"
          className="flex-1"
        />
      </div>
    </div>
  );
}

export { FilterBar };
