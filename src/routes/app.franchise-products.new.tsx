import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProductEditor } from "@/components/app/franchise/ProductEditor";

export const Route = createFileRoute("/app/franchise-products/new")({
  head: () => ({ meta: [{ title: "New Franchise Product — MMA Suite" }] }),
  component: NewProductPage,
});

function NewProductPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-gradient-gold">New Franchise Product</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define the investment, ROI, royalty, and commission structure for a new franchise offering.
        </p>
      </div>
      <ProductEditor
        onSaved={(id) => {
          if (id) navigate({ to: "/app/franchise-products/$productId", params: { productId: id } });
          else navigate({ to: "/app/franchise-products" });
        }}
        onCancel={() => navigate({ to: "/app/franchise-products" })}
      />
    </div>
  );
}
