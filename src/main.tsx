import { createRoot } from "react-dom/client";

// Temporary application entrypoint. Product UI workstreams may replace only this
// rendered node; platform configuration stays in src/lib/platform.ts.
createRoot(document.getElementById("root")!).render(<div data-app="calle-ai" />);
