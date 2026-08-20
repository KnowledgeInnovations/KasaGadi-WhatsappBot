import { cn } from "@/lib/utils";
import { Loader2, AlertCircle, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";

/* ─── Badge ─────────────────────────────────────────── */
const badgeVariants = {
  default: "bg-black/[0.04] text-ink-secondary",
  green:   "bg-emerald-100 text-emerald-700",
  red:     "bg-red-100 text-red-700",
  amber:   "bg-amber-100 text-amber-700",
  blue:    "bg-blue-100 text-blue-700",
  purple:  "bg-purple-100 text-purple-700",
  teal:    "bg-brand-100 text-brand-700",
  slate:   "bg-black/[0.04] text-ink-secondary",
  outline: "border border-black/10 text-ink-secondary bg-transparent",
  // Fixed status scale (dataviz skill) — reserved meaning, never used for "just another series"
  good:     "bg-status-good/10 text-status-good",
  warning:  "bg-status-warning/15 text-amber-800",
  serious:  "bg-status-serious/15 text-orange-800",
  critical: "bg-status-critical/10 text-status-critical",
};

export function Badge({ children, variant = "default", className, dot }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", badgeVariants[variant] || badgeVariants.default, className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ─── VerdictBadge ──────────────────────────────────────
 * Fact-check verdicts are status, not "series color" — this always pairs the
 * status color with an icon + label so it never reads as color-alone (dataviz
 * skill: status colors are reserved and always icon+label). Use this instead
 * of a bare <Badge> wherever a verdict is shown. */
const VERDICT_MAP = {
  True:            { variant: "good",     icon: CheckCircle2,  label: "True" },
  False:           { variant: "critical", icon: XCircle,       label: "False" },
  Misleading:      { variant: "warning",  icon: AlertTriangle, label: "Misleading" },
  "Partly True":   { variant: "serious",  icon: AlertTriangle, label: "Partly True" },
  Unverifiable:    { variant: "default",  icon: HelpCircle,    label: "Unverifiable" },
  Unverified:      { variant: "default",  icon: HelpCircle,    label: "Unverified" },
  Satire:          { variant: "purple",   icon: HelpCircle,    label: "Satire" },
};

export function VerdictBadge({ verdict, className }) {
  const entry = VERDICT_MAP[verdict] || { variant: "default", icon: HelpCircle, label: verdict || "Unknown" };
  const Icon = entry.icon;
  return (
    <Badge variant={entry.variant} className={cn("font-semibold", className)}>
      <Icon size={12} className="shrink-0" />
      {entry.label}
    </Badge>
  );
}

/* ─── Button ─────────────────────────────────────────── */
const btnVariants = {
  primary:   "bg-brand-600 hover:bg-brand-700 text-white shadow-sm hover:shadow-md",
  secondary: "bg-white hover:bg-black/[0.02] text-ink-primary border border-black/10 shadow-sm",
  ghost:     "text-ink-secondary hover:bg-black/[0.04] hover:text-ink-primary",
  danger:    "bg-status-critical hover:bg-red-700 text-white shadow-sm",
  "ghost-danger": "text-status-critical hover:bg-red-50 hover:text-red-700",
};
const btnSizes = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-sm gap-2",
};

export function Button({ children, variant = "primary", size = "md", className, loading, icon: Icon, ...props }) {
  return (
    <button
      disabled={loading || props.disabled}
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]",
        btnVariants[variant],
        btnSizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  );
}

/* ─── Card ─────────────────────────────────────────── */
export function Card({ children, className, ...props }) {
  return (
    <div className={cn("bg-paper-surface rounded-2xl border border-black/[0.06] shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className, action }) {
  return (
    <div className={cn("flex items-center justify-between px-5 py-4 border-b border-black/[0.06]", className)}>
      <div className="min-w-0">{children}</div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

/* ─── Spinner ─────────────────────────────────────────── */
export function Spinner({ size = 20, className }) {
  return <Loader2 size={size} className={cn("animate-spin text-brand-600", className)} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full py-20">
      <Spinner size={32} />
    </div>
  );
}

/* ─── Empty ─────────────────────────────────────────── */
export function Empty({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-black/[0.04] flex items-center justify-center mb-4">
          <Icon size={22} className="text-ink-muted" />
        </div>
      )}
      <p className="font-semibold text-ink-primary mb-1">{title}</p>
      {description && <p className="text-sm text-ink-muted max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ─── StatCard ─────────────────────────────────────────── */
export function StatCard({ label, value, sub, icon: Icon, trend, color = "brand", className }) {
  const iconColors = {
    brand:  "bg-brand-50 text-brand-600",
    red:    "bg-red-50 text-status-critical",
    amber:  "bg-amber-50 text-amber-600",
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-emerald-50 text-status-good",
    purple: "bg-purple-50 text-purple-600",
  };
  const accentBar = {
    brand:  "bg-brand-500",
    red:    "bg-status-critical",
    amber:  "bg-amber-400",
    blue:   "bg-blue-500",
    green:  "bg-status-good",
    purple: "bg-purple-500",
  };
  return (
    <Card className={cn("relative overflow-hidden p-5", className)}>
      <span className={cn("absolute top-0 left-0 right-0 h-[3px]", accentBar[color] || accentBar.brand)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1.5">{label}</p>
          <p className="text-[1.75rem] leading-none font-bold text-ink-primary tabular-nums">{value ?? "—"}</p>
          {sub && <p className="text-xs text-ink-muted mt-2 truncate">{sub}</p>}
          {trend != null && (
            <p className={cn("text-xs font-medium mt-1.5", trend >= 0 ? "text-status-good" : "text-status-critical")}>
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last 7d
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconColors[color] || iconColors.brand)}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Meter ─────────────────────────────────────────────
 * A same-ramp proportion track for a two-way (or few-way) share — the correct
 * form for "share of a whole" instead of a pie of 2-3 slices (dataviz skill:
 * "A single ratio against a limit → Meter, not: a pie of 2 slices"). Segments
 * are drawn left-to-right in the order given, each with its own color + label,
 * so identity never rests on color alone. */
export function Meter({ segments, className }) {
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0) || 1;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex h-3 rounded-full overflow-hidden bg-black/[0.05]">
        {segments.map((seg, i) => {
          const pct = (seg.value / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={seg.label}
              className={cn("h-full transition-all", i > 0 && "border-l-2 border-paper-surface")}
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${seg.value}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="font-semibold text-ink-primary tabular-nums">{seg.value}</span>
            <span className="text-ink-muted">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Modal ─────────────────────────────────────────── */
export function Modal({ open, onClose, title, children, width = "max-w-lg" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative bg-paper-surface rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh]", width)}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06]">
            <h3 className="font-semibold text-ink-primary">{title}</h3>
            <button onClick={onClose} className="text-ink-muted hover:text-ink-primary transition-colors text-xl leading-none">&times;</button>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

/* ─── Input / Select / Textarea ─────────────────────── */
export function Input({ label, error, className, ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-xs font-medium text-ink-secondary">{label}</label>}
      <input
        className={cn(
          "w-full px-3 py-2 rounded-xl border text-sm bg-white text-ink-primary outline-none transition-all",
          "border-black/10 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          error && "border-status-critical focus:border-status-critical focus:ring-red-500/20",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-status-critical">{error}</p>}
    </div>
  );
}

export function Select({ label, error, className, children, ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-xs font-medium text-ink-secondary">{label}</label>}
      <select
        className={cn(
          "w-full px-3 py-2 rounded-xl border text-sm bg-white text-ink-primary outline-none transition-all",
          "border-black/10 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-status-critical">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className, ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-xs font-medium text-ink-secondary">{label}</label>}
      <textarea
        className={cn(
          "w-full px-3 py-2 rounded-xl border text-sm bg-white text-ink-primary outline-none transition-all resize-none",
          "border-black/10 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-status-critical">{error}</p>}
    </div>
  );
}

/* ─── ErrorBanner ─────────────────────────────────────── */
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
      <AlertCircle size={16} className="shrink-0" />
      {message}
    </div>
  );
}
