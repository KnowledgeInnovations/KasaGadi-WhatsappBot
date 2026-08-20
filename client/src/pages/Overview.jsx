import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, ShieldCheck, MessageSquare, AlertTriangle,
  UserPlus, Zap, Clock, CheckCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtPhone, avatarColor, initials } from "@/lib/utils";
import { StatCard, Card, CardHeader, CardBody, Badge, Meter, PageLoader } from "@/components/ui";

// Chart series colors — from the dataviz skill's validated categorical/status
// palettes, not eyeballed. "Escalated" is a bad-state subset of the total, so
// it wears the fixed status-critical red rather than a second categorical hue.
const SERIES_CONVERSATIONS = "#2a78d6"; // categorical slot 1 (blue)
const SERIES_ESCALATED     = "#d03b3b"; // status: critical

function buildTrend(conversations) {
  const now = new Date();
  const days = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en", { weekday: "short" });
    days[key] = { day: key, conversations: 0, escalated: 0 };
  }
  conversations.forEach((c) => {
    if (!c.firstContact) return;
    const d = new Date(c.firstContact);
    const diff = Math.floor((now - d) / 86400000);
    if (diff > 6) return;
    const key = d.toLocaleDateString("en", { weekday: "short" });
    if (days[key]) {
      days[key].conversations++;
      if (c.state === "ESCALATED") days[key].escalated++;
    }
  });
  return Object.values(days);
}

function computeInsights(stats, conversations, escalations) {
  const insights = [];
  const overdue = escalations.filter((e) =>
    e.lastActivity && (Date.now() - new Date(e.lastActivity)) > 3600000 && e.escalationStatus !== "responded"
  ).length;

  if (overdue > 0)
    insights.push({ icon: AlertTriangle, color: "red", text: `${overdue} escalation${overdue > 1 ? "s" : ""} waiting over 1 hour for a human fact-checker` });

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayConvos = conversations.filter((c) => c.firstContact && new Date(c.firstContact) >= todayStart).length;
  if (todayConvos > 0)
    insights.push({ icon: MessageSquare, color: "brand", text: `${todayConvos} new conversation${todayConvos > 1 ? "s" : ""} started today` });

  if ((stats?.claims || 0) > 0)
    insights.push({ icon: ShieldCheck, color: "green", text: `${stats.claims} published fact-check${stats.claims > 1 ? "s" : ""} available to the bot` });

  if ((stats?.registered || 0) > 0 && stats?.totalConversations)
    insights.push({ icon: UserPlus, color: "brand", text: `${Math.round((stats.registered / stats.totalConversations) * 100)}% of conversations are with registered members` });

  return insights;
}

function ChartLegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-muted">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

export default function Overview() {
  const { data: stats, isLoading: sLoading } = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 30_000 });
  const { data: convoData, isLoading: cLoading } = useQuery({ queryKey: ["conversations"], queryFn: api.conversations, refetchInterval: 60_000 });
  const { data: escData } = useQuery({ queryKey: ["escalations"], queryFn: api.escalations, refetchInterval: 30_000 });

  if (sLoading || cLoading) return <PageLoader />;

  const conversations = convoData?.conversations || [];
  const escalations = escData?.escalations || [];
  const trend = buildTrend(conversations);
  const recentEscalations = escalations.slice(0, 5);
  const recentConvos = [...conversations].sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0)).slice(0, 5);
  const insights = computeInsights(stats, conversations, escalations);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const activeNow = stats?.activeSessions || 0;

  return (
    <div className="space-y-6 max-w-[1400px]">

      {/* ── Greeting ── */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-ink-primary">{greeting} 👋</h2>
        <p className="text-sm text-ink-muted mt-0.5">
          {activeNow > 0
            ? `${activeNow} conversation${activeNow !== 1 ? "s are" : " is"} happening on WhatsApp right now.`
            : "No one's chatting with the bot right now — here's how things are looking."}
        </p>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Conversations"   value={stats?.totalConversations || 0} icon={MessageSquare} color="brand" sub={`${stats?.activeSessions || 0} active right now`} />
        <StatCard label="Registered Members" value={stats?.registered || 0}      icon={Users}        color="green" sub={`${stats?.guests || 0} guests`} />
        <StatCard label="Published Claims" value={stats?.claims || 0}            icon={ShieldCheck}  color="blue"  sub="In the Kasagadi database" />
        <StatCard label="Escalations"     value={stats?.escalated || 0}          icon={AlertTriangle} color="red"  sub={`${stats?.awaitingReviewer || 0} awaiting a reviewer`} />
      </div>

      {/* ── AI Intelligence Panel ── */}
      {insights.length > 0 && (
        <Card className="border-brand-200 bg-gradient-to-r from-brand-50 to-paper-surface">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              <p className="font-semibold text-ink-primary text-sm">Live Insights</p>
            </div>
            <p className="text-xs text-ink-muted">Snapshot of bot activity right now</p>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {insights.map((ins, i) => {
                const colorMap = {
                  red:   "bg-red-50 border-red-200 text-red-700",
                  green: "bg-emerald-50 border-emerald-200 text-emerald-700",
                  brand: "bg-brand-50 border-brand-200 text-brand-700",
                };
                const iconColor = { red: "text-status-critical", green: "text-status-good", brand: "text-brand-500" };
                return (
                  <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-sm ${colorMap[ins.color] || colorMap.brand}`}>
                    <ins.icon size={15} className={`shrink-0 mt-0.5 ${iconColor[ins.color]}`} />
                    <span>{ins.text}</span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader action={<Badge variant="teal">Last 7 days</Badge>}>
            <p className="font-semibold text-ink-primary text-sm">Conversation Activity</p>
            <p className="text-xs text-ink-muted">New conversations and escalations per day</p>
          </CardHeader>
          <CardBody>
            {/* Explicit legend — 2 series, so identity never rests on color alone */}
            <div className="flex items-center gap-4 mb-3">
              <ChartLegendDot color={SERIES_CONVERSATIONS} label="Conversations" />
              <ChartLegendDot color={SERIES_ESCALATED} label="Escalated" />
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gConvos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={SERIES_CONVERSATIONS} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={SERIES_CONVERSATIONS} stopOpacity={0}    />
                  </linearGradient>
                  <linearGradient id="gEsc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={SERIES_ESCALATED} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={SERIES_ESCALATED} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#898781" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#898781" }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e1e0d9", boxShadow: "0 8px 24px -4px rgba(11,11,11,0.12)" }}
                  labelStyle={{ color: "#0b0b0b", fontWeight: 600, marginBottom: 2 }}
                />
                <Area type="monotone" dataKey="conversations" stroke={SERIES_CONVERSATIONS} strokeWidth={2} fill="url(#gConvos)" name="Conversations" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="escalated"     stroke={SERIES_ESCALATED}     strokeWidth={2} fill="url(#gEsc)"    name="Escalated"     dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <p className="font-semibold text-ink-primary text-sm">Audience</p>
            <p className="text-xs text-ink-muted">Registered vs. guest</p>
          </CardHeader>
          <CardBody className="flex flex-col justify-center h-full pb-8">
            <Meter
              segments={[
                { label: "Registered", value: stats?.registered || 0, color: "#1e3f6b" },
                { label: "Guest",      value: stats?.guests || 0,      color: "#c3c2b7" },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {/* ── Recent conversations + Escalations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader action={<Badge variant="blue" dot>{recentConvos.length}</Badge>}>
            <p className="font-semibold text-ink-primary text-sm">Recent Conversations</p>
            <p className="text-xs text-ink-muted">Latest activity</p>
          </CardHeader>
          {recentConvos.length === 0 ? (
            <CardBody><p className="text-sm text-ink-muted text-center py-6">No conversations yet</p></CardBody>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {recentConvos.map((c) => (
                <li key={c.userId} className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${avatarColor(c.name || c.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {initials(c.name || c.userId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-primary truncate">{c.name || fmtPhone(c.userId)}</p>
                    <p className="text-xs text-ink-muted truncate">{c.lastMessage || "No messages"}</p>
                  </div>
                  {c.registered && <Badge variant="green" className="text-[10px]">Member</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader action={<Badge variant={recentEscalations.length > 0 ? "critical" : "good"}>{recentEscalations.length}</Badge>}>
            <p className="font-semibold text-ink-primary text-sm">⚠️ Open Escalations</p>
            <p className="text-xs text-ink-muted">Needs human attention</p>
          </CardHeader>
          {recentEscalations.length === 0 ? (
            <CardBody><p className="text-sm text-ink-muted text-center py-6">All clear — no escalations</p></CardBody>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {recentEscalations.map((l) => (
                <li key={l.userId} className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${avatarColor(l.name || l.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {initials(l.name || l.userId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink-primary truncate">{l.name || fmtPhone(l.userId)}</p>
                    <p className="text-xs text-ink-muted">{fmtRelative(l.lastActivity)}</p>
                  </div>
                  <Badge variant={l.escalationStatus === "responded" ? "good" : "critical"}>
                    {l.escalationStatus === "responded" ? "Responded" : "Waiting"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
