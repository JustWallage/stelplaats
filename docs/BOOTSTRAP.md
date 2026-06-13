# Bootstrap — one-time setup

Everything scriptable is in `scripts/bootstrap.sh`. The steps below are the
only truly manual ones. Do them once, in order.

## 1. Cloudflare API token (dashboard)

Cloudflare dashboard → My Profile → API Tokens → Create Token (custom):

- Account / Workers Scripts / Edit
- Account / D1 / Edit
- Account / Workers R2 Storage / Edit
- Account / Access: Apps and Policies / Edit
- Account / Access: Organizations, Identity Providers, and Groups / Edit

Copy the token → `CLOUDFLARE_API_TOKEN`.
Your account id (dashboard → Workers & Pages, right sidebar) → `CLOUDFLARE_ACCOUNT_ID`.
Your workers.dev subdomain (Workers & Pages → subdomain, or `wrangler whoami`) → `WORKERS_DEV_SUBDOMAIN`.

## 2. R2 S3 credentials for Terraform state (dashboard)

Dashboard → R2 → Manage R2 API Tokens → Create API Token (Object Read & Write,
scope: bucket `stelplaats-tfstate` — create the token after the bucket exists,
or scope account-wide). Copy:

- Access Key ID → `CLOUDFLARE_R2_ACCESS_KEY_ID`
- Secret Access Key → `CLOUDFLARE_R2_SECRET_ACCESS_KEY`

## 3. Google OAuth client (Google Cloud Console)

console.cloud.google.com → APIs & Services → Credentials → Create credentials →
OAuth client ID (Web application):

- Authorized redirect URI: `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/callback`
  (find the team domain under Zero Trust → Settings → Custom Pages; the same
  Google client used by jaw-finance's Access setup can be reused)

Copy client id/secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## 4. Run the bootstrap script

```sh
cp .bootstrap.env.example .bootstrap.env   # fill in values from steps 1–3
pnpm exec wrangler login
gh auth login
./scripts/bootstrap.sh
```

This creates the R2 state bucket, pushes all GitHub Actions secrets
(client-side encrypted by `gh`), scaffolds `.dev.vars`, and applies local
migrations. Re-running is safe.

## 5. First pipeline run

Push to `main` (or push a branch with `run-pipeline` in the commit title for a
no-deploy dry run). The pipeline terraform-applies the Cloudflare resources
(prod D1 + the Google IdP) and deploys to
`https://stelplaats.<subdomain>.workers.dev`.

## 6. Enable Access on the workers.dev URL (interim — manual, one-time)

Cloudflare Access can only be managed by Terraform once the app is on a custom
domain (a self-hosted Access app rejects a `workers.dev` hostname with "domain
does not belong to zone"). **Until the domain move, the deployed worker is
publicly reachable until you do this**, so do it before putting real data in:

1. Dashboard → Compute (Workers) → `stelplaats` → Settings → Domains & Routes →
   on the `*.workers.dev` route, **Enable Cloudflare Access**.
2. In the Access policy, choose the **Google** identity provider (the one
   Terraform created) and add an Allow policy including exactly
   `just@wallage.nl` and `suusraedts2018@gmail.com`.

Once the custom domain lands (next section), Terraform manages the Access
application end-to-end and this toggle can be removed.

## Later: custom domain

The move of `stelplaats.just.wallage.nl` is deliberately deferred —
see [DOMAIN-MIGRATION.md](DOMAIN-MIGRATION.md). Setting `custom_domain` makes
Terraform create the self-hosted Access app + Workers custom domain.
