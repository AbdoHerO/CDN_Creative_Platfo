/** Minimal structured logger for the worker (one JSON line per event). */
function write(level: "info" | "warn" | "error", message: string, data?: unknown) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg: message, ...(data && typeof data === "object" ? data : data !== undefined ? { data } : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (m: string, d?: unknown) => write("info", m, d),
  warn: (m: string, d?: unknown) => write("warn", m, d),
  error: (m: string, d?: unknown) => write("error", m, d),
};
