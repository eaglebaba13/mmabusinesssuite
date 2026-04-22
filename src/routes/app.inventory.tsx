import { createFileRoute, Link, Outlet, useLocation, redirect } from "@tanstack/react-router";
import { Package, Boxes, Warehouse, ArrowLeftRight, Truck, FileText, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — MMA Suite" }] }),
  component: InventoryLayout,
});

const TABS = [
  { to: "/app/inventory" as const, label: "Overview", icon: Package, exact: true },
  { to: "/app/inventory/products" as const, label: "Products", icon: Boxes },
  { to: "/app/inventory/categories" as const, label: "Categories", icon: Layers },
  { to: "/app/inventory/warehouses" as const, label: "Warehouses", icon: Warehouse },
  { to: "/app/inventory/stock" as const, label: "Stock Levels", icon: Boxes },
  { to: "/app/inventory/movements" as const, label: "Movements", icon: ArrowLeftRight },
  { to: "/app/inventory/suppliers" as const, label: "Suppliers", icon: Truck },
  { to: "/app/inventory/purchase-orders" as const, label: "Purchase Orders", icon: FileText },
];

function InventoryLayout() {
  const loc = useLocation();
  return (
    <div className="flex flex-col">
      <div className="border-b border-border/50 bg-card/30 backdrop-blur">
        <div className="px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
              <Package className="h-5 w-5 text-background" />
            </div>
            <div>
              <h1 className="font-display text-2xl text-gradient-gold">Inventory</h1>
              <p className="text-xs text-muted-foreground">Products · Stock · Suppliers · Purchase Orders</p>
            </div>
          </div>
          <nav className="mt-5 flex gap-1 overflow-x-auto pb-px">
            {TABS.map((t) => {
              const active = t.exact ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
}
