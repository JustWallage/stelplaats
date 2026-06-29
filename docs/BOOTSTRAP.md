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

## Telegram bot (optional)

The bot sends a reminder at 07:00 Amsterdam time on the day a task's countdown
reaches zero. Its two credentials are **GitHub Actions secrets**; the deploy
pipeline installs them onto the production worker on every deploy (and skips the
bot when they are unset).

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`). Copy the
   HTTP API token and the bot's `@username`.
2. Put `TELEGRAM_BOT_USERNAME` (without the `@`) into `wrangler.jsonc` →
   `env.production.vars` so the app can build `t.me` deep links.
3. Set the two secrets (pick any random string for the webhook secret, e.g.
   `openssl rand -hex 32`). Either add them to `.bootstrap.env` and re-run
   `./scripts/bootstrap.sh`, or set them directly:

   ```sh
   gh secret set TELEGRAM_BOT_TOKEN
   gh secret set TELEGRAM_WEBHOOK_SECRET
   ```

   The next push to `main` deploys and installs them onto the worker, and
   registers the slash-command list from `worker/lib/bot-commands.json`.

4. Register the webhook with Telegram (uses the same secret so the worker can
   verify each call):

   ```sh
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d url="https://stelplaats.justwallage.nl/telegram/webhook" \
     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>"
   ```

   Until the custom domain lands, point `url` at the workers.dev host instead.
   The `/telegram/webhook` path is exposed past Cloudflare Access by a Terraform
   "bypass" Access app (it is still gated by the secret token in the worker).

5. Open the app's **Telegram** tab, tap **Generate connect link**, and send the
   bot `/start <code>` (or open the deep link). The 07:00 reminder cron is
   already configured in `wrangler.jsonc`.

## Later: custom domain

The move of `stelplaats.just.wallage.nl` is deliberately deferred —
see [DOMAIN-MIGRATION.md](DOMAIN-MIGRATION.md). Setting `custom_domain` makes
Terraform create the self-hosted Access app + Workers custom domain.
