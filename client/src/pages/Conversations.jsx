import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, MessageSquare, X, Calendar, ArrowLeft } from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, subDays, isAfter } from "date-fns";
import { api } from "@/lib/api";
import { fmtRelative, fmtPhone, truncate, avatarColor, initials, cn } from "@/lib/utils";
import { Badge, Card, PageLoader, Empty } from "@/components/ui";

const URL_RE = /(https?:\/\/[^\s]+)/g;

// Render message text with clickable links (property cards include a "🔗 Learn more" URL)
function MessageText({ text, dark }) {
  if (!text) return null;
  const parts = String(text).split(URL_RE);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline break-all ${dark ? "text-brand-200" : "text-brand-600"}`}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

function stateBadgeVariant(state) {
  if (!state) return "slate";
  if (state.includes("ESCALATED")) return "red";
  if (state === "ACTIVE") return "green";
  if (state === "AWAITING_PRODUCT_INTENT") return "blue";
  return "slate";
}

const DATE_FILTERS = [
  { key: "all",       label: "All time" },
  { key: "today",     label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week",      label: "This week" },
  { key: "month",     label: "This month" },
  { key: "custom",    label: "Custom range" },
];

function getDateBound(key) {
  const now = new Date();
  switch (key) {
    case "today":     return startOfDay(now);
    case "yesterday": return startOfDay(subDays(now, 1));
    case "week":      return startOfWeek(now, { weekStartsOn: 1 });
    case "month":     return startOfMonth(now);
    default:          return null;
  }
}

export default function Conversations() {
  const [search,     setSearch]     = useState("");
  const [selected,   setSelected]   = useState(null);
  const [dateFilter, setDateFilter] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.conversations,
    refetchInterval: 30_000,
  });

  const { data: convo, isLoading: convoLoading } = useQuery({
    queryKey: ["conversation", selected?.userId],
    queryFn: () => api.conversation(selected.userId),
    enabled: !!selected,
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteConversation,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["conversations"] }); setSelected(null); },
  });

  const list = useMemo(() => {
    let items = data?.conversations || [];

    // Text search
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((c) =>
        String(c.userId).includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q)
      );
    }

    // Date filter
    if (dateFilter !== "all" && dateFilter !== "custom") {
      const bound = getDateBound(dateFilter);
      if (bound) {
        if (dateFilter === "yesterday") {
          const end = startOfDay(new Date());
          items = items.filter((c) => {
            const d = new Date(c.lastActivity || 0);
            return isAfter(d, bound) && !isAfter(d, end);
          });
        } else {
          items = items.filter((c) => isAfter(new Date(c.lastActivity || 0), bound));
        }
      }
    }

    if (dateFilter === "custom") {
      if (customFrom) {
        const from = new Date(customFrom);
        items = items.filter((c) => isAfter(new Date(c.lastActivity || 0), from));
      }
      if (customTo) {
        const to = new Date(customTo + "T23:59:59");
        items = items.filter((c) => new Date(c.lastActivity || 0) <= to);
      }
    }

    return items.sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));
  }, [data, search, dateFilter, customFrom, customTo]);

  if (isLoading) return <PageLoader />;

  return (
    <div className="max-w-[1400px]">
      <div className="flex gap-5" style={{ height: "calc(100vh - 144px)" }}>

        {/* ── Left panel — list. On mobile, hidden once a conversation is picked. ── */}
        <Card className={cn(
          "w-full lg:w-80 shrink-0 flex-col overflow-hidden",
          selected ? "hidden lg:flex" : "flex"
        )}>

          {/* Search */}
          <div className="px-4 pt-3 pb-2 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-7 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Date filter */}
            <div className="flex gap-1 flex-wrap">
              {DATE_FILTERS.filter((f) => f.key !== "custom").map((f) => (
                <button
                  key={f.key}
                  onClick={() => setDateFilter(f.key)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                    dateFilter === f.key
                      ? "bg-navy-900 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <button
                onClick={() => setDateFilter("custom")}
                className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all flex items-center gap-1 ${
                  dateFilter === "custom"
                    ? "bg-navy-900 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                <Calendar size={10} /> Custom
              </button>
            </div>

            {/* Custom date range inputs */}
            {dateFilter === "custom" && (
              <div className="flex gap-1.5 items-center">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-brand-500"
                />
                <span className="text-xs text-slate-400">–</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-brand-500"
                />
              </div>
            )}

            <p className="text-[10px] text-slate-400">{list.length} conversation{list.length !== 1 ? "s" : ""}</p>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {list.length === 0 ? (
              <Empty icon={MessageSquare} title="No conversations" description="Try adjusting the date filter or search." />
            ) : list.map((c) => (
              <button
                key={c.userId}
                onClick={() => setSelected(c)}
                className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors flex items-start gap-3 ${
                  selected?.userId === c.userId ? "bg-brand-50 border-l-2 border-brand-600" : ""
                }`}
              >
                <div className={`w-9 h-9 rounded-full ${avatarColor(c.name || c.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5`}>
                  {initials(c.name || c.userId)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-sm text-slate-800 truncate flex-1 pr-2">{c.name || fmtPhone(c.userId)}</p>
                    <span className="text-[10px] text-slate-400 shrink-0">{fmtRelative(c.lastActivity)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{c.lastMessage || "No messages"}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={stateBadgeVariant(c.state)} className="text-[10px] px-1.5 py-0">
                      {c.state?.replace(/_/g, " ") || "—"}
                    </Badge>
                    <span className="text-[10px] text-slate-400">{c.messageCount} msgs</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* ── Right panel — chat. On mobile, only shown once a conversation is picked. ── */}
        <Card className={cn(
          "flex-1 flex-col overflow-hidden min-w-0",
          selected ? "flex" : "hidden lg:flex"
        )}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <Empty icon={MessageSquare} title="Select a conversation"
                description="Click any conversation on the left to view the full chat history." />
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setSelected(null)}
                  className="lg:hidden -ml-1.5 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                  aria-label="Back to conversation list"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className={`w-10 h-10 rounded-full ${avatarColor(selected.name || selected.userId)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                  {initials(selected.name || selected.userId)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{selected.name || fmtPhone(selected.userId)}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>{fmtPhone(selected.userId)}</span>
                    <span>·</span>
                    <span>{selected.messageCount} messages</span>
                    {selected.registered && <><span>·</span><span className="text-emerald-600 font-medium">Registered member</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={stateBadgeVariant(selected.state)}>
                    {selected.state?.replace(/_/g, " ") || "—"}
                  </Badge>
                  <button
                    onClick={() => { if (confirm("Delete this conversation?")) deleteMutation.mutate(selected.userId); }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Context bar */}
              {(selected.email || selected.registered) && (
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500 shrink-0">
                  {selected.email      && <span>📧 <strong className="text-slate-700">{selected.email}</strong></span>}
                  {selected.registered && <span className="text-emerald-600 font-medium">✓ Registered member</span>}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-2.5 bg-slate-50/60">
                {convoLoading ? (
                  <p className="text-center text-slate-400 text-sm py-10">Loading messages…</p>
                ) : !convo?.history?.length ? (
                  <p className="text-center text-slate-400 text-sm py-10">No messages in this conversation</p>
                ) : convo.history.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed space-y-2 ${
                      m.role === "user"
                        ? "bg-navy-900 text-white rounded-br-sm"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm shadow-card"
                    }`}>
                      {m.content && <MessageText text={m.content} dark={m.role === "user"} />}
                      {m.mediaUrl && (
                        <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={m.mediaUrl}
                            alt={m.content || "attachment"}
                            loading="lazy"
                            className="rounded-lg max-h-56 w-auto object-cover border border-black/10"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
