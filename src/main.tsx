import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider } from "convex/react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import App from "./App";
import { convex } from "./lib/convex";
import { queryClient } from "./lib/query-client";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    </QueryClientProvider>
  </StrictMode>,
);
