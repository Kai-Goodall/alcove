"use client";

import { IconHouseSearchFill24, IconPlusFill18 } from "@/_components/ui/icons";
import { Button } from "@/_components/ui/button";
import { Icon } from "@/_components/ui/icon";
import { Typography } from "@/_components/ui/typography";

interface HeaderProps {
  onOpenAdd: () => void;
  onOpenSearch: () => void;
}

function Header({ onOpenAdd, onOpenSearch }: HeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <Typography variant="h1" className="text-foreground">
        Alcove
      </Typography>
      <div className="flex items-center gap-2">
        <Button
          aria-label="Search apartments"
          variant="quiet"
          onClick={onOpenSearch}
          data-search-trigger
        >
          <Icon glyph={IconHouseSearchFill24} size={14} />
          Search
        </Button>
        <Button
          aria-label="Add apartment"
          onClick={onOpenAdd}
          data-add-apartment-trigger
        >
          <Icon glyph={IconPlusFill18} size={14} />
          Add
        </Button>
      </div>
    </header>
  );
}

export { Header };
