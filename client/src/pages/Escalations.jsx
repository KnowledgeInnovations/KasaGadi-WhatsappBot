import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Clock, Phone, MessageSquare,
  CheckCircle, Siren, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtPhone, truncate, avatarColor, initials } from "@/lib/utils";
import { Card, CardHeader, CardBody, Badge, PageLoader, Empty, StatCard, Modal } from "@/components/ui";

/* ── helpers ────────────────────────────────────────────── */
function waitDuration(lastActivity) {
  if (!lastActivity) return null;
  const mins = Math.floor((Date.now() - new Date(lastActivity)) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function urgencyLevel(lastActivity) {
  if (!lastActivity) return "low";
  const mins = (Date.now() - new Date(lastActivity)) / 60000;
  if (mins > 120) return "critical";
  if (mins > 60) return "high";
  if (mins > 30) return "medium";
  return "low";
}

const URGENCY_STYLES = {
  critical: { dot: "bg-red-500 animate-pulse",  badge: "red",   label: "Critical — 2h+" },
  high:     { dot: "bg-orange-500 animate-pulse", badge: "red",   label: "High — 1h+" },
  medium:   { dot: "bg-amber-400",               badge: "amber", label: "Medium — 30m+" },
  low:      { dot: "bg-emerald-500",             badge: "green", label: "Recent" },
};

function computeInsights(escalations) {
  if (!escalations.length) return [];
  const now = Date.now();
  const urgent = escalations.filter((l) => urgencyLevel(l.lastActivity) === "critical").length;
  const high   = escalations.filter((l) => urgencyLevel(l.lastActivity) === "high").length;
  const totalWait = escalations.reduce((s, l) => s + (l.lastActivity ? now - new Date(l.lastActivity) : 0), 0);
  const avgWaitMins = Math.floor(totalWait / escalations.length / 60000);
  const avgWait = avgWaitMins > 60 ? `${Math.floor(avgWaitMins / 60)}h ${avgWaitMins % 60}m` : `${avgWaitMins}m`;

  const insights = [];
  if (urgent > 0)
    insights.push({ level: "critical", icon: Siren, text: `${urgent} escalation${urgent > 1 ? "s" : ""} have been waiting over 2 hours — immediate action required` });
  if (high > 0)
    insights.push({ level: "high", icon: AlertTriangle, text: `${high} escalation${high > 1 ? "s" : ""} waiting 1–2 hours — respond soon` });
  insights.push({ level: "info", icon: Clock, text: `Average wait time across all open escalations: ${avgWait}` });

  return insights;
}

/* ── component ─────────────────────────────────────────── */
export default function Escalations() {
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState("all");

  const { data: escData, isLoading } = useQuery({
    queryKey: ["escalations"],
    queryFn: api.escalations,
    refetchInterval: 30_000,
  });

  const { data: convo, isLoading: convoLoading } = useQuery({
    queryKey: ["conversation", selected?.userId],
    queryFn: () => api.conversation(selected.userId),
    enabled: !!selected,
  });

  if (isLoading) return <PageLoader />;

  const all = escData?.escalations || [];
  const awaiting  = all.filter((l) => !l.escalationStatus || l.escalationStatus === "awaiting_reviewer");
  const responded = all.filter((l) => l.escalationStatus === "responded");

  const filtered = filter === "all" ? all
    : filter === "awaiting"  ? awaiting
    : filter === "responded" ? responded
    : all;

  const insights = computeInsights(awaiting);

  return (
    <div className="space-y-6 max-w-[1400px]">

      {/* ── KPI row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Escalations" value={all.length}       icon={Siren}        color="red"   sub="All time" />
        <StatCard label="Awaiting Reviewer"  value={awaiting.length}  icon={Clock}        color="amber" sub="Need response now" />
        <StatCard label="Responded"          value={responded.length} icon={CheckCircle}  color="green" sub="Reviewer replied" />
        <StatCard label="Critical (2h+)"
          value={all.filter((l) => urgencyLevel(l.lastActivity) === "critical").length}
          icon={AlertTriangle} color="red" sub="Urgent — over 2 hours" />
      </div>

      {/* ── AI Analysis ── */}
      {insights.length > 0 && (
        <Card className="border-red-200 bg-gradient-to-r from-red-50 to-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-red-500" />
              <p className="font-semibold text-slate-900 text-sm">Escalation Analysis</p>
            </div>
            <p className="text-xs text-slate-400">Real-time assessment of open escalations</p>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {insights.map((ins, i) => {
                const style = ins.level === "critical" ? "bg-red-50 border-red-200 text-red-700"
                  : ins.level === "high" ? "bg-orange-50 border-orange-200 text-orange-700"
                  : "bg-slate-50 border-slate-200 text-slate-600";
                const iconStyle = ins.level === "critical" ? "text-red-500"
                  : ins.level === "high" ? "text-orange-500"
                  : "text-slate-400";
                return (
                  <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-sm ${style}`}>
                    <ins.icon size={15} className={`shrink-0 mt-0.5 ${iconStyle}`} />
                    <span>{ins.text}</span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Escalations table ── */}
      <Card>
        <CardHeader>
          <p className="font-semibold text-slate-900">Escalated Conversations</p>
          <p className="text-xs text-slate-400">{filtered.length} of {all.length}</p>
        </CardHeader>

        {/* Filter tabs */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex gap-1.5">
          {[
            { key: "all",       label: `All (${all.length})` },
            { key: "awaiting",  label: `Awaiting (${awaiting.length})` },
            { key: "responded", label: `Responded (${responded.length})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === key ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <CardBody>
            <Empty icon={CheckCircle} title="No escalations" description="All clear — no escalations match this filter." />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Priority", "Contact", "Reason", "Waiting", "Last Message", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered
                  .sort((a, b) => new Date(a.lastActivity || 0) - new Date(b.lastActivity || 0))
                  .map((l) => {
                    const level = urgencyLevel(l.lastActivity);
                    const urg   = URGENCY_STYLES[level];
                    const wait  = waitDuration(l.lastActivity);
                    return (
                      <tr key={l.userId}
                        onClick={() => setSelected(l)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${urg.dot}`} />
                            <Badge variant={urg.badge} className="text-[10px] whitespace-nowrap">{urg.label}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full ${avatarColor(l.name || l.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                              {initials(l.name || l.userId)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate">{l.name || "Guest"}</p>
                              <p className="text-xs text-slate-400">{fmtPhone(l.userId)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-[220px]">
                          <p className="truncate">{l.escalationReason || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-semibold tabular-nums ${
                            level === "critical" ? "text-red-600"
                            : level === "high" ? "text-orange-500"
                            : level === "medium" ? "text-amber-500"
                            : "text-emerald-600"
                          }`}>
                            {wait || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px]">
                          <p className="truncate">{l.lastMessage || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <button className="text-brand-600 hover:text-brand-700 text-xs font-medium whitespace-nowrap">
                            View chat →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Chat modal ── */}
      <Modal open={!!selected} onClose={() => setSelected(null)} width="max-w-2xl">
        {selected && (
          <>
            {/* Header */}
            <div className="bg-gradient-to-br from-navy-900 to-red-900 px-6 py-5 rounded-t-2xl">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl ${avatarColor(selected.name || selected.userId)} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                  {initials(selected.name || selected.userId)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-white">{selected.name || "Guest"}</h3>
                  <p className="text-white/60 text-sm">{fmtPhone(selected.userId)}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge className="bg-red-500/30 text-red-200 border-0">Escalated</Badge>
                    {selected.registered && <Badge className="bg-white/15 text-white/90 border-0">Registered member</Badge>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Waiting</p>
                  <p className={`text-3xl font-black tabular-nums ${
                    urgencyLevel(selected.lastActivity) === "critical" ? "text-red-400"
                    : urgencyLevel(selected.lastActivity) === "high" ? "text-orange-400"
                    : "text-white"
                  }`}>
                    {waitDuration(selected.lastActivity) || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="px-6 py-4 grid grid-cols-2 gap-3 border-b border-slate-100 text-sm">
              {[
                { label: "Phone", value: fmtPhone(selected.userId) },
                { label: "Reason", value: selected.escalationReason },
                { label: "Last active", value: fmtRelative(selected.lastActivity) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="font-semibold text-slate-800">{value || "—"}</p>
                </div>
              ))}
            </div>

            {/* Conversation */}
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Conversation</p>
              {convoLoading ? (
                <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
              ) : !convo?.history?.length ? (
                <p className="text-sm text-slate-400 py-4 text-center">No messages</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {convo.history.slice(-20).map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug ${
                        m.role === "user"
                          ? "bg-navy-900 text-white rounded-br-sm"
                          : "bg-slate-100 text-slate-800 rounded-bl-sm"
                      }`}>
                        {truncate(m.content, 200)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 pb-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <a
                href={`https://wa.me/${selected.userId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <Phone size={14} /> Open in WhatsApp
              </a>
              <button className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
