import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { collection, getDocs, getDoc, getCountFromServer, doc, setDoc, deleteDoc, updateDoc, deleteField, writeBatch, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { tokenizeSearchQuery, matchesSearchTokens } from '../utils/search';
import { getSupplierUrl } from '../utils/supplierUrls';
import {
  Ingredient, IngredientSchema, IngredientSupplier,
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

// --- CACHE-PATCHING HELPERS (Firestore Optimisation Phase 2) ---
// Applied to an already-cached array without triggering a refetch. Every
// helper is a no-op when the target query isn't currently cached (`old` is
// undefined) — nothing gets seeded for a screen nobody has visited yet, so
// it fetches fresh (and correctly) the first time it's actually mounted.

// Strips `id`/`createdAt` from an update payload and stamps a fresh
// `updatedAt` — the same shape used for both the Firestore write (after
// withDeleteFieldForUndefined) and the local cache patch, so the two never
// drift apart.
function buildPatch<T extends { id: string; createdAt?: string }>(data: Partial<T>): Partial<T> & { updatedAt: string } {
  const { id: _id, createdAt: _createdAt, ...rest } = data as any;
  return { ...rest, updatedAt: new Date().toISOString() };
}

function patchArrayItem<T extends { id: string }>(queryClient: QueryClient, queryKey: readonly unknown[], id: string, patch: Partial<T>) {
  queryClient.setQueryData<T[]>(queryKey as any, (old) =>
    old ? old.map((item) => (item.id === id ? { ...item, ...patch } : item)) : old
  );
}

function appendArrayItem<T>(queryClient: QueryClient, queryKey: readonly unknown[], item: T) {
  queryClient.setQueryData<T[]>(queryKey as any, (old) => (old ? [...old, item] : old));
}

function prependArrayItem<T>(queryClient: QueryClient, queryKey: readonly unknown[], item: T) {
  queryClient.setQueryData<T[]>(queryKey as any, (old) => (old ? [item, ...old] : old));
}

function removeArrayItem<T extends { id: string }>(queryClient: QueryClient, queryKey: readonly unknown[], id: string) {
  queryClient.setQueryData<T[]>(queryKey as any, (old) => (old ? old.filter((item) => item.id !== id) : old));
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

// --- DASHBOARD SUMMARY COUNTS ---
// Firestore aggregate count() queries — for screens that only need a total
// document count (e.g. the Dashboard's stat tiles), not the documents
// themselves. Billed as a small fraction of a full collection read
// regardless of collection size, unlike fetchCollection's getDocs().
//
// A document count only changes when a document is added or deleted, never
// on an in-place edit — so these are cached long and refetched only via the
// explicit invalidation in useIngredientMutations/useRecipeMutations/
// useDishMutations' add/delete (not update) onSuccess handlers, rather than
// on every mount/focus/reconnect like the rest of the app's queries.
//
// refetchOnMount is deliberately left at its default (true = "refetch if
// stale", not "always refetch") rather than disabled: the add/delete that
// invalidates a count almost always happens on a different screen (e.g.
// adding an ingredient from Pantry), so Dashboard has no active observer at
// invalidation time — invalidateQueries only marks the query stale then,
// it can't refetch something nobody's watching. refetchOnMount:true is what
// makes the *next* Dashboard mount notice that staleness and catch up.
const DASHBOARD_COUNT_QUERY_OPTIONS = {
  staleTime: 30 * 60 * 1000, // 30 minutes
  gcTime: 60 * 60 * 1000, // 1 hour
  refetchOnWindowFocus: false,
  refetchOnReconnect: false
} as const;

export const useIngredientsCount = () => {
  return useQuery<number>({
    queryKey: ['ingredients_count'],
    queryFn: async () => {
      const snap = await getCountFromServer(collection(db, 'ingredients'));
      return snap.data().count;
    },
    ...DASHBOARD_COUNT_QUERY_OPTIONS
  });
};

export const useRecipesCount = () => {
  return useQuery<number>({
    queryKey: ['recipes_count'],
    queryFn: async () => {
      const snap = await getCountFromServer(collection(db, 'recipes'));
      return snap.data().count;
    },
    ...DASHBOARD_COUNT_QUERY_OPTIONS
  });
};

export const useDishesCount = () => {
  return useQuery<number>({
    queryKey: ['dishes_count'],
    queryFn: async () => {
      const snap = await getCountFromServer(collection(db, 'dishes'));
      return snap.data().count;
    },
    ...DASHBOARD_COUNT_QUERY_OPTIONS
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
    onSuccess: (fullItem) => {
      appendArrayItem<Ingredient>(queryClient, ['ingredients'], fullItem);
      // Adding a document changes the Dashboard's count tile — updates don't.
      // Left as invalidate (not a client-side +1) since the count is a
      // server aggregate and invalidate is the safest way to stay exactly
      // correct if two people add from different devices at once.
      queryClient.invalidateQueries({ queryKey: ['ingredients_count'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Ingredient> }) => {
      const docRef = doc(db, 'ingredients', id);
      const patch = buildPatch<Ingredient>(data);
      await updateDoc(docRef, withDeleteFieldForUndefined(patch));
      return patch;
    },
    onSuccess: (patch, { id }) => patchArrayItem<Ingredient>(queryClient, ['ingredients'], id, patch)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'ingredients', id));
    },
    onSuccess: (_data, id) => {
      removeArrayItem<Ingredient>(queryClient, ['ingredients'], id);
      // Deleting a document changes the Dashboard's count tile too.
      queryClient.invalidateQueries({ queryKey: ['ingredients_count'] });
    }
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
    onSuccess: (fullItem) => {
      appendArrayItem<Recipe>(queryClient, ['recipes'], fullItem);
      queryClient.invalidateQueries({ queryKey: ['recipes_count'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Recipe> }) => {
      const docRef = doc(db, 'recipes', id);
      const patch = buildPatch<Recipe>(data);
      await updateDoc(docRef, withDeleteFieldForUndefined(patch));
      return patch;
    },
    onSuccess: (patch, { id }) => patchArrayItem<Recipe>(queryClient, ['recipes'], id, patch)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'recipes', id));
    },
    onSuccess: (_data, id) => {
      removeArrayItem<Recipe>(queryClient, ['recipes'], id);
      queryClient.invalidateQueries({ queryKey: ['recipes_count'] });
    }
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
    onSuccess: (fullItem) => {
      appendArrayItem<Dish>(queryClient, ['dishes'], fullItem);
      queryClient.invalidateQueries({ queryKey: ['dishes_count'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Dish> }) => {
      const docRef = doc(db, 'dishes', id);
      const patch = buildPatch<Dish>(data);
      await updateDoc(docRef, withDeleteFieldForUndefined(patch));
      return patch;
    },
    onSuccess: (patch, { id }) => patchArrayItem<Dish>(queryClient, ['dishes'], id, patch)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'dishes', id));
    },
    onSuccess: (_data, id) => {
      removeArrayItem<Dish>(queryClient, ['dishes'], id);
      queryClient.invalidateQueries({ queryKey: ['dishes_count'] });
    }
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
    // NOTE: this mutation only ever writes a stock_movements ledger entry —
    // it never touches the ingredient or recipe document (stockLevel is
    // written separately, only by Stock Take's updateIngredient/
    // updateRecipe calls, which already invalidate ['ingredients']/
    // ['recipes'] themselves). There's also no Cloud Function in this
    // project (no functions/ dir, no "functions" key in firebase.json)
    // that could be doing it server-side. So the ['ingredients']/['recipes']
    // invalidation this used to do on every waste/goods-in log was a full
    // collection re-read for data that never actually changed — removed.
    onSuccess: (fullMovement) => {
      // Precisely targets whichever cache(s) this movement actually belongs
      // in (['stock_movements', <its type>] and/or ['stock_movements','all']
      // if either is currently cached) instead of invalidating the whole
      // ['stock_movements'] prefix, which used to refetch every type-filtered
      // list regardless of whether the new movement matched it.
      prependArrayItem<StockMovement>(queryClient, ['stock_movements', fullMovement.type], fullMovement);
      prependArrayItem<StockMovement>(queryClient, ['stock_movements', 'all'], fullMovement);
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
    // Reports sort newest-date-first and a freshly saved report's date is
    // always "today" (see handleCommitStockTake), so it always belongs at
    // the front — safe to prepend instead of refetching the whole list.
    onSuccess: (full) => prependArrayItem<StocktakeReport>(queryClient, ['stocktake_reports'], full)
  });
  // Combines several reports (e.g. one stocktake accidentally committed in
  // pieces) into a single new report, then removes the originals — done as
  // one atomic batch so a failure partway never leaves duplicates or a gap.
  // Left on invalidateQueries deliberately: this is a rare, manually
  // triggered recovery action (not a hot path), it changes multiple
  // documents in one batch, and the merged report's `date` isn't guaranteed
  // to be the newest (it could combine reports from different days) — a
  // precise cache patch could put it in the wrong sort position, so a plain
  // refetch is the safest way to keep the sort order correct here.
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

// `enabled` defaults to true so existing no-argument callers (e.g.
// useCatalogCapture) are unaffected. Catalog.tsx passes it explicitly so
// this full-collection download only happens for the one case that
// genuinely needs it: searching across every supplier at once (see
// useSupplierProductsBySupplier below for the supplier-scoped case).
export const useSupplierProducts = (enabled: boolean = true) => {
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
    enabled,
    staleTime: 5 * 60 * 1000
  });
};

// The linked supplier products for a single Pantry Ingredient — the single source of truth
// for its supplier options (see Pantry.tsx's "Supplier Products" section). Indexed exact
// match on ingredientId; no name/fuzzy matching, so this only ever returns products someone
// has deliberately linked (via the Catalogue Matcher or Pantry's "Add Supplier Product").
export const useSupplierProductsForIngredient = (ingredientId: string | undefined) => {
  return useQuery<SupplierProduct[]>({
    queryKey: ['supplier_products_by_ingredient', ingredientId],
    queryFn: async () => {
      const q = query(collection(db, 'supplierProducts'), where('ingredientId', '==', ingredientId));
      const snap = await getDocs(q);
      const items: SupplierProduct[] = [];
      snap.forEach(docSnapshot => {
        const rawData = { id: docSnapshot.id, ...docSnapshot.data() };
        const result = SupplierProductSchema.safeParse(rawData);
        if (result.success) items.push(result.data);
      });
      return items.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!ingredientId,
    staleTime: 5 * 60 * 1000
  });
};

// Regenerates ingredient.suppliers[] — the array costing.ts reads synchronously across
// Kitchen/Stock/Service — from the full set of supplierProducts linked to that ingredient.
// suppliers[] is no longer user-edited directly; it's a derived cache kept in sync by this
// helper so costing keeps working unchanged without an app-wide async rewrite.
function deriveIngredientSuppliers(products: SupplierProduct[]): IngredientSupplier[] {
  return products.map(p => ({
    name: p.supplier,
    packCost: p.packCost,
    packSize: p.packSize,
    packUnit: p.packUnit,
    isPreferred: !!p.isPreferred,
    sourceUrl: getSupplierUrl(p),
    productName: p.name,
    priceUpdatedAt: new Date().toISOString()
  }));
}

// Standalone (non-hook) version of the resync, for call sites that don't hold a fixed
// ingredientId at hook-setup time — e.g. Catalog.tsx's "Add as Supplier Option" flow, which
// links whichever ingredient the user picked in that moment.
export async function resyncIngredientSuppliersFromProducts(queryClient: QueryClient, ingredientId: string): Promise<void> {
  const items = await fetchLinkedSupplierProducts(ingredientId);
  queryClient.setQueryData(['supplier_products_by_ingredient', ingredientId], items);
  const patch = buildPatch<Ingredient>({ suppliers: deriveIngredientSuppliers(items) } as Partial<Ingredient>);
  await updateDoc(doc(db, 'ingredients', ingredientId), withDeleteFieldForUndefined(patch));
  patchArrayItem<Ingredient>(queryClient, ['ingredients'], ingredientId, patch);
}

export async function fetchLinkedSupplierProducts(ingredientId: string): Promise<SupplierProduct[]> {
  const q = query(collection(db, 'supplierProducts'), where('ingredientId', '==', ingredientId));
  const snap = await getDocs(q);
  const items: SupplierProduct[] = [];
  snap.forEach(docSnapshot => {
    const rawData = { id: docSnapshot.id, ...docSnapshot.data() };
    const result = SupplierProductSchema.safeParse(rawData);
    if (result.success) items.push(result.data);
  });
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

// Wraps the plain supplierProduct mutations for products linked to a Pantry Ingredient
// (Pantry's "Supplier Products" section). Every write (add/update/delete/setPreferred) also
// re-syncs ingredient.suppliers[] from the full linked set afterwards, so supplierProducts +
// ingredientId stays the one editable relationship — the user never maintains two lists.
export const useLinkedSupplierProductMutations = (ingredientId: string) => {
  const queryClient = useQueryClient();
  const { addSupplierProduct, updateSupplierProduct, deleteSupplierProduct } = useSupplierProductMutations();

  const resync = () => resyncIngredientSuppliersFromProducts(queryClient, ingredientId);

  const addLinked = useMutation({
    mutationFn: async (data: Omit<SupplierProduct, 'id' | 'ingredientId'>) => {
      await addSupplierProduct.mutateAsync({ ...data, ingredientId } as Omit<SupplierProduct, 'id'>);
    },
    onSuccess: resync
  });

  const updateLinked = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SupplierProduct> }) => {
      await updateSupplierProduct.mutateAsync({ id, data });
    },
    onSuccess: resync
  });

  const deleteLinked = useMutation({
    mutationFn: async (id: string) => {
      await deleteSupplierProduct.mutateAsync(id);
    },
    onSuccess: resync
  });

  // Sets exactly one linked product as preferred, clearing the flag on every sibling in the
  // same batch write — guarantees at most one preferred product per ingredient.
  const setPreferred = useMutation({
    mutationFn: async (id: string) => {
      const q = query(collection(db, 'supplierProducts'), where('ingredientId', '==', ingredientId));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(docSnapshot => {
        batch.update(docSnapshot.ref, { isPreferred: docSnapshot.id === id });
      });
      await batch.commit();
    },
    onSuccess: resync
  });

  return { addLinked, updateLinked, deleteLinked, setPreferred };
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
    onSuccess: (fullItem) => appendArrayItem<Supplier>(queryClient, ['suppliers'], fullItem)
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Supplier> }) => {
      const docRef = doc(db, 'suppliers', id);
      const patch = buildPatch<Supplier>(data);
      await updateDoc(docRef, withDeleteFieldForUndefined(patch));
      return patch;
    },
    onSuccess: (patch, { id }) => patchArrayItem<Supplier>(queryClient, ['suppliers'], id, patch)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'suppliers', id));
    },
    onSuccess: (_data, id) => removeArrayItem<Supplier>(queryClient, ['suppliers'], id)
  });

  return { addSupplier: addMutation, updateSupplier: updateMutation, deleteSupplier: deleteMutation };
};

export const useSupplierProductMutations = () => {
  const queryClient = useQueryClient();

  // The canonical full list (['supplier_products_all']) is patched directly
  // below in each mutation, since we always know exactly which document
  // changed. The narrower derived views — search results, per-supplier
  // browse, and Pantry's ingredient-prefix lookup — are still invalidated:
  // whether a given product now belongs in one of THOSE filtered results
  // can change (e.g. editing a product's name can move it in or out of a
  // cached prefix match), and there's no reliable way to patch every
  // possible cached variant of those without risking a stale/incorrect
  // result, so correctness wins here per Task 5.
  //
  // Also fixes two pre-existing bugs found during this audit:
  //  - 'all_supplier_products_summary' was invalidated here but no hook has
  //    used that query key since useAllSupplierProducts was removed in the
  //    Dashboard Phase 1 cleanup — a dead invalidation, removed.
  //  - 'supplier_products_by_ingredient' (Pantry's linked-supplier-products
  //    lookup, keyed by ingredientId) is invalidated broadly here as a
  //    safety net for writes that land on a product's ingredientId from
  //    outside useLinkedSupplierProductMutations (e.g. Catalog.tsx's
  //    "Add as Supplier Option" flow) — those don't know which specific
  //    ingredientId cache entry to patch, so invalidate every entry.
  const invalidateDerivedCatalogQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['supplier_search'] });
    queryClient.invalidateQueries({ queryKey: ['supplier_browse'] });
    queryClient.invalidateQueries({ queryKey: ['supplier_products_by_ingredient'] });
  };

  const addMutation = useMutation({
    mutationFn: async (data: Omit<SupplierProduct, 'id'>) => {
      const docRef = doc(collection(db, 'supplierProducts'));
      const fullItem = { id: docRef.id, ...data };
      SupplierProductSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: (fullItem) => {
      appendArrayItem<SupplierProduct>(queryClient, ['supplier_products_all'], fullItem);
      invalidateDerivedCatalogQueries();
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SupplierProduct> }) => {
      const docRef = doc(db, 'supplierProducts', id);
      const { id: _, ...updatePayload } = data as any;
      await updateDoc(docRef, withDeleteFieldForUndefined(updatePayload));
      return updatePayload as Partial<SupplierProduct>;
    },
    onSuccess: (patch, { id }) => {
      patchArrayItem<SupplierProduct>(queryClient, ['supplier_products_all'], id, patch);
      invalidateDerivedCatalogQueries();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'supplierProducts', id));
    },
    onSuccess: (_data, id) => {
      removeArrayItem<SupplierProduct>(queryClient, ['supplier_products_all'], id);
      invalidateDerivedCatalogQueries();
    }
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
    onSuccess: (_data, ids) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<SupplierProduct[]>(['supplier_products_all'], (old) =>
        old ? old.filter((item) => !idSet.has(item.id)) : old
      );
      invalidateDerivedCatalogQueries();
    }
  });

  return {
    addSupplierProduct: addMutation,
    updateSupplierProduct: updateMutation,
    deleteSupplierProduct: deleteMutation,
    bulkDeleteSupplierProducts: bulkDeleteMutation
  };
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
      // useFoodTempChecksToday doesn't sort (Firestore's return order for a
      // single-day filtered query), so appending at the end matches natural
      // insertion order. useFoodTempChecksHistory sorts newest-checkedAt
      // first, so the just-recorded check (checkedAt = now) is prepended to
      // stay correctly ordered without a full re-sort.
      appendArrayItem<FoodTempCheck>(queryClient, ['food_temp_checks', fullItem.checkDate], fullItem);
      prependArrayItem<FoodTempCheck>(queryClient, ['food_temp_checks', 'history'], fullItem);
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
    onSuccess: (fullItem) => appendArrayItem<Equipment>(queryClient, ['equipment'], fullItem)
  });

  const updateEquipment = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Equipment> }) => {
      const docRef = doc(db, 'equipment', id);
      const patch = buildPatch<Equipment>(data);
      await updateDoc(docRef, withDeleteFieldForUndefined(patch));
      return patch;
    },
    onSuccess: (patch, { id }) => patchArrayItem<Equipment>(queryClient, ['equipment'], id, patch)
  });

  const deleteEquipment = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'equipment', id));
    },
    onSuccess: (_data, id) => removeArrayItem<Equipment>(queryClient, ['equipment'], id)
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
      appendArrayItem<EquipmentTempCheck>(queryClient, ['equipment_temp_checks', fullItem.checkDate], fullItem);
      prependArrayItem<EquipmentTempCheck>(queryClient, ['equipment_temp_checks', 'history'], fullItem);
    }
  });

  return { recordCheck };
};

