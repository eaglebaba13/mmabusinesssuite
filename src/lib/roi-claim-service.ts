import { storageService } from "@/lib/storage";
// ROI Claim persistence: creates/updates the roi_claims record, renders the
// PDF + DOCX, stores both in the private `roi-claims` bucket and writes an
// audit/version row. All access is RLS-gated (finance staff manage, franchise
// partners read their own folder only).
import { supabase } from "@/integrations/supabase/client";
import {
  buildClaimData,
  claimFileBase,
  claimStoragePrefix,
  generateClaimDocx,
  generateClaimPdf,
  validateClaim,
  type ClaimData,
  type FranchiseeForClaim,
  type PayoutForClaim,
} from "./roi-claim";
import type { Database, Json } from "@/integrations/supabase/types";

type ClaimStatus = Database["public"]["Enums"]["roi_claim_status"];

const BUCKET = "roi-claims";

const FRANCHISEE_FIELDS =
  "id, full_name, auth_name, franchisee_code, address, email, phone, territory_city, territory_district, territory_state, territory_area, territory_id, warehouse_id, bank_name, bank_account_holder, bank_account_number, bank_ifsc, bank_branch, investment_amount, mg_percent";

type FranchiseeRecord = FranchiseeForClaim & { territory_id?: string | null; warehouse_id?: string | null };

/**
 * Resolves Location / Territory from related records when the franchisee row has
 * no territory columns: territory mapping → own warehouse → state franchise.
 * Never invents values; returns nulls when nothing exists.
 */
async function resolveTerritoryContext(f: FranchiseeRecord) {
  let location: string | null = null;
  let territory: string | null = null;

  if (f.territory_id) {
    const { data } = await supabase
      .from("territories")
      .select("name, region, state")
      .eq("id", f.territory_id)
      .maybeSingle();
    if (data) {
      territory = data.name || data.region || null;
      location = [data.region || data.name, data.state].filter(Boolean).join(", ") || null;
    }
  }

  if (!location) {
    const wq = supabase.from("warehouses").select("name, city, state").limit(1);
    const { data } = f.warehouse_id
      ? await wq.eq("id", f.warehouse_id).maybeSingle()
      : await wq.eq("franchisee_id", f.id).maybeSingle();
    if (data && (data.city || data.state)) {
      location = [data.city, data.state].filter(Boolean).join(", ") || null;
      territory = territory || data.city || data.name || null;
    }
  }

  return { location, territory };
}


export type RoiClaimRow = {
  id: string;
  payout_id: string;
  franchisee_id: string;
  claim_ref_no: number;
  claim_period: string;
  submitted_on: string;
  activity_type: string;
  description: string | null;
  fix_roi_amount: number;
  shopify_amount: number;
  tns_amount: number;
  total_claimed: number;
  net_payable: number;
  status: string;
  version: number;
  pdf_path: string | null;
  docx_path: string | null;
  snapshot: unknown;
  created_at: string;
  updated_at: string;
};

export async function fetchClaimForPayout(payoutId: string) {
  const { data, error } = await supabase.from("roi_claims").select("*").eq("payout_id", payoutId).maybeSingle();
  if (error) throw error;
  return (data as RoiClaimRow | null) ?? null;
}

export async function fetchClaimsForPayouts(payoutIds: string[]) {
  if (!payoutIds.length) return [] as RoiClaimRow[];
  const { data, error } = await supabase.from("roi_claims").select("*").in("payout_id", payoutIds);
  if (error) throw error;
  return (data ?? []) as RoiClaimRow[];
}

export async function fetchClaimsForFranchisee(franchiseeId: string) {
  const { data, error } = await supabase
    .from("roi_claims")
    .select("*")
    .eq("franchisee_id", franchiseeId)
    .order("claim_period", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RoiClaimRow[];
}

/**
 * Generates (or regenerates) the ROI Claim Letter for a payout.
 * Duplicate-safe: one claim per payout, same claim reference number on regeneration.
 */
export async function generateClaimForPayout(opts: {
  payoutId: string;
  regenerate?: boolean;
  reason?: string;
  activityType?: string;
  description?: string;
}): Promise<{ claim: RoiClaimRow; data: ClaimData; skipped?: boolean }> {
  const { data: payout, error: pErr } = await supabase
    .from("roi_payouts")
    .select("*")
    .eq("id", opts.payoutId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!payout) throw new Error("ROI payout not found.");

  const { data: franchisee, error: fErr } = await supabase
    .from("franchisees")
    .select(FRANCHISEE_FIELDS)
    .eq("id", (payout as PayoutForClaim).franchisee_id)
    .maybeSingle();
  if (fErr) throw fErr;

  const f = franchisee as FranchiseeRecord | null;
  const p = payout as PayoutForClaim;

  const problems = validateClaim(f, p);
  if (problems.length) throw new Error(problems.join(" "));

  const ctx = await resolveTerritoryContext(f!);

  const existing = await fetchClaimForPayout(opts.payoutId);
  if (existing && !opts.regenerate) {
    const data = buildClaimData({
      franchisee: f!,
      payout: p,
      claimRefNo: existing.claim_ref_no,
      submittedOn: existing.submitted_on,
      activityType: existing.activity_type,
      description: existing.description,
      locationFallback: ctx.location,
      territoryFallback: ctx.territory,
    });
    return { claim: existing, data, skipped: true };
  }

  let claim = existing;
  if (!claim) {
    const { data: inserted, error } = await supabase
      .from("roi_claims")
      .insert({
        payout_id: p.id,
        franchisee_id: p.franchisee_id,
        claim_period: p.payout_month,
        activity_type: opts.activityType ?? undefined,
        description: opts.description ?? undefined,
        status: "generated",
      })
      .select("*")
      .single();
    if (error) throw error;
    claim = inserted as RoiClaimRow;
  }

  const data = buildClaimData({
    franchisee: f!,
    payout: p,
    claimRefNo: claim.claim_ref_no,
    submittedOn: claim.submitted_on,
    activityType: opts.activityType ?? claim.activity_type,
    description: opts.description ?? claim.description,
    locationFallback: ctx.location,
    territoryFallback: ctx.territory,
  });


  const [pdf, docx] = await Promise.all([generateClaimPdf(data), generateClaimDocx(data)]);
  const base = claimFileBase(data);
  const prefix = claimStoragePrefix(p.franchisee_id, claim.claim_ref_no);
  const pdfPath = `${prefix}/${base}.pdf`;
  const docxPath = `${prefix}/${base}.docx`;

  const up1 = await storageService.from(BUCKET).upload(pdfPath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up1.error) throw up1.error;
  const up2 = await storageService.from(BUCKET).upload(docxPath, docx, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  });
  if (up2.error) throw up2.error;

  const nextVersion = existing && opts.regenerate ? claim.version + 1 : claim.version;
  const { data: { user } = { user: null } } = await supabase.auth.getUser();

  const { data: updated, error: uErr } = await supabase
    .from("roi_claims")
    .update({
      activity_type: data.activityType,
      description: data.description,
      fix_roi_amount: data.fixRoi,
      shopify_amount: data.shopifyClaim,
      tns_amount: data.tnsClaim,
      total_claimed: data.totalClaimed,
      net_payable: data.netPayable,
      pdf_path: pdfPath,
      docx_path: docxPath,
      version: nextVersion,
      status: (claim.status === "draft" ? "generated" : claim.status) as ClaimStatus,
      snapshot: data as unknown as Json,
      generated_by: user?.id ?? null,
    })
    .eq("id", claim.id)
    .select("*")
    .single();
  if (uErr) throw uErr;

  await supabase.from("roi_claim_versions").insert([{
    claim_id: claim.id,
    version: nextVersion,
    action: existing && opts.regenerate ? "regenerated" : "generated",
    reason: opts.reason ?? null,
    snapshot: data as unknown as Json,
    pdf_path: pdfPath,
    docx_path: docxPath,
    actor: user?.id ?? null,
  }]);

  return { claim: updated as RoiClaimRow, data };
}

/** Bulk generation used after "Auto-generate" creates payouts. */
export async function generateClaimsForPayouts(payoutIds: string[]) {
  const results = { created: 0, skipped: 0, failed: [] as { payoutId: string; message: string }[] };
  for (const id of payoutIds) {
    try {
      const r = await generateClaimForPayout({ payoutId: id });
      if (r.skipped) results.skipped += 1;
      else results.created += 1;
    } catch (e) {
      results.failed.push({ payoutId: id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

export async function signedClaimUrl(path: string, download?: string) {
  const { data, error } = await storageService
    .from(BUCKET)
    .createSignedUrl(path, 60 * 5, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/** Download the stored PDF as a blob object URL so it can be embedded reliably. */
export async function claimObjectUrl(path: string) {
  const { data, error } = await storageService.from(BUCKET).download(path);
  if (error) throw error;
  const bytes = await data.arrayBuffer();
  return {
    url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
    data: bytes,
  };
}

export async function downloadClaimFile(path: string, filename: string) {
  const url = await signedClaimUrl(path, filename);
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function updateClaimStatus(claimId: string, status: string) {
  const { error } = await supabase.from("roi_claims").update({ status: status as ClaimStatus }).eq("id", claimId);
  if (error) throw error;
}
