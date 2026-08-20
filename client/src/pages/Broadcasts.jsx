import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2, Send, CheckCircle, XCircle, Users } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CardBody, Modal, Input, Textarea, PageLoader, Empty, ErrorBanner } from "@/components/ui";

function SendToMembersModal({ initial, onClose }) {
  const qc = useQueryClient();
  const [title,   setTitle]   = useState(initial?.title || "");
  const [message, setMessage] = useState(initial?.message || "");
  const [mode,    setMode]    = useState("all"); // "all" | "specific"
  const [selected, setSelected] = useState(() => new Set()); // Set<phone>
  const [search,  setSearch]  = useState("");
  const [error,   setError]   = useState("");
  const [result,  setResult]  = useState(null);

  const { data: audience, isLoading: audLoading } = useQuery({
    queryKey: ["membersAudience"],
    queryFn: api.broadcastMembersAudience,
  });
  const contacts = audience?.recipients || [];
  const filteredContacts = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.name || "").toLowerCase().includes(q) || c.phone.includes(q);
  });

  const count = mode === "specific" ? selected.size : (audience?.count ?? 0);

  function toggle(phone) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(phone) ? next.delete(phone) : next.add(phone);
      return next;
    });
  }
  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = filteredContacts.every((c) => next.has(c.phone));
      filteredContacts.forEach((c) => (allSelected ? next.delete(c.phone) : next.add(c.phone)));
      return next;
    });
  }

  const sendMutation = useMutation({
    mutationFn: () => api.sendToMembers(
      mode === "specific"
        ? { title, message, phones: [...selected] }
        : { title, message }
    ),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["broadcastResults"] });
    },
    onError: (e) => setError(e.message),
  });

  function submit() {
    setError("");
    if (!message.trim()) { setError("Message is required."); return; }
    if (count === 0)      { setError(mode === "specific" ? "Select at least one contact." : "No registered members to send to."); return; }
    if (!confirm(`Send this message to ${count} contact${count !== 1 ? "s" : ""} on WhatsApp now?`)) return;
    sendMutation.mutate();
  }

  return (
    <Modal open onClose={onClose} title="Send to Members" width="max-w-lg">
      <div className="p-6 space-y-4">
        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <CheckCircle size={22} />
              <p className="font-semibold">Broadcast sent</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-lg font-bold text-slate-800 tabular-nums">{result.audience ?? result.totalRequested ?? 0}</p>
                <p className="text-xs text-slate-400">Audience</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-lg font-bold text-emerald-600 tabular-nums">{result.totalSent ?? 0}</p>
                <p className="text-xs text-slate-400">Sent</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-lg font-bold text-red-500 tabular-nums">{result.failed ?? 0}</p>
                <p className="text-xs text-slate-400">Failed</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <ErrorBanner message={error} />

            {/* Mode toggle */}
            <div className="flex gap-1.5">
              {[
                { key: "all",      label: "All registered members" },
                { key: "specific", label: "Specific contacts" },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    mode === m.key ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === "all" ? (
              <p className="flex items-center gap-1.5 text-sm text-slate-500">
                <Users size={14} />
                {audLoading ? "Counting recipients…" : <span><strong className="text-slate-800">{count}</strong> member{count !== 1 ? "s" : ""} will receive this message</span>}
              </p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-600">
                    Contacts <span className="text-slate-400">({selected.size} selected)</span>
                  </label>
                  {filteredContacts.length > 0 && (
                    <button onClick={toggleAllFiltered} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                      {filteredContacts.every((c) => selected.has(c.phone)) ? "Clear" : "Select all"}
                    </button>
                  )}
                </div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or number…"
                  className="w-full mb-2 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {contacts.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No registered members yet</p>
                  ) : filteredContacts.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No contacts match your search</p>
                  ) : (
                    filteredContacts.map((c) => (
                      <label key={c.phone} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(c.phone)}
                          onChange={() => toggle(c.phone)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{c.name || "Unknown"}</p>
                          <p className="text-xs text-slate-400">{c.phone}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <Input
              label="Campaign Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New fact-check published"
            />
            <Textarea
              label="Message *"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hello {name}! We just published a new fact-check on Kasagadi AI…"
              rows={6}
            />
            <p className="text-xs text-slate-400">
              Use <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{"{name}"}</code> to personalise with each member's name.
            </p>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" icon={Send} loading={sendMutation.isPending} onClick={submit} disabled={count === 0}>
                Send to {count} contact{count !== 1 ? "s" : ""}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function Broadcasts() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", message: "" });
  const [formError, setFormError] = useState("");
  const [sendCompose, setSendCompose] = useState(null); // null | { title, message }
  const qc = useQueryClient();

  const { data: draftsData, isLoading: dLoading } = useQuery({ queryKey: ["broadcastDrafts"],  queryFn: api.broadcastDrafts });
  const { data: resultsData, isLoading: rLoading } = useQuery({ queryKey: ["broadcastResults"], queryFn: api.broadcastResults });

  const createMutation = useMutation({
    mutationFn: (data) => api.createDraft(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broadcastDrafts"] });
      setShowForm(false);
      setForm({ title: "", message: "" });
      setFormError("");
    },
    onError: (err) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteDraft,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcastDrafts"] }),
  });

  const drafts  = draftsData?.drafts   || [];
  const results = resultsData?.results || [];

  if (dLoading || rLoading) return <PageLoader />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Broadcasts</h2>
          <p className="text-sm text-slate-400">Send bulk WhatsApp messages to registered members — e.g. new fact-check alerts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={Send} onClick={() => setSendCompose({ title: "", message: "" })} className="flex-1 sm:flex-none justify-center">Send to Members</Button>
          <Button icon={Plus} onClick={() => { setShowForm(true); setFormError(""); }} className="flex-1 sm:flex-none justify-center">New Draft</Button>
        </div>
      </div>

      {sendCompose && (
        <SendToMembersModal initial={sendCompose} onClose={() => setSendCompose(null)} />
      )}

      {/* Draft form modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Broadcast Draft" width="max-w-lg">
        <div className="p-6 space-y-4">
          <ErrorBanner message={formError} />
          <Input
            label="Campaign Title *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Weekly fact-check digest"
          />
          <Textarea
            label="Message *"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Hello {name}! We just published a new fact-check on Kasagadi AI…"
            rows={5}
          />
          <p className="text-xs text-slate-400">
            Use <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{"{name}"}</code> to personalise with the member's first name.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={createMutation.isPending}
              onClick={() => {
                if (!form.title || !form.message) { setFormError("Title and message are required."); return; }
                createMutation.mutate(form);
              }}
            >
              Save Draft
            </Button>
          </div>
        </div>
      </Modal>

      {/* Drafts */}
      <Card>
        <CardHeader action={<Badge variant="default">{drafts.length} drafts</Badge>}>
          <p className="font-semibold text-slate-900">Saved Drafts</p>
          <p className="text-xs text-slate-400">Campaigns ready to send</p>
        </CardHeader>
        {drafts.length === 0 ? (
          <CardBody>
            <Empty icon={Megaphone} title="No drafts yet"
              description="Create a draft to compose your broadcast message before sending."
              action={<Button icon={Plus} size="sm" onClick={() => setShowForm(true)}>New Draft</Button>} />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {drafts.map((d) => {
              const id = d.draftId || d._id || d.id;
              return (
                <li key={id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{d.title || d.name || "Untitled draft"}</p>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{d.message}</p>
                    <p className="text-xs text-slate-400 mt-1.5">{fmtRelative(d.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Send}
                      onClick={() => setSendCompose({ title: d.title || "", message: d.message || "" })}
                    >
                      Send
                    </Button>
                    <button
                      onClick={() => { if (confirm(`Delete "${d.title || "this draft"}"?`)) deleteMutation.mutate(id); }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <p className="font-semibold text-slate-900">Broadcast History</p>
          <p className="text-xs text-slate-400">Past campaigns and delivery results</p>
        </CardHeader>
        {results.length === 0 ? (
          <CardBody>
            <Empty icon={Send} title="No broadcasts sent yet"
              description="Once you send a broadcast campaign, the results will appear here." />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Campaign", "Sent", "Delivered", "Failed", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r, i) => (
                  <tr key={r.broadcastId || r._id || i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.title || r.name || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{r.totalSent ?? r.sent ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-emerald-600 font-semibold tabular-nums flex items-center gap-1">
                        <CheckCircle size={12} />{r.totalSent ?? r.delivered ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-red-500 font-semibold tabular-nums flex items-center gap-1">
                        <XCircle size={12} />{r.totalFailed ?? r.failed ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmtDateTime(r.createdAt || r.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
