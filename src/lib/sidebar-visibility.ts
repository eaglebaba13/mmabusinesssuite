import { useEffect, useState, useCallback } from "react";

export type SidebarSectionKey =
  | "operations"
  | "franchise_network"
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

export type SidebarItem = { id: string; label: string };
export type SidebarSection = {
  key: SidebarSectionKey;
  label: string;
  description: string;
  items: SidebarItem[];
};

// Item ids match the Link `to` prop (or `to?tab=...` for tabbed nav)
export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    key: "operations",
    label: "Operations",
    description: "Dashboard, Leads, Franchisees, State Franchises",
    items: [
      { id: "/app/dashboard", label: "Dashboard" },
      { id: "/app/leads", label: "Leads" },
      { id: "/app/franchisees", label: "Franchisees" },
      { id: "/app/state-franchises", label: "State Franchises" },
    ],
  },
  {
    key: "franchise_network",
    label: "Franchise Network",
    description: "Products, Marketplace, Compare",
    items: [
      { id: "/app/franchise-products", label: "Products" },
      { id: "/app/franchise-marketplace", label: "Marketplace" },
      { id: "/app/franchise-compare", label: "Compare" },
      { id: "/app/agreements", label: "Agreements" },
    ],
  },
  {
    key: "academy",
    label: "Academy",
    description: "Academy module",
    items: [{ id: "/app/academy", label: "Academy" }],
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Inventory module",
    items: [{ id: "/app/inventory", label: "Inventory" }],
  },
  {
    key: "pos",
    label: "Sales / POS",
    description: "POS / Billing",
    items: [{ id: "/app/pos", label: "POS / Billing" }],
  },
  {
    key: "finance",
    label: "Finance",
    description: "Finance, Invoices, Accounts, Payouts",
    items: [
      { id: "/app/finance", label: "Finance" },
      { id: "/app/billing/invoices", label: "Invoices" },
      { id: "/app/accounts", label: "Accounts" },
      { id: "/app/payouts/state", label: "State Payouts" },
      { id: "/app/payouts/city", label: "City Payouts" },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    description: "Reports, Entity Dashboards",
    items: [
      { id: "/app/reports", label: "Reports" },
      { id: "/app/dashboards/academy", label: "Entity Dashboards" },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Webinars",
    items: [{ id: "/app/webinars", label: "Webinars" }],
  },
  {
    key: "trainer",
    label: "Trainer",
    description: "Trainer Portal",
    items: [{ id: "/app/trainer", label: "Trainer Portal" }],
  },
  {
    key: "franchisee",
    label: "Franchisee",
    description: "My Franchise tabs",
    items: [
      { id: "/app/my-franchise?tab=dashboard", label: "My Franchise" },
      { id: "/app/my-franchise?tab=leads", label: "My Leads" },
      { id: "/app/my-franchise?tab=campaigns", label: "My Campaigns" },
      { id: "/app/my-franchise?tab=documents", label: "Documents" },
      { id: "/app/my-franchise?tab=agreements", label: "Agreements" },
      { id: "/app/my-franchise?tab=timeline", label: "Timeline" },
    ],
  },
  {
    key: "state_franchise",
    label: "State Franchise",
    description: "My State",
    items: [{ id: "/app/my-state", label: "My State" }],
  },
  {
    key: "admin",
    label: "Admin",
    description: "Audit Logs, Impersonation Sessions",
    items: [
      { id: "/app/audit-logs", label: "Audit Logs" },
      { id: "/app/impersonation-sessions", label: "Impersonation Sessions" },
    ],
  },
];

const STORAGE_KEY = "mma:sidebar:hidden-sections";
const EVENT = "mma:sidebar-visibility-changed";

function read(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function write(set: Set<string>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  window.dispatchEvent(new Event(EVENT));
}

export function useSidebarHidden() {
  const [hidden, setHidden] = useState<Set<string>>(() => read());

  useEffect(() => {
    const handler = () => setHidden(read());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const toggle = useCallback((key: string, visible: boolean) => {
    const next = read();
    if (visible) next.delete(key);
    else next.add(key);
    write(next);
  }, []);

  const reset = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const isSectionVisible = useCallback((k: SidebarSectionKey) => !hidden.has(k), [hidden]);
  const isItemVisible = useCallback((id: string) => !hidden.has(`item:${id}`), [hidden]);

  return { hidden, toggle, reset, isSectionVisible, isItemVisible };
}

export const itemKey = (id: string) => `item:${id}`;
