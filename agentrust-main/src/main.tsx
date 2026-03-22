import { Buffer } from "buffer";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

createRoot(document.getElementById("root")!).render(<App />);
