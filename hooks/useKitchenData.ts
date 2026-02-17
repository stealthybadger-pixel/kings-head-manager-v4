
import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Ingredient, Recipe, Dish, Allergen } from '../types';

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

export const useKitchenData = () => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    const q = query(collection(db, 'ingredients'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const raw = doc.data();
        // In-memory migration for legacy data model
        if (!raw.suppliers && raw.supplier) {
          return {
            id: doc.id,
            ...raw,
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
          // Ensure suppliers array exists if completely missing
          suppliers: raw.suppliers || []
        };
      }) as Ingredient[];
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
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Recipe[];
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

  const addIngredient = useCallback(async (ingredient: Omit<Ingredient, 'id'>) => {
    try {
      const newIng = {
        ...ingredient,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      // Clean up legacy fields if they accidentally crept in
      if ('supplier' in newIng) delete (newIng as any).supplier;
      if ('packCost' in newIng) delete (newIng as any).packCost;
      if ('packSize' in newIng) delete (newIng as any).packSize;
      if ('packUnit' in newIng) delete (newIng as any).packUnit;

      const docRef = await addDoc(collection(db, 'ingredients'), newIng);
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
      // Ensure we don't write legacy fields back if we are updating to new model
      if (ingredient.suppliers) {
        // We are updating the structured data, so let's try to remove legacy fields from the update payload
        // Note: Firestore update only updates specified fields. To delete legacy fields, we'd need FieldValue.delete()
        // For now, we just don't include them in the new data payload.
        delete (updateData as any).supplier;
        delete (updateData as any).packCost;
        delete (updateData as any).packSize;
        delete (updateData as any).packUnit;
      }

      await updateDoc(docRef, updateData);
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
      const docRef = await addDoc(collection(db, 'recipes'), newRecipeData);
      return { id: docRef.id, ...newRecipeData } as Recipe;
    } catch (err) {
      console.error("Error saving recipe:", err);
      throw err;
    }
  }, []);

  const updateRecipe = useCallback(async (id: string, recipe: Partial<Recipe>) => {
    try {
      const recipeRef = doc(db, 'recipes', id);
      await updateDoc(recipeRef, {
        ...recipe,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error updating recipe:", err);
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

  const saveDish = useCallback(async (dish: Partial<Dish>) => {
    try {
      const newDishData = {
        ...dish,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'dishes'), newDishData);
      return { id: docRef.id, ...newDishData } as Dish;
    } catch (err) {
      console.error("Error saving dish:", err);
      throw err;
    }
  }, []);

  const updateDish = useCallback(async (id: string, dish: Partial<Dish>) => {
    try {
      const dishRef = doc(db, 'dishes', id);
      await updateDoc(dishRef, {
        ...dish,
        updatedAt: new Date().toISOString()
      });
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

  const bulkImport = useCallback(async (data: { ingredients: Ingredient[], recipes: Recipe[], dishes?: Dish[] }) => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      data.ingredients.forEach(ing => {
        const { id, ...cleanIng } = ing;
        const ref = doc(collection(db, 'ingredients'));
        batch.set(ref, { ...cleanIng, audited: true, updatedAt: new Date().toISOString() });
      });
      data.recipes.forEach(rec => {
        const { id, ...cleanRec } = rec;
        const ref = doc(collection(db, 'recipes'));
        batch.set(ref, { ...cleanRec, updatedAt: new Date().toISOString() });
      });
      if (data.dishes) {
        data.dishes.forEach(dish => {
          const { id, ...cleanDish } = dish;
          const ref = doc(collection(db, 'dishes'));
          batch.set(ref, { ...cleanDish, updatedAt: new Date().toISOString() });
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
        batch.set(docRef, { ...ing, createdAt: new Date().toISOString() });
      });
      await batch.commit();
    } catch (err: any) {
      console.error("Error seeding database:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ingredients.length]);

  return {
    ingredients,
    recipes,
    dishes,
    loading,
    error,
    connectionStatus,
    addIngredient,
    updateIngredient,
    deleteIngredient,
    saveRecipe,
    updateRecipe,
    deleteRecipe,
    saveDish,
    updateDish,
    deleteDish,
    seedDatabase,
    bulkImport
  };
};
