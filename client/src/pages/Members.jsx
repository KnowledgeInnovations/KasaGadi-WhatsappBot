import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Search, X, Link2, Copy, Check, Users } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime, fmtPhone, avatarColor, initials, cn } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Modal, Input, PageLoader, Empty, ErrorBanner } from "@/components/ui";

function AddMemberModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.createMember(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members"] }); onClose(); },
    onError: (e) => setError(e.message),
  });

  function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.phone.trim()) { setError("Name and phone are required."); return; }
    mutation.mutate();
  }

  return (
    <Modal open onClose={onClose} title="Add Member" width="max-w-md">
      <form onSubmit={submit} className="p-6 space-y-4">
        <ErrorBanner message={error} />
        <p className="text-xs text-slate-500 -mt-1">
          Manually link a WhatsApp number to a Kasagadi identity — useful until kasagadi.ai has its own account system wired in.
        </p>
        <Input label="Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ama Boateng" required />
        <Input label="WhatsApp Phone *" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="e.g. 233241234567" required />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="optional" />
        <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={mutation.isPending}>Add Member</Button>
        </div>
      </form>
    </Modal>
  );
}

function LinkModal({ member, onClose }) {
  const [botNumber, setBotNumber] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setError("");
    try {
      const digits = botNumber.replace(/\D/g, "");
      if (digits.length < 8) { setError("Enter the bot's WhatsApp number (international digits, no +)."); return; }
      const res = await api.memberWhatsappLink(member.memberId, digits);
      setLink(res.link);
    } catch (e) {
      setError(e.message);
    }
  }

  function copy() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal open onClose={onClose} title={`"Chat on WhatsApp" link — ${member.name}`} width="max-w-lg">
      <div className="p-6 space-y-4">
        <ErrorBanner message={error} />
        <p className="text-sm text-slate-500">
          This is the deep link kasagadi.ai's dashboard button should point to for this member — it opens WhatsApp with a hidden
          reference so the bot greets them by name from message one (brief: Path A).
        </p>
        <div className="flex gap-2">
          <Input label="Bot WhatsApp number" value={botNumber} onChange={(e) => setBotNumber(e.target.value)} placeholder="e.g. 233597309383" />
          <div className="pt-6"><Button size="sm" onClick={generate}>Generate</Button></div>
        </div>
        {link && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <Link2 size={14} className="text-slate-400 shrink-0" />
            <p className="text-xs text-slate-600 truncate flex-1">{link}</p>
            <button onClick={copy} className="text-brand-600 hover:text-brand-700 shrink-0">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
        <div className="flex justify-end pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Members() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [linkFor, setLinkFor] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["members"], queryFn: api.members });

  const deleteMutation = useMutation({
    mutationFn: api.deleteMember,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });

  if (isLoading) return <PageLoader />;

  const members = (data?.members || []).filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.name?.toLowerCase().includes(q) || String(m.phone).includes(q) || m.email?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Registered Members</h2>
          <p className="text-sm text-slate-400">{data?.members?.length || 0} total · linked WhatsApp numbers get greeted by name</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-56 sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…"
              className="w-full pl-8 pr-7 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>
          <Button icon={Plus} onClick={() => setShowAdd(true)} className="shrink-0">Add Member</Button>
        </div>
      </div>

      <Card>
        {members.length === 0 ? (
          <Empty icon={Users} title="No members yet"
            description="Members are created either by users typing 'register' in WhatsApp, or added here manually."
            action={<Button icon={Plus} onClick={() => setShowAdd(true)}>Add Member</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Member", "Phone", "Email", "Source", "Registered", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.memberId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", avatarColor(m.name))}>
                          {initials(m.name)}
                        </div>
                        <p className="font-semibold text-slate-800">{m.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmtPhone(m.phone)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{m.email || "—"}</td>
                    <td className="px-4 py-3"><Badge variant={m.source === "dashboard" ? "blue" : "default"}>{m.source}</Badge></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmtDateTime(m.registeredAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setLinkFor(m)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Get WhatsApp link">
                          <Link2 size={13} />
                        </button>
                        <button onClick={() => { if (confirm(`Remove ${m.name}?`)) deleteMutation.mutate(m.memberId); }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} />}
      {linkFor && <LinkModal member={linkFor} onClose={() => setLinkFor(null)} />}
    </div>
  );
}
