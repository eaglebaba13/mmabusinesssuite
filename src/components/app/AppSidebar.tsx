import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  Settings,
  LifeBuoy,
  Briefcase,
  GraduationCap,
  UserCog,
  Package,
  Wallet,
  Megaphone,
  ShoppingCart,
  MapPin,
  FileText,
  Coins,
  ShieldCheck,
  BarChart3,
  Calculator,
  Store,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";
import { useSidebarHidden, type SidebarSectionKey } from "@/lib/sidebar-visibility";

const NAV_MAIN = [
  { title: "Dashboard", url: "/app/dashboard" as const, icon: LayoutDashboard },
  { title: "Leads", url: "/app/leads" as const, icon: Users },
  { title: "Franchisees", url: "/app/franchisees" as const, icon: Building2 },
  
] as const;

const NAV_FRANCHISE_NETWORK = [
  { title: "Products", url: "/app/franchise-products" as const, icon: Package },
  { title: "Marketplace", url: "/app/franchise-marketplace" as const, icon: Store },
  { title: "Compare", url: "/app/franchise-compare" as const, icon: BarChart3 },
  { title: "Agreements", url: "/app/agreements" as const, icon: FileText },
] as const;

const NAV_ACADEMY = [
  { title: "Academy", url: "/app/academy" as const, icon: GraduationCap },
] as const;

const NAV_INVENTORY = [
  { title: "Inventory", url: "/app/inventory" as const, icon: Package },
] as const;

const NAV_FINANCE = [
  { title: "Finance", url: "/app/finance" as const, icon: Wallet },
  { title: "Invoices", url: "/app/billing/invoices" as const, icon: FileText },
  { title: "Accounts", url: "/app/accounts" as const, icon: Calculator },
  { title: "State Payouts", url: "/app/payouts/state" as const, icon: Coins },
  { title: "City Payouts", url: "/app/payouts/city" as const, icon: Coins },
] as const;

const NAV_INSIGHTS = [
  { title: "Reports", url: "/app/reports" as const, icon: BarChart3 },
  { title: "Entity Dashboards", url: "/app/dashboards/academy" as const, icon: Store },
] as const;

const NAV_ADMIN = [
  { title: "Audit Logs", url: "/app/audit-logs" as const, icon: ShieldCheck },
  { title: "Impersonation Sessions", url: "/app/impersonation-sessions" as const, icon: ShieldCheck },
] as const;

const NAV_WEBINARS = [
  { title: "Webinars", url: "/app/webinars" as const, icon: Megaphone },
] as const;

const NAV_POS = [
  { title: "POS / Billing", url: "/app/pos" as const, icon: ShoppingCart },
] as const;

const NAV_TRAINER = [
  { title: "Trainer Portal", url: "/app/trainer" as const, icon: UserCog },
] as const;

const NAV_FRANCHISEE = [
  { title: "My Franchise", url: "/app/my-franchise" as const, icon: Briefcase, search: { tab: "dashboard" as const } },
  { title: "My Leads", url: "/app/my-franchise" as const, icon: Users, search: { tab: "leads" as const } },
  { title: "My Campaigns", url: "/app/my-franchise" as const, icon: Megaphone, search: { tab: "campaigns" as const } },
  { title: "Timeline", url: "/app/my-franchise" as const, icon: BarChart3, search: { tab: "timeline" as const } },
] as const;

const NAV_STATE_FRANCHISEE = [
  { title: "My State", url: "/app/my-state" as const, icon: MapPin },
] as const;

const NAV_FOOTER = [
  { title: "Support", url: "/app/support" as const, icon: LifeBuoy },
  { title: "Settings", url: "/app/settings" as const, icon: Settings },
] as const;

export function AppSidebar() {
  const location = useLocation();
  const { isAdmin, hasRole } = useAuth();
  const { isSectionVisible, isItemVisible } = useSidebarHidden();
  const show = (key: SidebarSectionKey) => isSectionVisible(key);
  const itemOn = (id: string) => isItemVisible(id);
  const isFranchisee = hasRole("franchisee");
  const isStateFranchisee = hasRole("state_franchisee");
  const isFranchiseeOnly = (isFranchisee || isStateFranchisee) && !isAdmin;
  const isTrainer = hasRole("trainer");
  const isAcademyStaff = !isFranchiseeOnly && (isAdmin || hasRole("academy_admin") || hasRole("accounts"));
  const isInventoryStaff = !isFranchiseeOnly && (isAdmin || hasRole("inventory"));
  const isFinanceStaff = !isFranchiseeOnly && (isAdmin || hasRole("accounts"));
  const isWebinarStaff = !isFranchiseeOnly && (isAdmin || hasRole("webinar") || hasRole("sales"));
  const isPosStaff = !isFranchiseeOnly && (isAdmin || hasRole("package_sales") || hasRole("accounts") || hasRole("inventory"));
  const showOps = !isFranchiseeOnly && (isAdmin || hasRole("sales"));
  const navMainFiltered = NAV_MAIN.filter((item) => isAdmin || item.url !== "/app/dashboard");

  const isActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(url + "/");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border py-4">
        <div className="px-1">
          <Logo />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {showOps && show("operations") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Operations
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navMainFiltered.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showOps && show("franchise_network") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Franchise Network
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_FRANCHISE_NETWORK.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}


        {isAcademyStaff && show("academy") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Academy
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ACADEMY.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isInventoryStaff && show("inventory") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Inventory
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_INVENTORY.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
          </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isPosStaff && show("pos") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Sales / POS
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_POS.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isFinanceStaff && show("finance") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Finance
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_FINANCE.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(isAdmin || hasRole("accounts") || hasRole("founder")) && !isFranchiseeOnly && show("insights") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Insights</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_INSIGHTS.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url) || (item.url.startsWith("/app/dashboards") && location.pathname.startsWith("/app/dashboards"))} tooltip={item.title} className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background">
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isWebinarStaff && show("marketing") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Marketing
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_WEBINARS.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isTrainer && show("trainer") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Trainer
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_TRAINER.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isFranchisee && show("franchisee") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Franchisee
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_FRANCHISEE.filter((item) => itemOn(`${item.url}?tab=${item.search.tab}`)).map((item) => {
                  const currentTab = (location.search as { tab?: string }).tab ?? "dashboard";
                  const active = location.pathname === item.url && currentTab === item.search.tab;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                      >
                        <Link to={item.url} search={item.search}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isStateFranchisee && show("state_franchise") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              State Franchise
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_STATE_FRANCHISEE.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && show("admin") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ADMIN.filter((item) => itemOn(item.url)).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {NAV_FOOTER.filter((item) => itemOn(item.url)).map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={isActive(item.url)}
                tooltip={item.title}
                className="data-[active=true]:bg-gradient-gold data-[active=true]:text-background"
              >
                <Link to={item.url}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
