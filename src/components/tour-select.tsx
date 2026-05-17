import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TourStatus = "not_yet" | "touring" | "toured";

const TOUR_OPTIONS: { value: TourStatus; menuLabel: string }[] = [
  { value: "not_yet", menuLabel: "Not toured" },
  { value: "touring", menuLabel: "Touring" },
  { value: "toured", menuLabel: "Toured" },
];

/**
 * The trigger label is the *action* when nothing is set yet ("Mark as toured")
 * but flips to the current state once the user has chosen.
 */
function triggerLabel(status: TourStatus): string {
  switch (status) {
    case "touring":
      return "Touring";
    case "toured":
      return "Toured";
    case "not_yet":
    default:
      return "Mark as toured";
  }
}

export interface TourSelectProps {
  apartmentId: Id<"apartments">;
  tourStatus: TourStatus | undefined;
}

function TourSelect({ apartmentId, tourStatus }: TourSelectProps) {
  const value: TourStatus = tourStatus ?? "not_yet";

  const setTourStatus = useMutation(
    api.apartments.setTourStatus,
  ).withOptimisticUpdate((localStore, args) => {
    const lists = localStore.getAllQueries(api.apartments.list);
    for (const { args: listArgs, value: listValue } of lists) {
      if (!listValue) continue;
      localStore.setQuery(
        api.apartments.list,
        listArgs,
        listValue.map((apt) =>
          apt._id === args.id ? { ...apt, tourStatus: args.tourStatus } : apt,
        ),
      );
    }
    const detail = localStore.getQuery(api.apartments.get, { id: args.id });
    if (detail) {
      localStore.setQuery(
        api.apartments.get,
        { id: args.id },
        { ...detail, tourStatus: args.tourStatus },
      );
    }
  });

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        void setTourStatus({
          id: apartmentId,
          tourStatus: next as TourStatus,
        });
      }}
    >
      <SelectTrigger aria-label="Tour status">
        {/* Always render our own custom label, not the option's text. */}
        <SelectValue>{triggerLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TOUR_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.menuLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { TourSelect };
