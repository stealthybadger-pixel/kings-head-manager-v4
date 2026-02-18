
export type Unit = 'g' | 'ml' | 'ea' | 'kg' | 'l';

export enum Allergen {
  MILK = 'Milk',
  EGGS = 'Eggs',
  FISH = 'Fish',
  CRUSTACEANS = 'Crustaceans',
  MOLLUSCS = 'Molluscs',
  PEANUTS = 'Peanuts',
  TREE_NUTS = 'Nuts',
  SESAME = 'Sesame',
  SOYA = 'Soya',
  WHEAT = 'Wheat (Gluten)',
  CELERY = 'Celery',
  MUSTARD = 'Mustard',
  SULPHITES = 'Sulphites',
  LUPIN = 'Lupin'
}

export interface IngredientSupplier {
  name: string;
  packCost: number;
  packSize: number;
  packUnit: Unit;
  isPreferred: boolean;
  isCase?: boolean; // Flag for case/multipack vs loose item
  notes?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  suppliers: IngredientSupplier[];
  category: string;
  wastePercent: number;
  allergens: Allergen[];
  kcalPer100: number;
  stockLevel: number;
  incomplete?: boolean; // Flag for items created via OCR/Quick-add that need full data
  audited?: boolean; // Flag to indicate data has been manually reviewed/verified
  createdAt?: string;
  updatedAt?: string;
  
  // Legacy fields for migration safety (optional in new types, but present in old DB records)
  supplier?: string;
  packCost?: number;
  packSize?: number;
  packUnit?: Unit;
}

export interface RecipeItem {
  type: 'ingredient' | 'recipe';
  id: string; // References either Ingredient.id or Recipe.id
  quantity: number;
  unit: Unit;
  notes?: string; // For preserving details like "Sliced" during swaps
}

export type RecipeStatus = 'pending_validation' | 'needs_resolution' | 'structured' | 'active';

export interface Recipe {
  id: string;
  name: string;
  category?: string; // Recipe category for organization
  batchSize: number;
  batchUnit: Unit;
  items: RecipeItem[];
  instructions: string;
  sourceType: 'manual' | 'ocr';
  isDirty?: boolean; // Flag for recipes imported with unmapped/incomplete data
  status?: RecipeStatus;
  raw_text?: string;
  structured_data?: Record<string, any> | null;
  source_filename?: string; // Original filename for traceability
  createdAt?: string;
  updatedAt?: string;
}

export interface DishItem {
  type: 'ingredient' | 'recipe';
  id: string; // References either Ingredient.id or Recipe.id
  quantity: number;
  unit: Unit;
  notes?: string; // For preserving details like "Sliced" during swaps
}

export interface Dish {
  id: string;
  name: string;
  items: DishItem[];
  instructions: string;
  targetGP: number;
  sellPrice: number;
  sourceType: 'manual' | 'ocr';
  createdAt?: string;
  updatedAt?: string;
}

export interface Financials {
  totalCost: number;
  suggestedSellPrice: number;
  currentGP: number;
}
