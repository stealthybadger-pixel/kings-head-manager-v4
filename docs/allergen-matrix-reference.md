# Allergen Matrix — reference for a future in-app report

Goal (not yet built): replace the standalone `Kitchen_compliance` allergen matrix
generator with a report inside King's Head Manager that's driven by live dish/recipe/
ingredient data, instead of a hand-maintained array that goes stale as the menu changes.

Source studied: `E:\Projects\Kitchen_compliance\summer-2026-matrix.html`
(and sibling `allergen-matrix.html`, `allergens-*.md`).

## The 14 UK FSA allergens (already in our schema)

`AllergenSchema` in [src/types.ts](../src/types.ts) already matches the UK 14 exactly:
Milk, Eggs, Fish, Crustaceans, Molluscs, Peanuts, Nuts (tree nuts), Sesame, Soya,
Wheat (Gluten), Celery, Mustard, Sulphites, Lupin. No schema change needed for the
allergen set itself.

## We already compute this live — it just isn't surfaced as a report

`src/components/FrontOfHouse.tsx` already has the exact traversal logic needed:

- `getDishAllergens(dish, ingredientMap, recipeMap)` — walks a dish's items, recursing
  into sub-recipes (depth-guarded), unions all `ingredient.allergens` into a `Set<Allergen>`.
- `getDishComponentAllergens(...)` — same traversal, but keeps allergens attributed to
  the top-level component (e.g. "Mash Potato: Milk") instead of collapsing to one set.
- `ALL_ALLERGENS`, `ALLERGEN_LABELS` (short display names), `ALLERGEN_ICONS` (emoji per
  allergen) are defined locally in that file.

For the future report, these should move to a shared `src/utils/allergens.ts` so both
FOH and the new matrix screen use one source of truth instead of duplicating the walk.

## Kitchen_compliance matrix — what's worth reusing from its formatting

`summer-2026-matrix.html` is a static, hand-authored HTML/Tailwind/vanilla-JS page.
Structure worth carrying over:

- **Table layout**: sticky first column (dish name + category colour swatch + notes),
  14 allergen columns with `-rotate-45` header labels so short column width still reads.
  One row per dish, one cell per allergen.
  ```html
  <th class="allergen-col px-2 py-5"><div class="-rotate-45 ...">Celery</div></th>
  ```
- **Category tabs** across the top switch between menus (A La Carte, Sunday Lunch, Bar
  Snacks, Function Menu, Buffet, Desserts, Special Nights), with a second row of
  sub-category filter pills (Starter/Main/Sharing/etc) — maps naturally onto our
  `Dish.dishType` (Starter/Main/Side/Dessert/Drink/Other) plus `isLive` for menu scoping.
- **Search box** + **allergen dropdown filter** (filters rows to only those containing
  a chosen allergen).
- **Row flags**: `⚠` warn badge (amber, "requires kitchen confirmation") and `?` variable
  badge (grey, "allergens change daily") — both hand-set per dish today with a free-text
  note. We have no equivalent field yet. Candidate for v1: auto-derive a "needs review"
  flag from `ingredient.incomplete` (already exists — stub ingredients missing full data)
  bubbling up through any dish that uses one, rather than adding new manual fields.
- **Stats strip**: total visible items, active warning count, compliance status pill —
  cheap to recompute from the filtered list, no new data needed.
- **Print stylesheet**: dedicated `@media print` block — A4 landscape, shrinks fonts/
  padding, hides interactive chrome (`.no-print`), paginates every 18 rows
  (`tr:nth-child(18n){break-after:page}`). Needed since this doc gets printed/laminated
  for kitchen and FOH.
- **Category swatch colours**: small `catColour` map (Starter/Main/etc → hex) used as an
  8×34 rounded bar next to each dish name — quick visual grouping without a full column.

Not worth carrying over: the editable checkboxes (matrix today lets someone hand-tick
allergen cells — in-app this must be read-only and derived, since ticking a box here
should mean "edit the ingredient/recipe," not "edit the report").

## Where this plugs into the app (for later)

- New screen, likely `src/components/AllergenMatrix.tsx`, nav-grouped under Compliance
  next to Food/Equipment Temp Checks — reads `useDishes`/`useRecipes`/`useIngredients`
  (already used elsewhere) and the shared `allergens.ts` util above.
- No new Firestore fields required for a v1 (allergens come from existing
  `Ingredient.allergens`); the only open design question is whether/how to add the
  warn/variable-style manual annotation, or lean on `ingredient.incomplete` instead.

This file is a reference capture only — no implementation yet. Pick this up with
`/brainstorm` or `superpowers:writing-plans` when ready to build it.
