# Next task (saved 2026-07-15): Active-menu price-sync orchestrator

## The prompt

Now that we have successfully written the single-product scraper that checks a specific
product URL and extracts its details for a one-click live check, let's automate it.

We want to build a loop/orchestrator around this scraper logic to automatically sync prices
across our entire active menu:

1. **Extract Active Menu Ingredients:**
   - Query our Firestore database to find all active `dishes`.
   - Resolve the `recipes` used by those active dishes.
   - Collect the list of unique `ingredientId`s currently in use.
   - Query the `ingredients` collection to get those active items.

2. **Loop and Scrape (with Filters):**
   - For each active ingredient, iterate through its defined `suppliers`.
   - Skip/Ignore the item if:
     - It falls under 'Meat' or 'Fish' categories (local suppliers without online portals).
     - It does not have a valid supplier product URL.
     - The price was recently checked (e.g., if `priceLastCheckedAt` is within the last 24 or
       48 hours, skip it to prevent spamming the wholesaler's site).
   - For items that pass the filters, run our single-product scraper logic on the URL.

3. **Update Firestore:**
   - Save the fresh price back to the ingredient's supplier options.
   - Set the `priceLastCheckedAt` timestamp to the current date/time.
   - This will trigger the cascade that automatically updates our recipe costs and dish
     margins in the app.

Please write the script/orchestration layer to loop our single-product scraper across this
filtered active ingredient list. Thanks!

---

## Context for whoever picks this up (notes from the 2026-07-15 session)

The "single-product scraper logic" referred to lives in the **Chrome extension** content
scripts, which run **in the browser DOM** of an authenticated wholesaler session:
- `extension/content-scripts/booker.js` — `khkmScrapeBooker()`
- `extension/content-scripts/fresho.js` — `khkmScrapeFresho()` (David Catt, Ember SPA)
- `extension/content-scripts/urban.js`  — `khkmScrapeUrban()` (Angular SPA)

Each returns `{ supplier, name, packCost, packSizeText, productCode, sourceUrl }`.

**Key architectural constraint to resolve first (design decision before coding):** these
scrapers depend on the browser DOM *and a logged-in wholesaler session*. Booker/Urban/Fresho
all require authentication and are heavily client-rendered SPAs, so a plain Node `fetch` +
Cheerio will NOT work — there's no logged-in session and no rendered DOM. Realistic options:
  - **(a) Headless browser with saved auth** (Playwright/Puppeteer, reusing a persisted login
    storageState per wholesaler) driving the same scrape functions page-by-page. Most faithful
    to "the exact scraper logic we just wrote," but needs credential/session handling — there's
    already a `scrape:login` / `scrape:update` batch flow (`1. Login to Wholesalers.bat`,
    `2. Update Wholesaler Prices.bat`) that may already establish sessions; check
    `scripts/` for the existing scraper harness before building a new one.
  - **(b) Extend the extension** to batch-visit the active-ingredient product URLs in the
    user's already-authenticated browser and post results back — keeps auth "for free" but is
    a bigger extension change.
  Pick the approach with the user before writing the orchestrator.

**Building the active-ingredient set (step 1)** is the straightforward, provider-agnostic part
and can reuse existing helpers:
  - Active dishes: `dishes` where `isLive === true`.
  - `src/components/Stock.tsx` already has `collectIngredientIds(items, allRecipes)` that
    recursively walks recipe items + sub-recipes to gather ingredient IDs — mirror that logic.
  - The `menuIngredientIds` memo in Stock.tsx is exactly this cascade (live dishes → recipes →
    sub-recipes → ingredient IDs); reuse the shape.

**Filters (step 2):**
  - Skip ingredients whose `category` is `Meat` or `Fish` (local suppliers, no online portal).
  - Skip suppliers with no usable product URL (see URL note below).
  - Skip if `priceLastCheckedAt` is within the last 24–48h (rate-limit the wholesaler). NOTE:
    `priceLastCheckedAt` is a NEW field — add it (per-supplier is more precise than
    per-ingredient, since an ingredient can have several suppliers). If per-supplier, extend
    `IngredientSupplierSchema` in `src/types.ts` with an optional `priceLastCheckedAt?: string`
    (ISO string — the app stores timestamps as ISO strings, NOT Firestore Timestamps).

**Product URL (step 2/3)**: `src/utils/supplierUrls.ts` `getSupplierUrl()` builds a product
URL from `{ supplier, bookerProductCode, urbanProductId, name }`. As of 2026-07-15, linked
supplier records also store `sourceUrl` (see `IngredientSupplierSchema`). Prefer the exact
`sourceUrl`; a `getSupplierUrl` result that's only a Google-search fallback is NOT a "valid
product URL" for scraping — treat those as skip.

**Update (step 3)**: write back into `ingredients/<id>.suppliers[]` (match by supplier name),
updating `packCost` (+ `packSize`/`packUnit`/`unitPrice` if changed) and set
`priceLastCheckedAt`. Costing cascades automatically in the app — no dish/recipe writes needed.
Use the Admin SDK batched-write pattern from `scripts/apply_*.mjs`. **Mind Firestore quota**
(exhausted repeatedly on 2026-07-15) and back up before mass writes.

**Safety:** include a dry-run mode that logs old→new prices and flags large swings (e.g. a
scrape returning £0.00, or a >50% jump) for review before committing — the scrapers can grab a
wrong price if a site's layout changes.
