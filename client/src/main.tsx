import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Fetch public runtime config (Razorpay key, etc.) before mounting the app.
// This avoids baking VITE_ env vars into the bundle at build time.
fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    if (cfg.razorpayKeyId) {
      (window as any).__RAZORPAY_KEY__ = cfg.razorpayKeyId;
    }
  })
  .catch(() => {/* non-critical */})
  .finally(() => {
    createRoot(document.getElementById("root")!).render(<App />);
  });
