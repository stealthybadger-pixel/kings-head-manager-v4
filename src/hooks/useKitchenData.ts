import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc, deleteField, writeBatch, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { tokenizeSearchQuery, matchesSearchTokens } from '../utils/search';
import {
  Ingredient, IngredientSchema,
  Recipe, RecipeSchema,
  Dish, DishSchema,
  ContainerProfile, ContainerProfileSchema,
  StockMovement, StockMovementSchema,
  StocktakeReport, StocktakeReportSchema,
  StocktakeDraft, StocktakeDraftSchema,
  SupplierProduct, SupplierProductSchema,
  Supplier, SupplierSchema,
  FoodTempCheck, FoodTempCheckSchema,
  Equipment, EquipmentSchema,
  EquipmentTempCheck, EquipmentTempCheckSchema
} from '../types';

// Firestore's SDK is configured with `ignoreUndefinedProperties: true`
// (see firebase.ts), which means updateDoc() silently DROPS any field set
// to `undefined` from the write instead of clearing it — the old stored
// value is left untouched. Any code that wants to actually clear an
// optional field (e.g. unchecking a toggle) needs Firestore's deleteField()
// sentinel instead of `undefined`. This converts every undefined value in
// a partial-update payload to deleteField() so callers can just assign
// `undefined` normally and have it behave as "clear this field".
function withDeleteFieldForUndefined(payload: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    result[key] = value === undefined ? deleteField() : value;
  }
  return result;
}

// Generic fetcher that parses and validates with Zod
async function fetchCollection<T>(collectionName: string, schema: any): Promise<T[]> {
  const querySnapshot = await getDocs(collection(db, collectionName));
  const items: T[] = [];
  
  querySnapshot.forEach((docSnapshot) => {
    const rawData = { id: docSnapshot.id, ...docSnapshot.data() };
    const result = schema.safeParse(rawData);
    if (result.success) {
      items.push(result.data);
    } else {
      console.warn(`[Zod Schema Validation Failure] in collection '${collectionName}' for ID '${docSnapshot.id}':`, result.error.format());
      // Fallback: still push the raw data to avoid losing access in UI, but log error
      items.push(rawData as T);
    }
  });
  
  return items;
}

export const useIngredients = () => {
  return useQuery<Ingredient[]>({
    queryKey: ['ingredients'],
    queryFn: () => fetchCollection<Ingredient>('ingredients', IngredientSchema)
  });
};

export const useRecipes = () => {
  return useQuery<Recipe[]>({
    queryKey: ['recipes'],
    queryFn: () => fetchCollection<Recipe>('recipes', RecipeSchema)
  });
};

export const useDishes = () => {
  return useQuery<Dish[]>({
    queryKey: ['dishes'],
    queryFn: () => fetchCollection<Dish>('dishes', DishSchema)
  });
};

export const useContainerProfiles = () => {
  return useQuery<ContainerProfile[]>({
    queryKey: ['container_profiles'],
    queryFn: () => fetchCollection<ContainerProfile>('container_profiles', ContainerProfileSchema)
  });
};

// --- MUTATIONS ---

export const useIngredientMutations = () => {
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: async (ingredient: Omit<Ingredient, 'id'>) => {
      const docRef = doc(collection(db, 'ingredients'));
      const { id: _, ...rest } = ingredient as any;
      const fullItem = { id: docRef.id, ...rest, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
      // Strict client-side validation before writing to DB
      IngredientSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ingredients'] })
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Ingredient> }) => {
      const docRef = doc(db, 'ingredients', id);
      const { id: _, createdAt: __, ...updatePayload } = data as any;
      const updateData = withDeleteFieldForUndefined({ ...updatePayload, updatedAt: new Date().toISOString() });
      await updateDoc(docRef, updateData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ingredients'] })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'ingredients', id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ingredients'] })
  });

  return { addIngredient: addMutation, updateIngredient: updateMutation, deleteIngredient: deleteMutation };
};

export const useRecipeMutations = () => {
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: async (recipe: Omit<Recipe, 'id'>) => {
      const docRef = doc(collection(db, 'recipes'));
      const { id: _, ...rest } = recipe as any;
      const fullItem = { id: docRef.id, ...rest, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
      RecipeSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] })
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Recipe> }) => {
      const docRef = doc(db, 'recipes', id);
      const { id: _, createdAt: __, ...updatePayload } = data as any;
      const updateData = withDeleteFieldForUndefined({ ...updatePayload, updatedAt: new Date().toISOString() });
      await updateDoc(docRef, updateData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'recipes', id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] })
  });

  return { addRecipe: addMutation, updateRecipe: updateMutation, deleteRecipe: deleteMutation };
};

export const useDishMutations = () => {
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: async (dish: Omit<Dish, 'id'>) => {
      const docRef = doc(collection(db, 'dishes'));
      const { id: _, ...rest } = dish as any;
      const fullItem = { id: docRef.id, ...rest, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
      DishSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dishes'] })
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Dish> }) => {
      const docRef = doc(db, 'dishes', id);
      const { id: _, createdAt: __, ...updatePayload } = data as any;
      const updateData = withDeleteFieldForUndefined({ ...updatePayload, updatedAt: new Date().toISOString() });
      await updateDoc(docRef, updateData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dishes'] })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'dishes', id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dishes'] })
  });

  return { addDish: addMutation, updateDish: updateMutation, deleteDish: deleteMutation };
};

// --- STOCK MOVEMENTS ---

export const useStockMutations = () => {
  const queryClient = useQueryClient();

  const logMovement = useMutation({
    mutationFn: async (movement: Omit<StockMovement, 'id'>) => {
      const batch = writeBatch(db);
      
      const docRef = doc(collection(db, 'stock_movements'));
      const fullMovement = { id: docRef.id, ...movement, createdAt: new Date().toISOString() };
      StockMovementSchema.parse(fullMovement);
      
      batch.set(docRef, fullMovement);

      await batch.commit();
      return fullMovement;
    },
    onSuccess: (fullMovement) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      if (fullMovement.recipeId) queryClient.invalidateQueries({ queryKey: ['recipes'] });
      // useStockMovements keys on ['stock_movements', type] — partial
      // matching on the prefix catches every type-filtered variant
      // (e.g. the Wastage History list), not just the exact movement's type.
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
    }
  });

  return { logMovement };
};

export const useStockMovements = (type?: string) => {
  return useQuery<StockMovement[]>({
    queryKey: ['stock_movements', type ?? 'all'],
    queryFn: async () => {
      const q = type
        ? query(collection(db, 'stock_movements'), where('type', '==', type))
        : collection(db, 'stock_movements');
      const snap = await getDocs(q as any);
      const items: StockMovement[] = [];
      snap.forEach(d => {
        const raw = { id: d.id, ...(d.data() as object) };
        const result = StockMovementSchema.safeParse(raw);
        items.push(result.success ? result.data : raw as StockMovement);
      });
      return items.sort((a, b) => b.date.localeCompare(a.date));
    },
    staleTime: 60 * 1000
  });
};

export const useStocktakeReports = () => {
  return useQuery<StocktakeReport[]>({
    queryKey: ['stocktake_reports'],
    queryFn: async () => {
      try {
        console.log("[useStocktakeReports] Fetching stocktake_reports...");
        const snap = await getDocs(collection(db, 'stocktake_reports'));
        console.log(`[useStocktakeReports] Found ${snap.size} documents in Firestore`);
        const items: StocktakeReport[] = [];
        snap.forEach(d => {
          const raw = { id: d.id, ...d.data() };
          const result = StocktakeReportSchema.safeParse(raw);
          if (!result.success) {
            console.warn(`[useStocktakeReports] Validation failed for report ${d.id}:`, result.error);
          }
          items.push(result.success ? result.data : raw as StocktakeReport);
        });
        const sorted = items.sort((a, b) => b.date.localeCompare(a.date));
        console.log("[useStocktakeReports] Returning sorted reports:", sorted);
        return sorted;
      } catch (err) {
        console.error("[useStocktakeReports] Error fetching reports:", err);
        throw err;
      }
    },
    staleTime: 60 * 1000
  });
};

export const useStocktakeMutations = () => {
  const queryClient = useQueryClient();
  const saveReport = useMutation({
    mutationFn: async (report: Omit<StocktakeReport, 'id'>) => {
      const docRef = doc(collection(db, 'stocktake_reports'));
      const full = { id: docRef.id, ...report, createdAt: new Date().toISOString() };
      await setDoc(docRef, full);
      return full;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stocktake_reports'] })
  });
  // Combines several reports (e.g. one stocktake accidentally committed in
  // pieces) into a single new report, then removes the originals — done as
  // one atomic batch so a failure partway never leaves duplicates or a gap.
  const mergeReports = useMutation({
    mutationFn: async ({ sourceIds, merged }: { sourceIds: string[]; merged: Omit<StocktakeReport, 'id'> }) => {
      const batch = writeBatch(db);
      const newRef = doc(collection(db, 'stocktake_reports'));
      batch.set(newRef, { id: newRef.id, ...merged, createdAt: new Date().toISOString() });
      for (const id of sourceIds) {
        batch.delete(doc(db, 'stocktake_reports', id));
      }
      await batch.commit();
      return newRef.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stocktake_reports'] })
  });
  return { saveReport, mergeReports };
};

const STOCKTAKE_DRAFT_ID = 'current';

// The one in-progress stocktake, if any — a chef can pause (exit the modal)
// and resume it later, possibly on a different device, without losing
// progress or splitting one count into two separate reports.
export const useStocktakeDraft = () => {
  return useQuery<StocktakeDraft | null>({
    queryKey: ['stocktake_draft'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'stocktake_drafts', STOCKTAKE_DRAFT_ID));
      if (!snap.exists()) return null;
      const raw = { id: snap.id, ...snap.data() };
      const result = StocktakeDraftSchema.safeParse(raw);
      return result.success ? result.data : (raw as StocktakeDraft);
    },
    staleTime: 0
  });
};

export const useStocktakeDraftMutations = () => {
  const queryClient = useQueryClient();
  const saveDraft = useMutation({
    mutationFn: async (draft: Omit<StocktakeDraft, 'id'>) => {
      await setDoc(doc(db, 'stocktake_drafts', STOCKTAKE_DRAFT_ID), draft);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stocktake_draft'] })
  });
  const clearDraft = useMutation({
    mutationFn: async () => {
      await deleteDoc(doc(db, 'stocktake_drafts', STOCKTAKE_DRAFT_ID));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stocktake_draft'] })
  });
  return { saveDraft, clearDraft };
};

export const searchSupplierProducts = async (searchTerm: string, supplier: string): Promise<SupplierProduct[]> => {
  if (!searchTerm || searchTerm.trim().length < 2) return [];
  
  const queryTokens = tokenizeSearchQuery(searchTerm);
  if (queryTokens.length === 0) return [];
  
  // Use the first word for the Firestore prefix query
  const firstWord = queryTokens[0];
  const variations = [
    firstWord,
    firstWord.charAt(0).toUpperCase() + firstWord.slice(1),
  ];
  
  const resultsMap = new Map<string, SupplierProduct>();
  
  for (const term of variations) {
    const q = query(
      collection(db, 'supplierProducts'),
      where('name', '>=', term),
      where('name', '<=', term + '\uf8ff'),
      limit(200)
    );
    
    const snapshot = await getDocs(q);
    snapshot.forEach((docSnapshot) => {
      const rawData = { id: docSnapshot.id, ...docSnapshot.data() };
      const result = SupplierProductSchema.safeParse(rawData);
      if (result.success) {
        if (supplier === 'All' || result.data.supplier === supplier) {
          resultsMap.set(result.data.id, result.data);
        }
      }
    });
  }
  
  // In-memory filter: ensure all tokens exist in the product name
  const filteredResults = Array.from(resultsMap.values()).filter(prod =>
    matchesSearchTokens(prod.name, queryTokens)
  );
  
  return filteredResults;
};

export const useSupplierProducts = () => {
  return useQuery<SupplierProduct[]>({
    queryKey: ['supplier_products_all'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'supplierProducts'));
      const items: SupplierProduct[] = [];
      snap.forEach(docSnapshot => {
        const rawData = { id: docSnapshot.id, ...docSnapshot.data() };
        const result = SupplierProductSchema.safeParse(rawData);
        if (result.success) items.push(result.data);
      });
      return items.sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 5 * 60 * 1000
  });
};

export const useSupplierSearchQuery = (searchTerm: string, supplier: string) => {
  return useQuery<SupplierProduct[]>({
    queryKey: ['supplier_search', searchTerm, supplier],
    queryFn: () => searchSupplierProducts(searchTerm, supplier),
    enabled: searchTerm.trim().length >= 2,
    staleTime: 5 * 60 * 1000
  });
};

export const useSupplierProductsBySupplier = (supplier: string) => {
  return useQuery<SupplierProduct[]>({
    queryKey: ['supplier_browse', supplier],
    queryFn: async () => {
      const q = query(
        collection(db, 'supplierProducts'),
        where('supplier', '==', supplier)
      );
      const snapshot = await getDocs(q);
      const items: SupplierProduct[] = [];
      snapshot.forEach(docSnapshot => {
        const rawData = { id: docSnapshot.id, ...docSnapshot.data() };
        const result = SupplierProductSchema.safeParse(rawData);
        if (result.success) items.push(result.data);
      });
      return items.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: supplier !== 'All',
    staleTime: 5 * 60 * 1000
  });
};

export const useSuppliers = () => {
  return useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => fetchCollection<Supplier>('suppliers', SupplierSchema)
  });
};

export const useSupplierMutations = () => {
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: async (supplier: Omit<Supplier, 'id'>) => {
      const docRef = doc(collection(db, 'suppliers'));
      const fullItem = { id: docRef.id, ...supplier, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      SupplierSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Supplier> }) => {
      const docRef = doc(db, 'suppliers', id);
      const { id: _, createdAt: __, ...updatePayload } = data as any;
      await updateDoc(docRef, withDeleteFieldForUndefined({ ...updatePayload, updatedAt: new Date().toISOString() }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'suppliers', id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] })
  });

  return { addSupplier: addMutation, updateSupplier: updateMutation, deleteSupplier: deleteMutation };
};

export const useSupplierProductMutations = () => {
  const queryClient = useQueryClient();

  const invalidateCatalogQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['supplier_search'] });
    queryClient.invalidateQueries({ queryKey: ['supplier_products_all'] });
    queryClient.invalidateQueries({ queryKey: ['all_supplier_products_summary'] });
    queryClient.invalidateQueries({ queryKey: ['supplier_browse'] });
  };

  const addMutation = useMutation({
    mutationFn: async (data: Omit<SupplierProduct, 'id'>) => {
      const docRef = doc(collection(db, 'supplierProducts'));
      const fullItem = { id: docRef.id, ...data };
      SupplierProductSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: invalidateCatalogQueries
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SupplierProduct> }) => {
      const docRef = doc(db, 'supplierProducts', id);
      const { id: _, ...updatePayload } = data as any;
      await updateDoc(docRef, withDeleteFieldForUndefined(updatePayload));
    },
    onSuccess: invalidateCatalogQueries
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'supplierProducts', id));
    },
    onSuccess: invalidateCatalogQueries
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const batch = writeBatch(db);
        chunk.forEach(id => batch.delete(doc(db, 'supplierProducts', id)));
        await batch.commit();
      }
    },
    onSuccess: invalidateCatalogQueries
  });

  return {
    addSupplierProduct: addMutation,
    updateSupplierProduct: updateMutation,
    deleteSupplierProduct: deleteMutation,
    bulkDeleteSupplierProducts: bulkDeleteMutation
  };
};

export interface ScrapeLogEntry {
  id: string;
  supplier: string;
  count: number;
  added: number;
  updated: number;
  scrapedAt: string;
  source: string;
}

export const useScrapeLogs = () => {
  return useQuery<ScrapeLogEntry[]>({
    queryKey: ['scrape_logs'],
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, 'scrapeLog'));
      const items: ScrapeLogEntry[] = [];
      snapshot.forEach(d => items.push({ id: d.id, ...d.data() } as ScrapeLogEntry));
      return items.sort((a, b) => b.scrapedAt.localeCompare(a.scrapedAt));
    },
    staleTime: 2 * 60 * 1000
  });
};

export const useAllSupplierProducts = () => {
  return useQuery({
    queryKey: ['all_supplier_products_summary'],
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, 'supplierProducts'));
      const bySupplier: Record<string, { count: number; latestAt: string }> = {};
      const products: SupplierProduct[] = [];
      snapshot.forEach(d => {
        const data = d.data();
        const sup = data.supplier as string;
        const ts: string = data.importedAt || data.capturedAt || '';
        if (!bySupplier[sup]) bySupplier[sup] = { count: 0, latestAt: ts };
        bySupplier[sup].count++;
        if (ts > bySupplier[sup].latestAt) bySupplier[sup].latestAt = ts;
        const result = SupplierProductSchema.safeParse({ id: d.id, ...data });
        if (result.success) products.push(result.data);
      });
      return { bySupplier, products };
    },
    staleTime: 5 * 60 * 1000
  });
};

// --- FOOD TEMP CHECKS ---

// Local-time YYYY-MM-DD, used to scope "today's" checklist without a
// timezone-fiddly range query against a timestamp field.
export function todayCheckDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const useFoodTempChecksToday = () => {
  const checkDate = todayCheckDate();
  return useQuery<FoodTempCheck[]>({
    queryKey: ['food_temp_checks', checkDate],
    queryFn: async () => {
      const q = query(collection(db, 'food_temp_checks'), where('checkDate', '==', checkDate));
      const snap = await getDocs(q);
      const items: FoodTempCheck[] = [];
      snap.forEach(d => {
        const raw = { id: d.id, ...(d.data() as object) };
        const result = FoodTempCheckSchema.safeParse(raw);
        items.push(result.success ? result.data : raw as FoodTempCheck);
      });
      return items;
    },
    staleTime: 30 * 1000
  });
};

export const useFoodTempChecksHistory = () => {
  return useQuery<FoodTempCheck[]>({
    queryKey: ['food_temp_checks', 'history'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'food_temp_checks'));
      const items: FoodTempCheck[] = [];
      snap.forEach(d => {
        const raw = { id: d.id, ...(d.data() as object) };
        const result = FoodTempCheckSchema.safeParse(raw);
        items.push(result.success ? result.data : raw as FoodTempCheck);
      });
      return items.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
    },
    staleTime: 60 * 1000
  });
};

export const useFoodTempCheckMutations = () => {
  const queryClient = useQueryClient();

  const recordCheck = useMutation({
    mutationFn: async (check: Omit<FoodTempCheck, 'id'>) => {
      const docRef = doc(collection(db, 'food_temp_checks'));
      const fullItem = { id: docRef.id, ...check };
      FoodTempCheckSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: (fullItem) => {
      queryClient.invalidateQueries({ queryKey: ['food_temp_checks', fullItem.checkDate] });
      queryClient.invalidateQueries({ queryKey: ['food_temp_checks', 'history'] });
    }
  });

  return { recordCheck };
};

// --- EQUIPMENT (floor plan) ---

export const useEquipmentList = () => {
  return useQuery<Equipment[]>({
    queryKey: ['equipment'],
    queryFn: () => fetchCollection<Equipment>('equipment', EquipmentSchema)
  });
};

export const useEquipmentMutations = () => {
  const queryClient = useQueryClient();

  const addEquipment = useMutation({
    mutationFn: async (equipment: Omit<Equipment, 'id'>) => {
      const docRef = doc(collection(db, 'equipment'));
      const fullItem = { id: docRef.id, ...equipment, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      EquipmentSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment'] })
  });

  const updateEquipment = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Equipment> }) => {
      const docRef = doc(db, 'equipment', id);
      const { id: _, createdAt: __, ...updatePayload } = data as any;
      await updateDoc(docRef, withDeleteFieldForUndefined({ ...updatePayload, updatedAt: new Date().toISOString() }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment'] })
  });

  const deleteEquipment = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'equipment', id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment'] })
  });

  return { addEquipment, updateEquipment, deleteEquipment };
};

export const useEquipmentChecksToday = () => {
  const checkDate = todayCheckDate();
  return useQuery<EquipmentTempCheck[]>({
    queryKey: ['equipment_temp_checks', checkDate],
    queryFn: async () => {
      const q = query(collection(db, 'equipment_temp_checks'), where('checkDate', '==', checkDate));
      const snap = await getDocs(q);
      const items: EquipmentTempCheck[] = [];
      snap.forEach(d => {
        const raw = { id: d.id, ...(d.data() as object) };
        const result = EquipmentTempCheckSchema.safeParse(raw);
        items.push(result.success ? result.data : raw as EquipmentTempCheck);
      });
      return items;
    },
    staleTime: 30 * 1000
  });
};

export const useEquipmentChecksHistory = () => {
  return useQuery<EquipmentTempCheck[]>({
    queryKey: ['equipment_temp_checks', 'history'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'equipment_temp_checks'));
      const items: EquipmentTempCheck[] = [];
      snap.forEach(d => {
        const raw = { id: d.id, ...(d.data() as object) };
        const result = EquipmentTempCheckSchema.safeParse(raw);
        items.push(result.success ? result.data : raw as EquipmentTempCheck);
      });
      return items.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
    },
    staleTime: 60 * 1000
  });
};

export const useEquipmentCheckMutations = () => {
  const queryClient = useQueryClient();

  // Unlike food checks, out-of-range readings ARE recorded here — see
  // EquipmentTempCheckSchema.
  const recordCheck = useMutation({
    mutationFn: async (check: Omit<EquipmentTempCheck, 'id'>) => {
      const docRef = doc(collection(db, 'equipment_temp_checks'));
      const fullItem = { id: docRef.id, ...check };
      EquipmentTempCheckSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: (fullItem) => {
      queryClient.invalidateQueries({ queryKey: ['equipment_temp_checks', fullItem.checkDate] });
      queryClient.invalidateQueries({ queryKey: ['equipment_temp_checks', 'history'] });
    }
  });

  return { recordCheck };
};

