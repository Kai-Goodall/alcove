import { Typography } from "@/components/ui/typography";

function Header() {
  return (
    <header className="flex items-center justify-between">
      <Typography variant="h1" className="text-foreground">
        Alcove
      </Typography>
      <UserDot />
    </header>
  );
}

function UserDot() {
  return (
    <div
      aria-hidden
      className="relative size-6 overflow-hidden rounded-full bg-card shadow-[0_0_0_3px_rgb(223_218_214)]"
    >
      <div
        className="absolute inset-0 size-full"
        style={{
          background:
            "radial-gradient(circle at 50% 70%, rgb(96 121 200 / 0.95) 0%, rgb(96 121 200 / 0.55) 38%, rgb(96 121 200 / 0) 70%)",
          filter: "blur(6.6px)",
        }}
      />
    </div>
  );
}

export { Header };
