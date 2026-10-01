---
paths:
  - "website/**"
  - "wrangler.jsonc"
---

# Website

The landing page under `website/` is a static site. Its deploy config is
`wrangler.jsonc` at the repo root: **Cloudflare Workers Builds**, no Worker
script, assets served straight from `./website`.

- **Trigger:** a merge to `main`. There is no deploy job in
  `.github/workflows/` — Workers Builds watches the GitHub repo itself, so the
  deploy is invisible to CI and to `release.yml`.
- **No build step on Cloudflare.** The page ships precompiled: edit
  `website/page/*.jsx`, run `npm run build:website`, and commit the regenerated
  `.js` in the same commit. A `.jsx` change without its `.js` deploys the old
  page.
- **Where to verify:** the Workers Builds history of the `arcforge` Worker
  (`wrangler.jsonc` `name`) in the Cloudflare dashboard — each build names the
  commit it deployed — then the live page itself: check the footer's `vX.Y.Z`
  label after a release.

What the repo cannot tell you: the production URL and the dashboard project
settings live in Cloudflare, not here. `wrangler.jsonc` fixes the platform and
the asset directory only. The PR that introduced the site (#21) called the
target Cloudflare Pages with an `arcforge.pages.dev` URL; the committed config
is Workers Builds, and that is the one to trust.
