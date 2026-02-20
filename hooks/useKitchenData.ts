
import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy, writeBatch, getDocs, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Ingredient, Recipe, Dish, Allergen, RecipeStatus, RecipeItem, StockMovement, Invoice } from '../types';
import { normalizeName, detectSupplierFromCategory, detectCategory, normalizeCategory } from '../utils/intelligence';
import { calculateBatchTotal } from '../utils/units';
import { getProduceYield } from '../utils/yields';
import { COFID_DATA } from '../utils/nutritionLookup';

// TODO: Move to types.ts
export interface ScanQueueItem {
  id: string;
  type: 'invoice' | 'recipe';
  imageUrl: string;
  storagePath: string;
  status: 'pending' | 'done';
  note?: string | null;
  uploadedAt: any; // Firestore Timestamp
}

export interface SupplierPriceItem {
  id: string;
  name: string;
  packCost: number;
  packSize: number;
  packUnit: string;
  kcalPer100?: number;
  allergens?: string[];
}

const DEFAULT_INGREDIENTS: Omit<Ingredient, 'id'>[] = [
  { 
    name: 'Agar-agar', 
    category: 'Dry Store', 
    suppliers: [{ name: 'Urban', packCost: 33.75, packSize: 500, packUnit: 'g', isPreferred: true }], 
    wastePercent: 0, 
    allergens: [], 
    kcalPer100: 306, 
    stockLevel: 95, 
    audited: true 
  },
  { 
    name: 'Beef Mince', 
    category: 'Meat', 
    suppliers: [{ name: 'Crouch', packCost: 9.00, packSize: 1000, packUnit: 'g', isPreferred: true }], 
    wastePercent: 15, 
    allergens: [], 
    kcalPer100: 250, 
    stockLevel: 5000, 
    audited: true 
  },
  { 
    name: 'Double Cream', 
    category: 'Dairy', 
    suppliers: [{ name: 'David Catt', packCost: 4.50, packSize: 1000, packUnit: 'ml', isPreferred: true }], 
    wastePercent: 0, 
    allergens: [Allergen.MILK], 
    kcalPer100: 450, 
    stockLevel: 2000, 
    audited: true 
  },
  { 
    name: 'Red Wine', 
    category: 'Alcohol', 
    suppliers: [{ name: 'Urban', packCost: 12.00, packSize: 750, packUnit: 'ml', isPreferred: true }], 
    wastePercent: 0, 
    allergens: [Allergen.SULPHITES], 
    kcalPer100: 85, 
    stockLevel: 3000, 
    audited: true 
  },
  { 
    name: 'Butter Unsalted', 
    category: 'Dairy', 
    suppliers: [{ name: 'David Catt', packCost: 2.50, packSize: 250, packUnit: 'g', isPreferred: true }], 
    wastePercent: 0, 
    allergens: [Allergen.MILK], 
    kcalPer100: 717, 
    stockLevel: 1000, 
    audited: true 
  },
  { 
    name: 'Flour (Plain)', 
    category: 'Dry Store', 
    suppliers: [{ name: 'Urban', packCost: 1.20, packSize: 1000, packUnit: 'g', isPreferred: true }], 
    wastePercent: 0, 
    allergens: [Allergen.WHEAT], 
    kcalPer100: 364, 
    stockLevel: 5000, 
    audited: true 
  },
  { 
    name: 'Eggs (Large)', 
    category: 'Dairy', 
    suppliers: [{ name: 'David Catt', packCost: 0.30, packSize: 1, packUnit: 'ea', isPreferred: true }], 
    wastePercent: 0, 
    allergens: [Allergen.EGGS], 
    kcalPer100: 155, 
    stockLevel: 120, 
    audited: true 
  }
];

// Utility to recursively strip undefined values and dangerous circular objects
// HARDENED: Prevents "Converting circular structure to JSON" by stripping complex types (like Events)
const cleanObject = (obj: any): any => {
  // Primitives and null
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle Date specifically (common in this app)
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // Arrays: Recurse mapped
  if (Array.isArray(obj)) {
    return obj.map(v => cleanObject(v));
  }

  // Allow specific Firebase/Firestore types based on constructor name
  // This avoids serializing React Events or other circular structures
  const ctorName = obj.constructor?.name;
  if (['Timestamp', 'GeoPoint', 'DocumentReference', 'CollectionReference'].includes(ctorName)) {
    return obj;
  }

  // Guard against other complex objects (Class Instances, SyntheticEvents, DOM Nodes, etc.)
  // Only recurse into Plain Objects (POJOs) or objects with no constructor
  if (obj.constructor !== Object && obj.constructor !== undefined) {
    console.warn(`[Data Safety] Stripping complex object of type '${ctorName}' from DB payload to prevent circular reference errors.`);
    return undefined; 
  }

  // Plain Objects: Recurse entries
  return Object.entries(obj).reduce((acc, [k, v]) => {
    const cleaned = cleanObject(v);
    if (cleaned !== undefined) {
      acc[k] = cleaned;
    }
    return acc;
  }, {} as any);
};

export const useKitchenData = () => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [scanQueue, setScanQueue] = useState<ScanQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    const q = query(collection(db, 'ingredients'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const raw = doc.data();
        if (!raw.suppliers && raw.supplier) {
          return {
            id: doc.id,
            ...raw,
            wastePercent: raw.wastePercent ?? 0,
            stockLevel: raw.stockLevel ?? 0,
            kcalPer100: raw.kcalPer100 ?? 0,
            suppliers: [{
              name: raw.supplier,
              packCost: raw.packCost,
              packSize: raw.packSize,
              packUnit: raw.packUnit,
              isPreferred: true
            }]
          };
        }
        return {
          id: doc.id,
          ...raw,
          wastePercent: raw.wastePercent ?? 0,
          stockLevel: raw.stockLevel ?? 0,
          kcalPer100: raw.kcalPer100 ?? 0,
          suppliers: raw.suppliers || []
        };
      }) as Ingredient[];

      // Normalize category aliases ("Veg" → "Vegetable", etc.) and re-detect miscategorized items
      // Skip items with multiple suppliers (user has manually configured them)
      data.forEach(ing => {
        const normalized = normalizeCategory(ing.category);
        const needsNormalize = normalized !== ing.category;

        // Only re-detect category for single-supplier, non-audited items
        const canRecat = ing.suppliers.length <= 1 && !ing.audited;
        const detected = canRecat ? detectCategory(ing.name) : normalized;
        const needsRecat = canRecat && detected !== normalized;
        const correctedCategory = needsRecat ? detected : normalized;

        if (needsNormalize || needsRecat) {
          console.info(`[CATEGORY_FIX] "${ing.name}": "${ing.category}" → "${correctedCategory}"`);
          ing.category = correctedCategory;
          const correctSupplier = detectSupplierFromCategory(correctedCategory);
          const preferred = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
          const updates: Record<string, any> = { category: correctedCategory, updatedAt: new Date().toISOString() };
          // Also fix the supplier in the same write if it's wrong
          if (preferred && (preferred.name === 'Generic' || preferred.name === 'Internal' || preferred.name === 'Urban') && correctSupplier !== preferred.name) {
            const updatedSuppliers = ing.suppliers.map(s =>
              s === preferred ? { ...s, name: correctSupplier } : s
            );
            ing.suppliers = updatedSuppliers;
            updates.suppliers = updatedSuppliers;
            console.info(`[SUPPLIER_FIX] "${ing.name}": "${preferred.name}" → "${correctSupplier}" (via category fix)`);
          }
          updateDoc(doc(db, 'ingredients', ing.id), updates).catch(console.error);
        }
      });

      // Auto-populate wastePercent from yield data for Vegetable/Fruit ingredients
      data.forEach(ing => {
        if ((ing.category === 'Vegetable' || ing.category === 'Fruit') && (ing.wastePercent === 0 || ing.wastePercent === undefined)) {
          const yieldPct = getProduceYield(ing.name);
          if (yieldPct !== null) {
            const waste = 100 - yieldPct;
            console.info(`[YIELD_UPDATE] "${ing.name}" → ${yieldPct}% yield (${waste}% waste)`);
            ing.wastePercent = waste;
            updateDoc(doc(db, 'ingredients', ing.id), { wastePercent: waste, updatedAt: new Date().toISOString() }).catch(console.error);
          }
        }
      });

      // Auto-fix supplier routing for ingredients with "Generic" or "Internal" preferred supplier
      data.forEach(ing => {
        const preferred = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
        if (preferred && (preferred.name === 'Generic' || preferred.name === 'Internal')) {
          const correctSupplier = detectSupplierFromCategory(ing.category);
          if (correctSupplier !== 'Internal' && correctSupplier !== preferred.name) {
            console.info(`[SUPPLIER_FIX] "${ing.name}" (${ing.category}): "${preferred.name}" → "${correctSupplier}"`);
            const updatedSuppliers = ing.suppliers.map(s =>
              s === preferred ? { ...s, name: correctSupplier } : s
            );
            ing.suppliers = updatedSuppliers;
            updateDoc(doc(db, 'ingredients', ing.id), { suppliers: updatedSuppliers, updatedAt: new Date().toISOString() }).catch(console.error);
          }
        }
      });

      // Auto-populate kcalPer100 from COFID data for ingredients with kcal = 0
      const ZERO_KCAL_ITEMS = ['water', 'salt', 'ice', 'bicarbonate'];
      data.forEach(ing => {
        if (ing.kcalPer100 === 0 || ing.kcalPer100 === undefined) {
          if (ZERO_KCAL_ITEMS.some(k => ing.name.toLowerCase().includes(k))) return;
          const lower = ing.name.toLowerCase();
          for (const [key, val] of Object.entries(COFID_DATA)) {
            if (lower.includes(key) && val > 0) {
              console.info(`[KCAL_FIX] "${ing.name}" → ${val} kcal/100g (matched: "${key}")`);
              ing.kcalPer100 = val;
              updateDoc(doc(db, 'ingredients', ing.id), { kcalPer100: val, updatedAt: new Date().toISOString() }).catch(console.error);
              break;
            }
          }
        }
      });

      // Auto-clear incomplete flag when pricing data is valid (stockLevel: 0 is NOT a stub indicator)
      data.forEach(ing => {
        if (ing.incomplete) {
          const pref = ing.suppliers.find((s: any) => s.isPreferred) || ing.suppliers[0];
          const hasValidPrice = pref && pref.packCost > 0 && pref.packSize > 0;
          if (hasValidPrice) {
            console.info(`[STUB_CLEAR] "${ing.name}" → incomplete cleared (has valid pricing)`);
            ing.incomplete = false;
            updateDoc(doc(db, 'ingredients', ing.id), { incomplete: false, updatedAt: new Date().toISOString() }).catch(console.error);
          }
        }
      });

      setIngredients(data);
      setConnectionStatus('connected');
      setError(null);
    }, (err) => {
      console.error("Error fetching ingredients:", err);
      setError(err.message);
      setConnectionStatus('error');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'recipes'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => {
        const raw = d.data();
        const id = d.id;
        // Strip self-referential items (recipe containing itself as a sub-recipe)
        const items = (raw.items || []).filter(
          (item: any) => !(item.type === 'recipe' && (item.id === id || (item as any).recipeId === id))
        );
        const patches: Record<string, any> = {};

        // If corrupted items were found, clean them in Firestore too
        if (items.length !== (raw.items || []).length) {
          console.warn(`[SELF_REF_CLEANUP] Recipe "${raw.name}" (${id}) had self-referential items — stripping.`);
          patches.items = items;
        }

        // Auto-clear isDirty for recipes that have resolved items and an active/structured status
        if (raw.isDirty && items.length > 0 && items.every((i: any) => i.id)) {
          console.info(`[AUTO_CLEAN] Recipe "${raw.name}" (${id}) has resolved items — clearing isDirty.`);
          patches.isDirty = false;
          if (!raw.status || raw.status === 'pending_validation' || raw.status === 'needs_resolution') {
            patches.status = 'active';
          }
        }

        if (Object.keys(patches).length > 0) {
          patches.updatedAt = new Date().toISOString();
          updateDoc(doc(db, 'recipes', id), patches).catch(console.error);
        }

        return { id, ...raw, items, ...patches } as Recipe;
      });
      setRecipes(data);
    }, (err) => {
      console.error("Error fetching recipes:", err);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'dishes'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Dish[];
      setDishes(data);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching dishes:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'stock_movements'), orderBy('createdAt', 'desc'), limit(500));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as StockMovement[];
      setStockMovements(data);
    }, (err) => console.error("Error fetching stock_movements:", err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'invoices'), orderBy('date', 'desc'), limit(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Invoice[];
      setInvoices(data);
    }, (err) => console.error("Error fetching invoices:", err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'scan_queue'), where('status', '==', 'pending'), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ScanQueueItem[];
      setScanQueue(data);
    }, (err) => console.error("Error fetching scan_queue:", err));
    return () => unsubscribe();
  }, []);

  // Retroactive batch size calculation (runs once when both ingredients and recipes are loaded)
  const batchCalcRan = useRef(false);
  const davidCattCache = useRef<SupplierPriceItem[]>([]);
  const davidCattLoaded = useRef(false);
  useEffect(() => {
    if (batchCalcRan.current || ingredients.length === 0 || recipes.length === 0) return;
    batchCalcRan.current = true;

    // Build waste lookup from all ingredients
    const wasteMap = new Map<string, number>();
    ingredients.forEach(ing => {
      if (ing.wastePercent > 0) wasteMap.set(ing.id, ing.wastePercent);
    });

    recipes.forEach(recipe => {
      if (!recipe.items || recipe.items.length === 0 || !recipe.batchUnit) return;
      const calculatedBatch = parseFloat(calculateBatchTotal(recipe.items, recipe.batchUnit, wasteMap).toFixed(4));
      if (calculatedBatch > 0 && Math.abs(calculatedBatch - (recipe.batchSize || 1)) > 0.001) {
        console.info(`[BATCH_CALC] Recipe "${recipe.name}": ${recipe.batchSize} → ${calculatedBatch} ${recipe.batchUnit}`);
        updateDoc(doc(db, 'recipes', recipe.id), { batchSize: calculatedBatch, updatedAt: new Date().toISOString() }).catch(console.error);
      }
    });
  }, [ingredients, recipes]);

  const addIngredient = useCallback(async (ingredient: Omit<Ingredient, 'id'>) => {
    try {
      const newIng = {
        ...ingredient,
        wastePercent: ingredient.wastePercent ?? 0,
        stockLevel: ingredient.stockLevel ?? 0,
        kcalPer100: ingredient.kcalPer100 ?? 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if ('supplier' in newIng) delete (newIng as any).supplier;
      if ('packCost' in newIng) delete (newIng as any).packCost;
      if ('packSize' in newIng) delete (newIng as any).packSize;
      if ('packUnit' in newIng) delete (newIng as any).packUnit;

      const docRef = await addDoc(collection(db, 'ingredients'), cleanObject(newIng));
      return { id: docRef.id, ...newIng } as Ingredient;
    } catch (err) {
      console.error("Error adding ingredient:", err);
      throw err;
    }
  }, []);

  const updateIngredient = useCallback(async (id: string, ingredient: Partial<Ingredient>) => {
    try {
      const docRef = doc(db, 'ingredients', id);
      const updateData = {
        ...ingredient,
        updatedAt: new Date().toISOString()
      };
      if (ingredient.suppliers) {
        delete (updateData as any).supplier;
        delete (updateData as any).packCost;
        delete (updateData as any).packSize;
        delete (updateData as any).packUnit;
      }

      await updateDoc(docRef, cleanObject(updateData));
    } catch (err) {
      console.error("Error updating ingredient:", err);
      throw err;
    }
  }, []);

  const deleteIngredient = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'ingredients', id));
    } catch (err) {
      console.error("Error deleting ingredient:", err);
      throw err;
    }
  }, []);

  const saveRecipe = useCallback(async (recipe: Partial<Recipe>) => {
    try {
      const newRecipeData = {
        ...recipe,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'recipes'), cleanObject(newRecipeData));
      return { id: docRef.id, ...newRecipeData } as Recipe;
    } catch (err) {
      console.error("Error saving recipe:", err);
      throw err;
    }
  }, []);

  const updateRecipe = useCallback(async (id: string, recipe: Partial<Recipe>) => {
    try {
      const recipeRef = doc(db, 'recipes', id);
      const payload = {
        ...recipe,
        updatedAt: new Date().toISOString()
      };
      await updateDoc(recipeRef, cleanObject(payload));
    } catch (err) {
      console.error("Error updating recipe:", err);
      console.dir(recipe); // Log the partial payload for debugging
      throw err;
    }
  }, []);

  const deleteRecipe = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'recipes', id));
    } catch (err) {
      console.error("Error deleting recipe:", err);
      throw err;
    }
  }, []);

  const ingestRawRecipe = useCallback(async (rawText: string, title?: string, filename?: string) => {
    try {
      // De-Duplication Check: Update if name matches an existing recipe
      let existingId: string | undefined;
      
      if (title) {
         const normTitle = normalizeName(title).toLowerCase();
         const match = recipes.find(r => normalizeName(r.name).toLowerCase() === normTitle);
         if (match) existingId = match.id;
      }

      if (existingId) {
           await updateDoc(doc(db, 'recipes', existingId), cleanObject({
              raw_text: rawText,
              status: 'pending_validation',
              updatedAt: new Date().toISOString()
           }));
           // Return existing recipe object
           return recipes.find(r => r.id === existingId) as Recipe;
      }

      // If no match, Create New
      const timestamp = new Date().toISOString();
      const recipeData: Omit<Recipe, 'id'> = {
        name: title || `Raw Import ${new Date().toLocaleTimeString()}`,
        batchSize: 1,
        batchUnit: 'ea',
        items: [],
        instructions: '',
        sourceType: 'manual', 
        isDirty: true,
        status: 'pending_validation',
        raw_text: rawText,
        structured_data: null,
        source_filename: filename,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const docRef = await addDoc(collection(db, 'recipes'), cleanObject(recipeData));
      return { id: docRef.id, ...recipeData } as Recipe;
    } catch (err) {
      console.error("Error ingesting raw recipe:", err);
      throw err;
    }
  }, [recipes]);

  const batchIngestFiles = useCallback(async (
    files: { name: string, content: string }[],
    onProgress: (progress: number, logs: string[]) => void
  ) => {
    try {
      // 1. Map existing filenames AND normalized names to IDs for Upsert Logic
      const existingFileMap = new Map<string, string>();
      const existingNameMap = new Map<string, string>();
      
      recipes.forEach(r => {
        if (r.source_filename) existingFileMap.set(r.source_filename, r.id);
        if (r.name) existingNameMap.set(normalizeName(r.name).toLowerCase(), r.id);
      });

      const total = files.length;
      let processed = 0;
      const CHUNK_SIZE = 50;

      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        const chunkLogs: string[] = [];

        chunk.forEach(file => {
          const cleanTitle = file.name.replace(/\.[^/.]+$/, ""); // Strip extension
          const normName = normalizeName(cleanTitle).toLowerCase();
          
          // Check both maps
          const existingId = existingFileMap.get(file.name) || existingNameMap.get(normName);
          const timestamp = new Date().toISOString();

          if (existingId) {
            // Update existing
            const ref = doc(db, 'recipes', existingId);
            batch.update(ref, cleanObject({
              name: cleanTitle,
              raw_text: file.content,
              status: 'pending_validation',
              updatedAt: timestamp
            }));
            chunkLogs.push(`[COMMIT] ${cleanTitle} ... SUCCESS (UPDATED)`);
          } else {
            // Create new
            const newRef = doc(collection(db, 'recipes'));
            const newRecipe = {
              name: cleanTitle,
              batchSize: 1,
              batchUnit: 'ea',
              items: [],
              instructions: '',
              sourceType: 'manual',
              isDirty: true,
              status: 'pending_validation',
              raw_text: file.content,
              structured_data: null,
              source_filename: file.name,
              createdAt: timestamp,
              updatedAt: timestamp
            };
            batch.set(newRef, cleanObject(newRecipe));
            
            // Add to maps to prevent duplicates within same batch/session
            existingNameMap.set(normName, newRef.id);
            existingFileMap.set(file.name, newRef.id);
            
            chunkLogs.push(`[COMMIT] ${cleanTitle} ... SUCCESS`);
          }
        });

        await batch.commit();
        processed += chunk.length;
        onProgress(Math.round((processed / total) * 100), chunkLogs);
      }
    } catch (err) {
      console.error("Batch ingest error", err);
      throw err;
    }
  }, [recipes]);

  const saveDish = useCallback(async (dish: Partial<Dish>) => {
    try {
      const newDishData = {
        ...dish,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'dishes'), cleanObject(newDishData));
      return { id: docRef.id, ...newDishData } as Dish;
    } catch (err) {
      console.error("Error saving dish:", err);
      throw err;
    }
  }, []);

  const updateDish = useCallback(async (id: string, dish: Partial<Dish>) => {
    try {
      const dishRef = doc(db, 'dishes', id);
      await updateDoc(dishRef, cleanObject({
        ...dish,
        updatedAt: new Date().toISOString()
      }));
    } catch (err) {
      console.error("Error updating dish:", err);
      throw err;
    }
  }, []);

  const deleteDish = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'dishes', id));
    } catch (err) {
      console.error("Error deleting dish:", err);
      throw err;
    }
  }, []);

  const mergeIngredients = useCallback(async (sourceId: string, targetId: string, sourceName: string) => {
    try {
      const batch = writeBatch(db);
      
      // Find affected recipes
      const affectedRecipes = recipes.filter(r => r.items.some(i => i.type === 'ingredient' && i.id === sourceId));
      affectedRecipes.forEach(r => {
        const newItems = r.items.map(i => {
           if (i.type === 'ingredient' && i.id === sourceId) {
             return { 
               ...i, 
               id: targetId, 
               notes: sourceName 
             };
           }
           return i;
        });
        const ref = doc(db, 'recipes', r.id);
        batch.update(ref, cleanObject({ items: newItems, updatedAt: new Date().toISOString() }));
      });

      // Find affected dishes
      const affectedDishes = dishes.filter(d => d.items.some(i => i.type === 'ingredient' && i.id === sourceId));
      affectedDishes.forEach(d => {
        const newItems = d.items.map(i => {
           if (i.type === 'ingredient' && i.id === sourceId) {
             return { 
               ...i, 
               id: targetId, 
               notes: sourceName 
             };
           }
           return i;
        });
        const ref = doc(db, 'dishes', d.id);
        batch.update(ref, cleanObject({ items: newItems, updatedAt: new Date().toISOString() }));
      });

      // Delete source ingredient
      const sourceRef = doc(db, 'ingredients', sourceId);
      batch.delete(sourceRef);

      await batch.commit();
      return { recipeCount: affectedRecipes.length, dishCount: affectedDishes.length };
    } catch (err) {
      console.error("Merge failed:", err);
      throw err;
    }
  }, [recipes, dishes]);

  const purgeStagingData = useCallback(async () => {
    try {
      const batch = writeBatch(db);
      let recipeCount = 0;
      let ingredientCount = 0;

      const allRecipesQuery = query(collection(db, 'recipes'));
      const recipeSnap = await getDocs(allRecipesQuery);
      
      recipeSnap.docs.forEach(doc => {
        const data = doc.data() as Recipe;
        if (data.isDirty || !data.items || data.items.length === 0) {
          batch.delete(doc.ref);
          recipeCount++;
        }
      });

      const allIngredientsQuery = query(collection(db, 'ingredients'));
      const ingSnap = await getDocs(allIngredientsQuery);

      ingSnap.docs.forEach(doc => {
        const data = doc.data() as Ingredient;
        
        // Relaxed Stub Logic
        // An ingredient is only "Incomplete" (stub) if it has no supplier, or if packCost / packSize is 0.
        // We do NOT check stockLevel or kcalPer100.
        const hasSupplier = data.suppliers && data.suppliers.length > 0;
        const pref = hasSupplier ? (data.suppliers.find(s => s.isPreferred) || data.suppliers[0]) : null;
        const hasValidPrice = pref && pref.packCost > 0 && pref.packSize > 0;
        
        const isStub = !hasSupplier || !hasValidPrice;
        
        if (data.incomplete && isStub) {
           batch.delete(doc.ref);
           ingredientCount++;
        }
      });

      if (recipeCount > 0 || ingredientCount > 0) {
        await batch.commit();
      }
      
      return { recipeCount, ingredientCount };
    } catch (err) {
      console.error("Purge failed:", err);
      throw err;
    }
  }, []);

  const deletePendingRecipes = useCallback(async () => {
    try {
      const q = query(collection(db, 'recipes'), where('status', '==', 'pending_validation'));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      let count = 0;
      
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
      });

      if (count > 0) {
        await batch.commit();
      }
      return count;
    } catch (err) {
      console.error("Error deleting pending recipes:", err);
      throw err;
    }
  }, []);

  const bulkImport = useCallback(async (data: { ingredients: Ingredient[], recipes: Recipe[], dishes?: Dish[] }) => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      data.ingredients.forEach(ing => {
        const { id, ...cleanIng } = ing;
        const ref = doc(collection(db, 'ingredients'));
        batch.set(ref, cleanObject({ 
          ...cleanIng, 
          wastePercent: cleanIng.wastePercent ?? 0,
          stockLevel: cleanIng.stockLevel ?? 0,
          kcalPer100: cleanIng.kcalPer100 ?? 0,
          audited: true, 
          updatedAt: new Date().toISOString() 
        }));
      });
      data.recipes.forEach(rec => {
        const { id, ...cleanRec } = rec;
        const ref = doc(collection(db, 'recipes'));
        batch.set(ref, cleanObject({ ...cleanRec, updatedAt: new Date().toISOString() }));
      });
      if (data.dishes) {
        data.dishes.forEach(dish => {
          const { id, ...cleanDish } = dish;
          const ref = doc(collection(db, 'dishes'));
          batch.set(ref, cleanObject({ ...cleanDish, updatedAt: new Date().toISOString() }));
        });
      }
      await batch.commit();
    } catch (err: any) {
      console.error("Error in bulk import:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const seedDatabase = useCallback(async () => {
    if (ingredients.length > 0) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const collectionRef = collection(db, 'ingredients');
      DEFAULT_INGREDIENTS.forEach(ing => {
        const docRef = doc(collectionRef);
        batch.set(docRef, cleanObject({ ...ing, createdAt: new Date().toISOString() }));
      });
      await batch.commit();
    } catch (err: any) {
      console.error("Error seeding database:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ingredients.length]);

  const logUnresolvedIngredient = useCallback(async (name: string, recipeId: string) => {
     try {
       const collectionRef = collection(db, 'unresolved_ingredients');
       await addDoc(collectionRef, cleanObject({
         name,
         recipeId,
         detectedAt: new Date().toISOString(),
         status: 'open'
       }));
     } catch (err) {
       console.error("Error logging unresolved ingredient:", err);
     }
  }, []);

  const updateRecipeStatus = useCallback(async (id: string, status: RecipeStatus, items?: RecipeItem[], instructions?: string) => {
    try {
      const ref = doc(db, 'recipes', id);
      
      const payload = { 
        status: status || 'pending_validation', 
        updatedAt: new Date().toISOString(),
        items: items || [],
        instructions: instructions || "" 
      };
      
      const updateData = cleanObject(payload);
      
      await updateDoc(ref, updateData);
    } catch (err) {
      console.error("Error updating recipe status. Payload:", { id, status, items, instructions });
      throw err;
    }
  }, []);

  const searchSupplierPriceGuide = useCallback(async (searchTerm: string): Promise<SupplierPriceItem[]> => {
    if (!searchTerm || searchTerm.trim().length < 2) return [];
    try {
      // Load catalogue once, then filter in memory
      if (!davidCattLoaded.current) {
        const snapshot = await getDocs(collection(db, 'david_catt_db'));
        const unitMap: Record<string, string> = { each: 'ea', ea: 'ea', kg: 'kg', g: 'g', ml: 'ml', l: 'l', litre: 'l', ltr: 'l', gram: 'g', kilo: 'kg' };
        davidCattCache.current = snapshot.docs.map(d => {
          const data = d.data();
          const rawUnit = (data.pack_unit || 'ea').toLowerCase();
          return {
            id: d.id,
            name: data.name,
            packCost: data.cost,
            packSize: data.pack_size,
            packUnit: unitMap[rawUnit] || 'ea',
            kcalPer100: (() => {
              if (data.kcal_per_100g > 0) return data.kcal_per_100g;
              const lower = (data.name || '').toLowerCase();
              for (const [key, val] of Object.entries(COFID_DATA)) {
                if (lower.includes(key) && val > 0) return val;
              }
              return 0;
            })(),
            allergens: Array.isArray(data.allergens) ? data.allergens : [],
          };
        });
        davidCattLoaded.current = true;
      }
      const lower = searchTerm.toLowerCase().trim();
      const words = lower.split(/\s+/).filter(w => w.length > 2);
      return davidCattCache.current
        .filter(item => {
          const name = item.name?.toLowerCase() || '';
          return name.includes(lower) || words.some(w => name.includes(w));
        })
        .slice(0, 15);
    } catch (err) {
      console.error("Error searching David Catt price guide:", err);
      return [];
    }
  }, []);

  // ── Stock Management ────────────────────────────────────────────────────────

  const addInvoice = useCallback(async (
    invoiceData: Omit<Invoice, 'id'>,
    movements: Omit<StockMovement, 'id'>[]
  ) => {
    const now = new Date().toISOString();
    const batch = writeBatch(db);

    // Create invoice doc
    const invoiceRef = doc(collection(db, 'invoices'));
    batch.set(invoiceRef, cleanObject({ ...invoiceData, createdAt: now }));

    // Create movement docs and update ingredient stockLevels
    movements.forEach(mv => {
      const mvRef = doc(collection(db, 'stock_movements'));
      batch.set(mvRef, cleanObject({ ...mv, invoiceId: invoiceRef.id, createdAt: now }));
      // Increment stockLevel on ingredient
      const ingRef = doc(db, 'ingredients', mv.ingredientId);
      batch.update(ingRef, { stockLevel: (ingredients.find((i: Ingredient) => i.id === mv.ingredientId)?.stockLevel ?? 0) + mv.quantity, updatedAt: now });
    });

    await batch.commit();
  }, [ingredients]);

  const logWaste = useCallback(async (
    ingredientId: string,
    quantity: number,
    unit: string,
    notes?: string,
    date?: string
  ) => {
    const now = new Date().toISOString();
    const today = date || now.slice(0, 10);
    const ing = ingredients.find((i: Ingredient) => i.id === ingredientId);
    const currentStock = ing?.stockLevel ?? 0;
    const batch = writeBatch(db);

    const mvRef = doc(collection(db, 'stock_movements'));
    batch.set(mvRef, cleanObject({
      ingredientId,
      type: 'waste',
      quantity: -Math.abs(quantity),
      unit,
      date: today,
      notes,
      createdAt: now,
    }));

    const ingRef = doc(db, 'ingredients', ingredientId);
    batch.update(ingRef, { stockLevel: Math.max(0, currentStock - Math.abs(quantity)), updatedAt: now });

    await batch.commit();
  }, [ingredients]);

  const commitStockTake = useCallback(async (changes: { id: string; newLevel: number }[]) => {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const batch = writeBatch(db);

    changes.forEach(({ id, newLevel }) => {
      const ing = ingredients.find((i: Ingredient) => i.id === id);
      const oldLevel = ing?.stockLevel ?? 0;
      const delta = newLevel - oldLevel;

      const mvRef = doc(collection(db, 'stock_movements'));
      batch.set(mvRef, cleanObject({
        ingredientId: id,
        type: 'stock_take',
        quantity: delta,
        unit: ing?.suppliers[0]?.packUnit || 'g',
        date: today,
        notes: `Stock take: ${oldLevel} → ${newLevel}`,
        createdAt: now,
      }));

      const ingRef = doc(db, 'ingredients', id);
      batch.update(ingRef, { stockLevel: newLevel, updatedAt: now });
    });

    await batch.commit();
  }, [ingredients]);

  const seedSupplierPriceGuide = useCallback(async () => {
    setLoading(true);
    try {
      const TEST_BATCH = [
        { name: "Potatoes - Chippers Washed", packCost: 14.50, packSize: 25, packUnit: 'kg' },
        { name: "Potatoes - Koffmann's Chipping", packCost: 20.25, packSize: 20, packUnit: 'kg' },
        { name: "Peppers Mixed Loose", packCost: 18.13, packSize: 5, packUnit: 'kg' },
        { name: "Tomatoes Standard", packCost: 13.75, packSize: 6, packUnit: 'kg' },
        { name: "Tomatoes On Vine", packCost: 10.63, packSize: 5, packUnit: 'kg' },
        { name: "Mushrooms Button", packCost: 7.75, packSize: 2.5, packUnit: 'kg' },
        { name: "Mushrooms Portobello", packCost: 7.00, packSize: 1.5, packUnit: 'kg' }
      ];

      const batch = writeBatch(db);
      
      TEST_BATCH.forEach(item => {
        const docRef = doc(collection(db, 'supplier_prices'));
        batch.set(docRef, {
          ...item,
          supplier: "David Catt",
          name_lowercase: item.name.toLowerCase(),
          unitPrice: Number((item.packCost / item.packSize).toFixed(4)),
          updatedAt: new Date().toISOString()
        });
      });

      await batch.commit();
      console.info(`[SEED] Successfully added ${TEST_BATCH.length} items to supplier_prices.`);
    } catch (err: any) {
      console.error("Error seeding supplier prices:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const dismissScanQueueItem = useCallback(async (id: string) => {
    await updateDoc(doc(db, 'scan_queue', id), { status: 'done' });
  }, []);

  return {
    ingredients,
    recipes,
    dishes,
    stockMovements,
    invoices,
    scanQueue,
    loading,
    error,
    connectionStatus,
    addInvoice,
    logWaste,
    commitStockTake,
    addIngredient,
    updateIngredient,
    deleteIngredient,
    saveRecipe,
    updateRecipe,
    deleteRecipe,
    ingestRawRecipe,
    batchIngestFiles,
    saveDish,
    updateDish,
    deleteDish,
    mergeIngredients,
    purgeStagingData,
    deletePendingRecipes,
    seedDatabase,
    bulkImport,
    logUnresolvedIngredient,
    updateRecipeStatus,
    searchSupplierPriceGuide,
    seedSupplierPriceGuide,
    dismissScanQueueItem
  };
};
