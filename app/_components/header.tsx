"use client";

import { IconPlusFill18 } from "@/_components/ui/icons";
import { Button } from "@/_components/ui/button";
import { Icon } from "@/_components/ui/icon";
import { Typography } from "@/_components/ui/typography";

interface HeaderProps {
  onOpenAdd: () => void;
}

function Header({ onOpenAdd }: HeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <Typography variant="h1" className="text-foreground">
        Alcove
      </Typography>
      <Button
        aria-label="Add apartment"
        onClick={onOpenAdd}
        data-add-apartment-trigger
      >
        <Icon glyph={IconPlusFill18} size={14} />
        Add
      </Button>
    </header>
  );
}

export { Header };
