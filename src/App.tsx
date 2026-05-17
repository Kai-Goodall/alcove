import { TooltipProvider } from "@/components/ui/tooltip";
import { HomePage } from "@/components/home-page";

function App() {
  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={0}>
      <HomePage />
    </TooltipProvider>
  );
}

export default App;
