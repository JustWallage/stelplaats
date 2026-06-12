# Domain migration — stelplaats.just.wallage.nl (deferred)

## Why deferred

Workers custom domains require the zone to live in the Cloudflare account.
`just.wallage.nl` is a Route53 hosted zone (repo `../just-wallage-nl`), and
Cloudflare subdomain zones are Enterprise-only — so the whole registrable
domain `wallage.nl` must move. Until then production runs on
`stelplaats.<account>.workers.dev` (still behind Cloudflare Access).

## Migration steps

1. **Add the zone**: Cloudflare dashboard → Add site → `wallage.nl` (Free plan).
   Cloudflare imports most DNS records automatically — verify against the
   current authoritative records and add anything missed (MX, TXT/SPF/DKIM,
   the NS delegation for `just.wallage.nl` becomes obsolete, and the existing
   `finance`/`iglympics`/`contexts` CNAMEs to `*.pages.dev` must exist as
   proxied records).
2. **Switch nameservers**: dad updates the `wallage.nl` nameservers at the
   registrar to the two assigned Cloudflare nameservers. Wait for activation
   (the zone shows Active; DNS propagation up to 24h).
3. **Verify the sibling apps**: finance.just.wallage.nl and
   iglympics.just.wallage.nl must still resolve and serve (Pages custom
   domains re-validate automatically on Cloudflare DNS).
4. **Flip Terraform**: set in the deploy pipeline / tfvars:
   - `custom_domain = "stelplaats.just.wallage.nl"`
   - `custom_domain_zone_id = <wallage.nl zone id>`
     Apply. This creates the Workers custom domain (DNS + cert are managed by
     Cloudflare) and moves the Access application to the new hostname.
5. **Retire `../just-wallage-nl`**: the Route53 zone is no longer
   authoritative. Archive the repo (or convert it to manage the Cloudflare
   zone records with the Cloudflare provider, which is recommended so DNS
   stays in code).

## Rollback

Set `custom_domain` back to `null` and apply: the app and Access revert to the
workers.dev hostname. Nameserver rollback at the registrar restores Route53.
