import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { ImportConfig, ImportContext } from "./import";
import { parseDate, parseNumber } from "./import";

/* ----------------------------- helpers ------------------------------- */

const optionalString = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === null || v === "" ? null : String(v).trim()));

const requiredString = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length > 0, { message: `${label} is required` });

const optionalNumber = z
  .any()
  .optional()
  .transform((v) => parseNumber(v));

const optionalDate = z
  .any()
  .optional()
  .transform((v) => parseDate(v));

const requiredDate = (label: string) =>
  z
    .any()
    .transform((v) => parseDate(v))
    .refine((v) => v !== null, { message: `${label} must be a valid date (YYYY-MM-DD)` });

async function buildLookup(
  table: string,
  keyCol: string,
  valueCol = "id",
  filter?: { col: string; eq: any },
): Promise<Map<string, string>> {
  let q: any = (supabase as any).from(table).select(`${keyCol}, ${valueCol}`);
  if (filter) q = q.eq(filter.col, filter.eq);
  const { data } = await q;
  const map = new Map<string, string>();
  (data ?? []).forEach((r: any) => {
    const k = r[keyCol];
    if (k !== null && k !== undefined && k !== "") {
      map.set(String(k).trim().toLowerCase(), r[valueCol]);
    }
  });
  return map;
}

function lookup(map: Map<string, string>, value: string | null, label: string): string | null {
  if (!value) return null;
  const found = map.get(String(value).trim().toLowerCase());
  if (!found) throw new Error(`Unknown ${label}: ${value}`);
  return found;
}

/* ---------------------------- LEADS --------------------------------- */

const leadsConfig: ImportConfig = {
  entity: "leads",
  label: "Leads",
  table: "leads",
  invalidateKeys: [["leads"]],
  columns: [
    { key: "full_name", required: true, example: "Riya Sharma" },
    { key: "email", example: "riya@example.com" },
    { key: "phone", example: "+919812345678" },
    { key: "city", example: "Mumbai" },
    { key: "source", example: "manual", description: "manual | facebook | instagram | google | webinar | referral | website" },
    { key: "stage", example: "new", description: "new | interested | followup | hot | payment_pending | closed | lost" },
    { key: "score", example: 50 },
    { key: "ad_name", example: "Diwali Combo — Reel A", description: "Specific ad creative / ad set name" },
    { key: "notes" },
  ],
  schema: z.object({
    full_name: requiredString("full_name"),
    email: optionalString,
    phone: optionalString,
    city: optionalString,
    source: optionalString,
    stage: optionalString,
    score: optionalNumber,
    ad_name: optionalString,
    notes: optionalString,
  }),
  transform: (row) => ({
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    source: row.source ?? "manual",
    stage: row.stage ?? "new",
    score: row.score ?? 0,
    ad_name: row.ad_name,
    notes: row.notes,
  }),
};

/* -------------------------- FRANCHISEES ------------------------------ */

const franchiseesConfig: ImportConfig = {
  entity: "franchisees",
  label: "Franchisees",
  table: "franchisees",
  invalidateKeys: [["franchisees"]],
  columns: [
    { key: "full_name", required: true, example: "Acme Partners" },
    { key: "email", example: "owner@acme.com" },
    { key: "phone", example: "+919811112222" },
    { key: "investment_amount", example: 500000 },
    { key: "franchise_fee", example: 500000 },
    { key: "base_roi_pct", example: 3 },
    { key: "emporium_pct", example: 10 },
    { key: "academy_pct", example: 3 },
    { key: "dark_store_pct", example: 3 },
    { key: "area_sqft", example: 150 },
    { key: "status", example: "active", description: "active | suspended | closed" },
  ],
  schema: z.object({
    full_name: requiredString("full_name"),
    email: optionalString,
    phone: optionalString,
    investment_amount: optionalNumber,
    franchise_fee: optionalNumber,
    base_roi_pct: optionalNumber,
    emporium_pct: optionalNumber,
    academy_pct: optionalNumber,
    dark_store_pct: optionalNumber,
    area_sqft: optionalNumber,
    status: optionalString,
  }),
  transform: (row) => ({
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    investment_amount: row.investment_amount ?? 500000,
    franchise_fee: row.franchise_fee ?? 500000,
    base_roi_pct: row.base_roi_pct ?? 3,
    emporium_pct: row.emporium_pct ?? 10,
    academy_pct: row.academy_pct ?? 3,
    dark_store_pct: row.dark_store_pct ?? 3,
    area_sqft: row.area_sqft,
    status: row.status ?? "active",
  }),
};

/* --------------------------- PRODUCTS -------------------------------- */

const productsConfig: ImportConfig = {
  entity: "products",
  label: "Products",
  table: "products",
  invalidateKeys: [["products"]],
  columns: [
    { key: "sku", required: true, example: "SKU-001" },
    { key: "name", required: true, example: "Sample Product" },
    { key: "category", example: "snacks", description: "Category slug" },
    { key: "unit", example: "pcs" },
    { key: "cost_price", example: 100 },
    { key: "sale_price", example: 150 },
    { key: "mrp", example: 200 },
    { key: "hsn_code", example: "1234" },
    { key: "low_stock_threshold", example: 10 },
  ],
  schema: z.object({
    sku: requiredString("sku"),
    name: requiredString("name"),
    category: optionalString,
    unit: optionalString,
    cost_price: optionalNumber,
    sale_price: optionalNumber,
    mrp: optionalNumber,
    hsn_code: optionalString,
    low_stock_threshold: optionalNumber,
  }),
  transform: async (row, ctx) => ({
    sku: row.sku,
    name: row.name,
    category_id: lookup(ctx.lookups.categories, row.category, "category"),
    unit: row.unit ?? "pcs",
    cost_price: row.cost_price ?? 0,
    sale_price: row.sale_price ?? 0,
    mrp: row.mrp ?? 0,
    hsn_code: row.hsn_code,
    low_stock_threshold: row.low_stock_threshold ?? 10,
    active: true,
  }),
};

/* ----------------------- PRODUCT CATEGORIES -------------------------- */

const productCategoriesConfig: ImportConfig = {
  entity: "product_categories",
  label: "Product categories",
  table: "product_categories",
  invalidateKeys: [["categories"]],
  columns: [
    { key: "name", required: true, example: "Snacks" },
    { key: "slug", example: "snacks" },
    { key: "description" },
  ],
  schema: z.object({
    name: requiredString("name"),
    slug: optionalString,
    description: optionalString,
  }),
  transform: (row) => ({
    name: row.name,
    slug: row.slug ?? String(row.name).toLowerCase().replace(/\s+/g, "-"),
    description: row.description,
  }),
};

/* ---------------------------- SUPPLIERS ------------------------------ */

const suppliersConfig: ImportConfig = {
  entity: "suppliers",
  label: "Suppliers",
  table: "suppliers",
  invalidateKeys: [["suppliers"]],
  columns: [
    { key: "name", required: true, example: "Acme Wholesalers" },
    { key: "contact_person", example: "Ravi Kumar" },
    { key: "phone", example: "+919812345678" },
    { key: "email", example: "sales@acme.com" },
    { key: "gstin", example: "27AAAAA0000A1Z5" },
    { key: "city", example: "Mumbai" },
    { key: "state", example: "Maharashtra" },
    { key: "address" },
  ],
  schema: z.object({
    name: requiredString("name"),
    contact_person: optionalString,
    phone: optionalString,
    email: optionalString,
    gstin: optionalString,
    city: optionalString,
    state: optionalString,
    address: optionalString,
  }),
  transform: (row) => ({ ...row, active: true }),
};

/* --------------------------- WAREHOUSES ------------------------------ */

const warehousesConfig: ImportConfig = {
  entity: "warehouses",
  label: "Warehouses",
  table: "warehouses",
  invalidateKeys: [["warehouses"]],
  columns: [
    { key: "code", required: true, example: "WH-MUM-01" },
    { key: "name", required: true, example: "Mumbai Central Store" },
    { key: "type", example: "dark_store", description: "central_warehouse | dark_store | outlet" },
    { key: "city", example: "Mumbai" },
    { key: "state", example: "Maharashtra" },
    { key: "address" },
  ],
  schema: z.object({
    code: requiredString("code"),
    name: requiredString("name"),
    type: optionalString,
    city: optionalString,
    state: optionalString,
    address: optionalString,
  }),
  transform: (row) => ({
    code: row.code,
    name: row.name,
    type: row.type ?? "dark_store",
    city: row.city,
    state: row.state,
    address: row.address,
    active: true,
  }),
};

/* ------------------------ PURCHASE ORDERS ---------------------------- */

const purchaseOrdersConfig: ImportConfig = {
  entity: "purchase_orders",
  label: "Purchase orders",
  table: "purchase_orders",
  invalidateKeys: [["purchase-orders"]],
  columns: [
    { key: "po_number", required: true, example: "PO-000123" },
    { key: "supplier_name", required: true, example: "Acme Wholesalers" },
    { key: "warehouse_code", required: true, example: "WH-MUM-01" },
    { key: "order_date", example: "2025-04-01" },
    { key: "expected_date", example: "2025-04-10" },
    { key: "status", example: "draft", description: "draft | sent | partially_received | received | cancelled" },
    { key: "notes" },
  ],
  schema: z.object({
    po_number: requiredString("po_number"),
    supplier_name: requiredString("supplier_name"),
    warehouse_code: requiredString("warehouse_code"),
    order_date: optionalDate,
    expected_date: optionalDate,
    status: optionalString,
    notes: optionalString,
  }),
  transform: async (row, ctx) => ({
    po_number: row.po_number,
    supplier_id: lookup(ctx.lookups.suppliers, row.supplier_name, "supplier_name"),
    warehouse_id: lookup(ctx.lookups.warehouses, row.warehouse_code, "warehouse_code"),
    order_date: row.order_date ?? new Date().toISOString().slice(0, 10),
    expected_date: row.expected_date,
    status: row.status ?? "draft",
    notes: row.notes,
  }),
};

/* ---------------------------- REVENUE -------------------------------- */

const revenueConfig: ImportConfig = {
  entity: "revenue_entries",
  label: "Revenue entries",
  table: "revenue_entries",
  invalidateKeys: [["revenue-list"], ["fin-overview"], ["fin-recent"]],
  columns: [
    { key: "received_on", required: true, example: "2025-04-01" },
    { key: "source", example: "other", description: "academy | inventory | franchise_fee | consulting | event | other" },
    { key: "source_label", example: "Spring batch fees" },
    { key: "amount", required: true, example: 25000 },
    { key: "franchisee_email", description: "Optional — links entry to a franchisee" },
    { key: "reference" },
    { key: "notes" },
  ],
  schema: z.object({
    received_on: requiredDate("received_on"),
    source: optionalString,
    source_label: optionalString,
    amount: optionalNumber,
    franchisee_email: optionalString,
    reference: optionalString,
    notes: optionalString,
  }).refine((v) => v.amount !== null && (v.amount ?? 0) > 0, { message: "amount must be greater than 0", path: ["amount"] }),
  transform: async (row, ctx) => ({
    received_on: row.received_on,
    source: row.source ?? "other",
    source_label: row.source_label,
    amount: row.amount,
    franchisee_id: row.franchisee_email
      ? lookup(ctx.lookups.franchisees, row.franchisee_email, "franchisee_email")
      : null,
    reference: row.reference,
    notes: row.notes,
  }),
};

/* ---------------------------- EXPENSES ------------------------------- */

const expensesConfig: ImportConfig = {
  entity: "expenses",
  label: "Expenses",
  table: "expenses",
  invalidateKeys: [["expenses"], ["fin-overview"]],
  columns: [
    { key: "expense_date", required: true, example: "2025-04-01" },
    { key: "vendor", example: "Office Supplies Co." },
    { key: "category", example: "office", description: "Category slug" },
    { key: "amount", required: true, example: 1500 },
    { key: "payment_method", example: "bank_transfer", description: "cash | bank_transfer | upi | card | cheque | other" },
    { key: "status", example: "paid", description: "paid | pending | cancelled" },
    { key: "reference" },
    { key: "notes" },
  ],
  schema: z.object({
    expense_date: requiredDate("expense_date"),
    vendor: optionalString,
    category: optionalString,
    amount: optionalNumber,
    payment_method: optionalString,
    status: optionalString,
    reference: optionalString,
    notes: optionalString,
  }).refine((v) => v.amount !== null && (v.amount ?? 0) > 0, { message: "amount must be greater than 0", path: ["amount"] }),
  transform: async (row, ctx) => ({
    expense_date: row.expense_date,
    vendor: row.vendor,
    category_id: row.category ? lookup(ctx.lookups.expenseCategories, row.category, "category") : null,
    amount: row.amount,
    payment_method: row.payment_method ?? "bank_transfer",
    status: row.status ?? "paid",
    reference: row.reference,
    notes: row.notes,
  }),
};

/* ----------------------- EXPENSE CATEGORIES -------------------------- */

const expenseCategoriesConfig: ImportConfig = {
  entity: "expense_categories",
  label: "Expense categories",
  table: "expense_categories",
  invalidateKeys: [["exp-cats-full"], ["exp-cats"]],
  columns: [
    { key: "name", required: true, example: "Office Supplies" },
    { key: "slug", example: "office-supplies" },
    { key: "monthly_budget", example: 10000 },
    { key: "color", example: "#c9a84c" },
    { key: "description" },
  ],
  schema: z.object({
    name: requiredString("name"),
    slug: optionalString,
    monthly_budget: optionalNumber,
    color: optionalString,
    description: optionalString,
  }),
  transform: (row) => ({
    name: row.name,
    slug: row.slug ?? String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    monthly_budget: row.monthly_budget ?? 0,
    color: row.color ?? "#c9a84c",
    description: row.description,
  }),
};

/* ---------------------------- STUDENTS ------------------------------- */

const studentsConfig: ImportConfig = {
  entity: "students",
  label: "Students",
  table: "students",
  invalidateKeys: [["students"]],
  columns: [
    { key: "full_name", required: true, example: "Aarav Patel" },
    { key: "email", example: "aarav@example.com" },
    { key: "phone", example: "+919812345678" },
    { key: "city", example: "Mumbai" },
    { key: "date_of_birth", example: "2002-04-15" },
    { key: "gender", example: "male" },
    { key: "guardian_name" },
    { key: "guardian_phone" },
    { key: "address" },
  ],
  schema: z.object({
    full_name: requiredString("full_name"),
    email: optionalString,
    phone: optionalString,
    city: optionalString,
    date_of_birth: optionalDate,
    gender: optionalString,
    guardian_name: optionalString,
    guardian_phone: optionalString,
    address: optionalString,
  }),
  transform: (row) => row,
};

/* ---------------------------- COURSES -------------------------------- */

const coursesConfig: ImportConfig = {
  entity: "courses",
  label: "Courses",
  table: "courses",
  invalidateKeys: [["courses"]],
  columns: [
    { key: "code", example: "MMA-101" },
    { key: "title", required: true, example: "Foundation Course" },
    { key: "duration_weeks", example: 8 },
    { key: "fee_amount", example: 25000 },
    { key: "level", example: "beginner", description: "beginner | intermediate | advanced" },
    { key: "status", example: "published", description: "draft | published | archived" },
    { key: "description" },
  ],
  schema: z.object({
    code: optionalString,
    title: requiredString("title"),
    duration_weeks: optionalNumber,
    fee_amount: optionalNumber,
    level: optionalString,
    status: optionalString,
    description: optionalString,
  }),
  transform: (row) => ({
    code: row.code,
    title: row.title,
    duration_weeks: row.duration_weeks ?? 4,
    fee_amount: row.fee_amount ?? 0,
    level: row.level ?? "beginner",
    status: row.status ?? "published",
    description: row.description,
  }),
};

/* ----------------------------- BATCHES ------------------------------- */

const batchesConfig: ImportConfig = {
  entity: "batches",
  label: "Batches",
  table: "batches",
  invalidateKeys: [["batches"]],
  columns: [
    { key: "batch_code", required: true, example: "B-2025-04" },
    { key: "course_code", required: true, example: "MMA-101" },
    { key: "trainer_email", example: "trainer@example.com" },
    { key: "start_date", required: true, example: "2025-05-01" },
    { key: "end_date", example: "2025-06-30" },
    { key: "mode", example: "offline", description: "online | offline | hybrid" },
    { key: "capacity", example: 30 },
    { key: "location", example: "Mumbai HQ" },
  ],
  schema: z.object({
    batch_code: requiredString("batch_code"),
    course_code: requiredString("course_code"),
    trainer_email: optionalString,
    start_date: requiredDate("start_date"),
    end_date: optionalDate,
    mode: optionalString,
    capacity: optionalNumber,
    location: optionalString,
  }),
  transform: async (row, ctx) => ({
    batch_code: row.batch_code,
    course_id: lookup(ctx.lookups.courses, row.course_code, "course_code"),
    trainer_id: row.trainer_email ? lookup(ctx.lookups.trainers, row.trainer_email, "trainer_email") : null,
    start_date: row.start_date,
    end_date: row.end_date,
    mode: row.mode ?? "offline",
    capacity: row.capacity ?? 30,
    location: row.location,
    status: "upcoming",
  }),
};

/* ----------------------------- FEES ---------------------------------- */

const feesConfig: ImportConfig = {
  entity: "fee_payments",
  label: "Fee payments",
  table: "fee_payments",
  invalidateKeys: [["fees-all"]],
  columns: [
    { key: "enrollment_id", required: true, description: "UUID of the enrollment record" },
    { key: "amount", required: true, example: 5000 },
    { key: "method", example: "cash", description: "cash | upi | card | bank_transfer | cheque" },
    { key: "paid_on", example: "2025-04-01" },
    { key: "due_on", example: "2025-04-15" },
    { key: "status", example: "paid", description: "paid | pending | partial | overdue | waived" },
    { key: "reference" },
  ],
  schema: z.object({
    enrollment_id: requiredString("enrollment_id"),
    amount: optionalNumber,
    method: optionalString,
    paid_on: optionalDate,
    due_on: optionalDate,
    status: optionalString,
    reference: optionalString,
  }).refine((v) => v.amount !== null && (v.amount ?? 0) > 0, { message: "amount must be greater than 0", path: ["amount"] }),
  transform: (row) => ({
    enrollment_id: row.enrollment_id,
    amount: row.amount,
    method: row.method ?? "cash",
    paid_on: row.paid_on,
    due_on: row.due_on,
    status: row.status ?? "pending",
    reference: row.reference,
  }),
};

/* ---------------------------- WEBINARS ------------------------------- */

const webinarsConfig: ImportConfig = {
  entity: "webinars",
  label: "Webinars",
  table: "webinars",
  invalidateKeys: [["webinars"]],
  columns: [
    { key: "title", required: true, example: "Franchise Opportunity Demo" },
    { key: "slug", required: true, example: "franchise-demo-001" },
    { key: "scheduled_at", required: true, example: "2025-05-01T18:00:00" },
    { key: "duration_minutes", example: 60 },
    { key: "capacity", example: 500 },
    { key: "host_name", example: "Founder" },
    { key: "platform", example: "zoom", description: "zoom | meet | teams | youtube | other" },
    { key: "join_url" },
    { key: "price", example: 0 },
    { key: "description" },
  ],
  schema: z.object({
    title: requiredString("title"),
    slug: requiredString("slug"),
    scheduled_at: z
      .any()
      .transform((v) => {
        if (!v) return null;
        const d = new Date(v);
        return Number.isFinite(d.getTime()) ? d.toISOString() : null;
      })
      .refine((v) => v !== null, { message: "scheduled_at must be a valid date/time" }),
    duration_minutes: optionalNumber,
    capacity: optionalNumber,
    host_name: optionalString,
    platform: optionalString,
    join_url: optionalString,
    price: optionalNumber,
    description: optionalString,
  }),
  transform: (row) => ({
    title: row.title,
    slug: row.slug,
    scheduled_at: row.scheduled_at,
    duration_minutes: row.duration_minutes ?? 60,
    capacity: row.capacity ?? 500,
    host_name: row.host_name,
    platform: row.platform ?? "zoom",
    join_url: row.join_url,
    price: row.price ?? 0,
    description: row.description,
    status: "scheduled",
  }),
};

/* ---------------------------- EMPLOYEES ------------------------------ */

const employeesConfig: ImportConfig = {
  entity: "employees",
  label: "Employees",
  table: "employees",
  invalidateKeys: [["employees"]],
  columns: [
    { key: "employee_code", required: true, example: "EMP-0001" },
    { key: "full_name", required: true, example: "Sneha Iyer" },
    { key: "email", example: "sneha@example.com" },
    { key: "phone", example: "+919812345678" },
    { key: "designation", example: "Sales Manager" },
    { key: "department_code", example: "SALES" },
    { key: "employment_type", example: "full_time", description: "full_time | part_time | contract | intern | consultant" },
    { key: "date_of_joining", example: "2024-01-15" },
    { key: "monthly_ctc", example: 50000 },
    { key: "basic_salary", example: 25000 },
    { key: "hra", example: 12500 },
    { key: "allowances", example: 12500 },
    { key: "city", example: "Mumbai" },
    { key: "state", example: "Maharashtra" },
  ],
  schema: z.object({
    employee_code: requiredString("employee_code"),
    full_name: requiredString("full_name"),
    email: optionalString,
    phone: optionalString,
    designation: optionalString,
    department_code: optionalString,
    employment_type: optionalString,
    date_of_joining: optionalDate,
    monthly_ctc: optionalNumber,
    basic_salary: optionalNumber,
    hra: optionalNumber,
    allowances: optionalNumber,
    city: optionalString,
    state: optionalString,
  }),
  transform: async (row, ctx) => ({
    employee_code: row.employee_code,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    designation: row.designation,
    department_id: row.department_code
      ? lookup(ctx.lookups.departments, row.department_code, "department_code")
      : null,
    employment_type: row.employment_type ?? "full_time",
    date_of_joining: row.date_of_joining ?? new Date().toISOString().slice(0, 10),
    monthly_ctc: row.monthly_ctc ?? 0,
    basic_salary: row.basic_salary ?? 0,
    hra: row.hra ?? 0,
    allowances: row.allowances ?? 0,
    city: row.city,
    state: row.state,
    status: "active",
  }),
};

/* ------------------------- LEAD ROUTING RULES ------------------------ */

const leadRoutingConfig: ImportConfig = {
  entity: "lead_routing_rules",
  label: "Lead routing rules",
  table: "lead_routing_rules",
  invalidateKeys: [["routing-rules"]],
  columns: [
    { key: "name", required: true, example: "Mumbai Facebook leads" },
    { key: "match_source", example: "facebook" },
    { key: "match_campaign", example: "april-launch" },
    { key: "match_state", example: "Maharashtra" },
    { key: "match_city", example: "Mumbai" },
    { key: "set_stage", example: "interested" },
    { key: "assign_to_user_email", example: "sales@example.com" },
    { key: "priority", example: 100 },
  ],
  schema: z.object({
    name: requiredString("name"),
    match_source: optionalString,
    match_campaign: optionalString,
    match_state: optionalString,
    match_city: optionalString,
    set_stage: optionalString,
    assign_to_user_email: optionalString,
    priority: optionalNumber,
  }),
  transform: async (row, ctx) => ({
    name: row.name,
    enabled: true,
    priority: row.priority ?? 100,
    match_source: row.match_source,
    match_campaign: row.match_campaign,
    match_state: row.match_state,
    match_city: row.match_city,
    set_stage: row.set_stage,
    assign_to_user: row.assign_to_user_email
      ? lookup(ctx.lookups.users, row.assign_to_user_email, "assign_to_user_email")
      : null,
  }),
};

/* ----------------------------- TRAINERS ------------------------------ */

const trainersConfig: ImportConfig = {
  entity: "trainers",
  label: "Trainers",
  table: "trainers",
  invalidateKeys: [["trainers"]],
  columns: [
    { key: "full_name", required: true, example: "Anita Rao" },
    { key: "email", example: "anita@example.com" },
    { key: "phone", example: "+919812345678" },
    { key: "specialization", example: "Foundation, Watercolour" },
    { key: "bio" },
  ],
  schema: z.object({
    full_name: requiredString("full_name"),
    email: optionalString,
    phone: optionalString,
    specialization: optionalString,
    bio: optionalString,
  }),
  transform: (row) => row,
};

/* ---------------------------- CERTIFICATES --------------------------- */

const certificatesConfig: ImportConfig = {
  entity: "certificates",
  label: "Certificates",
  table: "certificates",
  invalidateKeys: [["certificates"]],
  columns: [
    { key: "enrollment_id", required: true, description: "UUID of the enrollment record" },
    { key: "certificate_code", required: true, example: "CERT-2025-0001" },
    { key: "grade", example: "A" },
    { key: "issued_on", example: "2025-04-01" },
    { key: "remarks" },
  ],
  schema: z.object({
    enrollment_id: requiredString("enrollment_id"),
    certificate_code: requiredString("certificate_code"),
    grade: optionalString,
    issued_on: optionalDate,
    remarks: optionalString,
  }),
  transform: (row) => ({
    enrollment_id: row.enrollment_id,
    certificate_code: row.certificate_code,
    grade: row.grade,
    issued_on: row.issued_on ?? new Date().toISOString().slice(0, 10),
    remarks: row.remarks,
  }),
};

/* ---------------------------- ROI PAYOUTS ---------------------------- */

const roiPayoutsConfig: ImportConfig = {
  entity: "roi_payouts",
  label: "ROI payouts",
  table: "roi_payouts",
  invalidateKeys: [["roi-list"], ["fin-overview"]],
  columns: [
    { key: "franchisee_email", required: true, example: "owner@acme.com" },
    { key: "payout_month", required: true, example: "2025-04-01" },
    { key: "base_roi", example: 15000 },
    { key: "academy_incentive", example: 0 },
    { key: "dark_store_incentive", example: 0 },
    { key: "emporium_incentive", example: 0 },
    { key: "status", example: "pending", description: "pending | approved | paid | cancelled" },
  ],
  schema: z.object({
    franchisee_email: requiredString("franchisee_email"),
    payout_month: requiredDate("payout_month"),
    base_roi: optionalNumber,
    academy_incentive: optionalNumber,
    dark_store_incentive: optionalNumber,
    emporium_incentive: optionalNumber,
    status: optionalString,
  }),
  transform: async (row, ctx) => {
    const base = row.base_roi ?? 0;
    const ai = row.academy_incentive ?? 0;
    const ds = row.dark_store_incentive ?? 0;
    const em = row.emporium_incentive ?? 0;
    return {
      franchisee_id: lookup(ctx.lookups.franchisees, row.franchisee_email, "franchisee_email"),
      payout_month: row.payout_month,
      base_roi: base,
      academy_incentive: ai,
      dark_store_incentive: ds,
      emporium_incentive: em,
      total_amount: base + ai + ds + em,
      status: row.status ?? "pending",
    };
  },
};

/* ----------------------- FRANCHISEE TARGETS -------------------------- */

const franchiseeTargetsConfig: ImportConfig = {
  entity: "franchisee_targets",
  label: "Franchisee targets",
  table: "franchisee_targets",
  invalidateKeys: [["franchisee-targets"]],
  columns: [
    { key: "franchisee_email", description: "Optional — leave blank for default city target" },
    { key: "city", example: "Mumbai" },
    { key: "model_item_id", required: true, description: "UUID of the revenue_model_items row" },
    { key: "target_numbers", required: true, example: 100 },
    { key: "period_month", example: "2025-04-01" },
    { key: "notes" },
  ],
  schema: z.object({
    franchisee_email: optionalString,
    city: optionalString,
    model_item_id: requiredString("model_item_id"),
    target_numbers: optionalNumber,
    period_month: optionalDate,
    notes: optionalString,
  }).refine((v) => v.target_numbers !== null && (v.target_numbers ?? 0) > 0, {
    message: "target_numbers must be greater than 0",
    path: ["target_numbers"],
  }),
  transform: async (row, ctx) => ({
    franchisee_id: row.franchisee_email
      ? lookup(ctx.lookups.franchisees, row.franchisee_email, "franchisee_email")
      : null,
    city: row.city ?? "",
    model_item_id: row.model_item_id,
    target_numbers: row.target_numbers,
    period_month: row.period_month ?? new Date().toISOString().slice(0, 10),
    notes: row.notes,
  }),
};

/* ----------------------- LOOKUP FETCHING ----------------------------- */

/**
 * Pre-fetch lookup tables required by a given config so per-row transforms
 * are synchronous and fast.
 */
export async function fetchLookups(entity: string): Promise<ImportContext["lookups"]> {
  const out: ImportContext["lookups"] = {};
  switch (entity) {
    case "products":
      out.categories = await buildLookup("product_categories", "slug");
      break;
    case "purchase_orders":
      out.suppliers = await buildLookup("suppliers", "name");
      out.warehouses = await buildLookup("warehouses", "code");
      break;
    case "revenue_entries":
    case "roi_payouts":
    case "franchisee_targets":
      out.franchisees = await buildLookup("franchisees", "email");
      break;
    case "expenses":
      out.expenseCategories = await buildLookup("expense_categories", "slug");
      break;
    case "batches":
      out.courses = await buildLookup("courses", "code");
      out.trainers = await buildLookup("trainers", "email");
      break;
    case "employees":
      out.departments = await buildLookup("departments", "code");
      break;
    case "lead_routing_rules":
      out.users = await buildLookup("profiles", "email");
      break;
  }
  return out;
}

/* ----------------------- REGISTRY ------------------------------------ */

export const IMPORT_CONFIGS = {
  leads: leadsConfig,
  franchisees: franchiseesConfig,
  products: productsConfig,
  product_categories: productCategoriesConfig,
  suppliers: suppliersConfig,
  warehouses: warehousesConfig,
  purchase_orders: purchaseOrdersConfig,
  revenue_entries: revenueConfig,
  expenses: expensesConfig,
  expense_categories: expenseCategoriesConfig,
  students: studentsConfig,
  courses: coursesConfig,
  batches: batchesConfig,
  fee_payments: feesConfig,
  webinars: webinarsConfig,
  employees: employeesConfig,
  lead_routing_rules: leadRoutingConfig,
  trainers: trainersConfig,
  certificates: certificatesConfig,
  roi_payouts: roiPayoutsConfig,
  franchisee_targets: franchiseeTargetsConfig,
} as const;

export type ImportConfigKey = keyof typeof IMPORT_CONFIGS;
