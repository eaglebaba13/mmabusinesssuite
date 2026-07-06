import * as React from "react";

/**
 * useState variant that persists to sessionStorage so form data survives
 * route navigation, tab switches, and component remounts within a session.
 *
 * Clears itself when the user closes the browser tab.
 * Use a unique, stable `key` per form field (e.g. "pos.cart", "pos.customer").
 */
export function usePersistedState<T>(
  key: string,
  initial: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = React.useState<T>(() => {
    if (typeof window === "undefined") {
      return typeof initial === "function" ? (initial as () => T)() : initial;
    }
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* ignore corrupt storage */
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or serialization error — ignore */
    }
  }, [key, value]);

  const clear = React.useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }, [key]);

  return [value, setValue, clear];
}
