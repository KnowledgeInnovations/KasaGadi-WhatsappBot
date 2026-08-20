import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Sidebar from "./Sidebar";
import Topbar  from "./Topbar";

export default function AppLayout() {
  const [collapsed, setCollapsed]     = useState(false); // desktop icon-only collapse
  const [mobileOpen, setMobileOpen]   = useState(false);  // mobile off-canvas drawer
  const qc = useQueryClient();
  const { pathname } = useLocation();

  // Close the mobile drawer automatically on navigation
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-paper-page relative">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar onRefresh={() => qc.invalidateQueries()} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
