import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, ShieldAlert, ShieldCheck, Plus, Trash2, Star, MapPin, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { productDefaults, type ProductCommission, type ProductTemplate } from "@/lib/franchise-product-map";

export interface TerritoryManagerProps {
  franchiseeId?: string;
  isSuperAdmin?: boolean;
  form?: any;
  setForm?: (f: any) => void;
}

/**
 * Dedicated Territory Manager component:
 * - Displays all allotted territories (1-to-many)
 * - Allows super_admin to Add, Change / Edit, Set Primary, or Delete allotments
 * - Supports inline creation of new cities/territories
 * - Synchronizes primary territory changes with the parent form state
 */
export function TerritoryManager({
  franchiseeId,
  isSuperAdmin = false,
  form,
  setForm,
}: TerritoryManagerProps) {
  const qc = useQueryClient();
  const fId = franchiseeId || form?.id;

  // 1. Territories catalog
  const { data: territories = [], refetch: refetchTerritories } = useQuery<any[]>({
    queryKey: ["territories-list"],
    queryFn: async () =>
      ((await (supabase as any).from("territories").select("id, name, state, ownership_type").order("name")).data ?? []) as any[],
  });

  // 2. Multi-territory allotments for this franchisee
  const { data: allotments = [], refetch: refetchAllotments } = useQuery<any[]>({
    queryKey: ["franchisee_territories", fId],
    enabled: !!fId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("franchisee_territories")
        .select("id, territory_id, is_primary, ownership_type, exclusivity_radius_km, area_name, effective_from, effective_to, territories(id, name, state, ownership_type)")
        .eq("franchisee_id", fId)
        .order("is_primary", { ascending: false });
      if (error) {
        console.warn("Could not fetch franchisee_territories:", error);
        return [];
      }
      return data ?? [];
    },
  });

  // Add form local state
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [selectedTerritoryId, setSelectedTerritoryId] = React.useState<string>("");
  const [isCustomCity, setIsCustomCity] = React.useState(false);
  const [customCityName, setCustomCityName] = React.useState("");
  const [customCityState, setCustomCityState] = React.useState("");
  const [areaName, setAreaName] = React.useState("");
  const [ownershipType, setOwnershipType] = React.useState("FRANCHISE");
  const [radiusKm, setRadiusKm] = React.useState("5.0");
  const [makePrimary, setMakePrimary] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  // Edit / Change state for existing row
  const [editingRowTerritoryId, setEditingRowTerritoryId] = React.useState<string | null>(null);
  const [editTerritoryId, setEditTerritoryId] = React.useState<string>("");
  const [editAreaName, setEditAreaName] = React.useState<string>("");
  const [editOwnershipType, setEditOwnershipType] = React.useState<string>("FRANCHISE");
  const [editRadiusKm, setEditRadiusKm] = React.useState<string>("5.0");
  const [editIsPrimary, setEditIsPrimary] = React.useState<boolean>(false);
  const [editIsCustomCity, setEditIsCustomCity] = React.useState<boolean>(false);
  const [editCustomCityName, setEditCustomCityName] = React.useState<string>("");
  const [editCustomCityState, setEditCustomCityState] = React.useState<string>("");
  const [editSubmitting, setEditSubmitting] = React.useState<boolean>(false);

  const startEditRow = (a: any) => {
    setEditingRowTerritoryId(a.territory_id);
    setEditTerritoryId(a.territory_id);
    setEditAreaName(a.area_name ?? "");
    setEditOwnershipType(a.ownership_type ?? "FRANCHISE");
    setEditRadiusKm(String(a.exclusivity_radius_km ?? 5.0));
    setEditIsPrimary(!!a.is_primary);
    setEditIsCustomCity(false);
    setEditCustomCityName("");
    setEditCustomCityState("");
  };

  const cancelEditRow = () => {
    setEditingRowTerritoryId(null);
    setEditSubmitting(false);
  };

  const handleSaveRowChange = async () => {
    if (!fId || !editingRowTerritoryId) return;
    if (!isSuperAdmin) {
      toast.error("Forbidden: Only super_admin or founder can change territory allotments");
      return;
    }

    setEditSubmitting(true);
    try {
      const payload: any = {
        p_action: "update",
        p_franchisee_id: fId,
        p_old_territory_id: editingRowTerritoryId,
        p_is_primary: editIsPrimary,
        p_ownership_type: editOwnershipType,
        p_radius_km: parseFloat(editRadiusKm) || 5.0,
        p_area_name: editAreaName.trim() || null,
      };

      if (editIsCustomCity && editCustomCityName.trim()) {
        payload.p_territory_id = null;
        payload.p_new_territory_name = editCustomCityName.trim();
        payload.p_new_territory_state = editCustomCityState.trim() || null;
      } else {
        payload.p_territory_id = editTerritoryId;
      }

      const { data, error } = await (supabase as any).rpc("manage_franchisee_territory", payload);
      if (error) throw error;

      toast.success("Territory allotment updated successfully");
      cancelEditRow();
      refetchAllotments();
      refetchTerritories();
      qc.invalidateQueries({ queryKey: ["franchisees"] });
      qc.invalidateQueries({ queryKey: ["franchisee_territories", fId] });

      // Update parent form if setForm provided
      if (setForm && form && editIsPrimary) {
        const resolvedT = territories.find((t: any) => t.id === editTerritoryId);
        setForm({
          ...form,
          territory_id: data?.territory_id ?? editTerritoryId,
          territory_city: editIsCustomCity ? editCustomCityName.trim() : (resolvedT?.name ?? form.territory_city),
          territory_state: editIsCustomCity ? editCustomCityState.trim() : (resolvedT?.state ?? form.territory_state),
          territory_area: editAreaName.trim() || resolvedT?.name || form.territory_area,
          territory_radius_km: parseFloat(editRadiusKm) || 5.0,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update territory allotment");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleAddAllotment = async () => {
    if (!fId) {
      toast.error("Franchisee ID not found");
      return;
    }
    if (!isSuperAdmin) {
      toast.error("Forbidden: Only super_admin or founder can add territory allotments");
      return;
    }
    if (isCustomCity && !customCityName.trim()) {
      toast.error("Please enter a new city name");
      return;
    }
    if (!isCustomCity && !selectedTerritoryId) {
      toast.error("Please select a territory from the catalog");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        p_action: "add",
        p_franchisee_id: fId,
        p_is_primary: makePrimary,
        p_ownership_type: ownershipType,
        p_radius_km: parseFloat(radiusKm) || 5.0,
        p_area_name: areaName.trim() || null,
      };

      if (isCustomCity) {
        payload.p_territory_id = null;
        payload.p_new_territory_name = customCityName.trim();
        payload.p_new_territory_state = customCityState.trim() || null;
      } else {
        payload.p_territory_id = selectedTerritoryId;
      }

      const { data, error } = await (supabase as any).rpc("manage_franchisee_territory", payload);
      if (error) throw error;

      toast.success("Territory allotted successfully");
      const chosenT = territories.find((t: any) => t.id === selectedTerritoryId);
      if (makePrimary && setForm && form) {
        setForm({
          ...form,
          territory_id: data?.territory_id ?? selectedTerritoryId,
          territory_city: isCustomCity ? customCityName.trim() : (chosenT?.name ?? form.territory_city),
          territory_state: isCustomCity ? customCityState.trim() : (chosenT?.state ?? form.territory_state),
          territory_area: areaName.trim() || chosenT?.name || form.territory_area,
          territory_radius_km: parseFloat(radiusKm) || 5.0,
        });
      }

      setShowAddForm(false);
      setSelectedTerritoryId("");
      setIsCustomCity(false);
      setCustomCityName("");
      setCustomCityState("");
      setAreaName("");
      refetchAllotments();
      refetchTerritories();
      qc.invalidateQueries({ queryKey: ["franchisees"] });
      qc.invalidateQueries({ queryKey: ["franchisee_territories", fId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to allot territory");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPrimary = async (territoryId: string) => {
    if (!fId || !isSuperAdmin) {
      toast.error("Forbidden: Only super_admin or founder can change primary territory");
      return;
    }

    try {
      const { error } = await (supabase as any).rpc("manage_franchisee_territory", {
        p_action: "set_primary",
        p_franchisee_id: fId,
        p_territory_id: territoryId,
      });

      if (error) throw error;

      toast.success("Primary territory updated");
      const chosenT = territories.find((t: any) => t.id === territoryId);
      if (chosenT && setForm && form) {
        setForm({
          ...form,
          territory_id: chosenT.id,
          territory_city: chosenT.name,
          territory_state: chosenT.state,
        });
      }
      refetchAllotments();
      qc.invalidateQueries({ queryKey: ["franchisees"] });
      qc.invalidateQueries({ queryKey: ["franchisee_territories", fId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update primary territory");
    }
  };

  const handleDeleteAllotment = async (territoryId: string, territoryName: string) => {
    if (!fId || !isSuperAdmin) {
      toast.error("Forbidden: Only super_admin or founder can delete territory allotments");
      return;
    }

    if (!confirm(`Are you sure you want to remove ${territoryName} from this franchisee's allotted territories?`)) {
      return;
    }

    try {
      const { error } = await (supabase as any).rpc("manage_franchisee_territory", {
        p_action: "delete",
        p_franchisee_id: fId,
        p_territory_id: territoryId,
      });

      if (error) throw error;

      toast.success("Territory allotment removed");
      refetchAllotments();
      qc.invalidateQueries({ queryKey: ["franchisees"] });
      qc.invalidateQueries({ queryKey: ["franchisee_territories", fId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to remove territory allotment");
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-gold/30 bg-card/60 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-gold" />
          <div>
            <h4 className="font-display text-base font-semibold">Allotted Territories & Outlets</h4>
            <p className="text-[11px] text-muted-foreground">
              Official assigned cities, operational ownership (Direct Company vs Franchise), and exclusive radii.
            </p>
          </div>
        </div>

        {isSuperAdmin && !showAddForm && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs border-gold/40 text-gold hover:bg-gold/10"
            onClick={() => {
              setShowAddForm(true);
              setIsCustomCity(false);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Allot Territory
          </Button>
        )}
      </div>

      {/* Role Notice */}
      {!isSuperAdmin ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
          <span>View-only: Only super_admin or founder can add, change, or delete territory allotments.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span>Executive access verified: full authority to add, change, reassign primary, or delete allotments.</span>
        </div>
      )}

      {/* List of Allotted Territories */}
      {allotments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center text-xs text-amber-300">
          No territory currently allotted to this partner. Click &quot;Allot Territory&quot; to assign a city.
        </div>
      ) : (
        <div className="space-y-2">
          {allotments.map((a: any) => {
            const t = a.territories || {};
            const isPrimary = a.is_primary;
            const isEditing = editingRowTerritoryId === a.territory_id;

            if (isEditing) {
              return (
                <div key={a.id || a.territory_id} className="rounded-xl border border-gold/40 bg-gold/5 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gold">
                      Change Allotment: {t.name || "Territory"}
                    </span>
                    <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={cancelEditRow}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Territory City</Label>
                      {!editIsCustomCity ? (
                        <Select
                          value={editTerritoryId}
                          onValueChange={(v) => {
                            if (v === "__new__") {
                              setEditIsCustomCity(true);
                            } else {
                              setEditTerritoryId(v);
                            }
                          }}
                        >
                          <SelectTrigger className="mt-1 h-9 bg-card">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {territories.map((item: any) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}{item.state ? ` (${item.state})` : ""}
                              </SelectItem>
                            ))}
                            <SelectItem value="__new__" className="text-gold font-medium">
                              + Create New City / Territory...
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="space-y-1.5 mt-1">
                          <Input
                            placeholder="New city name (e.g. Bhopal)"
                            value={editCustomCityName}
                            onChange={(e) => setEditCustomCityName(e.target.value)}
                            className="h-8 text-xs bg-card"
                          />
                          <Input
                            placeholder="State (e.g. Madhya Pradesh)"
                            value={editCustomCityState}
                            onChange={(e) => setEditCustomCityState(e.target.value)}
                            className="h-8 text-xs bg-card"
                          />
                          <button
                            type="button"
                            onClick={() => setEditIsCustomCity(false)}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                          >
                            Back to existing catalog
                          </button>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Specific Area / Outlet Name</Label>
                      <Input
                        value={editAreaName}
                        onChange={(e) => setEditAreaName(e.target.value)}
                        placeholder="e.g. Jhotwara, Main Market"
                        className="mt-1 h-9 bg-card text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Operational Ownership</Label>
                      <Select value={editOwnershipType} onValueChange={setEditOwnershipType}>
                        <SelectTrigger className="mt-1 h-9 bg-card">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FRANCHISE">FRANCHISE (Franchisee Outlet)</SelectItem>
                          <SelectItem value="DIRECT_COMPANY">DIRECT_COMPANY (Company Owned Branch)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Exclusivity Radius (km)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={editRadiusKm}
                        onChange={(e) => setEditRadiusKm(e.target.value)}
                        className="mt-1 h-9 bg-card text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editIsPrimary}
                        onChange={(e) => setEditIsPrimary(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>Primary territory (used for ROI calculation)</span>
                    </label>

                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={cancelEditRow}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={editSubmitting}
                        onClick={handleSaveRowChange}
                        className="bg-gradient-gold text-background h-8 px-4"
                      >
                        {editSubmitting ? "Saving..." : "Save Change"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={a.id || a.territory_id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${
                  isPrimary
                    ? "border-sky-500/40 bg-sky-500/5 shadow-sm"
                    : "border-border/50 bg-card/40"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <MapPin className={`h-4 w-4 ${isPrimary ? "text-sky-400" : "text-muted-foreground"}`} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">
                        {t.name || "Unknown territory"}
                        {t.state ? ` (${t.state})` : ""}
                      </span>
                      {a.area_name && a.area_name !== t.name && (
                        <span className="text-xs text-muted-foreground font-medium">· {a.area_name}</span>
                      )}
                      {isPrimary && (
                        <Badge variant="secondary" className="bg-sky-500/20 text-sky-400 border-sky-500/30 text-[10px]">
                          <Star className="mr-1 h-2.5 w-2.5 fill-sky-400" /> Primary
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono uppercase tracking-wider ${
                          a.ownership_type === "DIRECT_COMPANY"
                            ? "border-purple-500/40 text-purple-400 bg-purple-500/10"
                            : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                        }`}
                      >
                        {a.ownership_type === "DIRECT_COMPANY" ? "Direct Co." : "Franchise"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Radius: {a.exclusivity_radius_km ?? 5} km
                      {a.effective_from ? ` · Effective from ${a.effective_from}` : ""}
                    </div>
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-border/60 hover:bg-muted"
                      onClick={() => startEditRow(a)}
                    >
                      <Pencil className="mr-1 h-3 w-3" /> Change
                    </Button>
                    {!isPrimary && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-border/60 hover:bg-muted"
                        onClick={() => handleSetPrimary(a.territory_id)}
                      >
                        Set Primary
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      onClick={() => handleDeleteAllotment(a.territory_id, t.name || "territory")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Territory Inline Panel (super_admin / founder only) */}
      {isSuperAdmin && showAddForm && (
        <div className="rounded-xl border border-gold/40 bg-gold/5 p-4 space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gold">Allot New Territory</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => setShowAddForm(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Territory *</Label>
              {!isCustomCity ? (
                <Select
                  value={selectedTerritoryId}
                  onValueChange={(v) => {
                    if (v === "__new__") {
                      setIsCustomCity(true);
                      setSelectedTerritoryId("");
                    } else {
                      setSelectedTerritoryId(v);
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 h-9 bg-card">
                    <SelectValue placeholder="Select territory" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {territories.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{t.state ? ` (${t.state})` : ""} — {t.ownership_type || "FRANCHISE"}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__" className="text-gold font-medium">
                      + Create New City / Territory...
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-1.5 mt-1">
                  <Input
                    placeholder="New city name (e.g. Bhopal)"
                    value={customCityName}
                    onChange={(e) => setCustomCityName(e.target.value)}
                    className="h-8 text-xs bg-card"
                  />
                  <Input
                    placeholder="State (e.g. Madhya Pradesh)"
                    value={customCityState}
                    onChange={(e) => setCustomCityState(e.target.value)}
                    className="h-8 text-xs bg-card"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCustomCity(false)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  >
                    Back to existing catalog
                  </button>
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Specific Area / Outlet Name</Label>
              <Input
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="e.g. Jhotwara, Pune Main"
                className="mt-1 h-9 bg-card text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Operational Ownership</Label>
              <Select value={ownershipType} onValueChange={setOwnershipType}>
                <SelectTrigger className="mt-1 h-9 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FRANCHISE">FRANCHISE (Franchisee Outlet)</SelectItem>
                  <SelectItem value="DIRECT_COMPANY">DIRECT_COMPANY (Company Owned Branch)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Exclusivity Radius (km)</Label>
              <Input
                type="number"
                step="0.5"
                value={radiusKm}
                onChange={(e) => setRadiusKm(e.target.value)}
                className="mt-1 h-9 bg-card text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={makePrimary}
                onChange={(e) => setMakePrimary(e.target.checked)}
                className="rounded border-border"
              />
              <span>Set as primary territory for ROI & invoices</span>
            </label>

            <Button
              type="button"
              size="sm"
              disabled={submitting || (!isCustomCity && !selectedTerritoryId) || (isCustomCity && !customCityName.trim())}
              onClick={handleAddAllotment}
              className="bg-gradient-gold text-background h-8 px-4"
            >
              {submitting ? "Allotting..." : "Confirm Allotment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Territory allotment editor with boundary profile inputs and manager */
export function TerritoryFields({
  form,
  setForm,
  franchiseeId,
  isSuperAdmin = false,
}: {
  form: any;
  setForm: (f: any) => void;
  franchiseeId?: string;
  isSuperAdmin?: boolean;
}) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const txt = (k: string, label: string, ph?: string) => (
    <div>
      <Label>{label}</Label>
      <Input
        value={form[k] ?? ""}
        disabled={!isSuperAdmin}
        onChange={set(k)}
        placeholder={ph}
        className="mt-1"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Territory Manager: Allotments, Add, Change, Delete */}
      <TerritoryManager
        franchiseeId={franchiseeId || form?.id}
        isSuperAdmin={isSuperAdmin}
        form={form}
        setForm={setForm}
      />

      {/* Primary Boundaries & Registration Details */}
      <div className="border-t border-border/40 pt-3">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Primary Territory Boundaries & Registration
        </Label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {txt("territory_country", "Country", "India")}
          {txt("territory_state", "State")}
          {txt("territory_district", "District")}
          {txt("territory_city", "City")}
          {txt("territory_area", "Area", "e.g. Vaishali Nagar")}
          {txt("territory_pincode", "Pincode")}
          <div>
            <Label>Radius (km)</Label>
            <Input
              type="number"
              step="0.1"
              value={form.territory_radius_km ?? ""}
              disabled={!isSuperAdmin}
              onChange={set("territory_radius_km")}
              className="mt-1"
            />
          </div>
          <div />
          <div>
            <Label>Start date</Label>
            <Input
              type="date"
              value={form.territory_start_date ?? ""}
              disabled={!isSuperAdmin}
              onChange={set("territory_start_date")}
              className="mt-1"
            />
          </div>
          <div>
            <Label>End date</Label>
            <Input
              type="date"
              value={form.territory_end_date ?? ""}
              disabled={!isSuperAdmin}
              onChange={set("territory_end_date")}
              className="mt-1"
            />
          </div>
        </div>

        <div className="mt-3 flex gap-6 text-sm">
          <label className={`flex items-center gap-2 ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              disabled={!isSuperAdmin}
              checked={!!form.territory_exclusive}
              onChange={(e) => setForm({ ...form, territory_exclusive: e.target.checked })}
            />
            Exclusive territory
          </label>
          <label className={`flex items-center gap-2 ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              disabled={!isSuperAdmin}
              checked={!!form.territory_approved}
              onChange={(e) => setForm({ ...form, territory_approved: e.target.checked })}
            />
            Territory approved
          </label>
        </div>
      </div>
    </div>
  );
}

/** Shows the assigned Franchise Product's ROI % and lets admin reapply them to the agreement. */
export function ProductPctSync({
  franchiseProductId,
  current,
  onApply,
}: {
  franchiseProductId: string | null;
  current: any;
  onApply: (v: Record<string, number>) => void;
}) {
  const { data } = useQuery({
    queryKey: ["product-pct-sync", franchiseProductId],
    enabled: !!franchiseProductId,
    queryFn: async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        (supabase as any).from("franchise_products").select("*").eq("id", franchiseProductId).maybeSingle(),
        (supabase as any).from("franchise_product_commissions").select("kind,label,amount,percent").eq("product_id", franchiseProductId),
      ]);
      return { product: p as ProductTemplate | null, commissions: (c ?? []) as ProductCommission[] };
    },
  });
  if (!franchiseProductId) {
    return <p className="rounded-lg border border-border/50 p-3 text-xs text-muted-foreground">No Franchise Product assigned — assign one in the Product tab so ROI % follow the product.</p>;
  }
  if (!data?.product) return null;
  const d = productDefaults(data.product, data.commissions, {
    investment_amount: Number(current.investment_amount ?? 0),
    franchise_fee: Number(current.franchise_fee ?? 0),
    mg_percent: Number(current.mg_percent ?? 0),
    tns_percent: Number(current.tns_percent ?? 0),
    academy_percent: Number(current.academy_percent ?? 0),
    mall_percent: Number(current.mall_percent ?? 0),
    royalty_percent: Number(current.royalty_percent ?? 0),
    franchise_commission_amount: Number(current.franchise_commission_amount ?? 0),
    agreement_version: current.agreement_version ?? null,
  });
  const keys = ["mg_percent", "tns_percent", "academy_percent", "mall_percent", "royalty_percent"] as const;
  const differs = keys.some((k) => Number(current[k] ?? 0) !== Number(d[k]));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/30 bg-gold/5 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-gold" />
        <span>
          Product <b>{data.product.name}</b>: MG {d.mg_percent}% · TNS {d.tns_percent}% · Academy {d.academy_percent}% · Mall {d.mall_percent}% · Royalty {d.royalty_percent}%
        </span>
      </div>
      {differs ? (
        <Button size="sm" variant="outline" onClick={() => onApply(Object.fromEntries(keys.map((k) => [k, Number(d[k])])))}>
          Use product %
        </Button>
      ) : (
        <span className="text-emerald-400">Matches product</span>
      )}
    </div>
  );
}
