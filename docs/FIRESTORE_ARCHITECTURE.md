# Firestore Architecture

Authoritative reference for how King's Head Manager v4 uses Firestore: collections, React Query caching, mutation strategy, and the read-optimisation work done to date. Written for a developer joining the project with no prior context.

**Last updated:** 2026-07-16, after Firestore Optimisation Phase 1 (Dashboard) and Phase 2 (cache patching).

---

## Section 1 — Firestore Collections

| Collection | Purpose | Approx. doc count | Growth rate | Primary pages/components | Write frequency | Read frequency | Pagination | Aggregation | Offline cache | Lazy loading |
|---|---|---|---|---|---|---|---|---|---|---|
| `ingredients` | Master pantry record — raw ingredients with cost, stock level, allergens, waste % | Not measured this session; single-site pub, likely tens to low hundreds | Slow — grows only as new raw ingredients are added to the pantry | Pantry, Kitchen, Service, Stock, FrontOfHouse, InvoiceScanner, Catalog, CatalogCaptureModal, FoodTempChecks | Low-moderate (manager edits) | High — read on nearly every screen | Not needed at current scale | Yes, for Dashboard's count tile (implemented, Phase 1) | Would help (rarely changes intra-session) | Not needed at current scale |
| `recipes` | Mid-tier prep recipes (built from ingredients, feed into dishes) | Tens to low hundreds (est.) | Slow | Kitchen, Service, Stock, FrontOfHouse, PrepList, FoodTempChecks | Low-moderate | High | Not needed | Yes (Dashboard count, Phase 1) | Would help | Not needed |
| `dishes` | Menu dishes (built from recipes/ingredients, the sellable item) | Tens to low hundreds (est.) | Slow | Pantry (Auditor), Kitchen, Service, Stock, FrontOfHouse, PrepList, FoodTempChecks | Low-moderate | High | Not needed | Yes (Dashboard count, Phase 1) | Would help | Not needed |
| `container_profiles` | Tare-weight profiles for the Bluetooth scale workflow | Small | Very slow | **None — dead code.** `useContainerProfiles()` is defined but has zero callers anywhere in `src/`. Stock.tsx uses a separate local `CONTAINER_PROFILES` constant instead. | None observed | None observed | n/a | n/a | n/a | n/a |
| `suppliers` | Supplier directory (name, contact, ordering links) | Single digits to tens | Very slow | Pantry, Catalog, Suppliers | Low | Moderate | Not needed | Not needed | Would help | Not needed |
| `supplierProducts` | Full wholesaler catalogue (scraped/imported line items: name, pack size, cost) | **~3,500+** (only collection with a measured order of magnitude this session) | Fast — refreshed by price-sync/scrape tooling, largest and fastest-growing collection in the app | Catalog (full browse), Pantry (single-ingredient prefix lookup), CatalogCaptureModal | High when a price-sync/import runs | High | **Strong candidate** — Catalog's full browse is the main remaining unbounded read | Not currently used, but a `count()` would suit a "N products in catalogue" stat if ever needed | Would help significantly given size | **Strong candidate** — already partially addressed via `useSupplierProductsForIngredient`'s prefix-range query (Phase 2 follow-up) |
| `equipment` | Floor-plan equipment boxes (fridges/freezers) — position, name, temp range | Single digits to tens | Very slow | EquipmentTempChecks | Very low (layout edits) | Moderate | Not needed | Not needed | Would help | Not needed |
| `stock_movements` | Ledger of stock changes — waste, goods-in, stocktake adjustments | Grows with every logged movement — likely the fastest-growing operational collection after `supplierProducts` | Fast — every waste/goods-in/stocktake-adjustment entry, one of the highest-frequency writes in the app | Stock (Wastage History, only `type='waste'` is actually queried anywhere) | Very high | Moderate (only the `'waste'`-filtered view is read anywhere today) | **Strong candidate** — unbounded growth, no date-range query exists yet | Not currently used | Not critical (short `staleTime`) | Could add a date-range window instead of loading full history |
| `stocktake_reports` | Finalised stock-take/snapshot reports | Grows with every committed stock take | Slow-moderate — one report per stock take session | Stock (Reports tab — browse-all, merge UI) | Low-moderate | Moderate | **Candidate over a long time horizon** — currently small enough to leave alone | Not needed | Would help | Not needed at current scale |
| `stocktake_drafts` | Single in-progress, pausable stock-take draft, shared across devices | Exactly 1 document (`id: 'current'`) | None — fixed-size | Stock (Stock Take modal) | Low, but deliberately **not** cached long (`staleTime: 0`) for cross-device correctness | Low | n/a (single doc) | n/a | **Deliberately avoided** — offline cache would defeat the cross-device "resume elsewhere" design | n/a |
| `food_temp_checks` | HACCP food temperature check log | Grows daily, unbounded | Fast — multiple checks logged per day, every day, forever | FoodTempChecks (today only), TempCheckRecords (full history), Stock (today only, for the compliance print/email report) | High | High | **Strong candidate** — `history` is a genuinely unbounded full-collection read | Not currently used | Not critical (short `staleTime`) | Best-suited to a date-range window rather than "load everything" |
| `equipment_temp_checks` | HACCP equipment (fridge/freezer) temperature check log | Grows daily, unbounded | Fast — same pattern as food checks | EquipmentTempChecks (today only), TempCheckRecords (full history), Stock (today only) | High | High | **Strong candidate**, same reasoning as `food_temp_checks` | Not currently used | Not critical | Same as `food_temp_checks` |
| `users` | Staff/manager account profiles (email, display name, role) | Single digits (team size) | Very slow | Team, useAuth (own-profile bootstrap/lookup) | Very low | Low-moderate (once per login + Team screen) | Not needed | Not needed | Would help | Not needed |

**Note on document counts:** only `supplierProducts` has a figure established through direct observation earlier in this project's work (~3,500+ docs). All other counts above are stated as estimates for a single-site pub, not measured production figures — flagged as such rather than presented as fact.

---

## Section 2 — React Query

Global defaults (`src/main.tsx`): `staleTime: 5 minutes`, `refetchOnWindowFocus: false`. Per-query overrides below are listed only where they differ from these defaults.

| Query Key | Hook | Collection | Page(s) | Query Type | staleTime | gcTime | Refetch strategy | Invalidation strategy |
|---|---|---|---|---|---|---|---|---|
| `['ingredients']` | `useIngredients` | ingredients | Pantry, Kitchen, Service, Stock, FrontOfHouse, InvoiceScanner, Catalog, CatalogCaptureModal, FoodTempChecks | `getDocs` (full collection) | 5 min (default) | default | default (refetch on mount if stale) | Cache-patched on add/update/delete (Phase 2) |
| `['recipes']` | `useRecipes` | recipes | Kitchen, Service, Stock, FrontOfHouse, PrepList, FoodTempChecks | `getDocs` | default | default | default | Cache-patched on add/update/delete |
| `['dishes']` | `useDishes` | dishes | Pantry, Kitchen, Service, Stock, FrontOfHouse, PrepList, FoodTempChecks | `getDocs` | default | default | default | Cache-patched on add/update/delete |
| `['container_profiles']` | `useContainerProfiles` | container_profiles | **None — dead code, zero callers** | `getDocs` | default | default | default | n/a |
| `['ingredients_count']` | `useIngredientsCount` | ingredients | Dashboard | `getCountFromServer` (aggregate) | 30 min | 1 hr | `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `refetchOnMount` default (catches up next mount after an invalidation) | `invalidateQueries` on add/delete only (not update) |
| `['recipes_count']` | `useRecipesCount` | recipes | Dashboard | `getCountFromServer` | 30 min | 1 hr | same as above | `invalidateQueries` on add/delete only |
| `['dishes_count']` | `useDishesCount` | dishes | Dashboard | `getCountFromServer` | 30 min | 1 hr | same as above | `invalidateQueries` on add/delete only |
| `['stock_movements', type]` (only `'waste'` has a real caller) | `useStockMovements(type)` | stock_movements | Stock (Wastage History) | `query()` + `getDocs` (`where('type','==',type)` when a type is passed) | 1 min | default | default | Precisely prepended on log (Phase 2) — not invalidated |
| `['stocktake_reports']` | `useStocktakeReports` | stocktake_reports | Stock (Reports tab) | `getDocs` (full collection) | 1 min | default | default | Prepended on `saveReport`; `invalidateQueries` retained on `mergeReports` |
| `['stocktake_draft']` | `useStocktakeDraft` | stocktake_drafts | Stock (Stock Take modal) | `getDoc` (single doc) | **0** (always stale) | default | default (refetches every mount) | `invalidateQueries` retained deliberately (cross-device correctness) |
| `['supplier_products_all']` | `useSupplierProducts` | supplierProducts | Catalog, useCatalogCapture | `getDocs` (full collection, ~3,500+ docs) | 5 min | default | default | Cache-patched on add/update/delete/bulkDelete |
| `['supplier_products_prefix', firstWord]` | `useSupplierProductsForIngredient` | supplierProducts | Pantry (catalogue suggestions panel) | `query()` + `getDocs` (prefix-range `where` on first word, `limit(200)`) | 5 min | default | `enabled` only when a word is present | `invalidateQueries` on any supplierProduct add/update/delete |
| `['supplier_search', term, supplier]` | `useSupplierSearchQuery` | supplierProducts | **None — zero callers, dead code** | `query()` + `getDocs` (prefix-range) | 5 min | default | `enabled` at 2+ chars | `invalidateQueries` on any supplierProduct add/update/delete |
| `['supplier_browse', supplier]` | `useSupplierProductsBySupplier` | supplierProducts | **None — zero callers, dead code** | `query()` + `getDocs` (`where('supplier','==',...)`) | 5 min | default | `enabled` unless `supplier==='All'` | `invalidateQueries` on any supplierProduct add/update/delete |
| `['suppliers']` | `useSuppliers` | suppliers | Pantry, Catalog, Suppliers | `getDocs` | default | default | default | Cache-patched on add/update/delete |
| `['food_temp_checks', checkDate]` | `useFoodTempChecksToday` | food_temp_checks | FoodTempChecks, Stock (compliance report) | `query()` + `getDocs` (`where('checkDate','==',today)`) | 30 sec | default | default | Appended on `recordCheck` |
| `['food_temp_checks', 'history']` | `useFoodTempChecksHistory` | food_temp_checks | TempCheckRecords | `getDocs` (full collection) | 1 min | default | default | Prepended on `recordCheck` |
| `['equipment']` | `useEquipmentList` | equipment | EquipmentTempChecks | `getDocs` | default | default | default | Cache-patched on add/update/delete |
| `['equipment_temp_checks', checkDate]` | `useEquipmentChecksToday` | equipment_temp_checks | Stock (compliance report), EquipmentTempChecks | `query()` + `getDocs` (`where('checkDate','==',today)`) | 30 sec | default | default | Appended on `recordCheck` |
| `['equipment_temp_checks', 'history']` | `useEquipmentChecksHistory` | equipment_temp_checks | TempCheckRecords | `getDocs` (full collection) | 1 min | default | default | Prepended on `recordCheck` |
| `['users']` | inline `useQuery` in `Team.tsx` (not in `useKitchenData.ts`) | users | Team | `getDocs` | default | default | default | Cache-patched (appended) on add |

---

## Section 3 — Mutation Strategy

| Mutation | Collection written | Cache update strategy | Why |
|---|---|---|---|
| Add ingredient/recipe/dish/supplier/equipment/supplierProduct | respective collection | `append` to the relevant array cache | The mutation already returns the complete new document (with server-confirmed `id`); appending avoids a full re-read to learn something already known |
| Update ingredient/recipe/dish/supplier/equipment | respective collection | `patch` (via shared `patchArrayItem` helper, built from `buildPatch()`) | The exact same payload written to Firestore is reused for the cache patch (single source of truth — write and cache patch cannot drift apart) |
| Update supplierProduct | supplierProducts | `patch` on `['supplier_products_all']` only; derived filtered caches (`supplier_search`, `supplier_browse`, `supplier_products_prefix`) still `invalidateQueries` | Whether a product belongs in a *filtered* view can change on rename (e.g. moves out of a cached prefix match) — no safe way to patch every possible filtered variant, so those stay on invalidate |
| Delete ingredient/recipe/dish/supplier/equipment/supplierProduct | respective collection | `remove` from the array cache, using the mutation's own `id` argument | No second read needed — the deleted id is already known from the call site |
| Add ingredient/recipe/dish | ingredients/recipes/dishes | `ingredients_count`/etc. still uses `invalidateQueries` (not a client `+1`) | Server aggregate `count()`; a local increment risks drifting if two people add from different devices near-simultaneously — invalidate-and-refetch stays exactly correct |
| `logMovement` (waste/goods-in/stock-take log) | stock_movements | `prepend` to `['stock_movements', <its type>]` and `['stock_movements','all']` if either is cached | Movements sort newest-first by date, and a new movement's date is always "today" — safe to prepend without a full re-sort. The mutation's former `invalidateQueries(['ingredients'])`/`(['recipes'])` calls were removed entirely (not converted) — traced the write path and confirmed this mutation never touches ingredient/recipe documents, and no Cloud Function exists in this project to do it server-side either, so those invalidations were pure waste |
| `saveReport` (Stock Take commit) | stocktake_reports | `prepend` | Reports sort newest-date-first and a freshly saved report's date is always "today" |
| `mergeReports` | stocktake_reports | `invalidateQueries` (retained) | Multi-document batch (1 create + N deletes), rare/manual, and the merged report's date isn't guaranteed to be the newest — a precise patch could misplace it in sort order, so correctness wins over the read saving |
| `saveDraft` / `clearDraft` | stocktake_drafts | `invalidateQueries` (retained) | Deliberately built for cross-device resume at `staleTime: 0`; a local optimistic patch could show a device its own stale write even after another device's write has superseded it server-side |
| `recordCheck` (food/equipment temp checks) | food_temp_checks / equipment_temp_checks | `append` to the "today" cache, `prepend` to the "history" cache | "Today" isn't sorted (natural Firestore order), so append matches; "history" sorts newest-first, so prepend keeps it correct without a re-sort |
| Add user (Team.tsx) | users | `append` | Same reasoning as other adds — the new user object is already fully known client-side |

---

## Section 4 — Dashboard

The Dashboard (`src/components/Dashboard.tsx`) was rewritten in Firestore Optimisation Phase 1 from 436 lines down to 117. It renders exactly three stat tiles (Pantry ingredient count, recipe count, menu dish count) plus three pure-navigation Quick Access tiles (Food Temps, Fridge Temps, Wastage — zero reads, just `setView()` calls).

- **Count aggregation queries:** `useIngredientsCount`/`useRecipesCount`/`useDishesCount` each call Firestore's `getCountFromServer()` — a server-side aggregate that returns only a number, billed as a small fraction of a full collection read regardless of how large the collection is. This replaced downloading the entire `ingredients`/`recipes`/`dishes` collections just to read `.length`.
- **Why `supplierProducts` is no longer loaded:** the old Dashboard had a "Catalogue Freshness" tile backed by `useAllSupplierProducts()`, which downloaded the same ~3,500+-doc collection Catalog.tsx already fetches under a different query key — a duplicate full-collection read on every Dashboard visit for a feature that was ultimately just a staleness indicator. Removed entirely in Phase 1's Task 2/4 (the tile, the hook, and the duplicate read all went together); confirmed zero remaining callers before deletion.
- **Why `scrapeLog` (`useScrapeLogs`) was removed:** confirmed zero callers anywhere in the codebase before deletion — dead code that was still being fetched on every Dashboard load for no consumer.
- **Cache strategy:** the three count queries use a much longer `staleTime` (30 min) and `gcTime` (1 hr) than the app's 5-minute default, since a document count only changes on add/delete, never on an in-place edit. `refetchOnWindowFocus`/`refetchOnReconnect` are disabled for the same reason. `refetchOnMount` is deliberately left at its default rather than disabled — an add/delete that invalidates a count almost always happens on a *different* screen (e.g. adding an ingredient from Pantry), so Dashboard has no active observer at invalidation time; `invalidateQueries` can only mark it stale, not refetch something nobody's watching, and `refetchOnMount: true` is what lets the *next* Dashboard visit catch up. (This was found to matter through live testing, not code review — an earlier attempt with `refetchOnMount: false` left the Dashboard showing a stale count after adding an ingredient elsewhere and navigating back without a full reload.)
- **Why `count()` was chosen instead of summary documents:** a `dashboard_summary` document would require either a Cloud Function (this project has none provisioned — no `functions/` directory, no `functions` key in `firebase.json`) or fragile client-side increment/decrement logic prone to drift across concurrent devices. `count()` needed neither — it's a built-in Firestore feature, correct by construction, and already cheap enough for a 3-tile dashboard. See Section 7 for when a summary document would actually earn its keep.

---

## Section 5 — Collection Relationships

```
Supplier Products (supplierProducts)
        │  (manual "suggested match" or manual entry — no automatic sync)
        ▼
Pantry Ingredients (ingredients)
        │  (referenced by id in RecipeItem entries)
        ▼
Recipes (recipes)
        │  (referenced by id, and ingredients can be referenced directly too)
        ▼
Menu Dishes (dishes)
        │
        ├──────────────► Stock (stock_movements, stocktake_reports, stocktake_drafts)
        │                 — ingredients/recipes are counted directly in stocktakes;
        │                   dishes determine which ingredients/recipes are "menu-relevant"
        │
        └──────────────► Service / FrontOfHouse
                          — dishes are what gets sold and displayed on the allergen board
```

**How data actually flows:**
- `supplierProducts` and `ingredients` are **not automatically linked**. A supplier product becomes an ingredient's supplier/pricing option only when a manager manually accepts a suggested catalogue match (Pantry) or a manual entry (Catalog/CatalogCaptureModal) — there's no write-time trigger keeping them in sync.
- `recipes` reference `ingredients` (and can reference other `recipes` for nested prep) by id inside `RecipeItem` entries. Costing (`calculateIngredientCost`/`calculatePlateCost` in `utils/costing.ts`) walks this graph at read time — nothing is denormalized or pre-computed and stored.
- `dishes` reference `recipes`/`ingredients` the same way, forming the top of the costing tree.
- `stock_movements` reference an ingredient or recipe by id (`ingredientId` xor `recipeId`, enforced by a Zod `.refine()`) but never write back to the ingredient/recipe document — they're a pure ledger. The ingredient/recipe's own `stockLevel` field is a separate, independently-written field, only touched by Stock Take's explicit `updateIngredient`/`updateRecipe` calls.
- `stocktake_reports`/`stocktake_drafts` are point-in-time snapshots of counted ingredient/recipe quantities — again, no live reference back to the source documents once saved.
- `food_temp_checks`/`equipment_temp_checks` are independent compliance logs; they reference dishes/equipment by name/id for display but don't feed back into any other collection.
- `users` stands alone — referenced only by `uid` from Firebase Auth, unrelated to the operational data graph above.

There is **no server-side propagation** anywhere in this graph — every relationship is resolved client-side, at read time, by looking up ids in already-fetched arrays (`ingMap`, `recMap`, etc. built via `useMemo`). This is why so many pages need the *full* `ingredients`/`recipes`/`dishes` collections: the lookups they perform (allergen resolution, cost calculation, "used in N dishes" badges) require arbitrary-id access across the whole set, not just currently-visible rows.

---

## Section 6 — Read Optimisation History

### Phase 1 — Dashboard simplification

- Removed the **Catalogue Freshness** tile and its backing `useAllSupplierProducts()` hook — a duplicate full read of the ~3,500+-doc `supplierProducts` collection that Catalog.tsx already fetched separately.
- Removed the **Smart Stock Flags** tile (`anomalies`, `stockItemsData`, `getStockValue`, `getStockWeightKg`, `supplierStaleness`) and the audit%/GP% sub-stats — all required full-collection scans purely to compute Dashboard-only derived numbers.
- Removed the **`scrapeLog`** query (`useScrapeLogs`) — confirmed zero callers anywhere before deletion.
- Removed the **duplicate `supplierProducts`** Dashboard read (see above — same root cause as Catalogue Freshness).
- **Added `count()` aggregation queries** (`useIngredientsCount`/`useRecipesCount`/`useDishesCount`) to replace full `getDocs()` downloads of `ingredients`/`recipes`/`dishes` with server-side aggregate counts.

**Estimated read reduction:** Dashboard went from downloading the *entire* `ingredients` + `recipes` + `dishes` + `supplierProducts` collections (4 full collection reads, including the ~3,500+-doc catalogue) on every visit, to 3 lightweight `count()` aggregates with a 30-minute `staleTime` — from "4 full collections per visit" to "3 aggregate reads, most visits served entirely from cache."

### Phase 2 — Smart cache & query optimisation

- **Cache patching:** replaced full-collection `invalidateQueries()` refetches with direct, synchronous cache writes (`setQueryData`) for every single-document mutation across ingredients, recipes, dishes, suppliers, equipment, and the canonical supplierProducts list.
- **append/remove strategy:** creates append the mutation's own returned document to the cached array (or prepend, where the array is sorted newest-first); deletes remove by the id already known from the mutation call — neither needs a second network round-trip.
- **Retained `invalidateQueries()`:** kept deliberately for `ingredients_count`/`recipes_count`/`dishes_count` (server aggregate, correctness under concurrent multi-device adds), `mergeReports` (multi-document batch, ambiguous sort position), `stocktake_draft` (cross-device resume at `staleTime: 0`), and the derived supplierProducts filter caches (`supplier_search`/`supplier_browse`/`supplier_products_prefix` — filter membership can change on edit, no safe way to patch every cached variant).
- **Removal of unnecessary `logMovement` invalidations:** traced the write path and confirmed `logMovement` never touches the `ingredients` or `recipes` documents (only `stock_movements`); its `invalidateQueries(['ingredients'])`/`(['recipes'])` calls were refetching full collections for data that never changed, on every single waste/goods-in log entry — the highest-frequency mutation in the app. Removed outright (not converted to a patch, since there was nothing to patch).
- Also fixed two pre-existing bugs surfaced by this audit: a dead invalidation of `['all_supplier_products_summary']` (no hook has used that key since Phase 1), and a missing invalidation of `['supplier_products_prefix']` (Pantry's catalogue lookup wasn't being refreshed on supplierProduct edits).

**Estimated read reduction:** 37 `invalidateQueries()` calls audited; 23 converted to direct cache patches, 3 removed outright as unnecessary, 11 retained deliberately for correctness (plus 1 newly added as a bug fix). Every single-document ingredient/recipe/dish/supplier/equipment edit now costs 0 full-collection reads instead of 1; every waste/goods-in log entry now costs 0 unrelated full-collection reads instead of 2. Verified behaviourally (not just by inspection) against the Firestore emulator: ingredient add/update/delete and waste logging all reflect instantly in the UI with no extra network read, and all writes persist correctly after a full page reload.

---

## Section 7 — Future Optimisation Opportunities

*Ideas only — none of these are implemented.*

| Idea | Expected benefit | Complexity | Priority |
|---|---|---|---|
| Pagination or a date-range window for `stock_movements`, `food_temp_checks`, `equipment_temp_checks` history views | Bounds reads on collections that grow forever — currently a full download regardless of age | Medium — needs a date-range `where()` plus a "load more" UI pattern | High, once any of these collections gets large enough to notice load time (not urgent today) |
| Lazy-loading / windowing `supplierProducts` in Catalog.tsx | Catalog's full browse is the largest remaining unbounded read (~3,500+ docs every visit) | Medium-high — needs pagination or virtualization plus a way to keep "find a specific product" search working across pages | Medium — worth doing before the catalogue grows much further |
| Deriving `supplier_products_prefix`/`supplier_search`/`supplier_browse` from an already-cached `supplier_products_all` when available, instead of always issuing a fresh Firestore query | Avoids a redundant read when the full catalogue is already in memory (e.g. user visited Catalog then Pantry in the same session) | Medium — requires conditionally skipping the network call based on another query's cache state, real risk of staleness bugs if done carelessly | Low-medium — flagged in Phase 2's Task 7, not attempted, since it changes fetch strategy structurally |
| Offline IndexedDB cache (Firestore's built-in persistence) | Would let already-fetched `ingredients`/`recipes`/`dishes`/`suppliers` survive a reload without a network round-trip at all | Low to enable (`enableIndexedDbPersistence`), but needs care around the multi-tab and cross-device-resume flows (`stocktake_draft` in particular deliberately avoids any caching for correctness) | Medium |
| Cloud Functions | Needed for genuinely server-side maintained data — e.g. a `dashboard_summary` doc, or auto-syncing `stockLevel` from `stock_movements` instead of the current manual `updateIngredient`/`updateRecipe` calls | High — this project has no Cloud Functions today (no `functions/` dir, no `functions` key in `firebase.json`, Blaze plan required) | Low today; would become High if the app needs guaranteed server-side consistency across devices |
| Dashboard summary document | Only useful if the Dashboard regains derived stats beyond simple counts (total stock value, GP%, low-stock flags) — for those, no `count()`/`where()` trick substitutes for a real sum/calculation | Medium (schema) + High (needs Cloud Functions to stay correct without client-side drift risk) | Low — explicitly deferred in Phase 2's Task 8 proposal until/unless those metrics return |

---

## Section 8 — Architecture Decisions

**Why aggregate `count()` queries.** Firestore's `getCountFromServer()` is a built-in, server-computed aggregate billed as a small fraction of a full collection read, correct by construction (no client-side arithmetic to get wrong), and requires zero new infrastructure. It was chosen over a maintained summary document specifically because this project has no Cloud Functions — a summary doc without server-side maintenance would need fragile client-side increment/decrement logic that can drift under concurrent multi-device writes, which `count()` avoids entirely.

**Why React Query (TanStack Query) caching.** It was already the app's sole data-fetching layer before this optimisation work began. Its `queryKey`-based shared cache means multiple components requesting the same data (e.g. `['ingredients']` from Pantry, Kitchen, and Stock simultaneously) share one fetch and one cache entry rather than each issuing their own read — this de-duplication was already doing significant work before any of the Phase 1/2 changes, and all of this session's optimisation builds on top of it rather than replacing it.

**Why client-side cache patching (`setQueryData`) over `invalidateQueries()`.** `invalidateQueries()` marks a query stale and, if it has an active observer, triggers a full refetch — for a single-document create/update/delete, that means downloading the *entire* collection again just to see the one change already known from the mutation's own return value or arguments. `setQueryData` applies that known change directly and synchronously, with no network round-trip, while preserving the exact same cached shape (so downstream `useMemo` sorting/filtering recomputes correctly off the new array reference).

**Why `invalidateQueries()` only where correctness requires it.** Not every mutation is safe to patch precisely: aggregate counts need to stay exactly right under concurrent multi-device writes (client-side `+1`/`-1` can drift); some mutations touch multiple documents in one batch with ambiguous ordering implications (`mergeReports`); some caches are deliberately built for cross-device correctness over local speed (`stocktake_draft` at `staleTime: 0`); some caches are *filtered views* where a single document's membership can change on edit in a way that can't be reliably predicted client-side (`supplier_search`/`supplier_browse`/`supplier_products_prefix`). In every one of these cases, the read cost of a full refetch was judged less important than the risk of showing incorrect data — correctness over read count, applied deliberately rather than by default.

---

## Section 9 — Known Technical Debt

**Collections expected to grow indefinitely, with no bound in place today:**
- `stock_movements` — every waste/goods-in/stocktake-adjustment entry, forever. Only the `'waste'`-filtered view is ever queried; no date-range window exists.
- `food_temp_checks` / `equipment_temp_checks` — the `history` queries (`TempCheckRecords`) download the entire collection, growing daily forever with no pagination.
- `supplierProducts` — the largest collection today (~3,500+ docs) and the fastest-growing, refreshed by price-sync/import tooling; Catalog.tsx's full browse remains an unbounded read.
- `stocktake_reports` — grows with every stock take, currently small enough to leave alone but worth revisiting over a multi-year horizon.

**Areas where Blaze plan features could help:** Cloud Functions (see below) require the Blaze (pay-as-you-go) plan; this project has not provisioned it. Scheduled Functions could also enable server-side archival/rollup of the ever-growing log collections above without any client-side pagination work.

**Areas requiring Cloud Functions if implemented:**
- A genuinely server-side-maintained `dashboard_summary` document (Section 7/8) — without Functions, any summary doc risks client-side drift.
- Auto-syncing ingredient/recipe `stockLevel` from `stock_movements` server-side, rather than the current pattern where Stock Take's client code explicitly writes `stockLevel` via `updateIngredient`/`updateRecipe` after computing the delta itself.
- Any future server-side data validation or write-time enforcement beyond what Firestore security rules and client-side Zod schemas already provide.

**Areas intentionally left unchanged for correctness (not oversights):**
- `stocktake_draft` mutations remain on `invalidateQueries()` at `staleTime: 0` — deliberately prioritises cross-device "resume where you left off" correctness over local read savings.
- `mergeReports` remains on `invalidateQueries()` — multi-document batch mutation with ambiguous sort-order implications for a precise patch.
- `ingredients_count`/`recipes_count`/`dishes_count` remain on `invalidateQueries()` rather than a client-side increment — server aggregate correctness under concurrent multi-device adds/deletes.
- The derived supplierProducts filter caches (`supplier_search`, `supplier_browse`, `supplier_products_prefix`) remain on `invalidateQueries()` — filtered-view membership can change on edit in ways that can't be safely predicted client-side.

**Dead code identified but not removed (out of scope for optimisation-only phases):**
- `useContainerProfiles()` (`useKitchenData.ts`) — zero callers anywhere in `src/`.
- `useSupplierSearchQuery()` and `useSupplierProductsBySupplier()` (`useKitchenData.ts`) — zero callers anywhere in `src/`, despite their backing query functions (`searchSupplierProducts`) still being actively used by other code paths.

---

## Section 10 — Current Architecture Summary

**How Firestore is organised.** Eleven collections form a shallow dependency graph — `supplierProducts` feeds `ingredients` (manually, no auto-sync) → `ingredients` feed `recipes` → `recipes` feed `dishes` → `dishes` drive Stock/Service/FrontOfHouse. Compliance logging (`food_temp_checks`, `equipment_temp_checks`) and stock ledgering (`stock_movements`, `stocktake_reports`, `stocktake_drafts`) sit alongside as independent operational records. Everything is resolved client-side at read time via id lookups (`Map`s built with `useMemo`) — there is no server-side denormalization or Cloud Functions anywhere in the project today.

**How reads are minimised.** Three techniques, applied only where behaviour allows it: (1) `count()` aggregates instead of full downloads wherever only a total is needed (Dashboard); (2) prefix-range `where()` queries instead of downloading a whole collection to filter it client-side, wherever a lookup targets one item rather than displaying everything (Pantry's catalogue suggestions, Stock's compliance report using the existing `checkDate`-scoped hooks instead of the full-history ones); (3) TanStack Query's shared cache doing straightforward de-duplication across components requesting the same `queryKey`. Genuine "show every item" UIs (ItemPicker search-everything, stocktake sheets, Catalog's full browse, FrontOfHouse's allergen board, TempCheckRecords' explicit full log) were deliberately left as full-collection reads — that's not waste, that's what the screen needs.

**How writes are cached.** Every mutation updates the local TanStack Query cache directly and synchronously after a successful Firestore write, using the mutation's own return value or arguments — no second read is issued to learn something already known. Creates append (or prepend, for newest-first lists); updates patch the changed fields using the exact same payload sent to Firestore; deletes remove by id. `invalidateQueries()` (which *does* trigger a network refetch) is reserved for the handful of cases where a precise patch would risk being wrong: server aggregates under concurrent writes, multi-document batches, cross-device-critical single documents, and filtered views whose membership can shift on edit.

**How the Dashboard works.** Three `count()` aggregate tiles (ingredients, recipes, dishes) with long cache lifetimes (30 min stale, 1 hr gc), refetched via invalidation only on add/delete (never on edit, since counts don't change then), plus three zero-read navigation shortcuts. No full-collection data is loaded on Dashboard visits at all.

**How future developers should extend the system.** Before adding a new `getDocs(collection(...))` call, ask: does this screen need to *show every item*, or is it *calculating a summary or looking for one item*? The former is fine as-is; the latter should use `count()`, a `where()`/prefix-range query, or reuse an existing narrower hook rather than downloading everything and filtering client-side. Before adding a new mutation, prefer patching the TanStack cache directly (`setQueryData`/append/prepend/patch/remove, following the existing helpers at the top of `useKitchenData.ts`) over `invalidateQueries()` — but default to `invalidateQueries()` without hesitation whenever multiple documents/collections are affected, a server-computed value is involved, or correctness under concurrent multi-device use is remotely in question. Every optimisation in this project so far has been paired with an explicit "why is this safe" explanation and, where practical, live verification against the Firestore emulator rather than trusting a type-check alone — that standard is worth keeping.
