# Session 2026-07-15, part 4 — Active-menu price-sync orchestrator (built, NOT yet tested live)

Continuation of the same day's earlier sessions (see `SESSION-2026-07-15.md`) and
`PROMPT-next-price-sync-orchestrator.md` (the original ask this builds on). Done on the
work laptop; picking up at home because that laptop hit an unrelated `npm`/`EPERM`
environment bug (see "Known blocker" below) before we could do a real end-to-end test.

## What shipped earlier today (already pushed, separate from this)
- Wastage entry's Bluetooth scale row was overflowing on mobile/tablet (Container/Tub +
  Read Scale pushed off-screen). Fixed in `src/components/Stock.tsx`: the row is now
  `flex flex-wrap` instead of a non-wrapping flex row, with `min-w-[140px]` on the
  Container/Tub select. Commit `d8cd439`, already on `main` and deployed live.

## What this session built (the price-sync orchestrator)
User's ask: automatically re-check prices for ingredients actually used on the live menu
(not the whole 3,515-item catalogue), skip Meat/Fish and rate-limit re-checks, and —
critically — make sure a price change actually cascades to Pantry/recipe/dish costing,
not just the flat catalogue collection. On-demand only (button click), not scheduled —
user was burned before by an over-eager full-catalogue scrape of Booker.

**Key discovery before building anything:** `scripts/reconcile_prices.ts` already existed
(the two root `.bat` files are just thin wrappers for its `scrape:login`/`scrape:check`/
`scrape:update` npm scripts) — but it only ever writes to the flat `supplierProducts`
catalogue collection, NEVER to `ingredients.suppliers[]`. So even for an ingredient's
preferred supplier, running it would silently leave Pantry/recipe/dish costs stale — same
bug class as the courgettes/aubergines issue from earlier today, just via a different code
path (a standalone Admin-SDK script rather than the `CatalogCaptureModal` UI flow).

### New files
- **`scripts/reconcile_active_menu_prices.ts`** — the actual new orchestrator.
  - Builds the active-ingredient set by mirroring `Stock.tsx`'s `menuIngredientIds` logic
    server-side: live dishes (`isLive === true`) → recipe items → sub-recipes (cycle-guarded)
    → ingredient IDs.
  - Filters out `Meat`/`Fish` category (local suppliers, no portal), suppliers not in
    `{Booker, Urban, David Catt}` (no online portal), missing/Google-fallback `sourceUrl`s,
    and anything checked within the last 48h (new `priceLastCheckedAt` field, see below).
  - Scrapes each remaining `supplier.sourceUrl` directly (reuses the same generic
    "largest visible £X.XX text" heuristic from `reconcile_prices.ts` — still fragile,
    not site-specific selectors, same caveat as before).
  - **On write**: re-reads the ingredient doc fresh (avoid clobbering concurrent edits),
    updates the matching `suppliers[]` entry's `packCost` + `priceLastCheckedAt` (+
    `priceUpdatedAt` only if the price actually changed) — this is the actual fix, the
    cascade `reconcile_prices.ts` never did. Also best-effort syncs the flat
    `supplierProducts` doc if one matches by `source` URL, for symmetry.
  - Flags (not blocks) large swings (>50%) and zero/not-found prices in its report for
    manual review, rather than silently trusting a scrape that might be wrong.
  - Dry-run by default; `--write` to actually apply. Same emulator-by-default Firebase
    Admin convention as `reconcile_prices.ts` (`FIRESTORE_EMULATOR_HOST` defaults to
    `localhost:8080` unless already set — **deliberately unset it to target real prod**,
    same as `apply_removals_to_prod.mjs`'s style. No `--prod` flag exists in this codebase;
    the emulator/prod switch is purely env-var presence).
  - New npm scripts: `scrape:menu-check` (dry run), `scrape:menu-update` (`--write`).

- **`scripts/priceSyncServer.mjs`** — tiny local-only Node HTTP server (no new deps,
  built-in `http` module) on port 5175. Exposes `GET /status` (checks `.auth/*.json`
  session files exist) and `POST /run?write=true|false` (spawns the orchestrator, returns
  full stdout/stderr + exit code once it finishes). Deliberately not deployed anywhere —
  only ever runs on a laptop you're sitting at. New npm script: `price-sync:server`.

- **Catalog page button** (`src/components/Catalog.tsx`): a manager-only **"Sync
  Active-Menu Prices"** button, gated behind `import.meta.env.DEV` so it only shows when
  running `npm run dev` locally (never on the live production build/site, since there's no
  price-sync server running there). Opens a modal that checks `/status`, then offers
  **Dry Run** / **Run & Apply Updates**, streaming the full text report back in a `<pre>`.

- **`scripts/start-dev-tools.sh`** + a Desktop shortcut (**"King's Head Dev Tools.command"**,
  Mac-only, made on the work laptop's Desktop — not part of the repo, would need
  recreating at home) — one double-click starts the Firestore emulator + price-sync
  server + `npm run dev` together, waits for the dev server, and auto-opens the browser.
  Closing the terminal window stops everything. To recreate at home: same script, just
  point a new `.command` file at wherever the repo lives there.

- **`scripts/seed_test_catalogue.mjs`** / **`scripts/seed_test_menu_data.mjs`** — pure
  test-data helpers for the local emulator (never touch prod): seed 7 real David Catt
  catalogue items (copied from the live Catalog page for realism), plus two fudged
  active-menu ingredients (Agar Agar seeded at £20.00 vs. real live ~£33.75; Agave Nectar
  at £15.00 vs. real ~£8.92) wired into a throwaway `isLive` test dish, specifically so a
  price-sync dry run has real discrepancies to detect. Delete these two ingredients/the
  test dish from the emulator (or just don't import this into anything real) once actual
  end-to-end testing is done — they're not meant to be permanent.

### Schema change
- `src/types.ts`: added `priceLastCheckedAt?: string` to `IngredientSupplierSchema` —
  distinct from the existing `priceUpdatedAt` (which only stamps on an actual price
  *change*). This new field stamps every time the orchestrator *checks*, whether or not
  the price moved, and is what the 48h rate-limit filter reads.

## Known blocker — NOT related to any of the above code
On the work laptop, `npm run scrape:login` (and plain `npm` in general) fails immediately
with:
```
Error: EPERM: process.cwd failed with error operation not permitted, uv_cwd
```
This is a macOS environment/permissions issue (Terminal likely lacking Files & Folders
access to the repo's parent folder under System Settings → Privacy & Security), not a bug
in this repo or any script above. `cd`-ing out and back in a fresh Terminal window, or
granting Terminal "Files and Folders" access to the relevant folder, are the next things
to try if it recurs — we ran out of time debugging it today. **This is why the orchestrator
has been built and typechecks clean, but has never actually been run against a real logged-in
wholesaler session** — the `scrape:login` step (which needs a real interactive browser login,
can't be done from an automated tool) never completed.

## Suggested next steps (pick up here)
1. Confirm `npm run scrape:login` works on the home machine (should be a non-issue there —
   this was a work-laptop-specific env problem).
2. Log in to at least David Catt (Fresho) when prompted — that's what the seeded test data
   above is set up to exercise.
3. Start the Firestore emulator (`firebase emulators:start --only firestore`, needs Java —
   `brew install openjdk` if not already present, and the keg-only PATH export it warns
   about), run `scripts/seed_test_catalogue.mjs` then `scripts/seed_test_menu_data.mjs` to
   get the same fudged test data.
4. `npm run dev`, log in (auto-bootstraps you as manager on first sign-in against an empty
   emulator — see `useAuth.tsx`), go to Catalog, click **Sync Active-Menu Prices** → **Dry
   Run** first. Should report Agar Agar and Agave Nectar as changed (real prices are
   higher than the fudged emulator values in both cases).
5. If the dry run looks right, try **Run & Apply Updates** and confirm the ingredient docs
   actually update in the Emulator UI (`http://127.0.0.1:4000/firestore`).
6. Once confident, this is still sitting entirely on a feature branch of behaviour that
   only activates in local dev (`import.meta.env.DEV` gate) — decide whether it's ready to
   just merge as-is (it's inert on production already) or wants more testing first.
7. Clean up the two seeded test ingredients / test dish from whichever emulator data you
   end up keeping around, so they don't linger as fake Pantry items.
