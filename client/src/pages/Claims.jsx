import { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ExternalLink, ShieldCheck, Search, X, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, cn } from "@/lib/utils";
import { Badge, Card, VerdictBadge, PageLoader, Empty } from "@/components/ui";

export default function Claims() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // Simple debounce so we're not hammering the partner API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["claims", debounced],
    queryFn: () => api.claims(debounced),
    placeholderData: keepPreviousData,
  });

  if (isLoading) return <PageLoader />;

  const claims = data?.claims || [];
  const apiDisabled = error?.message?.includes("not configured") || error?.message?.includes("503");

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Published Claims</h2>
          <p className="text-sm text-slate-400">
            Live from <a href="https://www.kasagadi.ai" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">kasagadi.ai</a>'s marketplace — this is exactly what the WhatsApp bot can search. Claims are authored and published on the website itself, not here.
          </p>
        </div>
        <div className="relative w-full sm:w-64 shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search published claims…"
            className="w-full pl-8 pr-7 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {apiDisabled && (
        <Card className="p-4 border-amber-200 bg-amber-50 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">Kasagadi Claims API not connected</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Set <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">KASAGADI_API_KEY</code> on the server (request a partner key from the Kasagadi team) — until then, the bot answers questions without any published fact-check grounding.
            </p>
          </div>
        </Card>
      )}

      {!apiDisabled && claims.length === 0 ? (
        <Empty icon={ShieldCheck} title={search ? "No claims match your search" : "No published claims yet"}
          description={search ? "Try a different search term." : "Once fact-checks are published on kasagadi.ai, they'll appear here automatically."} />
      ) : (
        <div className={cn("grid grid-cols-1 gap-3 transition-opacity", isFetching && "opacity-60")}>
          {claims.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    {c.verdict && <VerdictBadge verdict={c.verdict.verdict} />}
                    {(c.topics || []).map((t) => <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px]">{t}</span>)}
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{fmtDate(c.publishedAt)}</span>
                  </div>
                  <p className="font-semibold text-slate-900">{c.title}</p>
                  {c.verdict?.summary && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{c.verdict.summary}</p>}
                  {c.verdict?.factChecker && (
                    <p className="text-xs text-slate-400 mt-1.5">
                      Checked by <span className="font-medium text-slate-600">{c.verdict.factChecker.name}</span>
                      {c.verdict.factChecker.organization && ` · ${c.verdict.factChecker.organization}`}
                    </p>
                  )}
                </div>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noopener noreferrer"
                    className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors shrink-0" title="View on kasagadi.ai">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
