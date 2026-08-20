# Kasagadi AI — WhatsApp Fact-Checking Assistant

A WhatsApp bot for [Kasagadi AI](https://www.kasagadi.ai) that helps people check the
background of circulating stories, headlines, and rumours — in English, Twi, and
Hausa — powered by the **Mansa AI** model. Includes an admin dashboard for browsing
published claims, managing registered members, live conversations, and human escalations.

## How it works

```
WhatsApp user  →  Meta WhatsApp Cloud API  →  this server (webhook)
                                                     │
                                    ┌────────────────┼────────────────┐
                                    ▼                ▼                ▼
                        Kasagadi Claims API      Mansa AI API    Member lookup
                        (live, published        (reply +        (MongoDB, by
                         fact-checks)            language)       phone number)
                                    └────────────────┬────────────────┘
                                                     ▼
                                          Reply sent back on WhatsApp
```

Claims are **not** stored in this project's own database — they live on
**kasagadi.ai itself** and are fetched live via the Kasagadi Claims API
(documented at `docs.kasagadi.ai`) on every incoming message. Whatever the
Kasagadi team publishes on the website marketplace is what the bot can
surface on WhatsApp, automatically, with no manual syncing.

MongoDB is used only for things that belong to *this* bot specifically:
conversation sessions, registered members, and broadcast history.

- **`server.js`** — Express app: webhook, API, static dashboard.
- **`src/routes/webhook.js`** — receives/verifies WhatsApp messages from Meta.
- **`src/handlers/messageHandler.js`** — the conversation flow (greetings, claim
  lookup, registration, escalation to a human fact-checker).
- **`src/services/mansa.js`** — talks to the Mansa AI HTTP API.
- **`src/services/kasagadiApi.js`** — talks to the live Kasagadi Claims API
  (`https://kasagadi.ai/api/v1`) — the bot's source of published fact-checks.
- **`src/services/memberService.js`** + **`src/db/models/Member.js`** —
  links a WhatsApp phone number to a registered Kasagadi identity.
- **`client/`** — React admin dashboard (built to `public/app`, served at `/app`).

## Setup

1. **Install dependencies**
   ```bash
   npm install
   npm run build   # builds the React dashboard into public/app
   ```

2. **Environment variables** — copy `.env.example` to `.env` and fill in real
   values. See that file for the full list and where each one comes from
   (WhatsApp Business API, MongoDB Atlas, admin login).

3. **Run**
   ```bash
   npm run dev     # local dev, auto-restarts on change
   npm start        # production
   ```
   - Webhook: `http://localhost:3000/webhook`
   - Dashboard: `http://localhost:3000/app`
   - Health check: `http://localhost:3000/api/health`

4. **Point Meta's webhook at your deployed server** — in Meta for Developers,
   set the webhook URL to `https://<your-domain>/webhook` and the verify token
   to whatever you set as `VERIFY_TOKEN`.

## Claims — where the fact-check data comes from

Claims are **published on kasagadi.ai itself** (a Rails marketplace — see
`docs.kasagadi.ai` for the full claim lifecycle: members submit → admins
assign a fact checker → verdict gets published). This project doesn't store
or manage claims at all — it only *reads* published ones, live, via the
Kasagadi Claims API on every incoming WhatsApp message.

- Set `KASAGADI_API_KEY` in `.env` to enable it — request a partner key
  (`kg_live_...`) from the Kasagadi team.
- The dashboard's **Claims** page is a read-only viewer of that same live
  data — useful for confirming what the bot can currently see/search, not
  for creating or editing anything.
- Without a key set, the bot still runs and chats normally, but every claim
  search comes back empty — Mansa falls back to general synthesis and red-flag
  guidance only, with no verified verdict to cite.

## Registered members & the "Chat on WhatsApp" link

The product brief describes a kasagadi.ai dashboard button that opens WhatsApp
pre-greeted by name. That website dashboard doesn't exist yet, but this bot is
ready for it: `GET /api/members/:id/whatsapp-link?botNumber=<digits>` returns
the deep link to use. Until the website integration exists, members can also
just type **register** in WhatsApp to link their number directly.

## Broadcasts

See [`BROADCAST_GUIDE.md`](./BROADCAST_GUIDE.md) for sending bulk WhatsApp
messages to registered members (e.g. "new fact-check published" alerts).

## Rebrand notes (from the Devtraco Plus real-estate bot)

This project started as a real-estate sales bot for Devtraco Plus. The
technical foundation (WhatsApp integration, session handling, admin dashboard
shell, MongoDB setup) was kept; all business logic was rebuilt for
fact-checking: properties → claims, viewings/CRM/lead-scoring → removed,
OpenAI → Mansa AI. `src/config/index.js` has a `brandColors` placeholder —
swap in the real Kasagadi palette (and dashboard `tailwind.config.js`) once
provided.
