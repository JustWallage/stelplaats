# Custom domain — justwallage.nl

## What changed

The original plan moved production to `stelplaats.just.wallage.nl`, which was
blocked because `just.wallage.nl` is a subdomain zone (Enterprise-only) of
dad's `wallage.nl`. That dependency is **gone**: a dedicated domain
`justwallage.nl` was registered (Vimexx) and its zone now lives in Cloudflare
(free plan). Production moves to **`stelplaats.justwallage.nl`**, and Home
Assistant is embedded from **`hass.justwallage.nl`** on the same zone (see
`docs/superpowers/specs/2026-06-14-hass-embed-design.md`).

## Hostnames on the zone

| Host                        | Serves                          | Auth                        |
| --------------------------- | ------------------------------- | --------------------------- |
| `stelplaats.justwallage.nl` | the app (Workers custom domain) | Access (Google, 2 emails)   |
| `hass.justwallage.nl`       | Home Assistant (iframed)        | Access (Google, 2 emails)   |
| `hass-api.justwallage.nl`   | Home Assistant (Worker → API)   | Access (service token only) |

`hass`/`hass-api` are the same Cloudflare Tunnel on the Pi; the app's hostname
is a Workers custom domain. All share the `justwallage.nl` registrable domain,
so the Access cookie is same-site and one Google login covers the app + iframe.

## Activation switch

Everything on the custom domain is gated in Terraform on
`local.custom_domain_active` (`var.custom_domain != null && var.custom_domain_zone_id != null`).
`custom_domain` defaults to `stelplaats.justwallage.nl`; the only thing missing
is the **zone id**, supplied as the GitHub Actions secret
**`CUSTOM_DOMAIN_ZONE_ID`** (wired in `deploy.yml` as `TF_VAR_custom_domain_zone_id`).

Until that secret is set the app keeps running on `*.workers.dev` and none of
the custom-domain / Access / Home Assistant resources are created — so this
branch can merge safely before the cutover.

## Cutover steps

1. **Get the zone id**: Cloudflare dashboard → `justwallage.nl` → Overview →
   right sidebar → **Zone ID**.
2. **Add the GHA secret**: `gh secret set CUSTOM_DOMAIN_ZONE_ID` (or via the
   repo settings UI).
3. **Set up the Cloudflare Tunnel on the Pi** so `hass` / `hass-api` resolve
   (Cloudflared add-on; both public hostnames → `http://homeassistant:8123`).
4. **Deploy** (push to `main`): `terraform apply` creates the Workers custom
   domain, the three Access apps, the service token, and the iframe header rule;
   the app moves to `stelplaats.justwallage.nl`.
5. **Worker → HASS secrets** (phase 2): fetch the service-token creds
   (`terraform -chdir=iac output -raw hass_api_access_client_id` /
   `…_client_secret`) and set them, plus the HASS long-lived token, as Worker
   secrets.

## Rollback

Remove the `CUSTOM_DOMAIN_ZONE_ID` secret (or set it empty) and apply: the
custom domain, Access apps, and Home Assistant resources are destroyed and the
app reverts to the workers.dev hostname.
