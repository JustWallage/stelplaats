variable "cloudflare_api_token" {
  description = "Cloudflare API token (Workers, D1, R2, Access permissions)"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account id"
  type        = string
}

variable "workers_dev_subdomain" {
  description = "The account's workers.dev subdomain (the X in X.workers.dev)"
  type        = string
}

variable "google_client_id" {
  description = "Google OAuth client id for the Access identity provider"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth client secret for the Access identity provider"
  type        = string
  sensitive   = true
}

variable "custom_domain" {
  description = "Custom domain (stelplaats.just.wallage.nl) — leave null until the wallage.nl zone is on Cloudflare (docs/DOMAIN-MIGRATION.md)"
  type        = string
  default     = null
}

variable "custom_domain_zone_id" {
  description = "Cloudflare zone id for wallage.nl — only needed once custom_domain is set"
  type        = string
  default     = null
}
