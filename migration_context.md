# Kings Head Manager v4 - Migration Context & Next Steps

This file serves as the context bridge for the Antigravity session on your homebase machine. It documents the current project state, validation findings, and precise code modifications needed to resolve the "Unknown Item" issue.

## 1. Current Project State
* **Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS v3.4 + Zustand + TanStack React Query.
* **Environment:** Running via portable Node.js v20.12.2 (located in `../node-bin/`).
* **Dev Server:** Configured on port `3000` (`http://localhost:3000`).
* **Active Bug:** All ingredients display as "Unknown Item" in recipes/dishes.

---

## 2. Schema Validation Script Findings
We ran a custom validation script `check-validation.js` against the live Firestore database. Below are the causes of the schema failures:

### A. Recipe & Dish Items (The "Unknown Item" root cause)
* **Database Field:** Legacies store ingredient/sub-recipe IDs as `id` (e.g., `id: "ing_master_glucosesyrup"`).
* **Code Schema:** The v4 code expects `ingredientId` (if `type === 'ingredient'`) or `subRecipeId` (if `type === 'recipe'`).
* **Result:** Zod validation fails, and the fallback raw data has no `ingredientId`, resolving to `undefined` and displaying "Unknown Item".

### B. Dishes (72 / 72 failed validation)
* **Database Field:** Legacies store prices as `sellPrice`.
* **Code Schema:** The v4 code expects `retailPrice`.

### C. Ingredients (173 / 300 failed validation)
* **Timestamps:** `createdAt` and `updatedAt` are stored as Firestore Timestamp objects, but the schema expects ISO strings.
* **Categories:** Legacy categories include values not present in the v4 category enum: `'Tins Jars'`, `'Sauces'`, `'Internal'`, `'Bread'`, `'Dry Nuts Seeds'`, `'Dry Spices'`, `'Eggs'`, `'Oils Vinegars'`, `'Pastry'`.
* **Waste Percent:** Missing on some items but required in the schema.

### D. Recipes (5 / 266 failed validation)
* **Quantities:** A few recipes have ingredient quantities of `0` or negative, which violates the `z.number().positive()` constraint.

---

## 3. Recommended Code Changes in `src/types.ts`
Apply the following preprocessors in [src/types.ts](file:///src/types.ts) to handle legacy database records seamlessly:

### 1. Fix Recipe & Dish Items (`RecipeItemSchema` & `DishItemSchema`)
Wrap the schemas in `z.preprocess` to map `id` to `ingredientId` or `subRecipeId`:
```typescript
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
```

### 2. Fix Dishes (`DishSchema`)
Wrap `DishSchema` in `z.preprocess` to map `sellPrice` to `retailPrice`:
```typescript
export const DishSchema = z.preprocess((val: any) => {
  if (val && typeof val === 'object') {
    const copy = { ...val };
    if ('sellPrice' in copy && !('retailPrice' in copy)) {
      copy.retailPrice = copy.sellPrice;
    }
    if (!('items' in copy)) {
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
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
}));
```

### 3. Fix Ingredients (`IngredientSchema` & `IngredientCategorySchema`)
* Extend the `IngredientCategorySchema` list in `src/types.ts` to include the legacy categories:
  ```typescript
  export const IngredientCategorySchema = z.enum([
    'Vegetable', 'Fruit', 'Meat', 'Fish', 'Dry Store', 'Frozen', 'Dairy', 'Alcohol',
    'Tins Jars', 'Sauces', 'Internal', 'Bread', 'Dry Nuts Seeds', 'Dry Spices', 'Eggs', 'Oils Vinegars', 'Pastry'
  ]);
  ```
* Preprocess `IngredientSchema` to convert Timestamp objects to ISO strings and default missing `wastePercent` to `0`:
  ```typescript
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
  }, z.object({ ... }));
  ```

---

## 4. Resuming Instructions
When starting the session on your homebase:
1. Open the project root in the terminal.
2. Run the validation script using the local Node binary to verify the schemas:
   ```bash
   ../node-bin/bin/node check-validation.js
   ```
3. Once the database checks out green, run the dev server:
   ```bash
   PATH="../node-bin/bin:$PATH" npm run dev
   ```
4. Verify in the browser (`http://localhost:3000`) that recipes in the Kitchen view load their ingredients correctly and do not show "Unknown Item".
