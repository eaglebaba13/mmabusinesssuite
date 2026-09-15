import * as React from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search, Building2, Copy, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { formatINRCompact } from "@/lib/format";
import { format, startOfMonth } from "date-fns";
import { ExportBar } from "@/components/app/ExportBar";
import { exportToCSV, exportToPDF } from "@/lib/export";
import { createFranchiseeUser } from "@/lib/rpc/franchisee-user.functions";
import { FranchiseeActions } from "@/components/app/FranchiseeActions";
import { ImportButton } from "@/components/app/ImportButton";
import { OpenDashboardButton } from "@/components/app/OpenDashboardButton";
import { useAuth } from "@/lib/auth-context";
import { useMode } from "@/lib/mode-context";
import { usePersistedState } from "@/hooks/use-persisted-state";

const franchiseesSearchSchema = z.object({
  openOnboard: z.coerce.number().optional(),
  productId: z.string().optional(),
  leadId: z.string().optional(),
  fullName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
});

export const Route = createFileRoute("/app/franchisees")({
  head: () => ({ meta: [{ title: "Franchisees — MMA Suite" }] }),
  validateSearch: franchiseesSearchSchema,
  component: FranchiseesPage,
});

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface OnboardForm {
  franchise_product_id: string;
  full_name: string;
  email: string;
  phone: string;
  gst_number: string;
  pan_number: string;
  aadhaar_number: string;
  agreement_number: string;
  payment_status: string;

  investment_amount: string;
  franchise_fee: string;
  base_roi_pct: string;
  emporium_pct: string;
  academy_pct: string;
  dark_store_pct: string;

  territory_country: string;
  territory_state: string;
  territory_district: string;
  territory_city: string;
  territory_area: string;
  territory_pincode: string;
  territory_radius_km: string;
  territory_exclusive: boolean;
  territory_approved: boolean;
  territory_start_date: string;
  territory_end_date: string;

  area_sqft: string;
  chairs: string;
  tables_count: string;
  cctv_count: string;
  computer_count: string;
  printer_count: string;
}

const emptyForm: OnboardForm = {
  franchise_product_id: "",
  full_name: "",
  email: "",
  phone: "",
  gst_number: "",
  pan_number: "",
  aadhaar_number: "",
  agreement_number: "",
  payment_status: "pending",
  investment_amount: "500000",
  franchise_fee: "500000",
  base_roi_pct: "3",
  emporium_pct: "10",
  academy_pct: "3",
  dark_store_pct: "3",
  territory_country: "India",
  territory_state: "",
  territory_district: "",
  territory_city: "",
  territory_area: "",
  territory_pincode: "",
  territory_radius_km: "",
  territory_exclusive: false,
  territory_approved: false,
  territory_start_date: "",
  territory_end_date: "",
  area_sqft: "150",
  chairs: "2",
  tables_count: "1",
  cctv_count: "1",
  computer_count: "1",
  printer_count: "1",
};

function genPassword(length = 12) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  let pw = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) pw += chars[arr[i] % chars.length];
  return pw;
}

function FranchiseesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [agreementFilter, setAgreementFilter] = React.useState<string>("all");
  const [productFilter, setProductFilter] = React.useState<string>("all");
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>(1);
  const [form, setForm, clearFormDraft] = usePersistedState<OnboardForm>("franchisees.new", emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [creds, setCreds] = React.useState<{ email: string; password: string } | null>(null);
  const createUserFn = useServerFn(createFranchiseeUser);
  const navigate = useNavigate();
  const routeSearch = useSearch({ from: "/app/franchisees" });
  const appliedPrefill = React.useRef(false);

  const { isTesting } = useMode();

  const { data: franchisees = [] } = useQuery({
    queryKey: ["franchisees", isTesting],
    queryFn: async () => {
      let q = supabase.from("franchisees").select("*").order("created_at", { ascending: false });
      if (!isTesting) q = q.eq("is_demo", false);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["franchise_products_active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchise_products")
        .select("id,name,brand_name,investment_amount,royalty_percent,expected_roi_percent,status")
        .eq("status", "active")
        .order("is_featured", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string; brand_name: string | null; investment_amount: number; royalty_percent: number; expected_roi_percent: number | null; status: string }>;
    },
  });

  const { data: exportFinancials, isLoading: exportFinancialsLoading } = useQuery({
    queryKey: ["franchisees-export-financials"],
    queryFn: async () => {
      const pageSize = 1000;

      const loadAllSales = async () => {
        const rows: Array<{ franchisee_id: string | null; grand_total: number }> = [];
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from("sales_orders")
            .select("franchisee_id, grand_total")
            .eq("status", "completed")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          rows.push(...(data ?? []));
          if (!data || data.length < pageSize) break;
        }
        return rows;
      };

      const loadAllPayouts = async () => {
        const rows: Array<{
          franchisee_id: string;
          final_payable: number;
          total_amount: number;
          status: "pending" | "paid" | "overdue";
        }> = [];
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from("roi_payouts")
            .select("franchisee_id, final_payable, total_amount, status")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          rows.push(...(data ?? []));
          if (!data || data.length < pageSize) break;
        }
        return rows;
      };

      const loadAllProducts = async () => {
        const rows: Array<{ id: string; name: string; brand_name: string | null }> = [];
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await (supabase as any)
            .from("franchise_products")
            .select("id, name, brand_name")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          rows.push(...(data ?? []));
          if (!data || data.length < pageSize) break;
        }
        return rows;
      };

      const [sales, payouts, allProducts] = await Promise.all([
        loadAllSales(),
        loadAllPayouts(),
        loadAllProducts(),
      ]);

      return { sales, payouts, products: allProducts };
    },
  });

  // Auto-open onboarding wizard when navigated with prefill params (from Lead → Convert)
  React.useEffect(() => {
    if (appliedPrefill.current) return;
    if (!routeSearch.openOnboard) return;
    if (products.length === 0 && routeSearch.productId) return; // wait for products to load
    appliedPrefill.current = true;
    const p = routeSearch.productId ? products.find((x) => x.id === routeSearch.productId) : null;
    setForm((f) => ({
      ...f,
      franchise_product_id: routeSearch.productId ?? f.franchise_product_id,
      full_name: routeSearch.fullName ?? f.full_name,
      email: routeSearch.email ?? f.email,
      phone: routeSearch.phone ?? f.phone,
      ...(p
        ? {
            investment_amount: String(p.investment_amount ?? f.investment_amount),
            franchise_fee: String(p.investment_amount ?? f.franchise_fee),
            base_roi_pct:
              p.expected_roi_percent != null ? String(p.expected_roi_percent) : f.base_roi_pct,
          }
        : {}),
    }));
    setOpen(true);
    // clean URL so refresh doesn't re-open
    navigate({ to: "/app/franchisees", search: {}, replace: true });
  }, [routeSearch, products, navigate]);


  const today = new Date().toISOString().slice(0, 10);
  const agreementStatusOf = (f: any): "active" | "expired" | "expiring" | "missing" => {
    if (!f.agreement_expiry) return "missing";
    if (f.agreement_expiry < today) return "expired";
    const inThirty = new Date(); inThirty.setDate(inThirty.getDate() + 30);
    if (f.agreement_expiry <= inThirty.toISOString().slice(0, 10)) return "expiring";
    return "active";
  };

  const filtered = (franchisees ?? []).filter((f: any) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      (f.full_name ?? "").toLowerCase().includes(s) ||
      (f.email ?? "").toLowerCase().includes(s) ||
      (f.phone ?? "").toLowerCase().includes(s);
    const matchType = typeFilter === "all" || (f.franchise_type ?? "city") === typeFilter;
    const matchAgr = agreementFilter === "all" || agreementStatusOf(f) === agreementFilter;
    const matchProd =
      productFilter === "all" ||
      (productFilter === "none" ? !f.franchise_product_id : f.franchise_product_id === productFilter);
    return matchSearch && matchType && matchAgr && matchProd;
  });

  // Current month ROI summary
  const monthKey = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const { data: currentPayouts = [] } = useQuery({
    queryKey: ["current-month-payouts", monthKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("roi_payouts")
        .select("franchisee_id, mg_amount, variable_roi, final_payable, status")
        .eq("payout_month", monthKey);
      return data ?? [];
    },
  });
  const totals = React.useMemo(() => {
    const totalInv = filtered.reduce((s: number, f: any) => s + Number(f.investment_amount ?? 0), 0);
    const scoped = currentPayouts.filter((p: any) => filtered.some((f: any) => f.id === p.franchisee_id));
    const mg = scoped.reduce((s: number, p: any) => s + Number(p.mg_amount ?? 0), 0);
    const vr = scoped.reduce((s: number, p: any) => s + Number(p.variable_roi ?? 0), 0);
    const payable = scoped.reduce((s: number, p: any) => s + Number(p.final_payable ?? 0), 0);
    const pending = scoped.filter((p: any) => p.status === "pending").reduce((s: number, p: any) => s + Number(p.final_payable ?? 0), 0);
    return { totalInv, mg, vr, payable, pending };
  }, [filtered, currentPayouts]);


  const exportSummary = React.useMemo(() => {
    const byFranchise = new Map<string, { totalSale: number; totalRoi: number; totalRoiPaid: number; totalRoiDue: number }>();
    const get = (id: string) => {
      const existing = byFranchise.get(id);
      if (existing) return existing;
      const fresh = { totalSale: 0, totalRoi: 0, totalRoiPaid: 0, totalRoiDue: 0 };
      byFranchise.set(id, fresh);
      return fresh;
    };

    exportFinancials?.sales.forEach((sale) => {
      if (!sale.franchisee_id) return;
      get(sale.franchisee_id).totalSale += Number(sale.grand_total ?? 0);
    });
    exportFinancials?.payouts.forEach((payout) => {
      const summary = get(payout.franchisee_id);
      const payable = Number(payout.total_amount ?? payout.final_payable ?? 0);
      summary.totalRoi += payable;
      if (payout.status === "paid") summary.totalRoiPaid += payable;
      else summary.totalRoiDue += payable;
    });
    return byFranchise;
  }, [exportFinancials]);

  const exportProductNames = React.useMemo(
    () => new Map(
      (exportFinancials?.products ?? []).map((p) => [
        p.id,
        p.brand_name ? `${p.brand_name} · ${p.name}` : p.name,
      ]),
    ),
    [exportFinancials],
  );

  const csvExportCols = [
    { header: "Franchise Code", accessor: (f: any) => f.franchisee_code ?? "" },
    { header: "Franchise Name", accessor: (f: any) => f.full_name },
    { header: "City", accessor: (f: any) => f.territory_city ?? "" },
    { header: "District", accessor: (f: any) => f.territory_district ?? "" },
    { header: "State", accessor: (f: any) => f.territory_state ?? "" },
    { header: "Area", accessor: (f: any) => f.territory_area ?? "" },
    { header: "Pincode", accessor: (f: any) => f.territory_pincode ?? "" },
    { header: "Phone Number", accessor: (f: any) => f.phone ?? "" },
    { header: "Email ID", accessor: (f: any) => f.email ?? "" },
    { header: "Franchise Product", accessor: (f: any) => exportProductNames.get(f.franchise_product_id) ?? "" },
    { header: "Franchise Type", accessor: (f: any) => f.franchise_type ?? "" },
    { header: "Status", accessor: (f: any) => f.status ?? "" },
    { header: "Investment (INR)", accessor: (f: any) => Number(f.investment_amount ?? 0) },
    { header: "Total Sale (INR)", accessor: (f: any) => exportSummary.get(f.id)?.totalSale ?? 0 },
    { header: "Total ROI (INR)", accessor: (f: any) => exportSummary.get(f.id)?.totalRoi ?? 0 },
    { header: "Total ROI Paid (INR)", accessor: (f: any) => exportSummary.get(f.id)?.totalRoiPaid ?? 0 },
    { header: "Total ROI Dues (INR)", accessor: (f: any) => exportSummary.get(f.id)?.totalRoiDue ?? 0 },
    { header: "Payment Status", accessor: (f: any) => f.payment_status ?? "" },
    { header: "Agreement Number", accessor: (f: any) => f.agreement_number ?? "" },
    { header: "Joined Date", accessor: (f: any) => f.joined_at ?? "" },
  ];
  const pdfExportCols = [
    { header: "Name", accessor: (f: any) => f.full_name },
    { header: "Email", accessor: (f: any) => f.email ?? "" },
    { header: "Phone", accessor: (f: any) => f.phone ?? "" },
    { header: "Status", accessor: (f: any) => f.status },
    { header: "Investment", accessor: (f: any) => Number(f.investment_amount ?? 0) },
    { header: "Joined", accessor: (f: any) => f.joined_at ?? "" },
  ];
  const fileBase = `franchisees_roster`;
  const onCSV = () => {
    if (exportFinancialsLoading) {
      toast.info("Preparing complete franchise data. Please try again in a moment.");
      return;
    }
    exportToCSV(fileBase, filtered, csvExportCols);
  };
  const onPDF = () =>
    exportToPDF({
      filename: fileBase,
      title: "Franchisees Roster",
      rows: filtered,
      columns: pdfExportCols,
      totals: [
        { label: "Total franchisees", value: String(filtered.length) },
        { label: "Total invested", value: formatINRCompact(filtered.reduce((s, f) => s + Number(f.investment_amount ?? 0), 0)) },
      ],
    });

  const resetWizard = () => {
    setStep(1);
    setForm(emptyForm);
    clearFormDraft();
    setCreatedId(null);
    setCreds(null);
  };

  const closeWizard = () => {
    setOpen(false);
    setTimeout(resetWizard, 300);
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("franchisees")
        .insert({
          franchise_product_id: form.franchise_product_id || null,
          full_name: form.full_name,
          email: form.email || null,
          phone: form.phone || null,
          gst_number: form.gst_number || null,
          pan_number: form.pan_number || null,
          aadhaar_number: form.aadhaar_number || null,
          agreement_number: form.agreement_number || null,
          payment_status: form.payment_status || null,
          investment_amount: Number(form.investment_amount),
          franchise_fee: Number(form.franchise_fee),
          base_roi_pct: Number(form.base_roi_pct),
          emporium_pct: Number(form.emporium_pct),
          academy_pct: Number(form.academy_pct),
          dark_store_pct: Number(form.dark_store_pct),
          territory_country: form.territory_country || null,
          territory_state: form.territory_state || null,
          territory_district: form.territory_district || null,
          territory_city: form.territory_city || null,
          territory_area: form.territory_area || null,
          territory_pincode: form.territory_pincode || null,
          territory_radius_km: form.territory_radius_km ? Number(form.territory_radius_km) : null,
          territory_exclusive: form.territory_exclusive,
          territory_approved: form.territory_approved,
          territory_start_date: form.territory_start_date || null,
          territory_end_date: form.territory_end_date || null,
          area_sqft: Number(form.area_sqft),
          chairs: Number(form.chairs),
          tables_count: Number(form.tables_count),
          cctv_count: Number(form.cctv_count),
          computer_count: Number(form.computer_count),
          printer_count: Number(form.printer_count),
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setCreatedId(data.id);
      toast.success("Franchisee profile saved");
      setStep(5);
      qc.invalidateQueries({ queryKey: ["franchisees"] });
    },
    onError: (e: any) => {
      console.error(e);
      toast.error(e.message || "An error occurred. Please try again.");
    },
  });

  const generateLogin = async () => {
    if (!createdId) return;
    setSaving(true);
    try {
      const safeName = (form.full_name || "partner").toLowerCase().replace(/[^a-z0-9]/g, "");
      const phoneTail = (form.phone || Math.random().toString().slice(2, 7)).replace(/\D/g, "").slice(-5);
      const loginEmail = form.email || `${safeName}.${phoneTail}@franchisee.mma`;
      const password = genPassword(12);
      await createUserFn({
        data: {
          franchisee_id: createdId,
          email: loginEmail,
          password,
          full_name: form.full_name,
        },
      });
      setCreds({ email: loginEmail, password });
      setStep(6);
      toast.success("Login created");
      qc.invalidateQueries({ queryKey: ["franchisees"] });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to create login");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (txt: string, what: string) => {
    await navigator.clipboard.writeText(txt);
    toast.success(`${what} copied`);
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Franchise Network</p>
          <h1 className="mt-1 font-display text-3xl">Franchisees</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-[260px] bg-card/40 pl-9" />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-card/40 px-2 text-sm"
          >
            <option value="all">All types</option>
            <option value="master">Master</option>
            <option value="state">State</option>
            <option value="city">City</option>
          </select>
          <select
            value={agreementFilter}
            onChange={(e) => setAgreementFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-card/40 px-2 text-sm"
          >
            <option value="all">All agreements</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="missing">Missing</option>
          </select>
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-card/40 px-2 text-sm"
          >
            <option value="all">All products</option>
            <option value="none">No product linked</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.brand_name || p.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <ImportButton configKey="franchisees" />
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTimeout(resetWizard, 300); }}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-gold text-background"><Plus className="mr-1 h-4 w-4" />Onboard</Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl bg-card">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Onboard franchisee</DialogTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StepDot active={step >= 1} done={step > 1} label="Partner" />
                  <StepLine />
                  <StepDot active={step >= 2} done={step > 2} label="ROI" />
                  <StepLine />
                  <StepDot active={step >= 3} done={step > 3} label="Territory" />
                  <StepLine />
                  <StepDot active={step >= 4} done={step > 4} label="Premises" />
                  <StepLine />
                  <StepDot active={step >= 5} done={step > 5} label="Login" />
                </div>
              </DialogHeader>

              {step === 1 && (
                <div className="space-y-3">
                  <div>
                    <Label>Franchise product</Label>
                    <select
                      value={form.franchise_product_id}
                      onChange={(e) => {
                        const id = e.target.value;
                        const p = products.find((x) => x.id === id);
                        setForm((f) => ({
                          ...f,
                          franchise_product_id: id,
                          ...(p
                            ? {
                                investment_amount: String(p.investment_amount ?? f.investment_amount),
                                franchise_fee: String(p.investment_amount ?? f.franchise_fee),
                                base_roi_pct:
                                  p.expected_roi_percent != null
                                    ? String(p.expected_roi_percent)
                                    : f.base_roi_pct,
                              }
                            : {}),
                        }));
                      }}
                      className="mt-1 h-10 w-full rounded-md border border-border bg-card/40 px-2 text-sm"
                    >
                      <option value="">— Select a product —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.brand_name ? `${p.brand_name} · ` : ""}{p.name}
                        </option>
                      ))}
                    </select>
                    {products.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        No active products yet. Create one in Franchise Products.
                      </p>
                    )}
                  </div>
                  <div><Label>Full name *</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
                    <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>GST</Label><Input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} className="mt-1" /></div>
                    <div><Label>PAN</Label><Input value={form.pan_number} onChange={(e) => setForm({ ...form, pan_number: e.target.value })} className="mt-1" /></div>
                    <div><Label>Aadhaar</Label><Input value={form.aadhaar_number} onChange={(e) => setForm({ ...form, aadhaar_number: e.target.value })} className="mt-1" /></div>
                  </div>
                  <p className="text-xs text-muted-foreground">If email is left blank, we'll auto-generate one for the login.</p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Franchise fee (₹)</Label><Input type="number" value={form.franchise_fee} onChange={(e) => setForm({ ...form, franchise_fee: e.target.value, investment_amount: e.target.value })} className="mt-1" /></div>
                    <div><Label>Base monthly ROI %</Label><Input type="number" step="0.01" value={form.base_roi_pct} onChange={(e) => setForm({ ...form, base_roi_pct: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Nail Emporium %</Label><Input type="number" step="0.01" value={form.emporium_pct} onChange={(e) => setForm({ ...form, emporium_pct: e.target.value })} className="mt-1" /></div>
                    <div><Label>Academy %</Label><Input type="number" step="0.01" value={form.academy_pct} onChange={(e) => setForm({ ...form, academy_pct: e.target.value })} className="mt-1" /></div>
                    <div><Label>Dark store %</Label><Input type="number" step="0.01" value={form.dark_store_pct} onChange={(e) => setForm({ ...form, dark_store_pct: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Agreement number</Label><Input value={form.agreement_number} onChange={(e) => setForm({ ...form, agreement_number: e.target.value })} className="mt-1" /></div>
                    <div>
                      <Label>Payment status</Label>
                      <select
                        value={form.payment_status}
                        onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-border bg-card/40 px-2 text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Country</Label><Input value={form.territory_country} onChange={(e) => setForm({ ...form, territory_country: e.target.value })} className="mt-1" /></div>
                    <div><Label>State</Label><Input value={form.territory_state} onChange={(e) => setForm({ ...form, territory_state: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>District</Label><Input value={form.territory_district} onChange={(e) => setForm({ ...form, territory_district: e.target.value })} className="mt-1" /></div>
                    <div><Label>City</Label><Input value={form.territory_city} onChange={(e) => setForm({ ...form, territory_city: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Area</Label><Input value={form.territory_area} onChange={(e) => setForm({ ...form, territory_area: e.target.value })} placeholder="e.g. Vaishali Nagar" className="mt-1" /></div>
                    <div><Label>Pincode</Label><Input value={form.territory_pincode} onChange={(e) => setForm({ ...form, territory_pincode: e.target.value })} className="mt-1" /></div>
                    <div><Label>Radius (km)</Label><Input type="number" step="0.1" value={form.territory_radius_km} onChange={(e) => setForm({ ...form, territory_radius_km: e.target.value })} placeholder="optional" className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Start date</Label><Input type="date" value={form.territory_start_date} onChange={(e) => setForm({ ...form, territory_start_date: e.target.value })} className="mt-1" /></div>
                    <div><Label>End date</Label><Input type="date" value={form.territory_end_date} onChange={(e) => setForm({ ...form, territory_end_date: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={form.territory_exclusive} onChange={(e) => setForm({ ...form, territory_exclusive: e.target.checked })} />
                      Exclusive territory
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={form.territory_approved} onChange={(e) => setForm({ ...form, territory_approved: e.target.checked })} />
                      Territory approved
                    </label>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <div><Label>Area (sq ft, min 150)</Label><Input type="number" value={form.area_sqft} onChange={(e) => setForm({ ...form, area_sqft: e.target.value })} className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div><Label>Chairs</Label><Input type="number" value={form.chairs} onChange={(e) => setForm({ ...form, chairs: e.target.value })} className="mt-1" /></div>
                    <div><Label>Tables</Label><Input type="number" value={form.tables_count} onChange={(e) => setForm({ ...form, tables_count: e.target.value })} className="mt-1" /></div>
                    <div><Label>CCTV</Label><Input type="number" value={form.cctv_count} onChange={(e) => setForm({ ...form, cctv_count: e.target.value })} className="mt-1" /></div>
                    <div><Label>Computer</Label><Input type="number" value={form.computer_count} onChange={(e) => setForm({ ...form, computer_count: e.target.value })} className="mt-1" /></div>
                    <div><Label>Printer</Label><Input type="number" value={form.printer_count} onChange={(e) => setForm({ ...form, printer_count: e.target.value })} className="mt-1" /></div>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-3 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
                  <div className="font-display text-xl">Profile saved</div>
                  <p className="text-sm text-muted-foreground">
                    Generate login credentials so {form.full_name} can sign in to their dashboard.
                  </p>
                </div>
              )}

              {step === 6 && creds && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                    <div className="mt-2 font-display text-lg">Login created</div>
                    <p className="mt-1 text-xs text-muted-foreground">Share these credentials with the partner. The password is shown once.</p>
                  </div>
                  <div className="space-y-2">
                    <CredRow label="Login email" value={creds.email} onCopy={() => copy(creds.email, "Email")} />
                    <CredRow label="Temporary password" value={creds.password} onCopy={() => copy(creds.password, "Password")} mono />
                  </div>
                </div>
              )}

              <DialogFooter className="flex flex-row justify-between sm:justify-between">
                {step > 1 && step < 5 && (
                  <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)}>Back</Button>
                )}
                <div className="ml-auto flex gap-2">
                  {step < 4 && (
                    <Button
                      className="bg-gradient-gold text-background"
                      disabled={step === 1 && !form.full_name}
                      onClick={() => setStep((s) => (s + 1) as Step)}
                    >
                      Next
                    </Button>
                  )}
                  {step === 4 && (
                    <Button
                      className="bg-gradient-gold text-background"
                      disabled={create.isPending}
                      onClick={() => create.mutate()}
                    >
                      {create.isPending ? "Saving…" : "Save & continue"}
                    </Button>
                  )}
                  {step === 5 && (
                    <>
                      <Button variant="outline" onClick={closeWizard}>Skip</Button>
                      <Button className="bg-gradient-gold text-background" disabled={saving} onClick={generateLogin}>
                        {saving ? "Creating…" : "Generate login"}
                      </Button>
                    </>
                  )}
                  {step === 6 && (
                    <Button className="bg-gradient-gold text-background" onClick={closeWizard}>Done</Button>
                  )}
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <SumTile label="Total investment" value={formatINRCompact(totals.totalInv)} />
        <SumTile label="MG liability (this month)" value={formatINRCompact(totals.mg)} />
        <SumTile label="Variable ROI (this month)" value={formatINRCompact(totals.vr)} />
        <SumTile label="Payable (this month)" value={formatINRCompact(totals.payable)} highlight />
        <SumTile label="Pending payouts" value={formatINRCompact(totals.pending)} />
      </div>

      <ExportBar
        from=""
        to=""
        onFromChange={() => {}}
        onToChange={() => {}}
        onCSV={onCSV}
        onPDF={onPDF}
        showDateRange={false}
        count={filtered.length}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((f) => {
          const isInactive = f.status === "suspended" || f.status === "closed";
          return <FranchiseeCard key={f.id} franchisee={f} isInactive={isInactive} />;
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl glass p-12 text-center text-muted-foreground">No franchisees yet.</div>
        )}
      </div>
    </div>
  );
}

function FranchiseeCard({ franchisee: f, isInactive }: { franchisee: any; isInactive: boolean }) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-actions]")) return;
    navigate({ to: "/app/franchisees/$franchiseeId", params: { franchiseeId: f.id } });
  };
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate({ to: "/app/franchisees/$franchiseeId", params: { franchiseeId: f.id } });
        }
      }}
      className={`relative cursor-pointer rounded-2xl glass p-5 hover-gold-glow transition-opacity ${isInactive ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-gold shadow-gold">
          <Building2 className="h-5 w-5 text-background" />
        </div>
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className={
              isInactive
                ? "border-rose-500/40 text-rose-400 capitalize"
                : "border-gold/40 text-gold capitalize"
            }
          >
            {f.status}
          </Badge>
          <div data-actions>
            <FranchiseeActions franchisee={f} />
          </div>
        </div>
      </div>
      <h3 className="mt-4 font-display text-xl">{f.full_name}</h3>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-[11px] tracking-wider text-gold">
          {f.franchisee_code || "Code pending"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{f.email ?? f.phone ?? "—"}</p>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Investment</div>
          <div className="font-display text-lg text-gradient-gold">{formatINRCompact(Number(f.investment_amount))}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Joined</div>
          <div className="text-sm">{format(new Date(f.joined_at), "MMM yyyy")}</div>
        </div>
      </div>
      {isAdmin && (
        <div data-actions className="mt-3 border-t border-border/40 pt-3">
          <OpenDashboardButton entity_type="city_franchise" entity_id={f.id} label="Open Dashboard" />
        </div>
      )}
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2 w-2 rounded-full ${done ? "bg-emerald-400" : active ? "bg-gold" : "bg-muted"}`} />
      <span className={active ? "text-foreground" : ""}>{label}</span>
    </div>
  );
}
function StepLine() {
  return <div className="h-px w-6 bg-border" />;
}
function CredRow({ label, value, onCopy, mono }: { label: string; value: string; onCopy: () => void; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background/40 p-3">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-0.5 ${mono ? "font-mono" : ""} text-sm`}>{value}</div>
      </div>
      <Button size="sm" variant="ghost" onClick={onCopy}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function SumTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl glass p-4 ${highlight ? "border border-gold/40" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-xl ${highlight ? "text-gradient-gold" : ""}`}>{value}</div>
    </div>
  );
}
