import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Menu } from "lucide-react";
import { api } from "@/lib/api";

const TITLES = {
  "/app/overview":      "Overview",
  "/app/claims":        "Claims",
  "/app/members":       "Members",
  "/app/conversations": "Conversations",
  "/app/escalations":   "Escalations",
  "/app/broadcasts":    "Broadcasts",
  "/app/settings":      "Settings",
};

export default function Topbar({ onRefresh, onMenuClick }) {
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const title = TITLES[pathname] || "Dashboard";

  const { data: health, dataUpdatedAt } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 60_000,
  });

  const isOnline = !!health?.status;
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  function handleRefresh() {
    qc.invalidateQueries();
    if (onRefresh) onRefresh();
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-3 sm:px-6 gap-2 sm:gap-4 shrink-0 z-10">
      {/* Mobile menu trigger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shrink-0"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-slate-900 truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live status */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium">
          <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
          <span className={isOnline ? "text-emerald-600" : "text-slate-400"}>
            {isOnline ? "Live" : "Offline"}
          </span>
          {lastUpdated && <span className="text-slate-300 hidden md:inline">· {lastUpdated}</span>}
        </div>

        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          title="Refresh all data"
        >
          <RefreshCw size={15} />
        </button>

        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold shrink-0" title="Signed in as admin">
          A
        </div>
      </div>
    </header>
  );
}
