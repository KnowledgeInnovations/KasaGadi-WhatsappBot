import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShieldCheck, Users, MessageSquare,
  Siren, Megaphone, Settings, LogOut, ChevronRight, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/kasagadi-logo.jpeg";

const nav = [
  { to: "/app/overview",      icon: LayoutDashboard, label: "Overview"      },
  { to: "/app/claims",        icon: ShieldCheck,      label: "Claims"        },
  { to: "/app/members",       icon: Users,           label: "Members"       },
  { to: "/app/conversations", icon: MessageSquare,   label: "Conversations" },
  { to: "/app/escalations",   icon: Siren,           label: "Escalations"   },
  { to: "/app/broadcasts",    icon: Megaphone,       label: "Broadcasts"    },
];

// `collapsed` is a desktop-only concept (icon-only rail at lg+). On mobile the
// drawer is always full width, so label text is hidden with `lg:hidden` when
// collapsed — never unconditionally — so it still shows on the mobile drawer.
export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("kg_token");
    navigate("/app/login");
  }

  return (
    <aside className={cn(
      "flex flex-col bg-navy-900 text-white transition-all duration-300 ease-in-out shrink-0",
      "fixed inset-y-0 left-0 z-40 w-72",
      mobileOpen ? "translate-x-0" : "-translate-x-full",
      "lg:static lg:translate-x-0 lg:z-auto",
      collapsed ? "lg:w-16" : "lg:w-60"
    )}>
      {/* Logo */}
      <div className={cn("flex items-center h-16 border-b border-white/10 px-5 gap-3 shrink-0", collapsed && "lg:justify-center lg:px-3")}>
        <img src={logo} alt="Kasagadi" className="w-8 h-8 rounded-lg object-contain shrink-0" />
        <span className={cn("text-white font-bold text-sm tracking-wide truncate flex-1", collapsed && "lg:hidden")}>
          Kasagadi AI
        </span>
        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="lg:hidden p-1.5 -mr-1.5 text-white/50 hover:text-white transition-colors shrink-0"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Section label */}
      <p className={cn("px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/30", collapsed && "lg:hidden")}>
        Bot Console
      </p>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto scrollbar-hide">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
              isActive
                ? "bg-brand-600 text-white shadow-sm"
                : "text-white/55 hover:bg-white/8 hover:text-white"
            )}
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className="shrink-0" />
                <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>{label}</span>
                {isActive && <ChevronRight size={13} className={cn("opacity-60 shrink-0", collapsed && "lg:hidden")} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-4 space-y-0.5 border-t border-white/10 pt-3 shrink-0">
        <NavLink
          to="/app/settings"
          title={collapsed ? "Settings" : undefined}
          className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
            isActive ? "bg-brand-600 text-white" : "text-white/55 hover:bg-white/8 hover:text-white"
          )}
        >
          <Settings size={18} className="shrink-0" />
          <span className={cn(collapsed && "lg:hidden")}>Settings</span>
        </NavLink>
        <button
          onClick={logout}
          title={collapsed ? "Sign out" : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/55 hover:bg-red-500/15 hover:text-red-400 transition-all"
        >
          <LogOut size={18} className="shrink-0" />
          <span className={cn(collapsed && "lg:hidden")}>Sign out</span>
        </button>
      </div>

      {/* Collapse toggle — desktop only, doesn't apply to the mobile drawer */}
      <button
        onClick={onToggle}
        className="hidden lg:flex absolute -right-3 top-[68px] z-20 w-6 h-6 bg-navy-900 border border-white/20 rounded-full items-center justify-center text-white/50 hover:text-white transition-colors shadow-md"
        title={collapsed ? "Expand" : "Collapse"}
      >
        <ChevronRight size={12} className={cn("transition-transform duration-300", collapsed ? "" : "rotate-180")} />
      </button>
    </aside>
  );
}
