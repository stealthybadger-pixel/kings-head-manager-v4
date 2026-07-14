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

2. **Loop and Scrape:**
   - For each active ingredient, iterate through its defined `suppliers`.
   - If a supplier has a product page URL (or we can generate one), run the exact
     single-product scraper logic we just wrote to fetch its current price.
   - Skip/ignore items under the 'Meat' or 'Fish' categories (or any suppliers that don't
     have a valid product URL), since those local suppliers don't have online portal pricing
     anyway.

3. **Update Firestore:**
   - Write the fresh scraped price directly back to the ingredient's supplier options.
   - This will trigger the cascade that automatically updates our recipe costs and dish
     margins in the app.

Please write the script/orchestration layer to loop our single-product scraper across this
active ingredient list. Thanks!

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

**Product URL generation (step 2)**: `src/utils/supplierUrls.ts` `getSupplierUrl()` already
builds a product URL from `{ supplier, bookerProductCode, urbanProductId, name }`. As of
2026-07-15, linked supplier records now also store a `sourceUrl` (see `IngredientSupplierSchema`
in `src/types.ts`) — prefer that exact URL, fall back to `getSupplierUrl`.

**Update (step 3)**: write back into `ingredients/<id>.suppliers[]` (match by supplier name),
updating `packCost` (and `packSize`/`packUnit`/`unitPrice` if changed). Costing cascades
automatically in the app — no dish/recipe writes needed. Use the Admin SDK batched-write
pattern from `scripts/apply_*.mjs`. **Mind Firestore quota** (it was exhausted repeatedly on
2026-07-15) and back up before mass writes.

**Safety:** consider a dry-run mode that logs old→new prices and flags large swings (e.g. a
scrape that returns £0.00 or a >50% jump) for review before committing — the scrapers can grab
a wrong price on layout changes.
