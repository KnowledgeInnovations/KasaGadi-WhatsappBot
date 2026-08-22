import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardHeader, CardBody, Badge, PageLoader, StatCard } from "@/components/ui";
import { Server, Bot, Clock, Zap, Shield, RefreshCw } from "lucide-react";
import { fmtDateTime } from "@/lib/utils";

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold text-slate-800 text-right max-w-[60%] truncate ${mono ? "font-mono text-xs" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { data: health, isLoading } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 60_000 });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: api.stats });

  const clearMutation = useMutation({
    mutationFn: api.deleteAllConversations,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  if (isLoading) return <PageLoader />;

  const uptimeSec = health?.uptime || 0;
  const hrs  = Math.floor(uptimeSec / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);
  const uptimeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">System Settings</h2>
        <p className="text-sm text-slate-400">Bot status, health, and configuration</p>
      </div>

      {/* Health KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Server Uptime"    value={uptimeStr}                     icon={Clock}  color="green" sub="Since last restart" />
        <StatCard label="Active Sessions"  value={health?.activeSessions ?? 0}   icon={Zap}    color="brand" sub="Live conversations now" />
      </div>

      {/* System status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900 text-sm">System Status</p>
          </div>
          <button onClick={() => { qc.invalidateQueries({ queryKey: ["health"] }); qc.invalidateQueries({ queryKey: ["stats"] }); }}
            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </CardHeader>
        <CardBody className="p-0 px-5">
          <InfoRow label="Status"                  value={<Badge variant="green" dot>Operational</Badge>} />
          <InfoRow label="Last health check"        value={fmtDateTime(health?.timestamp)} />
          <InfoRow label="Total conversations"      value={(stats?.totalConversations || 0).toLocaleString()} />
          <InfoRow label="Total messages processed" value={(stats?.totalMessages || 0).toLocaleString()} />
          <InfoRow label="Published claims"         value={stats?.claims || 0} />
          <InfoRow label="Registered members"       value={stats?.members || 0} />
          <InfoRow label="Open escalations"         value={stats?.awaitingReviewer || 0} />
        </CardBody>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900 text-sm">Bot Configuration</p>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">
            All bot settings (WhatsApp API keys, Mansa endpoint, database, escalation contact) are managed via environment variables on the server. See <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs">.env.example</code> in the repo, and update them in your hosting provider's environment settings.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              "WHATSAPP_TOKEN", "PHONE_NUMBER_ID",
              "VERIFY_TOKEN", "MANSA_BASE_URL",
              "MONGODB_URI", "ADMIN_USERNAME",
              "JWT_SECRET", "ESCALATION_WHATSAPP",
            ].map((k) => (
              <div key={k} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                <span className="font-mono text-xs text-slate-600 truncate">{k}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900 text-sm">Security</p>
          </div>
        </CardHeader>
        <CardBody className="p-0 px-5">
          <InfoRow label="Authentication"  value="HMAC-SHA256 JWT · 24h expiry" />
          <InfoRow label="Rate limiting"   value="Active on webhook endpoint" />
          <InfoRow label="Mansa AI"        value="Public endpoint — no sensitive data sent" />
        </CardBody>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader>
          <p className="font-semibold text-red-600">Danger Zone</p>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-500 mb-4">
            These actions are permanent and cannot be undone. Use with extreme caution.
          </p>
          <button
            onClick={async () => {
              if (!confirm("⚠️ This will permanently delete ALL conversation history. Registered members and published claims are not affected.\n\nAre you absolutely sure?")) return;
              try {
                await clearMutation.mutateAsync();
                alert("All conversations have been cleared.");
              } catch (e) {
                alert("Failed: " + e.message);
              }
            }}
            disabled={clearMutation.isPending}
            className="px-4 py-2.5 text-sm font-medium text-red-600 border border-red-300 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {clearMutation.isPending ? "Clearing…" : "Clear all conversation history"}
          </button>
        </CardBody>
      </Card>
    </div>
  );
}
