# King's Head Manager — Master Reference
*Last updated: 19 Feb 2026*

---

## 1. Overview

A bespoke kitchen management system built for The King's Head pub restaurant.
Covers the full operational stack: ingredient costing → recipe formulation → dish building → menu GP analysis.

**Live app:** https://kings-head-kitchen-claude.web.app
**Version:** v1.3 (Intelligence Resolution Engine)

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS (dark theme — black/gold) |
| Build | Vite |
| Database | Firebase Firestore (live sync) |
| Hosting | Firebase Hosting |
| Dev server | `npm run dev` |
| Root | `c:/Users/paul/kings-head-manager` |

---

## 3. Firestore Collections

| Collection | Purpose |
|---|---|
| `ingredients` | Master ingredient registry |
| `recipes` | All recipe formulations |
| `dishes` | Menu dishes (composed of recipes + ingredients) |
| `supplier_prices` | David Catt price guide (read-only reference) |
| `unresolved_ingredients` | Log of ingredients that failed matching during resolution |

### Recipe Status Flow
```
pending_validation → needs_resolution → structured → active
```

---

## 4. Application Views

### 4.1 Dashboard (`/dashboard`)
- Live stats: **256 ingredients**, **319 recipes**, **45 dishes**
- Total inventory value: **£2,400.71**
- Incomplete records alert (action required badge)
- Database sync status indicator (LIVE / green dot)
- Inventory Analysis chart — top 20 items ranked by value
- Filters: Supplier / Category / Value vs Stock toggle
- Right-click any bar → jump to ingredient editor
- Dashboard can navigate directly to any flagged item

### 4.2 Ingredient Manager (`/pantry`)
- Master registry list with supplier + category tags + £/g rate
- Filters: Supplier dropdown, Category dropdown
- + NEW INGREDIENT form:
  - Supplier selector (David Catt, Urban, Cranbrook, Crouch, Generic/Internal)
  - Name field with **David Catt price-guide autocomplete** (fuzzy search against `supplier_prices`)
  - Pack Cost, Pack Size, Unit fields (auto-fill from DC price guide when matched)
  - Category (auto-detected, overridable)
  - Yield % field
  - Kcal / 100g field
  - Allergen toggle buttons (14 allergens, auto-detected)
  - SAVE INGREDIENT button
- Stock Take mode (toggle from sidebar)
- Clicking any ingredient opens full edit panel

### 4.3 Recipe Builder (`/kitchen`)
- Library sidebar: searchable recipe + ingredient list with category/supplier tags + £/g cost
- Filters: Supplier, Category
- Recipe edit panel:
  - Recipe name (editable)
  - Batch size + unit (kg/g/ml/l/ea)
  - Ingredient rows: qty, unit dropdown, ingredient name, £ cost per row
  - Method text area (free text)
  - SAVE CHANGES / DISCARD buttons
  - Integrity Status badge (UNCOMMITTED / committed)
- + NEW RECIPE button
- + NEW INGREDIENT shortcut
- Recursive builder: open a sub-recipe inline without leaving context

### 4.4 Dish Builder (`/menu`)
- Library sidebar: all recipes + ingredients alphabetically with type tags
- Dish edit panel:
  - Dish name (editable)
  - Target GP % (editable)
  - Component rows: qty, unit, name, £ cost per row — supports both recipes and raw ingredients
  - Allergen Risk Profile (auto-aggregated from all components)
  - The Build: plating instructions text field
  - PLATE COST and RETAIL (@ GP%) displayed at footer
  - SAVE CHANGES / DISCARD / TELEMETRY: ACTIVE status

### 4.5 Resolution Dashboard (`/resolve`)
- Queue of all `pending_validation` recipes (291 files queued in current session)
- Per-recipe view:
  - SOURCE TEXT (raw imported text)
  - Extraction grid: QTY | UNIT | EXTRACTED NAME | DB MATCH status
  - Each row: VERIFIED / UNRESOLVED with `+ CREATE` and `LINK` actions
  - Notes extracted from ingredient lines (e.g. "CRUSHED", "DICED")
  - EXTRACTED METHOD section
  - COMMIT EXTRACTION button → promotes recipe to `structured`
  - Match rate % shown top right
- AUTO-RESOLVE ALL [N] button — batch resolves all queued recipes
- PURGE ALL button (with confirmation)

### 4.6 Raw Ingestion Engine (`/ingest`)
- Text Stream mode: paste raw recipe text directly
- File Batch mode: multi-file upload (docx support via mammoth.js)
- INGEST PAYLOAD button → parses and pushes to `pending_validation`
- Status line at bottom

### 4.7 System Settings (`/settings`)
- System info: Core Module version, Intelligence Resolution Engine label, Live Connections count
- **Danger Zone — Data Hygiene:**
  - PURGE ALL STAGING DATA (double-click, irreversible) — removes dirty/stub/incomplete records
  - DELETE 'PENDING VALIDATION' (291) — targeted cleanup
- **Diagnostic Tools:**
  - SCAN SUPPLIERS — audit supplier routing
  - SCAN ALLERGENS — re-run allergen detection
  - SCAN NUTRITION (API) — attempt COFID kcal fill
  - SCAN TYPOGRAPHY — normalise name capitalisation
  - DEEP PREP ANALYSIS toggle — extended analysis mode
- Resolution Queue display (0 discrepancies when clean)

### 4.8 Financial HUD
- Persistent overlay / panel showing GP analysis across the menu
- Accessible from any view

### 4.9 Data Inspector
- Global overlay (accessible anywhere in the app)
- Deep-dive into any ingredient or recipe record directly from Firestore

---

## 5. Intelligence Engine (`utils/intelligence.ts`)

### Category Detection
- Keyword-based auto-categorisation on ingredient name
- Alias normalisation: `"veg"` → `"Vegetable"`, etc.
- Dry Store override keywords: `seed, dried, ground, powder, paste, extract, essence, puree, concentrate`
- Re-detection skipped for: multi-supplier items, audited items

### Allergen Detection
- 14 allergens (EU mandatory): Milk, Eggs, Fish, Crustaceans, Molluscs, Peanuts, Nuts, Sesame, Soya, Wheat (Gluten), Celery, Mustard, Sulphites, Lupin
- Auto-detected from ingredient name; toggleable override in UI

### Supplier Routing
| Category | Preferred Supplier |
|---|---|
| Fruit, Vegetable, Dairy | David Catt |
| Dry Store, Frozen, Alcohol | Urban |
| Fish | Cranbrook |
| Meat | Crouch |

### Name Normalisation
- Title-case enforcement
- Prefix stripping (e.g. `"CHOPPED"` → note field; `"FROZEN -"` → keep as-is)

---

## 6. Parser (`utils/parser.ts`)

Full unit conversion system overhauled Feb 2026.

### `NORMALIZE_UNITS` — unit label mapping
| Input | Output |
|---|---|
| tsp / teaspoon | ml |
| tbsp / tablespoon | ml |
| cup / cups | ml |
| fl / floz | ml |
| oz / ounce | g |
| lb / pound | kg |

### `UNIT_MULTIPLIERS` — quantity scaling
| Unit | Multiplier |
|---|---|
| tsp | × 5 |
| tbsp | × 15 |
| cup | × 240 |
| floz | × 29.57 |
| oz | × 28.35 |
| lb | × 0.4536 |

Examples: `2 tbsp oil` → 30 ml | `4 oz chicken` → 113.4 g

### `UNIT_WEIGHTS` — ea→g conversion table (65 entries)
Covers eggs, alliums, root veg, fruiting veg, citrus, tree/stone fruit, small items.

| Category | Key entries |
|---|---|
| Eggs | egg=60g, egg white=38g, egg yolk=18g |
| Alliums | garlic=5g, shallot=20g, spring onion=15g, onion=150g, leek=200g |
| Root veg | carrot=80g, potato=150g, sweet potato=200g, beetroot=100g |
| Fruiting veg | tomato=100g, cherry tomato=15g, courgette=200g, aubergine=300g, pepper=160g |
| Citrus | lemon=115g, lime=65g, orange=180g, grapefruit=300g |
| Tree fruit | apple=182g, pear=170g, banana=120g, mango=300g, plum=60g, fig=50g |
| Small items | vanilla pod=3g, gelatine leaf=2g, bay leaf=1g |

### `wordBoundaryMatch()` — safe phrase matching
- Replaced naive `includes()` to prevent false positives
- `"pea"` no longer matches `"peanut butter"`
- Keys pre-sorted longest-first: `"cherry tomato"` always beats `"tomato"`

---

## 7. Auto-fix Logic (on ingredient load — `hooks/useKitchenData.ts`)

Runs automatically whenever ingredients are loaded from Firestore:

1. Category alias normalisation (`"veg"` → `"Vegetable"`, etc.)
2. Category re-detection — single-supplier, non-audited items only
3. Dry Store keyword override
4. Yield-based `wastePercent` for Vegetable / Fruit (from `utils/yields.ts`)
5. Supplier routing correction for Generic/Internal items
6. COFID kcal auto-fill for items with kcal=0 (skips water/salt/ice/bicarbonate)
7. `incomplete` flag auto-clear when `packCost > 0` and `packSize > 0`

---

## 8. Ingredient Flags

| Flag | Meaning |
|---|---|
| `audited: true` | Manually reviewed — skip all auto-recat |
| `incomplete: true` | Stub created via OCR/quick-add — auto-cleared when pricing valid |
| `isDirty` (recipe) | Imported raw, not yet resolved |

---

## 9. Key Components

| File | Purpose |
|---|---|
| `App.tsx` | Main shell, routing, recursive builder modal, DataInspector overlay |
| `components/Dashboard.tsx` | Dashboard view with inventory chart |
| `components/IngredientManager.tsx` | Ingredient list + add form with DC autocomplete |
| `components/RecipeBuilder.tsx` | Recipe editing UI |
| `components/DishBuilder.tsx` | Dish editing UI with GP costing |
| `components/ResolutionDashboard.tsx` | Resolve pending_validation recipes |
| `components/MassIngester.tsx` | Bulk docx recipe import |
| `components/RawIngestionEngine.tsx` | Paste/file raw recipe ingestion |
| `components/Settings.tsx` | System settings + danger zone + diagnostics |
| `components/DataInspector.tsx` | Global Firestore record inspector overlay |
| `components/FinancialHUD.tsx` | Financial/GP analysis HUD |
| `components/Navigation.tsx` | Top navigation bar |
| `components/Sidebar.tsx` | Left sidebar library panel |
| `components/DashboardAlerts.tsx` | Alert banners for dashboard |
| `components/OCRScanner.tsx` | OCR scanning (camera/image input) |
| `components/StagingBox.tsx` | Staging area for raw imports |
| `hooks/useKitchenData.ts` | Central Firestore data hook |
| `hooks/useRecursiveBuilder.ts` | Recursive recipe-within-recipe editing stack |
| `hooks/useConfirmation.tsx` | Confirmation dialog hook |
| `utils/intelligence.ts` | Category / allergen / supplier / normalisation logic |
| `utils/parser.ts` | Recipe text parser with full unit conversion |
| `utils/nutritionLookup.ts` | COFID kcal lookup table |
| `utils/yields.ts` | Produce yield percentage table |
| `utils/textExtractor.ts` | Text extraction helpers |
| `utils/units.ts` | Unit utility helpers |
| `constants.tsx` | App-wide constants |

---

## 10. Utility Scripts (local only, untracked)

| Script | Purpose | Run |
|---|---|---|
| `scripts/outlier-analysis.mjs` | Statistical outlier detection across Firestore | `node scripts/outlier-analysis.mjs` |
| `scripts/fix-outliers.mjs` | Apply targeted Firestore data fixes | `node scripts/fix-outliers.mjs [--dry-run]` |
| `scripts/import-docx.mjs` | Bulk docx recipe import helper | — |
| `ai-sync.mjs` | Sends project files to Gemini API for Q&A | — |
| `update-files.mjs` | Purpose TBD | — |

---

## 11. Database Fixes Applied (Feb 2026)

### Pack unit corrections
| Ingredient | Fix |
|---|---|
| Fennel Seeds | packUnit: `kg` → `g` |
| White Pepper Corns | packUnit: `kg` → `g` |
| frozen - sweetcorn | packUnit: `ea` → `g` |
| Sherry | packUnit: `g` → `ml` |
| Brandy | packUnit: `l` → `ml` |
| Guinness | packUnit: `l` → `ml`, packSize corrected to 586 |

### Name corrections
| Before | After |
|---|---|
| `GUINESS` | `Guinness` |
| `RUM` | `Rum` |
| `Anchovioes` | `Anchovies` |
| `mace` | `Mace` |
| `oregano` | `Oregano` |

---

## 12. Outstanding — Needs Manual Data Entry

These ingredients have zero packCost and/or incomplete pricing:

| Ingredient | Supplier | Notes |
|---|---|---|
| Prune Puree | Urban | Missing price |
| Sultanas | Urban | Missing price |
| Currants | Urban | Missing price |
| Brandy | Urban | Missing price |
| Chopped Suet | Crouch | Missing price |
| Guinness | Urban | Missing price |
| brown shrimp | Cranbrook | Also check packSize (currently 1kg) |
| Mixed Peel | Cranbrook | Missing price |
| Rum | Urban | Missing price |
| Sherry | Urban | Missing price |
| Oregano | David Catt | Missing price AND packSize=null |

---

## 13. Commit History (local, not pushed)

```
a4fe937  feat: Fuzzy ingredient matching + bulk docx recipe importer
65c2c20  feat: Stock take mode, DC DB fuzzy search, dashboard filters and context menu
c858680  fix: Add plural forms, missing keywords for category detection
6356e16  fix: Skip category recat for multi-supplier items, auto-clear incomplete flag
223fb47  fix: Smart category detection with Dry Store overrides and alias normalisation
```

> Note: Local repo only — not pushed to GitHub.

---

## 14. Deployment

Built with Vite, deployed to Firebase Hosting.

```bash
npm run build
firebase deploy
```

Live: **https://kings-head-kitchen-claude.web.app**
