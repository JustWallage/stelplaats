output "d1_database_id_prod" {
  description = "Production D1 database id (templated into wrangler config by CI)"
  value       = cloudflare_d1_database.prod.id
}

output "app_hostname" {
  description = "Hostname the app (and its Access application) is served on"
  value       = local.app_hostname
}

# Service-token credentials the Worker uses to reach hass-api.justwallage.nl.
# Fetch with `terraform -chdir=iac output -raw hass_api_access_client_id` and
# store as Worker secrets (never committed). Null until the custom domain is active.
output "hass_api_access_client_id" {
  description = "CF-Access-Client-Id for the Worker -> Home Assistant calls"
  value       = one(cloudflare_zero_trust_access_service_token.hass_api[*].client_id)
  sensitive   = true
}

output "hass_api_access_client_secret" {
  description = "CF-Access-Client-Secret for the Worker -> Home Assistant calls"
  value       = one(cloudflare_zero_trust_access_service_token.hass_api[*].client_secret)
  sensitive   = true
}
