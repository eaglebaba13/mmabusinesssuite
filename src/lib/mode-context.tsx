import * as React from "react";

export type AppMode = "testing" | "live";

interface ModeContextValue {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  isTesting: boolean;
}

const ModeContext = React.createContext<ModeContextValue | null>(null);
const STORAGE_KEY = "mma.app.mode";

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<AppMode>(() => {
    if (typeof window === "undefined") return "live";
    return (localStorage.getItem(STORAGE_KEY) as AppMode) || "live";
  });

  const setMode = React.useCallback((m: AppMode) => {
    setModeState(m);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, m);
  }, []);

  return (
    <ModeContext.Provider value={{ mode, setMode, isTesting: mode === "testing" }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const ctx = React.useContext(ModeContext);
  if (!ctx) return { mode: "live" as AppMode, setMode: () => {}, isTesting: false };
  return ctx;
}
