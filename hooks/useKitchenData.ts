
import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, orderBy, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Ingredient, Recipe, Allergen } from '../types';

const DEFAULT_INGREDIENTS: Omit<Ingredient, 'id'>[] = [
  { name: 'Agar-agar', category: 'Dry store', supplier: 'Urban', packCost: 33.75, packSize: 500, packUnit: 'g', wastePercent: 0, allergens: [], kcalPer100: 306, stockLevel: 95 },
  { name: 'Beef Mince', category: 'Meat', supplier: 'Crouch', packCost: 9.00, packSize: 1000, packUnit: 'g', wastePercent: 15, allergens: [], kcalPer100: 250, stockLevel: 5000 },
  { name: 'Double Cream', category: 'Dairy', supplier: 'David Catt', packCost: 4.50, packSize: 1000, packUnit: 'ml', wastePercent: 0, allergens: [Allergen.MILK], kcalPer100: 450, stockLevel: 2000 },
  { name: 'Red Wine', category: 'Alcohol', supplier: 'Urban', packCost: 12.00, packSize: 750, packUnit: 'ml', wastePercent: 0, allergens: [Allergen.SULPHITES], kcalPer100: 85, stockLevel: 3000 },
  { name: 'Agar-agar Powder', category: 'Dry store', supplier: 'Urban', packCost: 45.00, packSize: 1000, packUnit: 'g', wastePercent: 0, allergens: [], kcalPer100: 300, stockLevel: 100 },
  { name: 'Butter Unsalted', category: 'Dairy', supplier: 'David Catt', packCost: 2.50, packSize: 250, packUnit: 'g', wastePercent: 0, allergens: [Allergen.MILK], kcalPer100: 717, stockLevel: 1000 },
  { name: 'Flour (Plain)', category: 'Dry store', supplier: 'Urban', packCost: 1.20, packSize: 1000, packUnit: 'g', wastePercent: 0, allergens: [Allergen.WHEAT], kcalPer100: 364, stockLevel: 5000 },
  { name: 'Eggs (Large)', category: 'Dairy', supplier: 'David Catt', packCost: 0.30, packSize: 1, packUnit: 'ea', wastePercent: 0, allergens: [Allergen.EGGS], kcalPer100: 155, stockLevel: 120 }
];

export const useKitchenData = () => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  // Subscribe to Ingredients
  useEffect(() => {
    const q = query(collection(db, 'ingredients'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Ingredient[];
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

  // Subscribe to Recipes
  useEffect(() => {
    const q = query(collection(db, 'recipes'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Recipe[];
      setRecipes(data);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching recipes:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Ingredient CRUD
  const addIngredient = useCallback(async (ingredient: Omit<Ingredient, 'id'>) => {
    try {
      const newIng = {
        ...ingredient,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'ingredients'), newIng);
    } catch (err) {
      console.error("Error adding ingredient:", err);
      throw err;
    }
  }, []);

  const updateIngredient = useCallback(async (id: string, ingredient: Partial<Ingredient>) => {
    try {
      const docRef = doc(db, 'ingredients', id);
      await updateDoc(docRef, {
        ...ingredient,
        updatedAt: new Date().toISOString()
      });
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

  // Recipe CRUD
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

  // Bulk Import logic
  const bulkImport = useCallback(async (data: { ingredients: Ingredient[], recipes: Recipe[] }) => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // We don't delete existing data to be safe, we just add the new items.
      // If the user wants a clean slate, they should do it manually or we'd need a "clearAll" logic.
      
      data.ingredients.forEach(ing => {
        // Strip existing ID to avoid conflicts if importing to a new DB, 
        // or keep it if we want to overwrite. For this backup utility, we use addDoc logic (new IDs).
        const { id, ...cleanIng } = ing;
        const ref = doc(collection(db, 'ingredients'));
        batch.set(ref, { ...cleanIng, updatedAt: new Date().toISOString() });
      });

      data.recipes.forEach(rec => {
        const { id, ...cleanRec } = rec;
        const ref = doc(collection(db, 'recipes'));
        batch.set(ref, { ...cleanRec, updatedAt: new Date().toISOString() });
      });

      await batch.commit();
    } catch (err: any) {
      console.error("Error in bulk import:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // New function to seed the database if it's empty
  const seedDatabase = useCallback(async () => {
    if (ingredients.length > 0) return; // Prevent double seeding
    
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const collectionRef = collection(db, 'ingredients');
      
      DEFAULT_INGREDIENTS.forEach(ing => {
        const docRef = doc(collectionRef); // Generate new ID
        batch.set(docRef, { ...ing, createdAt: new Date().toISOString() });
      });

      await batch.commit();
      console.log("Database seeded successfully");
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
    loading,
    error,
    connectionStatus,
    addIngredient,
    updateIngredient,
    deleteIngredient,
    saveRecipe,
    updateRecipe,
    deleteRecipe,
    seedDatabase,
    bulkImport
  };
};
