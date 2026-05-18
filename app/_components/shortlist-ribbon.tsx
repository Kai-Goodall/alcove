/**
 * Diagonal red ribbon shown across the top-right corner of a card whose
 * `status === "shortlist"`. Status is set by the ingest model, not the user.
 * The card needs `relative overflow-hidden rounded-…` so the ribbon clips
 * cleanly to the rounded corner.
 */
function ShortlistRibbon() {
  return (
    <div
      aria-label="Shortlist"
      role="img"
      className="pointer-events-none absolute top-0 right-0 flex size-[77.4px] -translate-y-[18px] translate-x-[18px] items-center justify-center"
    >
      <div
        className="h-[95.1px] w-[14.4px] -rotate-45 shadow-[0_1px_4px_rgba(0,0,0,0.15)]"
        style={{
          backgroundImage:
            "linear-gradient(193.62deg, rgb(235, 101, 77) 18.19%, rgb(225, 57, 27) 81.81%)",
        }}
      />
    </div>
  );
}

export { ShortlistRibbon };
