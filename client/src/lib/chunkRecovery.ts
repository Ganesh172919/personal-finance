const RELOAD_KEY = "finwise.chunk-recovery-at";
const COOLDOWN_MS = 60_000;

/** Recover old open tabs after deployment without reloading indefinitely offline. */
export function installChunkRecovery(reload: () => void = () => window.location.reload()) {
  const recover = (event: Event) => {
    const now = Date.now();
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY));
      if (last > 0 && now - last < COOLDOWN_MS) return;
      sessionStorage.setItem(RELOAD_KEY, String(now));
    } catch {
      // Without persistent per-tab state we cannot safely prevent a reload loop.
      return;
    }
    event.preventDefault();
    reload();
  };
  window.addEventListener("vite:preloadError", recover);
  return () => window.removeEventListener("vite:preloadError", recover);
}
