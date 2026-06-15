# Home Assistant embed — design

## Goal

Show the live Home Assistant (HASS) dashboard inside the Stelplaats app, on the
Home Assistant page, for the two household users — reachable from anywhere,
**without exposing the Raspberry Pi to the internet**. Phase 1 embeds the real
HASS Lovelace UI in an iframe. Native React controls over the HASS API are a
later, additive phase.

## Current state (probed 2026-06-14)

- Pi at `192.168.2.6` (`homeassistant.local`), MAC prefix `dc:a6:32` (Raspberry
  Pi Foundation). It runs **Home Assistant OS (HAOS)** — confirmed by the
  Supervisor observer on port `4357`. Consequence: there is no host SSH model;
  Cloudflare Tunnel, Tailscale, and SSH are all **add-ons** installed from the
  HASS UI.
- HASS HTTP is up on `:8123` (HTTP 200) and sends **`X-Frame-Options:
SAMEORIGIN`** — browsers will refuse to iframe it cross-origin until that
  header is removed at the Cloudflare edge (see §4).
- Domain `justwallage.nl` was registered at Vimexx and is being moved to a
  Cloudflare zone (free plan). It is its **own registrable domain** (not a
  subdomain of `wallage.nl`), so the Enterprise-only subdomain-zone limitation
  in `SPEC.md` §3 / `DOMAIN-MIGRATION.md` does **not** apply here.

## Hostnames

| Host                        | Serves                          | Origin                       |
| --------------------------- | ------------------------------- | ---------------------------- |
| `stelplaats.justwallage.nl` | the Stelplaats app (the Worker) | Workers custom domain        |
| `hass.justwallage.nl`       | Home Assistant (iframed)        | Cloudflare Tunnel → Pi :8123 |

Both are subdomains of `justwallage.nl` → **same-site**, so the Access cookie is
first-party in the iframe and single sign-on works (see §7).

## Topology

```
Browser ──https──► Cloudflare edge ──► [Access: Google, 2-email allowlist]
                        │
        stelplaats.justwallage.nl ──► Worker (Hono + React assets)
                        │
        hass.justwallage.nl ──► Tunnel ──► cloudflared add-on on HAOS ──► HASS :8123
                        │
            (edge Transform Rule strips X-Frame-Options, sets CSP frame-ancestors)
```

`cloudflared` dials **out** to Cloudflare; nothing inbound reaches the Pi. The Pi
has no port forward, no public IP exposure. The only path in is via Cloudflare's
edge, and the only identities the edge admits are the two allow-listed emails.

## Components

### 1. Domain & DNS

- `justwallage.nl` added as a Cloudflare zone (free plan); Vimexx nameservers
  switched to the two Cloudflare-assigned NS. No records needed by hand — the
  two we use are created automatically:
  - `stelplaats` — created by the Workers custom domain (Terraform, §6).
  - `hass` — `CNAME → <tunnel-id>.cfargotunnel.com` (proxied), created when the
    public hostname is attached to the tunnel (§2).

### 2. Cloudflare Tunnel — `cloudflared` add-on on HAOS

- Install the community **Cloudflared** add-on in HASS.
- Authenticate it to the Cloudflare account (`cloudflared tunnel login` →
  pick the `justwallage.nl` zone — requires the zone to be **Active** first).
- Named tunnel `stelplaats-hass`; public hostname `hass.justwallage.nl` →
  service `http://homeassistant:8123` (the add-on's internal name for HASS).
- Named (not quick) tunnel → the hostname is **stable forever**; no
  ephemeral-URL discovery machinery is needed.

### 3. Cloudflare Access (Terraform, `iac/`)

- The existing `cloudflare_zero_trust_access_application.stelplaats` already
  gates `stelplaats.justwallage.nl` (Google IdP, 2-email policy). It currently
  uses `session_duration = "168h"`.
- **Add a sibling Access application** for `hass.justwallage.nl` with the same
  IdP and the same 2-email policy. A second app (vs. one multi-destination app)
  keeps the existing resource untouched and is easy to reason about; **SSO
  across apps in the same Zero Trust org still means a single Google login.**
- Bump `session_duration` to **`730h` (≈1 month)** on both apps (user wants
  ≥30 days). Note: with `auto_redirect_to_identity = true`, expiry triggers a
  _silent_ re-auth against the live Google session — not a manual password
  prompt — so in practice re-logins are rare regardless. (Not on iOS, so the
  Safari 7-day storage eviction caveat does not apply.)

### 4. Un-block iframing — edge response-header rewrite

HASS sends `X-Frame-Options: SAMEORIGIN`. Because `hass.justwallage.nl` is
proxied through Cloudflare, add a **Transform Rule → Modify Response Header**
(free plan) scoped to `hostname eq "hass.justwallage.nl"`:

- **Remove** `X-Frame-Options`.
- **Set** `Content-Security-Policy: frame-ancestors 'self'
https://stelplaats.justwallage.nl` (overrides any HASS CSP; allows only the
  app to frame it).

Manage this as code if the provider supports it (`cloudflare_ruleset`,
`http_response_headers_transform` phase); otherwise document it as a dashboard
step in `BOOTSTRAP.md`.

### 5. HASS-side configuration

- **Trusted proxies** (`configuration.yaml`) so HASS accepts the proxied
  requests and logs real client IPs:
  ```yaml
  http:
    use_x_forwarded_for: true
    trusted_proxies:
      - 172.30.33.0/24 # Supervisor add-on docker network
  ```
- **HASS's own login**: kept for v1 (one-time sign-in; HASS persists a
  long-lived refresh token in the browser, durable on non-Safari). Decision
  D2 below tracks the optional `trusted_networks` auto-login that would make it
  a true single login but is fiddly behind the add-on reverse proxy.

### 6. App changes (`src/`, `iac/`)

- **`src/pages/HassPage.tsx`**: replace the "coming soon" placeholder with a
  full-height responsive `<iframe src="https://hass.justwallage.nl">`. The
  hostname is a build-time constant (or a small `VITE_`/config value), not
  fetched — it never changes. Handle the load state and a fallback message if
  the frame fails.
- **Custom-domain move** (Terraform): set `custom_domain =
"stelplaats.justwallage.nl"` and `custom_domain_zone_id = <justwallage.nl
zone id>`. The gated `cloudflare_workers_custom_domain.stelplaats` and the
  Access app activate; the app leaves `*.workers.dev`.
- **Update `docs/DOMAIN-MIGRATION.md`**: the plan changed — production now moves
  to the standalone `justwallage.nl`, not `stelplaats.just.wallage.nl`. The
  `wallage.nl`/Route53 migration is no longer a prerequisite for a custom
  domain. Record the new hostnames and that `hass.justwallage.nl` shares the
  zone.

## Auth & session flow (the user experience)

1. User opens `stelplaats.justwallage.nl` → Cloudflare Access → Google login
   (first time only) → app loads.
2. App's HASS page mounts the iframe to `hass.justwallage.nl`. Access SSO admits
   it silently (same org, live session, same-site cookie) — **no second Google
   prompt**.
3. HASS shows its own login once (v1); its refresh token persists thereafter.
4. Re-auth: only after the (1-month) Access session lapses _and_ the Google
   session is gone — otherwise silent. Goal of "sign in once, not weekly" met.

## Security considerations

- Pi stays internet-dark: outbound-only tunnel, no port forward, Access at the
  edge as the real gate, 2-email allowlist (defense-in-depth re-checked in the
  Worker for its own routes per `SPEC.md` §8 — HASS is gated purely by Access +
  its own login).
- The CSP `frame-ancestors` restricts who may embed HASS to the app origin only.
- Disabling HASS's own login (D2) would make "anyone past Access = HASS admin";
  acceptable for a 2-person household but only because Access is solid. Keep
  HASS login for v1 unless D2 is explicitly chosen.
- The SSH/Terminal add-on used during setup (protection mode off) should be
  stopped or re-protected once the tunnel and Tailscale are in place.

## Doable before the domain is Active

- ✅ Worktree `hass-embed` created.
- ✅ This spec.
- Pi access for setup: install the **Advanced SSH & Web Terminal** add-on
  (authorized key + port 22, protection mode off) so the remaining HAOS steps
  can be driven/verified.
- **Tailscale**: install the official Tailscale add-on and link it to the user's
  Tailscale account (independent of the domain; useful as a private fallback
  path to the Pi).
- Install the **Cloudflared** add-on (but its `tunnel login` waits for the zone).
- Build the `HassPage` iframe component behind the constant hostname (renders
  once the domain resolves; E2E can stub the frame origin).

## Blocked until the domain is Active

- `cloudflared tunnel login` + named tunnel + `hass` public hostname (§2).
- Sibling Access application + `session_duration` bump (§3).
- X-Frame-Options / CSP Transform Rule (§4).
- Terraform custom-domain flip (§6).

## Implementation order

1. (now) Pi setup: SSH add-on → Tailscale add-on linked → Cloudflared add-on
   installed.
2. (now) `HassPage` iframe + `DOMAIN-MIGRATION.md` update + Terraform edits
   staged behind the still-`null` `custom_domain`.
3. (domain Active) Tunnel login + `hass.justwallage.nl` hostname.
4. (domain Active) Terraform apply: custom domain + both Access apps.
5. (domain Active) Transform Rule for the iframe headers + HASS `trusted_proxies`.
6. Verify end-to-end on desktop + Android; tidy up the setup-only SSH add-on.

## Testing (e2e)

- Per repo rule, logic gets E2E coverage. The HASS page mostly renders a static
  iframe (little logic), but add a Playwright spec asserting: the page renders
  the iframe with the expected `src`, the nav entry routes to it, and a
  fallback message shows if the frame errors. The real cross-origin HASS content
  is **not** loaded in CI (no tunnel in ephemeral envs); the spec stubs/asserts
  the element, not HASS itself.
- Keep `pnpm check` green.

## Phase 2 — native controls (design)

Phase 1 embeds the dashboard. Phase 2 adds first-class buttons/toggles in the
app for chosen actions. **All logic lives in HASS** (scripts / scenes /
automations); the app + Worker are a thin trigger + status layer. The contract
between them is just entity_ids — a routine can change in HASS with no app
redeploy. The Worker can't reach devices except through HASS, so no
orchestration logic belongs in Cloudflare.

**Modeling.** Momentary "do it now" actions → HASS **scripts** → app **button**.
On/off behaviour (enable/disable a routine) → **automation entity** → app
**toggle** + state read. "Turn off all lights" is a single `light.turn_off`
action wrapped as `script.all_lights_off` — not an automation (no trigger).

**First control:** "Turn off all lights" → `script.all_lights_off` → one button.

**Machine-API path (decided).** A **second tunnel hostname
`hass-api.justwallage.nl`** whose Access policy allows **only a service token**
(not interactive Google) — keeping the human iframe path and the machine API
path cleanly separated. The Worker calls it server-side with two secrets, never
exposed to the browser:

- HASS **long-lived access token** (Bearer).
- CF Access **service token** (`CF-Access-Client-Id` / `CF-Access-Client-Secret`)
  to pass the edge.

**Worker proxy.** New routes, each with a Zod schema in `shared/` (per SPEC §6),
e.g. `POST /api/hass/script/:id`, later `POST /api/hass/automation/:id/toggle`
and `GET /api/hass/states`. The Worker forwards to
`https://hass-api.justwallage.nl/api/services/...` with the two creds. Reuses the
existing 2-email Access gate on the app side; HASS creds stay server-side.

**App UI.** A controls section on the Hass page (or a small panel) with the
"All lights off" button calling `POST /api/hass/script/all_lights_off`. Buttons
for scripts/scenes; toggles for automations (read state to reflect status).
Live status can reuse the existing `mutate()` + WS pattern or fetch-on-demand;
HASS's own WS API is a later option.

**HASS-side prep (doable now, no domain):** create `script.all_lights_off`;
create a long-lived access token (kept as a Worker secret later — never pasted
into chat). **Worker/Terraform/app wiring is gated on the tunnel being up.**

## Out of scope (later phases)

- Automation toggles and scene buttons beyond the first "all lights off" control.
- PWA install.
- `trusted_networks` true-single-login (decision D2).

## Open decisions

- **D1 — Access session length.** Spec assumes `730h` (~1 month). Go longer if
  Cloudflare accepts it; confirm the value.
- **D2 — HASS own login.** v1 keeps it (simple, persists). Optional later:
  `trusted_networks` auto-login for a true single sign-in — fiddlier behind the
  add-on reverse proxy. Confirm: keep for v1?
- ~~**D3 — machine-API auth topology.**~~ Resolved: separate
  `hass-api.justwallage.nl` with a service-token-only Access policy.
