/**
 * Global error capture for the React frontend.
 * Sends every JS error / unhandled rejection / console.error / API failure
 * to the backend at POST /api/system-logs so super-admin can review them.
 *
 * Safe: never throws; never blocks the UI; deduplicates same message
 * within a 5-second window; backs off if backend is unreachable.
 */
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ENDPOINT = `${API}/system-logs`;

const recent = new Map(); // message -> last sent ts
const DEDUP_WINDOW_MS = 5000;
let consecutiveFailures = 0;
let suspended = false;

function isDuplicate(message) {
  const now = Date.now();
  const last = recent.get(message);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recent.set(message, now);
  // Bound the map
  if (recent.size > 200) {
    const oldest = [...recent.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) recent.delete(oldest[0]);
  }
  return false;
}

async function ship(entry) {
  if (suspended) return;
  if (isDuplicate(entry.message)) return;
  try {
    const token = localStorage.getItem("token");
    await axios.post(ENDPOINT, entry, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 5000,
    });
    consecutiveFailures = 0;
  } catch (_e) {
    consecutiveFailures += 1;
    if (consecutiveFailures >= 5) {
      suspended = true;
      // Auto-resume after a minute so a transient outage doesn't kill logging forever
      setTimeout(() => {
        suspended = false;
        consecutiveFailures = 0;
      }, 60_000);
    }
  }
}

function installGlobalHandlers() {
  // 1. window.onerror
  window.addEventListener("error", (ev) => {
    ship({
      level: "error",
      source: "frontend",
      type: "js_error",
      message: ev?.message || "window error",
      stack: ev?.error?.stack || null,
      url: window.location.href,
    });
  });

  // 2. unhandled Promise rejections
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev?.reason;
    const msg = reason?.message || (typeof reason === "string" ? reason : "Unhandled rejection");
    ship({
      level: "error",
      source: "frontend",
      type: "unhandled_rejection",
      message: msg,
      stack: reason?.stack || null,
      url: window.location.href,
    });
  });

  // 3. console.error wrapper (keeps original behavior)
  const origError = console.error.bind(console);
  console.error = (...args) => {
    try {
      const msg = args
        .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ")
        .slice(0, 4000);
      // Skip noisy react devtools messages
      if (!/Download the React DevTools/i.test(msg)) {
        ship({
          level: "error",
          source: "frontend",
          type: "console_error",
          message: msg,
          url: window.location.href,
        });
      }
    } catch (_) {}
    origError(...args);
  };
}

/**
 * Attach an axios response interceptor to an existing instance so all API
 * failures (4xx/5xx) are reported as backend-side errors.
 */
export function attachAxiosLogger(axiosInstance) {
  axiosInstance.interceptors.response.use(
    (r) => r,
    (err) => {
      try {
        const status = err?.response?.status;
        if (status && status >= 400) {
          ship({
            level: status >= 500 ? "error" : "warn",
            source: "api",
            type: "api_error",
            message: `${err.config?.method?.toUpperCase() || "GET"} ${err.config?.url || ""} -> ${status} ${err.response?.statusText || ""}`.trim(),
            url: err.config?.url,
            status_code: status,
            metadata: {
              data: typeof err.response?.data === "string"
                ? err.response.data.slice(0, 1000)
                : (() => {
                    try { return JSON.parse(JSON.stringify(err.response?.data || {})); } catch (_) { return {}; }
                  })(),
            },
          });
        }
      } catch (_) {}
      return Promise.reject(err);
    }
  );
}

let installed = false;
export function initErrorLogger() {
  if (installed) return;
  installed = true;
  installGlobalHandlers();
}

export default { initErrorLogger, attachAxiosLogger };
