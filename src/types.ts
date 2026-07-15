import { z } from 'zod';

export type Unit = 'g' | 'ml' | 'ea' | 'kg' | 'l' | 'oz' | 'portion';

export const IngredientCategorySchema = z.enum([
  'Vegetable',
  'Fruit',
  'Meat',
  'Fish',
  'Dry Store',
  'Frozen',
  'Dairy',
  'Alcohol',
  'Non Consumables'
]);
export type IngredientCategory = z.infer<typeof IngredientCategorySchema>;

export const SupplierNameSchema = z.enum([
  'David Catt',
  'Urban',
  'Cranbrook',
  'Crouch',
  'Booker',
  'Glovers',
  'Internal'
]);
export type SupplierName = z.infer<typeof SupplierNameSchema>;

export const AllergenSchema = z.enum([
  'Milk',
  'Eggs',
  'Fish',
  'Crustaceans',
  'Molluscs',
  'Peanuts',
  'Nuts', // Tree nuts
  'Sesame',
  'Soya',
  'Wheat (Gluten)',
  'Celery',
  'Mustard',
  'Sulphites',
  'Lupin'
]);
export type Allergen = z.infer<typeof AllergenSchema>;

// Classifies the food-safety temperature check a raw or pre-cooked
// meat/fish item needs. Set once on the Ingredient or Recipe that
// represents the resolved cooking state (e.g. "12 Hour Cooked Pork
// Belly" recipe -> Reheat), then dishes inherit it automatically by
// walking their component tree — see resolveDishTempChecks in
// utils/tempChecks.ts. Hot Hold is not part of this enum because it's
// a service-holding property of the dish itself, not a protein state.
export const TempCheckTypeSchema = z.enum(['Cooked Core', 'Reheat']);
export type TempCheckType = z.infer<typeof TempCheckTypeSchema>;

// Recipes get a third option Ingredients don't need: 'None' explicitly
// resolves the recipe as needing no service-time check and stops the
// resolver from recursing into its ingredients — for things cooked
// during prep but served cold (e.g. a chicken terrine), where the raw
// chicken inside would otherwise incorrectly surface a Cooked Core tile.
export const RecipeTempCheckTypeSchema = z.enum(['Cooked Core', 'Reheat', 'None']);
export type RecipeTempCheckType = z.infer<typeof RecipeTempCheckTypeSchema>;

export const FoodCheckTypeSchema = z.enum(['Cooked Core', 'Reheat', 'Hot Hold']);
export type FoodCheckType = z.infer<typeof FoodCheckTypeSchema>;

// Container Tare Weight Profile
export const ContainerProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  tareWeight: z.number().nonnegative() // grams
});
export type ContainerProfile = z.infer<typeof ContainerProfileSchema>;

export const IngredientSupplierSchema = z.object({
  name: z.string(),
  packCost: z.number().nonnegative(),
  packSize: z.number().positive(),
  packUnit: z.enum(['g', 'ml', 'ea', 'kg', 'l', 'oz']),
  isPreferred: z.boolean(),
  // Deep link to this product on the wholesaler's site, captured when linked from the
  // catalogue. Optional — falls back to a supplier-site search when absent.
  sourceUrl: z.string().optional(),
  // The catalogue product's own name (e.g. "Parmesan - Vegan - Violife"), captured when linked
  // from the catalogue. Wholesaler search fallbacks must search by this, not the Pantry
  // ingredient's name — a Pantry name like "Cheese - Parmesan - Vegan" won't match their listing.
  productName: z.string().optional(),
  // ISO timestamp of the last time this supplier's price was set/refreshed (manually or via
  // a catalogue link/rescrape) — shown in Pantry so stale prices are visible at a glance.
  priceUpdatedAt: z.string().optional()
});
export type IngredientSupplier = z.infer<typeof IngredientSupplierSchema>;

export const IngredientSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const copy = { ...val };
    
    // Parse Firestore timestamps to ISO string
    const parseDate = (d: any) => {
      if (!d) return undefined;
      if (typeof d === 'string') return d;
      if (d.seconds) return new Date(d.seconds * 1000).toISOString();
      if (d.toDate && typeof d.toDate === 'function') return d.toDate().toISOString();
      return undefined;
    };

    if (copy.createdAt) copy.createdAt = parseDate(copy.createdAt);
    if (copy.updatedAt) copy.updatedAt = parseDate(copy.updatedAt);
    
    if (copy.wastePercent === undefined || copy.wastePercent === null) {
      copy.wastePercent = 0;
    }
    return copy;
  }
  return val;
}, z.object({
  id: z.string(),
  name: z.string(),
  category: IngredientCategorySchema,
  subCategory: z.string().optional(),
  // Last container/tub type (see CONTAINER_PROFILES in Stock.tsx) used to
  // weigh this ingredient during stocktake — pre-selects the tare dropdown
  // next time, updated whenever a new scale reading is logged at commit.
  defaultContainerId: z.string().optional(),
  wastePercent: z.number().min(0).max(100),
  allergens: z.array(AllergenSchema),
  kcalPer100: z.number().nonnegative(),
  stockLevel: z.number(),
  suppliers: z.array(IngredientSupplierSchema),
  audited: z.boolean().optional(),
  incomplete: z.boolean().optional(),
  pieceWeight: z.number().positive().optional(),
  eaWeight: z.number().positive().optional(),
  // Whole-animal/whole-item breakdown ("child ingredients"): a child cut
  // (e.g. Chicken Supreme) points back at its parent (e.g. Whole Chicken)
  // and records what % of the parent's weight it yields. A child has no
  // supplier pricing of its own — its cost is always derived from the
  // parent's preferred-supplier rate, inflated by the yield loss
  // (parent rate ÷ yield%), the same way wastePercent already inflates
  // cost elsewhere. Yields across all children of one parent don't need
  // to sum to 100% — the remainder is trim/carcass waste, implicitly
  // absorbed rather than tracked as its own child.
  parentIngredientId: z.string().optional(),
  childYieldPercent: z.number().positive().max(100).optional(),
  // Set on raw meat/fish ingredients used directly in a dish (not via a
  // recipe) — e.g. a steak added straight to a dish. See TempCheckTypeSchema.
  tempCheckType: TempCheckTypeSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
}));
export type Ingredient = z.infer<typeof IngredientSchema>;

export const RecipeItemSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const copy = { ...val };
    if ('id' in copy && !copy.ingredientId && !copy.subRecipeId) {
      if (copy.type === 'ingredient') {
        copy.ingredientId = copy.id;
      } else if (copy.type === 'recipe') {
        copy.subRecipeId = copy.id;
      }
    }
    // Clamping quantity to a minimum positive value
    if ('quantity' in copy && copy.quantity <= 0) {
      copy.quantity = 0.0001; 
    }
    return copy;
  }
  return val;
}, z.object({
  type: z.enum(['ingredient', 'recipe']),
  ingredientId: z.string().optional(),
  subRecipeId: z.string().optional(),
  quantity: z.number().positive(),
  // 'portion' is only meaningful when type === 'recipe' and the referenced
  // Recipe has portionCount set — see DishItemSchema for the same pattern.
  unit: z.enum(['g', 'ml', 'ea', 'kg', 'l', 'oz', 'portion'])
}));
export type RecipeItem = z.infer<typeof RecipeItemSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  batchSize: z.number().positive(),
  batchUnit: z.enum(['g', 'ml', 'ea', 'kg', 'l', 'oz']),
  // When true, batchSize is a manually-entered actual yield (e.g. weighed
  // after roasting/reduction) rather than the auto-summed raw-input total.
  // Costing/stocktake use batchSize either way; this flag only controls
  // whether the UI keeps recalculating it from the ingredient list.
  manualYield: z.boolean().optional(),
  // Number of portions this batch yields (e.g. "makes 12 portions").
  // When set, dish-builder can select "portion" as a unit for this recipe,
  // resolving to batchSize / portionCount rather than a fixed weight.
  portionCount: z.number().positive().optional(),
  stockLevel: z.number().optional(),
  items: z.array(RecipeItemSchema),
  instructions: z.string(),
  // Set on recipes that resolve a meat/fish protein to a known cooked
  // state — e.g. "12 Hour Cooked Pork Belly" -> Reheat, "Pan-Seared
  // Chicken Breast" -> Cooked Core, or "None" for something cooked during
  // prep but served cold (e.g. a chicken terrine) where the raw chicken
  // inside would otherwise leak through as a false Cooked Core tile. Any
  // of the three stops dish temp-check resolution here rather than
  // recursing into this recipe's own ingredients. See
  // RecipeTempCheckTypeSchema and utils/tempChecks.ts.
  tempCheckType: RecipeTempCheckTypeSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const DishItemSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const copy = { ...val };
    if ('id' in copy && !copy.ingredientId && !copy.subRecipeId) {
      if (copy.type === 'ingredient') {
        copy.ingredientId = copy.id;
      } else if (copy.type === 'recipe') {
        copy.subRecipeId = copy.id;
      }
    }
    // Clamping quantity to a minimum positive value
    if ('quantity' in copy && copy.quantity <= 0) {
      copy.quantity = 0.0001; 
    }
    return copy;
  }
  return val;
}, z.object({
  type: z.enum(['ingredient', 'recipe']),
  ingredientId: z.string().optional(),
  subRecipeId: z.string().optional(),
  quantity: z.number().positive(),
  // 'portion' is only valid when type === 'recipe' and the referenced
  // Recipe has portionCount set — it resolves to batchSize / portionCount
  // at cost-calculation time rather than being a fixed weight itself.
  unit: z.enum(['g', 'ml', 'ea', 'kg', 'l', 'oz', 'portion'])
}));
export type DishItem = z.infer<typeof DishItemSchema>;

// An optional add-on for a dish (e.g. "Bacon" on a burger, "Chicken" on a
// Caesar salad) — priced separately from the base dish so you don't need
// a distinct live-menu entry per combination. extraPrice is what the
// customer is charged for adding it; cost is derived from quantity/unit
// the same way a normal DishItem is. Purely a costing/planning tool for
// now — not yet surfaced to FOH or EPOS.
export const DishModifierSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['ingredient', 'recipe']),
  ingredientId: z.string().optional(),
  subRecipeId: z.string().optional(),
  quantity: z.number().positive(),
  unit: z.enum(['g', 'ml', 'ea', 'kg', 'l', 'oz', 'portion']),
  extraPrice: z.number().nonnegative()
});
export type DishModifier = z.infer<typeof DishModifierSchema>;

export const DishSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const copy = { ...val };
    if ('sellPrice' in copy && !('retailPrice' in copy)) {
      copy.retailPrice = copy.sellPrice;
    }
    if (copy.retailPrice === undefined || copy.retailPrice === null) {
      copy.retailPrice = 0;
    }
    if (copy.targetGP === undefined || copy.targetGP === null) {
      copy.targetGP = 72;
    }
    if (!('items' in copy) || !copy.items) {
      copy.items = [];
    }
    return copy;
  }
  return val;
}, z.object({
  id: z.string(),
  name: z.string(),
  retailPrice: z.number().nonnegative(),
  targetGP: z.number().min(0).max(100),
  items: z.array(DishItemSchema),
  isLive: z.boolean().optional(),
  dishType: z.enum(['Starter', 'Main', 'Side', 'Dessert', 'Drink', 'Other']).optional(),
  // Hot Hold is a service-holding property (e.g. soup kept warm in a
  // bain-marie), not derivable from ingredient/recipe raw-cooked state
  // like Cooked Core / Reheat are — so it's a manual per-dish flag.
  requiresHotHoldCheck: z.boolean().optional(),
  modifiers: z.array(DishModifierSchema).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
}));
export type Dish = z.infer<typeof DishSchema>;
export type DishType = 'Starter' | 'Main' | 'Side' | 'Dessert' | 'Drink' | 'Other';

export const StockMovementTypeSchema = z.enum([
  'delivery',
  'waste',
  'adjustment',
  'stock_take'
]);
export type StockMovementType = z.infer<typeof StockMovementTypeSchema>;

export const StockMovementSchema = z.object({
  id: z.string(),
  ingredientId: z.string(),
  type: StockMovementTypeSchema,
  quantity: z.number(),
  date: z.string(),
  costValue: z.number(),
  notes: z.string().optional(),
  createdAt: z.string().optional()
});
export type StockMovement = z.infer<typeof StockMovementSchema>;

export const SupplierSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  contactName: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  address: z.string().optional(),
  deliveryDays: z.string().default(''),
  minimumOrder: z.number().nonnegative().default(0),
  notes: z.string().default(''),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const StocktakeReportSchema = z.object({
  id: z.string(),
  date: z.string(),
  counts: z.record(z.number()),
  totalValue: z.number(),
  itemCount: z.number(),
  menuOnly: z.boolean().optional(),
  type: z.enum(['stocktake', 'snapshot']).optional(),
  columns: z.array(z.string()).optional(),
  scope: z.enum(['all', 'menu', 'nonzero']).optional(),
  wastageTotal: z.number().optional(),
  wastageCount: z.number().optional(),
  wastageCounts: z.record(z.number()).optional(),
  createdAt: z.string().optional()
});
export type StocktakeReport = z.infer<typeof StocktakeReportSchema>;

// Single in-progress stocktake session (singleton doc, id 'current') —
// lets a chef pause mid-count (exit the modal, close the tablet) and
// resume later, on any device, without losing progress or ending up
// with two separate reports for what was really one stocktake.
export const ContainerReadingSchema = z.object({
  containerId: z.string(),
  netGrams: z.number()
});
export const StocktakeDraftSchema = z.object({
  id: z.string(),
  stockCounts: z.record(z.number()),
  recipeCounts: z.record(z.number()),
  itemTareIds: z.record(z.string()),
  itemReadings: z.record(z.array(ContainerReadingSchema)),
  // Display/entry unit picked per ingredient (g/kg/oz/ea) — stockCounts itself
  // always stays in grams internally, this only affects what's shown and how
  // typed numbers are interpreted. Defaults to 'g' when absent.
  itemUnits: z.record(z.string()).optional(),
  menuOnlyMode: z.boolean().optional(),
  updatedAt: z.string(),
  updatedByName: z.string().optional()
});
export type StocktakeDraft = z.infer<typeof StocktakeDraftSchema>;

export const SupplierProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  originalName: z.string().optional(),
  supplier: z.string(),
  packCost: z.number().nonnegative(),
  packSize: z.number().positive(),
  packUnit: z.enum(['g', 'ml', 'ea', 'kg', 'l', 'oz']),
  unitPrice: z.number().nonnegative(),
  source: z.string().optional(),
  capturedAt: z.string().optional(),
  importedAt: z.string().optional(),
  bookerProductCode: z.string().optional(),
  urbanProductId: z.string().optional(),
  sku: z.string().optional(),
  productCode: z.string().optional()
});
export type SupplierProduct = z.infer<typeof SupplierProductSchema>;

export const UserRoleSchema = z.enum(['manager', 'staff']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AppUserSchema = z.object({
  uid: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: UserRoleSchema,
  createdAt: z.string().optional()
});
export type AppUser = z.infer<typeof AppUserSchema>;

// A single recorded food probe reading against one ingredient/recipe/dish's
// required check. Keyed by the item actually being probed (a batch of
// Beef Sirloin, say) rather than any one dish it happens to go into —
// the same physical item is often used across several live dishes.
// requiredMinC is snapshotted at record time (not looked up live) so
// historical records stay accurate if thresholds change later.
// Only passing readings are ever recorded — if a probe reads below the
// minimum, the item goes back to cook further and gets re-probed rather
// than logging a failed attempt, so `pass` is always true here.
export const FoodTempCheckSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  itemType: z.enum(['ingredient', 'recipe', 'dish']),
  checkType: FoodCheckTypeSchema,
  temperatureC: z.number(),
  requiredMinC: z.number(),
  pass: z.boolean(),
  userId: z.string(),
  userDisplayName: z.string(),
  checkedAt: z.string(),
  // ISO date (YYYY-MM-DD) the check was logged against, in local time —
  // used to scope "today's" checklist without a timezone-fiddly range query.
  checkDate: z.string()
});
export type FoodTempCheck = z.infer<typeof FoodTempCheckSchema>;

export const EquipmentTypeSchema = z.enum(['Fridge', 'Freezer', 'Other']);
export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;

// A fridge/freezer drawn as a labelled box on the kitchen floor plan.
// x/y/w/h are percentages (0-100) of the floor plan canvas, not pixels,
// so the box stays correctly placed and sized regardless of the
// rendered canvas size. w/h default to a sensible box shape if unset
// (older records created before boxes had a size).
export const EquipmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: EquipmentTypeSchema,
  minC: z.number(),
  maxC: z.number(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(2).max(100).optional(),
  h: z.number().min(2).max(100).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
export type Equipment = z.infer<typeof EquipmentSchema>;

// Unlike FoodTempCheck, out-of-range equipment readings ARE recorded —
// a warm fridge usually means a fault needing a repair callout, so it's
// worth a timestamped record even before it's fixed.
export const EquipmentTempCheckSchema = z.object({
  id: z.string(),
  equipmentId: z.string(),
  equipmentName: z.string(),
  temperatureC: z.number(),
  minC: z.number(),
  maxC: z.number(),
  pass: z.boolean(),
  userId: z.string(),
  userDisplayName: z.string(),
  checkedAt: z.string(),
  checkDate: z.string()
});
export type EquipmentTempCheck = z.infer<typeof EquipmentTempCheckSchema>;
