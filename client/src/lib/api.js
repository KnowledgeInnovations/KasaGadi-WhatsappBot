const BASE = "/api";

function token() {
  return localStorage.getItem("kg_token");
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      Authorization: `Bearer ${token()}`,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("kg_token");
    window.location.href = "/app/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export const api = {
  login: (username, password) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error || "Login failed");
      return r.json();
    }),

  stats:  () => request("/stats"),
  health: () => request("/health"),

  // Claims (fact-checks) — read-only, live from the Kasagadi Claims API
  claims: (q) => request(`/claims${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  claim:  (id) => request(`/claims/${id}`),

  // Members (registered users)
  members:      () => request("/members"),
  createMember: (data) => request("/members", { method: "POST", body: JSON.stringify(data) }),
  deleteMember: (id) => request(`/members/${id}`, { method: "DELETE" }),
  memberWhatsappLink: (id, botNumber) => request(`/members/${id}/whatsapp-link?botNumber=${encodeURIComponent(botNumber)}`),

  // Escalations
  escalations: () => request("/escalations"),

  // Conversations
  conversations:       () => request("/conversations"),
  conversation:        (id) => request(`/conversations/${id}`),
  deleteConversation:  (id) => request(`/conversations/${id}`, { method: "DELETE" }),
  deleteAllConversations: () => request("/conversations", { method: "DELETE" }),

  // Broadcasts — drafts use { title, message } (not name)
  broadcastDrafts:  () => request("/broadcast/drafts"),
  broadcastDraft:   (id) => request(`/broadcast/drafts/${id}`),
  createDraft: (data) =>
    request("/broadcast/drafts", { method: "POST", body: JSON.stringify(data) }),
  updateDraft: (id, data) =>
    request(`/broadcast/drafts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDraft: (id) =>
    request(`/broadcast/drafts/${id}`, { method: "DELETE" }),
  broadcastResults: () => request("/broadcast/results"),
  broadcastStatus:  () => request("/broadcast/status"),
  // Send a broadcast to registered members (message supports {name} personalisation)
  broadcastMembersAudience: () => request("/broadcast/members-audience"),
  sendToMembers: (data) => request("/broadcast/send-members", { method: "POST", body: JSON.stringify(data) }),
};
