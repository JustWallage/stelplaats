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

locals {
  # workers.dev until the wallage.nl zone moves to Cloudflare
  # (see docs/DOMAIN-MIGRATION.md), then var.custom_domain takes over.
  app_hostname = coalesce(var.custom_domain, "stelplaats.${var.workers_dev_subdomain}.workers.dev")
}

# --- D1 (production) ---
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

resource "cloudflare_zero_trust_access_application" "stelplaats" {
  account_id                = var.cloudflare_account_id
  name                      = "stelplaats"
  domain                    = local.app_hostname
  type                      = "self_hosted"
  session_duration          = "168h"
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

# --- Custom domain (activated after the DNS move; null until then) ---
resource "cloudflare_workers_custom_domain" "stelplaats" {
  count = var.custom_domain == null ? 0 : 1

  account_id = var.cloudflare_account_id
  zone_id    = var.custom_domain_zone_id
  hostname   = var.custom_domain
  service    = "stelplaats"
}
