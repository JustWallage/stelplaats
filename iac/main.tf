terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket                      = "stelplaats-tfstate"
    key                         = "terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    # endpoints.s3 is passed via -backend-config at init time because the
    # backend block cannot interpolate variables:
    #   terraform init -backend-config="endpoints={s3=\"https://<account>.r2.cloudflarestorage.com\"}"
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Everything on the custom domain (the app's Workers domain, all Access apps,
# the Home Assistant tunnel hostnames and header rule) activates together, and
# only once the justwallage.nl zone id is supplied. Until then the app keeps
# running on workers.dev and nothing here flips.
locals {
  custom_domain_active = var.custom_domain != null && var.custom_domain_zone_id != null
  app_hostname         = local.custom_domain_active ? var.custom_domain : "stelplaats.${var.workers_dev_subdomain}"

  hass_hostname     = "hass.justwallage.nl"
  hass_api_hostname = "hass-api.justwallage.nl"
}

resource "cloudflare_d1_database" "prod" {
  account_id = var.cloudflare_account_id
  name       = "stelplaats-prod"
  read_replication = {
    mode = "disabled"
  }
}

# --- Cloudflare Access (Zero Trust) ---

resource "cloudflare_zero_trust_access_identity_provider" "google" {
  account_id = var.cloudflare_account_id
  name       = "Google"
  type       = "google"

  config = {
    client_id     = var.google_client_id
    client_secret = var.google_client_secret
  }
}

# Self_hosted apps require a domain in a zone you own, so a workers.dev hostname
# is rejected with "domain does not belong to zone" — hence gated on the zone id.
resource "cloudflare_zero_trust_access_application" "stelplaats" {
  count = local.custom_domain_active ? 1 : 0

  account_id                = var.cloudflare_account_id
  name                      = "stelplaats"
  domain                    = var.custom_domain
  type                      = "self_hosted"
  session_duration          = "730h"
  auto_redirect_to_identity = true
  app_launcher_visible      = true
  allowed_idps              = [cloudflare_zero_trust_access_identity_provider.google.id]

  policies = [{
    name     = "Allow household only"
    decision = "allow"
    include = [
      { email = { email = "just@wallage.nl" } },
      { email = { email = "suusraedts2018@gmail.com" } },
    ]
  }]
}

# The Telegram bot webhook must be reachable by Telegram's servers, which carry
# no Access identity. A path-scoped app with a "bypass" policy punches a public
# hole at /telegram/webhook only; Access matches the most specific app, so the
# rest of the domain stays behind "Allow household only". The endpoint is still
# authenticated by its secret token (X-Telegram-Bot-Api-Secret-Token) in the
# worker, so bypassing Access does not make it unauthenticated.
resource "cloudflare_zero_trust_access_application" "telegram_webhook" {
  count = local.custom_domain_active ? 1 : 0

  account_id       = var.cloudflare_account_id
  name             = "stelplaats-telegram-webhook"
  domain           = "${var.custom_domain}/telegram/webhook"
  type             = "self_hosted"
  session_duration = "730h"

  policies = [{
    name     = "Public bypass (secret-token gated in worker)"
    decision = "bypass"
    include  = [{ everyone = {} }]
  }]
}

# Home Assistant dashboard (iframed). Same Google policy as the app, so SSO
# admits the frame silently — one login covers both (same-site cookie).
resource "cloudflare_zero_trust_access_application" "hass" {
  count = local.custom_domain_active ? 1 : 0

  account_id                = var.cloudflare_account_id
  name                      = "stelplaats-hass"
  domain                    = local.hass_hostname
  type                      = "self_hosted"
  session_duration          = "730h"
  auto_redirect_to_identity = true
  allowed_idps              = [cloudflare_zero_trust_access_identity_provider.google.id]

  policies = [{
    name     = "Allow household only"
    decision = "allow"
    include = [
      { email = { email = "just@wallage.nl" } },
      { email = { email = "suusraedts2018@gmail.com" } },
    ]
  }]
}

# Machine API path: the Worker calls Home Assistant server-side via this
# hostname, authenticating with the service token below (no interactive login).
resource "cloudflare_zero_trust_access_service_token" "hass_api" {
  count = local.custom_domain_active ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "stelplaats-hass-api"
}

resource "cloudflare_zero_trust_access_application" "hass_api" {
  count = local.custom_domain_active ? 1 : 0

  account_id       = var.cloudflare_account_id
  name             = "stelplaats-hass-api"
  domain           = local.hass_api_hostname
  type             = "self_hosted"
  session_duration = "730h"

  policies = [{
    name     = "Service token only"
    decision = "non_identity"
    include  = [{ service_token = { token_id = cloudflare_zero_trust_access_service_token.hass_api[0].id } }]
  }]
}

# Strip X-Frame-Options and set frame-ancestors so the app may iframe Home
# Assistant (HASS sends X-Frame-Options: SAMEORIGIN by default).
resource "cloudflare_ruleset" "hass_iframe_headers" {
  count = local.custom_domain_active ? 1 : 0

  zone_id = var.custom_domain_zone_id
  name    = "hass-iframe-headers"
  kind    = "zone"
  phase   = "http_response_headers_transform"

  rules = [{
    ref         = "strip_xfo_set_csp"
    description = "Allow the app to iframe Home Assistant"
    expression  = "(http.host eq \"${local.hass_hostname}\")"
    action      = "rewrite"
    action_parameters = {
      headers = {
        "X-Frame-Options" = {
          operation = "remove"
        }
        "Content-Security-Policy" = {
          operation = "set"
          value     = "frame-ancestors 'self' https://${var.custom_domain}"
        }
      }
    }
  }]
}

# --- Custom domain (activated once the zone id is supplied) ---
resource "cloudflare_workers_custom_domain" "stelplaats" {
  count = local.custom_domain_active ? 1 : 0

  account_id = var.cloudflare_account_id
  zone_id    = var.custom_domain_zone_id
  hostname   = var.custom_domain
  service    = "stelplaats"
}
