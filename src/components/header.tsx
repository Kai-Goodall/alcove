import { Typography } from "@/components/ui/typography";

function Header() {
  return (
    <header className="flex items-center">
      <Typography variant="h1" className="text-foreground">
        Alcove
      </Typography>
    </header>
  );
}

export { Header };
