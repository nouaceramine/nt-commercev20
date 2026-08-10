import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import "@/utils/globalDateFormatter";
import App from "@/App";

// ── Silence benign "ResizeObserver loop completed with undelivered notifications"
// dev-overlay errors. This is a well-known harmless browser warning that fires
// when a ResizeObserver callback triggers a re-layout (common with Radix UI
// dialogs/popovers). It does NOT indicate a real problem.
const RESIZE_OBSERVER_MSG = "ResizeObserver loop";
const _origError = window.onerror;
window.addEventListener("error", (e) => {
  if (e?.message?.includes?.(RESIZE_OBSERVER_MSG)) {
    e.stopImmediatePropagation();
    e.preventDefault();
    return true;
  }
  return false;
}, true);
window.addEventListener("unhandledrejection", (e) => {
  if (typeof e?.reason?.message === "string" && e.reason.message.includes(RESIZE_OBSERVER_MSG)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

// Service workers caused stale-bundle blank pages after redeploys.
// Unregister any previously registered worker instead of registering one.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
