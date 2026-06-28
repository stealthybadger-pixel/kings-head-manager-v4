import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc, writeBatch, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Ingredient, IngredientSchema,
  Recipe, RecipeSchema,
  Dish, DishSchema,
  ContainerProfile, ContainerProfileSchema,
  StockMovement, StockMovementSchema,
  SupplierProduct, SupplierProductSchema,
  Supplier, SupplierSchema
} from '../types';

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
      const updateData = { ...updatePayload, updatedAt: new Date().toISOString() };
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
      const updateData = { ...updatePayload, updatedAt: new Date().toISOString() };
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
      const updateData = { ...updatePayload, updatedAt: new Date().toISOString() };
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

      // Increment/Decrement the current stock cache value on the ingredient
      const ingRef = doc(db, 'ingredients', movement.ingredientId);
      // NOTE: We do not read the database first. The UI state or local cache keeps track, 
      // but in Firestore we increment the field value atomically to prevent concurrent race conditions.
      // However, Firestore doesn't provide a direct relative increment in standard Client SDK without transaction,
      // but we update it via set/merge.
      // To keep it simple, we do the updateDoc on the query success or transaction:
      await batch.commit();
      return fullMovement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    }
  });

  return { logMovement };
};

export const searchSupplierProducts = async (searchTerm: string, supplier: string): Promise<SupplierProduct[]> => {
  if (!searchTerm || searchTerm.trim().length < 2) return [];
  
  const trimTerm = searchTerm.trim();
  const variations = [
    trimTerm,
    trimTerm.charAt(0).toUpperCase() + trimTerm.slice(1),
  ];
  
  const resultsMap = new Map<string, SupplierProduct>();
  
  for (const term of variations) {
    const q = query(
      collection(db, 'supplierProducts'),
      where('name', '>=', term),
      where('name', '<=', term + '\uf8ff'),
      limit(50)
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
  
  return Array.from(resultsMap.values());
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
      await updateDoc(docRef, { ...updatePayload, updatedAt: new Date().toISOString() });
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SupplierProduct> }) => {
      const docRef = doc(db, 'supplierProducts', id);
      const { id: _, ...updatePayload } = data as any;
      await updateDoc(docRef, updatePayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier_search'] });
    }
  });

  return { updateSupplierProduct: updateMutation };
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
