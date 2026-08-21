import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Loader2, Eye, EyeOff } from "lucide-react";
import logo from "@/assets/kasagadi-logo.jpeg";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token } = await api.login(form.username, form.password);
      localStorage.setItem("kg_token", token);
      navigate("/app/overview", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — branding panel */}
      <div className="hidden lg:flex w-[55%] bg-navy-900 flex-col justify-between p-12 relative overflow-hidden">
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

        {/* Glow */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl" />
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-brand-600/10 rounded-full blur-3xl" />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <img src={logo} alt="Kasagadi" className="w-9 h-9 rounded-lg object-contain" />
          <span className="text-white font-bold text-lg tracking-wide">Kasagadi AI</span>
        </div>

        {/* Hero text */}
        <div className="relative space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-600/20 border border-brand-600/30 rounded-full text-brand-400 text-xs font-semibold uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            Fact-Checking WhatsApp Assistant
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight">
            Context &amp; Truth,<br />
            <span className="text-brand-400">Powered by Mansa</span><br />
            on WhatsApp
          </h2>
          <p className="text-white/50 text-lg leading-relaxed max-w-sm">
            Manage published claims, registered members, live conversations, and human escalations — all from one console.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { label: "Claims DB", value: "Live" },
              { label: "Languages", value: "En · Twi · Hausa" },
              { label: "AI Model", value: "Mansa" },
            ].map(({ label, value }) => (
              <div key={label} className="border border-white/10 rounded-xl p-3">
                <p className="text-brand-400 text-xs font-semibold mb-0.5">{value}</p>
                <p className="text-white/40 text-xs">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-white/20 text-xs">
          © {new Date().getFullYear()} Kasagadi AI. All rights reserved.
        </p>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-paper-page">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex items-center justify-center gap-2.5">
            <img src={logo} alt="Kasagadi" className="w-9 h-9 rounded-lg object-contain" />
            <span className="text-slate-900 font-bold text-lg">Kasagadi AI</span>
          </div>

          <div className="bg-white rounded-2xl shadow-card-md border border-slate-200 p-8">
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
              <p className="text-slate-500 text-sm mt-1">Sign in to the Bot Console</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">Username</label>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="admin"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-slate-50 text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all placeholder:text-slate-300"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">Password</label>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 text-sm bg-slate-50 text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all placeholder:text-slate-300"
                  />
                  <button type="button" onClick={() => setShow((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-all disabled:opacity-60 shadow-lg shadow-brand-600/20 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : "Sign in →"}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">
            Kasagadi AI Bot Console · Secured access
          </p>
        </div>
      </div>
    </div>
  );
}
