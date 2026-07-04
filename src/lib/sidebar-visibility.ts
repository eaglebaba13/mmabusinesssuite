import { useEffect, useState, useCallback } from "react";

export type SidebarSectionKey =
  | "operations"
  | "academy"
  | "inventory"
  | "pos"
  | "finance"
  | "insights"
  | "marketing"
  | "trainer"
  | "franchisee"
  | "state_franchise"
  | "admin";

export const SIDEBAR_SECTIONS: { key: SidebarSectionKey; label: string; description: string }[] = [
  { key: "operations", label: "Operations", description: "Dashboard, Leads, Franchisees, State Franchises" },
  { key: "academy", label: "Academy", description: "Academy module" },
  { key: "inventory", label: "Inventory", description: "Inventory module" },
  { key: "pos", label: "Sales / POS", description: "POS / Billing" },
  { key: "finance", label: "Finance", description: "Finance, Invoices, Accounts, Payouts" },
  { key: "insights", label: "Insights", description: "Reports, Entity Dashboards" },
  { key: "marketing", label: "Marketing", description: "Webinars" },
  { key: "trainer", label: "Trainer", description: "Trainer Portal" },
  { key: "franchisee", label: "Franchisee", description: "My Franchise tabs" },
  { key: "state_franchise", label: "State Franchise", description: "My State" },
  { key: "admin", label: "Admin", description: "Audit Logs, Impersonation Sessions" },
];

const STORAGE_KEY = "mma:sidebar:hidden-sections";
const EVENT = "mma:sidebar-visibility-changed";

function read(): Set<SidebarSectionKey> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as SidebarSectionKey[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function useSidebarHidden() {
  const [hidden, setHidden] = useState<Set<SidebarSectionKey>>(() => read());

  useEffect(() => {
    const handler = () => setHidden(read());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const toggle = useCallback((key: SidebarSectionKey, visible: boolean) => {
    const next = read();
    if (visible) next.delete(key);
    else next.add(key);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const reset = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { hidden, toggle, reset };
}
