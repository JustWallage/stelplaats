# iac/

Terraform owns: prod D1, the Access applications + Google IdP (the ONLY place
the allowed-emails list lives), the custom domain, and the Home Assistant
hostnames' Access apps + service token + iframe header rule. Wrangler/CI own:
the worker itself, its secrets, migrations, and all ephemeral e2e resources —
never add those to Terraform.

- State: R2 bucket `stelplaats-tfstate` (S3 backend; endpoint passed via
  `-backend-config` at init because backend blocks can't interpolate vars).
- Local validation only: `pnpm tf:init` (no backend) once, then `pnpm check`
  covers fmt+validate. Applies happen exclusively in the deploy pipeline.
- `custom_domain` defaults to `stelplaats.justwallage.nl`; everything on it is
  gated on `local.custom_domain_active`, which also needs `custom_domain_zone_id`
  (GHA secret `CUSTOM_DOMAIN_ZONE_ID`). Until that's set the app stays on
  workers.dev and no Access/HASS resources exist (docs/DOMAIN-MIGRATION.md).
- Provider is cloudflare 5.x: Access policies are inline on the application
  resource, config blocks use `=` map syntax.
