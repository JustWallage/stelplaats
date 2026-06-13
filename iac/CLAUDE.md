# iac/

Terraform owns: prod D1, the Access application + Google IdP (the ONLY place
the allowed-emails list lives), and the deferred custom domain. Wrangler/CI
own: the worker itself, its secrets, migrations, and all ephemeral e2e
resources — never add those to Terraform.

- State: R2 bucket `stelplaats-tfstate` (S3 backend; endpoint passed via
  `-backend-config` at init because backend blocks can't interpolate vars).
- Local validation only: `pnpm tf:init` (no backend) once, then `pnpm check`
  covers fmt+validate. Applies happen exclusively in the deploy pipeline.
- `custom_domain` stays `null` until the wallage.nl DNS move
  (docs/DOMAIN-MIGRATION.md); flipping it also moves the Access app hostname.
- Provider is cloudflare 5.x: Access policies are inline on the application
  resource, config blocks use `=` map syntax.
