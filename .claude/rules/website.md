---
paths:
  - "website/**"
  - "wrangler.jsonc"
---

# Website

The landing page under `website/` is a static site. Its deploy config is
`wrangler.jsonc` at the repo root: **Cloudflare Workers Builds**, no Worker
script, assets served straight from `./website`.

- **Trigger:** every push. Workers Builds watches the GitHub repo itself — there
  is no deploy job in `.github/workflows/` — and reports back as the
  `Workers Builds: arcforge` check run on each commit, PR branches included. A
  branch push builds a preview (`<branch>-arcforge.greghojob.workers.dev`, and a
  per-commit URL, both linked from the Cloudflare bot's PR comment); a push to
  `main` builds production. Observed on 2026-10-01: the check run on the
  `v6.1.1` release commit on `main` succeeded, and the production page served
  the `v6.1.1` footer afterwards.
- **No build step on Cloudflare.** The page ships precompiled: edit
  `website/page/*.jsx`, run `npm run build:website`, and commit the regenerated
  `.js` in the same commit. A `.jsx` change without its `.js` deploys the old
  page.
- **Where to verify:** the Workers Builds history of the `arcforge` Worker
  (`wrangler.jsonc` `name`) in the Cloudflare dashboard — each build names the
  commit it deployed — then the live page itself: check the footer's `vX.Y.Z`
  label after a release.

- **Production URL:** `https://arcforge.greghojob.workers.dev/` (the Worker's
  default `workers.dev` hostname; the footer `vX.Y.Z` label there is the
  release check).

What the repo cannot tell you: the dashboard project settings (build command,
branch rules, custom domains) live in Cloudflare, not here. `wrangler.jsonc`
fixes the platform and the asset directory only; the trigger and the URL above
are observed behavior, not committed configuration. The PR that introduced the
site (#21) called the target Cloudflare Pages with an `arcforge.pages.dev` URL;
the committed config is Workers Builds, and that is the one to trust.
