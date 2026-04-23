-- Wipe demo data; preserve auth, profiles, user_roles, org_settings, config tables, and real onboarded franchisees (user_id IS NOT NULL)

-- Children before parents to respect FKs
TRUNCATE TABLE
  public.lead_activities,
  public.social_lead_events,
  public.webinar_registrations,
  public.ad_campaigns,
  public.lead_routing_rules,
  public.sale_payments,
  public.sales_order_items,
  public.stock_movements,
  public.stock_levels,
  public.purchase_order_items,
  public.attendance,
  public.fee_payments,
  public.certificates,
  public.enrollments,
  public.payroll_items,
  public.employee_attendance,
  public.leave_requests,
  public.audit_logs,
  public.notifications
RESTART IDENTITY CASCADE;

TRUNCATE TABLE
  public.leads,
  public.webinars,
  public.sales_orders,
  public.purchase_orders,
  public.products,
  public.suppliers,
  public.warehouses,
  public.students,
  public.batches,
  public.courses,
  public.trainers,
  public.payroll_runs,
  public.employees,
  public.departments,
  public.revenue_entries,
  public.expenses,
  public.roi_payouts,
  public.franchisee_targets
RESTART IDENTITY CASCADE;

-- Demo franchisees: drop only those NOT linked to a real auth user
DELETE FROM public.franchisee_credentials
WHERE franchisee_id IN (SELECT id FROM public.franchisees WHERE user_id IS NULL);

DELETE FROM public.franchisees WHERE user_id IS NULL;
