
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

export interface Ingredient {
  id: string;
  name: string;
  supplier: string;
  category: string;
  packCost: number;
  packSize: number;
  packUnit: Unit;
  wastePercent: number;
  allergens: Allergen[];
  kcalPer100: number;
  stockLevel: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipeItem {
  type: 'ingredient';
  ingredientId: string;
  quantity: number;
  unit: Unit;
}

export interface Recipe {
  id: string;
  name: string;
  batchSize: number;
  batchUnit: Unit;
  items: RecipeItem[];
  instructions: string;
  sourceType: 'manual' | 'ocr';
  createdAt?: string;
  updatedAt?: string;
}

export interface DishItem {
  type: 'ingredient' | 'recipe';
  id: string; // References either Ingredient.id or Recipe.id
  quantity: number;
  unit: Unit;
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
