import { z } from 'zod';

export type Unit = 'g' | 'ml' | 'ea' | 'kg' | 'l';

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
  packUnit: z.enum(['g', 'ml', 'ea', 'kg', 'l']),
  isPreferred: z.boolean()
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
  unit: z.enum(['g', 'ml', 'ea', 'kg', 'l'])
}));
export type RecipeItem = z.infer<typeof RecipeItemSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  batchSize: z.number().positive(),
  batchUnit: z.enum(['g', 'ml', 'ea', 'kg', 'l']),
  stockLevel: z.number().optional(),
  items: z.array(RecipeItemSchema),
  instructions: z.string(),
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
  unit: z.enum(['g', 'ml', 'ea', 'kg', 'l'])
}));
export type DishItem = z.infer<typeof DishItemSchema>;

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
  createdAt: z.string().optional()
});
export type StocktakeReport = z.infer<typeof StocktakeReportSchema>;

export const SupplierProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  originalName: z.string().optional(),
  supplier: z.string(),
  packCost: z.number().nonnegative(),
  packSize: z.number().positive(),
  packUnit: z.enum(['g', 'ml', 'ea', 'kg', 'l']),
  unitPrice: z.number().nonnegative(),
  source: z.string().optional(),
  capturedAt: z.string().optional(),
  importedAt: z.string().optional()
});
export type SupplierProduct = z.infer<typeof SupplierProductSchema>;
