import React, { useState, useMemo, useRef } from 'react';
import { useRecipes, useIngredients, useRecipeMutations, useIngredientMutations, useDishes } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import { Search, Plus, Trash2, Camera, AlertCircle, Check, HelpCircle, ExternalLink, Upload, RefreshCw, X, Link2, Unlink } from 'lucide-react';
import { Recipe, RecipeItem, Ingredient, Unit } from '../types';
import { calculateIngredientCost, toBaseQuantity } from '../utils/costing';

async function scanRecipeWithGemini(base64Image: string, mimeType: string): Promise<{
  name: string;
  ingredients: { rawName: string; parsedName: string; qty: number; unit: RecipeItem['unit'] }[];
  instructions: string;
}> {
  const key = localStorage.getItem('geminiApiKey');
  if (!key) throw new Error('No Gemini API key set. Add it in Settings.');

  const prompt = `You are analysing a recipe card, handwritten recipe, printed recipe, or cookbook page.
Extract the recipe name, all ingredients with quantities, and the preparation instructions.

Return ONLY valid JSON in this exact shape, no markdown, no explanation:
{
  "name": "Recipe Name",
  "ingredients": [
    { "rawName": "original text as written", "parsedName": "clean ingredient name only, title case", "qty": 100, "unit": "g" }
  ],
  "instructions": "Full method as a single string, steps separated by newlines"
}

Units must be one of: "g", "kg", "ml", "l", "ea"
- Convert tablespoons/teaspoons to ml (1 tbsp = 15ml, 1 tsp = 5ml)
- Convert oz to g (1 oz = 28g), lbs to kg
- For "each" items like eggs use "ea"
- parsedName should be the ingredient only, no quantity or unit`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Image } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

const calculateDynamicBatchSize = (items: RecipeItem[], targetUnit: string) => {
  if (!items || items.length === 0) return 1;
  
  let totalGramsOrMls = 0;
  
  items.forEach(item => {
    if (!item) return;
    const qty = item.quantity || 0;
    const unit = item.unit || 'g';
    
    // Normalise to g/ml
    if (unit === 'g') {
      totalGramsOrMls += qty;
    } else if (unit === 'kg') {
      totalGramsOrMls += qty * 1000;
    } else if (unit === 'oz') {
      totalGramsOrMls += qty * 28.3495231;
    } else if (unit === 'ml') {
      totalGramsOrMls += qty;
    } else if (unit === 'l') {
      totalGramsOrMls += qty * 1000;
    } else if (unit === 'ea') {
      // Piece fallback: assume 50g per piece for weight calculation
      totalGramsOrMls += qty * 50; 
    }
  });

  // Convert total back to target unit (kg, g, l, ml)
  if (targetUnit === 'kg' || targetUnit === 'l') {
    const rawVal = totalGramsOrMls / 1000;
    return rawVal > 0 ? rawVal : 1;
  }
  return totalGramsOrMls > 0 ? totalGramsOrMls : 1;
};

export const Kitchen: React.FC = () => {
  const { data: recipes = [], isLoading: loadingRecs } = useRecipes();
  const { data: ingredients = [], isLoading: loadingIngs } = useIngredients();
  const { data: dishes = [] } = useDishes();
  
  const { addRecipe, updateRecipe, deleteRecipe } = useRecipeMutations();
  const { addIngredient } = useIngredientMutations();

  const selectedId = useStore((state) => state.selectedRecipeId);
  const selectRecipe = useStore((state) => state.selectRecipe);
  const showToast = useStore((state) => state.showToast);
  const navigateToPantryWithIngredient = useStore((state) => state.navigateToPantryWithIngredient);

  // Directory Search
  const [searchQuery, setSearchQuery] = useState('');
  const [recipeSort, setRecipeSort] = useState<'name' | 'date'>('name');

  // Recipe Scanner modal state
  const [showScanner, setShowScanner] = useState(false);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<{
    name: string;
    ingredients: { rawName: string; parsedName: string; qty: number; unit: RecipeItem['unit']; matchedId?: string }[];
    instructions: string;
  } | null>(null);
  const scanFileRef = useRef<HTMLInputElement>(null);

  // Form edit state
  const [isEditing, setIsEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [formState, setFormState] = useState<Omit<Recipe, 'id'> & { id?: string }>({
    name: '',
    batchSize: 1,
    batchUnit: 'kg',
    items: [],
    instructions: ''
  });

  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [scalingEnabled, setScalingEnabled] = useState(false);

  // Filtered + sorted recipe list
  const filteredRecipes = useMemo(() => {
    const filtered = recipes.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (recipeSort === 'date') {
      return [...filtered].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, searchQuery, recipeSort]);

  // Active recipe
  const activeRecipe = useMemo(() => {
    return recipes.find(r => r.id === selectedId) || null;
  }, [recipes, selectedId]);

  const activeRecipeDishes = useMemo(() => {
    if (!activeRecipe) return [];
    return dishes.filter(d => 
      d.items?.some(item => item.type === 'recipe' && item.subRecipeId === activeRecipe.id)
    );
  }, [activeRecipe, dishes]);

  // Set up form
  React.useEffect(() => {
    if (activeRecipe) {
      setFormState(activeRecipe);
      setIsEditing(true);
      setIsNew(false);
    } else {
      setIsEditing(false);
    }
  }, [activeRecipe]);

  const handleStartNew = () => {
    setFormState({
      name: '',
      batchSize: 1,
      batchUnit: 'kg',
      items: [],
      instructions: ''
    });
    setIsNew(true);
    setIsEditing(true);
    selectRecipe(null);
  };

  // Trigger create new recipe view when selectedId is 'new'
  React.useEffect(() => {
    if (selectedId === 'new') {
      handleStartNew();
    }
  }, [selectedId]);

  // Recalculate batch size dynamically from ingredients list, unless the
  // cook has switched to a manual yield override (e.g. actual weighed
  // output after roasting/reduction, which is less than the raw input sum).
  React.useEffect(() => {
    if (formState.manualYield) return;
    const calculated = calculateDynamicBatchSize(formState.items, formState.batchUnit);
    // Only update if it actually changed to prevent infinite rendering loops
    if (Math.abs(formState.batchSize - calculated) > 0.0001) {
      setFormState(prev => ({
        ...prev,
        batchSize: parseFloat(calculated.toFixed(4))
      }));
    }
  }, [formState.items, formState.batchUnit, formState.batchSize, formState.manualYield]);

  const isSaving = addRecipe.isPending || updateRecipe.isPending;

  const handleSave = async () => {
    if (!formState.name) {
      showToast("Recipe name is required", "error");
      return;
    }
    try {
      if (isNew) {
        await addRecipe.mutateAsync(formState);
        showToast(`Recipe "${formState.name}" created successfully!`, "success");
      } else if (formState.id) {
        await updateRecipe.mutateAsync({ id: formState.id, data: formState });
        showToast(`Recipe "${formState.name}" updated successfully!`, "success");
      }
      setIsEditing(false);
      setIsNew(false);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to save recipe", "error");
    }
  };

  // Add Item to Recipe (Pantry-First helper)
  const handleAddIngredientRow = (ing: Ingredient) => {
    // Check if ingredient already in list
    if (formState.items.some(i => i.type === 'ingredient' && i.ingredientId === ing.id)) return;
    
    setFormState(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { type: 'ingredient', ingredientId: ing.id, quantity: 100, unit: 'g' }
      ]
    }));
  };

  const handleUpdateItemQty = (index: number, qty: number) => {
    setFormState(prev => {
      const items = [...prev.items];
      if (scalingEnabled && items[index].quantity > 0 && qty > 0) {
        const ratio = qty / items[index].quantity;
        return {
          ...prev,
          items: items.map((item, i) =>
            i === index
              ? { ...item, quantity: qty }
              : { ...item, quantity: parseFloat((item.quantity * ratio).toFixed(4)) }
          )
        };
      }
      items[index] = { ...items[index], quantity: qty };
      return { ...prev, items };
    });
  };

  const handleUpdateItemUnit = (index: number, unit: RecipeItem['unit']) => {
    setFormState(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], unit };
      return { ...prev, items };
    });
  };

  const handleRemoveRow = (index: number) => {
    setFormState(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Calculating total recipe costs based on ingredient costing utility
  const calculateTotalCost = (items: RecipeItem[]) => {
    let cost = 0;
    items.forEach(item => {
      if (item.type === 'ingredient' && item.ingredientId) {
        const ing = ingredients.find(i => i.id === item.ingredientId);
        if (ing) {
          cost += calculateIngredientCost(ing, item.quantity, item.unit);
        }
      } else if (item.type === 'recipe' && item.subRecipeId) {
        const sub = recipes.find(r => r.id === item.subRecipeId);
        if (sub && sub.batchSize) {
          const batchCost = calculateTotalCost(sub.items);
          const batchSizeG = toBaseQuantity(sub.batchSize, sub.batchUnit);
          const qtyG = toBaseQuantity(item.quantity, item.unit);

          cost += (batchCost / batchSizeG) * qtyG;
        }
      }
    });
    return cost;
  };

  const totalCost = useMemo(() => {
    return calculateTotalCost(formState.items);
  }, [formState.items, ingredients]);

  const handleScanFile = async (file: File) => {
    setScanFile(file);
    setScanError(null);
    setScanResults(null);
    setScanning(true);

    try {
      const mimeType = file.type || 'image/jpeg';
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const extracted = await scanRecipeWithGemini(base64, mimeType);

      const mapped = extracted.ingredients.map(item => {
        const nameLower = item.parsedName.toLowerCase();
        const match = ingredients.find(i =>
          i.name.toLowerCase() === nameLower ||
          i.name.toLowerCase().includes(nameLower) ||
          nameLower.includes(i.name.toLowerCase())
        );
        return { ...item, matchedId: match?.id };
      });

      setScanResults({ ...extracted, ingredients: mapped });
    } catch (e: any) {
      setScanError(e.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  // Inline Quick-Add for missing scanner ingredients
  const handleCreateScannerIngredient = async (index: number, name: string) => {
    try {
      const newIng = await addIngredient.mutateAsync({
        name,
        category: 'Dry Store',
        wastePercent: 0,
        allergens: [],
        kcalPer100: 0,
        stockLevel: 0,
        suppliers: [{ name: 'Internal', packCost: 5.00, packSize: 1000, packUnit: 'g', isPreferred: true }]
      });
      
      if (scanResults) {
        const updated = [...scanResults.ingredients];
        updated[index] = { ...updated[index], matchedId: newIng.id };
        setScanResults({ ...scanResults, ingredients: updated });
      }
    } catch(err) {
      console.error(err);
    }
  };

  // Commit scanned recipe directly to local edit state
  const handleCommitScan = () => {
    if (!scanResults) return;
    
    const items: RecipeItem[] = scanResults.ingredients
      .filter(i => i.matchedId)
      .map(i => ({
        type: 'ingredient',
        ingredientId: i.matchedId!,
        quantity: i.qty,
        unit: i.unit
      }));

    setFormState({
      name: scanResults.name,
      batchSize: 1,
      batchUnit: 'kg',
      items,
      instructions: scanResults.instructions
    });
    
    setShowScanner(false);
    setScanFile(null);
    setScanResults(null);
    setIsNew(true);
    setIsEditing(true);
  };

  const isLoading = loadingIngs || loadingRecs;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-container-lowest">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-surface-container-lowest">
      
      {/* 1. LEFT PANEL: RECIPES DIRECTORY (35%) */}
      <div className="w-[35%] border-r border-outline-variant h-full flex flex-col bg-surface-container-lowest">
        <div className="p-4 border-b border-outline-variant bg-surface flex flex-col gap-3">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="label-caps text-outline font-bold">Kitchen Library</span>
            <div className="flex gap-2 flex-wrap">
              <div className="flex border border-outline-variant rounded-sm overflow-hidden text-[10px] font-bold label-caps">
                <button
                  onClick={() => setRecipeSort('name')}
                  className={`h-8 px-2.5 transition-colors ${recipeSort === 'name' ? 'bg-primary text-white' : 'bg-surface text-outline hover:bg-surface-container-low'}`}
                >
                  A–Z
                </button>
                <button
                  onClick={() => setRecipeSort('date')}
                  className={`h-8 px-2.5 border-l border-outline-variant transition-colors ${recipeSort === 'date' ? 'bg-primary text-white' : 'bg-surface text-outline hover:bg-surface-container-low'}`}
                >
                  Recent
                </button>
              </div>
              <button
                onClick={() => setShowScanner(true)}
                className="h-8 px-3 border border-outline text-[10px] label-caps font-bold rounded-sm bg-surface hover:bg-surface-container-low flex items-center gap-1"
              >
                <Camera className="h-3.5 w-3.5" />
                Scan
              </button>
              <button
                onClick={handleStartNew}
                title="Create new recipe"
                className="h-8 px-3 bg-primary text-white flex items-center justify-center gap-1 rounded-sm hover:bg-opacity-90 text-[10px] font-bold label-caps"
              >
                <Plus className="h-4 w-4" />
                New Recipe
              </button>
            </div>
          </div>

          <div className="relative flex items-center bg-surface-container-lowest border border-outline-variant rounded-sm px-3 py-1.5 focus-within:border-primary">
            <Search className="h-4 w-4 text-outline mr-2" />
            <input 
              type="text" 
              placeholder="Search recipes..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none border-none focus:ring-0 p-0"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-outline-variant">
          {filteredRecipes.map((recipe, idx) => {
            const usageDishes = dishes.filter(d => 
              d.items?.some(item => item.type === 'recipe' && item.subRecipeId === recipe.id)
            );
            const usageText = usageDishes.length > 0
              ? `Used in: ${usageDishes.length} dish${usageDishes.length > 1 ? 'es' : ''}`
              : 'Unused in menu';
            const tooltipText = usageDishes.length > 0
              ? `Used in:\n${usageDishes.map(d => `• ${d.name}`).join('\n')}`
              : 'Not linked to any menu dishes';

            return (
              <div 
                key={recipe.id}
                onClick={() => selectRecipe(recipe.id)}
                className={`p-4 hover:bg-surface-container cursor-pointer flex justify-between items-center transition-colors ${
                  selectedId === recipe.id 
                    ? 'bg-surface-container' 
                    : idx % 2 === 0 
                      ? 'bg-transparent' 
                      : 'bg-black/[0.0075]'
                }`}
              >
                <div>
                  <div className="font-semibold text-sm text-on-surface">{recipe.name}</div>
                  <div className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1.5">
                    <span>Batch: {recipe.batchSize} {recipe.batchUnit}{recipe.manualYield ? ' (adj.)' : ''}</span>
                    <span className="text-outline-variant">•</span>
                    <span 
                      className={`font-semibold cursor-help ${usageDishes.length > 0 ? 'text-primary' : 'text-outline'}`}
                      title={tooltipText}
                    >
                      {usageText}
                    </span>
                  </div>
                </div>
                <div className="data-tabular text-sm text-primary font-bold">
                  £{calculateTotalCost(recipe.items).toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. RIGHT PANEL: RECIPE WORKSPACE (65%) */}
      <div className="flex-1 h-full p-8 overflow-y-auto bg-surface-container-lowest flex flex-col gap-6">
        {isEditing ? (
          <>
            <div className="flex justify-between items-center border-b border-outline-variant pb-4">
              <div>
                <h2 className="headline-sm font-semibold">{isNew ? 'New Recipe Formulation' : formState.name}</h2>
                <div className="flex flex-wrap gap-2 items-center mt-1">
                  <span className="text-xs text-outline label-caps">Total Cost:</span>
                  <span className="text-xs text-primary font-bold data-tabular">£{totalCost.toFixed(2)}</span>
                  {!isNew && (
                    <>
                      <span className="text-outline-variant">•</span>
                      <span className="text-xs text-outline label-caps">
                        {activeRecipeDishes.length > 0
                          ? `Used in: ${activeRecipeDishes.map(d => d.name).join(', ')}`
                          : 'Not linked to any dishes'}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-4">
                {!isNew && (
                  <>
                    <button
                      onClick={async () => {
                        try {
                          const { id: _, createdAt: __, updatedAt: ___, ...rest } = formState as any;
                          const copy = { ...rest, name: `${formState.name} (Copy)` };
                          const saved = await addRecipe.mutateAsync(copy);
                          showToast(`Duplicated as "${copy.name}" — rename and edit below`, "success");
                          setFormState(saved as any);
                          setIsNew(false);
                          setIsEditing(true);
                        } catch (err: any) {
                          showToast(err.message || "Failed to duplicate recipe", "error");
                        }
                      }}
                      disabled={isSaving}
                      className="h-10 px-4 border border-outline-variant text-on-surface-variant text-xs font-bold label-caps rounded-sm hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete this recipe permanently?")) {
                          try {
                            await deleteRecipe.mutateAsync(formState.id!);
                            showToast("Recipe deleted successfully", "success");
                            selectRecipe(null);
                          } catch (err: any) {
                            showToast(err.message || "Failed to delete recipe", "error");
                          }
                        }
                      }}
                      disabled={isSaving}
                      className="h-10 px-4 border border-error text-error text-xs font-bold label-caps rounded-sm hover:bg-error-container disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  </>
                )}
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 flex items-center gap-2 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Formulation'
                  )}
                </button>
              </div>
            </div>

            {/* Header info */}
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2">
                <label className="label-caps text-outline block mb-2">Recipe Name</label>
                <input 
                  type="text" 
                  value={formState.name}
                  onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm"
                  placeholder="e.g., Peppercorn Sauce"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label-caps text-outline">Batch Yield Size</label>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-outline cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!formState.manualYield}
                      onChange={(e) => {
                        const manualYield = e.target.checked;
                        setFormState(prev => ({
                          ...prev,
                          manualYield,
                          // Snap back to the auto-calculated total the moment
                          // override is turned off, rather than leaving a
                          // stale manual value behind.
                          batchSize: manualYield
                            ? prev.batchSize
                            : parseFloat(calculateDynamicBatchSize(prev.items, prev.batchUnit).toFixed(4))
                        }));
                      }}
                      className="h-3.5 w-3.5"
                    />
                    Manual (shrinkage)
                  </label>
                </div>
                <div className="flex">
                  <input
                    type="number"
                    value={formState.batchSize}
                    readOnly={!formState.manualYield}
                    onChange={(e) => {
                      if (!formState.manualYield) return;
                      setFormState(prev => ({ ...prev, batchSize: Math.max(0.0001, parseFloat(e.target.value) || 0) }));
                    }}
                    className={`w-2/3 px-3 py-2 border border-outline-variant rounded-l-sm text-sm data-tabular ${
                      formState.manualYield ? 'bg-surface' : 'bg-surface-container-low text-outline cursor-not-allowed'
                    }`}
                    title={formState.manualYield ? 'Actual measured yield (e.g. after roasting/reduction)' : 'Calculated automatically from recipe ingredients total'}
                  />
                  <select
                    value={formState.batchUnit}
                    onChange={(e) => setFormState(prev => ({ ...prev, batchUnit: e.target.value as any }))}
                    className="w-1/3 border-t border-b border-r border-outline-variant bg-surface text-xs rounded-r-sm"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="oz">oz</option>
                    <option value="l">l</option>
                    <option value="ml">ml</option>
                  </select>
                </div>
                <span className="text-[9px] text-outline mt-1 block">
                  {formState.manualYield
                    ? 'Manual override active — enter the actual weighed/measured yield (e.g. after roasting).'
                    : 'Sum of ingredient components. Select unit to convert.'}
                </span>
              </div>
            </div>

            {/* Portions — lets this recipe be added to a Dish as "1 portion" rather than a raw weight */}
            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className="label-caps text-outline block mb-2">Portions Per Batch</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={formState.portionCount ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormState(prev => ({
                      ...prev,
                      portionCount: val === '' ? undefined : Math.max(1, parseFloat(val) || 1)
                    }));
                  }}
                  placeholder="e.g. 12"
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm data-tabular"
                />
                <span className="text-[9px] text-outline mt-1 block">
                  {formState.portionCount
                    ? `1 portion = ${(formState.batchSize / formState.portionCount).toFixed(3)} ${formState.batchUnit}. Selectable as "portion" when adding this recipe to a Dish.`
                    : 'Optional — set this to allow "portion" as a unit when adding this recipe to a Dish (e.g. burger buns, bread rolls).'}
                </span>
              </div>
            </div>

            {/* Ingredient lines */}
            <div className="mt-4 border-t border-outline-variant pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="label-caps text-on-surface font-bold">Recipe Ingredients</h3>
                <button
                  onClick={() => setScalingEnabled(s => !s)}
                  title={scalingEnabled ? 'Proportional scaling ON — changing one qty scales all others' : 'Proportional scaling OFF'}
                  className={`flex items-center gap-1.5 h-7 px-3 rounded-sm border text-[10px] font-bold label-caps transition-colors ${
                    scalingEnabled
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface text-outline border-outline-variant hover:bg-surface-container-low'
                  }`}
                >
                  {scalingEnabled ? <Link2 className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
                  Scale
                </button>
              </div>
              
              <div className="flex flex-col gap-3 mb-6">
                {formState.items.map((item, idx) => {
                  const ing = ingredients.find(i => i.id === item.ingredientId);
                  let cost = 0;
                  if (item.type === 'ingredient' && ing) {
                    cost = calculateIngredientCost(ing, item.quantity, item.unit);
                  } else if (item.type === 'recipe' && item.subRecipeId) {
                    const sub = recipes.find(r => r.id === item.subRecipeId);
                    if (sub && sub.batchSize) {
                      const batchCost = calculateTotalCost(sub.items);
                      const batchSizeG = toBaseQuantity(sub.batchSize, sub.batchUnit);
                      const qtyG = toBaseQuantity(item.quantity, item.unit);
                      cost = (batchCost / batchSizeG) * qtyG;
                    }
                  }

                  return (
                    <div key={idx} className="flex gap-4 items-center bg-surface p-4 border border-outline-variant rounded-sm">
                      <div className="flex-1">
                        <span className="font-semibold text-sm text-on-surface">{ing?.name || 'Unknown Item'}</span>
                        <div className="text-[10px] text-outline uppercase tracking-wider mt-0.5">
                          {ing?.category} • Waste: {ing?.wastePercent || 0}%
                        </div>
                      </div>

                      <div className="w-24">
                        <input 
                          type="number" 
                          value={item.quantity}
                          onChange={(e) => handleUpdateItemQty(idx, Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full px-2 py-1 border border-outline-variant text-xs data-tabular text-center"
                        />
                      </div>

                      <div className="w-20">
                        <select 
                          value={item.unit}
                          onChange={(e) => handleUpdateItemUnit(idx, e.target.value as any)}
                          className="w-full px-2 py-1 border border-outline-variant bg-surface-container-lowest text-xs"
                        >
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="oz">oz</option>
                          <option value="ml">ml</option>
                          <option value="l">l</option>
                          <option value="ea">ea</option>
                        </select>
                      </div>

                      <div className="w-20 text-right data-tabular text-sm font-bold text-primary">
                        £{cost.toFixed(2)}
                      </div>

                      {item.type === 'ingredient' && ing && (
                        <button
                          onClick={() => navigateToPantryWithIngredient(ing.id)}
                          title="Open in Pantry"
                          className="p-1 text-outline hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveRow(idx)}
                        className="p-1 text-error hover:bg-error-container"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add row search block */}
              <div className="bg-surface p-4 border border-outline-variant rounded-sm flex flex-col gap-3">
                <span className="text-xs label-caps text-outline font-bold">Add Ingredient to Recipe</span>
                <div className="flex gap-2">
                  <div className="relative flex-1 flex items-center bg-surface-container-lowest border border-outline-variant rounded-sm px-3 py-1.5 focus-within:border-primary">
                    <Search className="h-4 w-4 text-outline mr-2" />
                    <input 
                      type="text" 
                      placeholder="Search ingredients..." 
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                      className="flex-1 text-xs bg-transparent outline-none border-none focus:ring-0 p-0"
                    />
                  </div>
                </div>

                {itemSearchQuery.trim().length > 1 && (
                  <div className="max-h-48 overflow-y-auto bg-surface-container-lowest border border-outline-variant divide-y divide-outline-variant rounded-sm">
                    {ingredients
                      .filter(i => i.name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                      .slice(0, 5)
                      .map(ing => (
                        <div 
                          key={ing.id}
                          onClick={() => {
                            handleAddIngredientRow(ing);
                            setItemSearchQuery('');
                          }}
                          className="p-3 hover:bg-surface-container text-xs cursor-pointer flex justify-between font-semibold"
                        >
                          <span>{ing.name}</span>
                          <span className="text-primary label-caps">+ Add</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

            </div>

            {/* Method Box */}
            <div className="mt-4 border-t border-outline-variant pt-6">
              <label className="label-caps text-outline block mb-2">Preparation Instructions</label>
              <textarea
                value={formState.instructions}
                onChange={(e) => setFormState(prev => ({ ...prev, instructions: e.target.value }))}
                rows={6}
                placeholder="Step 1: Prep... Step 2: Combine..."
                className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm"
              />
            </div>

            {/* Allergens (derived from recipe items) */}
            {(() => {
              const ingMap = new Map(ingredients.map(i => [i.id, i]));
              const recMap = new Map(recipes.map(r => [r.id, r]));
              const allergens = new Set<string>();
              function collect(items: any[], depth = 0) {
                if (depth > 5) return;
                for (const item of (items ?? [])) {
                  if (item.type === 'ingredient' && item.ingredientId) {
                    (ingMap.get(item.ingredientId)?.allergens ?? []).forEach((a: string) => allergens.add(a));
                  } else if (item.type === 'recipe' && item.subRecipeId) {
                    const sub = recMap.get(item.subRecipeId);
                    if (sub) collect(sub.items ?? [], depth + 1);
                  }
                }
              }
              collect(formState.items ?? []);
              const list = Array.from(allergens);
              return (
                <div className="mt-4 border-t border-outline-variant pt-4">
                  <label className="label-caps text-outline block mb-2">Allergens in this recipe</label>
                  {list.length === 0 ? (
                    <p className="text-xs text-outline italic">None detected from current ingredients</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {list.map(a => (
                        <span key={a} className="px-2.5 py-1 text-xs font-semibold bg-error-container text-error border border-error rounded-sm">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-outline">
            <ChefHatIcon className="h-12 w-12 text-outline mb-2" />
            <span className="label-caps">Select a recipe to view formulation</span>
          </div>
        )}
      </div>

      {/* 3. RECIPE SCANNER MODAL */}
      {showScanner && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col relative">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
              <h2 className="font-bold text-on-surface flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                Recipe Scanner
              </h2>
              <button
                onClick={() => { setShowScanner(false); setScanFile(null); setScanResults(null); setScanError(null); }}
                className="p-1 text-outline hover:text-on-surface"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {/* Drop zone */}
              <div
                onClick={() => scanFileRef.current?.click()}
                className={`border-2 border-dashed border-outline-variant rounded-sm p-10 text-center cursor-pointer hover:border-primary hover:bg-surface-container transition-colors ${scanning ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input
                  ref={scanFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleScanFile(e.target.files[0])}
                />
                {scanning ? (
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-sm text-on-surface-variant">Reading recipe with Gemini…</p>
                  </div>
                ) : scanFile && !scanResults ? (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-primary" />
                    <p className="text-sm font-semibold text-primary">{scanFile.name}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="h-8 w-8 text-outline" />
                    <p className="text-sm font-semibold text-on-surface">Take a photo or upload a recipe image</p>
                    <p className="text-xs text-on-surface-variant">Recipe cards, handwritten notes, cookbook pages, menus</p>
                  </div>
                )}
              </div>

              {scanError && (
                <div className="border border-error bg-error-container p-3 rounded-sm flex gap-2 items-center text-xs text-on-error-container">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {scanError}
                </div>
              )}

              {scanResults && (
                <div className="flex flex-col gap-3 border-t border-outline-variant pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="label-caps font-bold text-xs">
                      {scanResults.name} — Pantry Verification
                    </h3>
                    <span className="text-[10px] text-outline">
                      {scanResults.ingredients.filter(i => i.matchedId).length}/{scanResults.ingredients.length} matched
                    </span>
                  </div>
                  <div className="max-h-60 overflow-y-auto border border-outline-variant divide-y divide-outline-variant rounded-sm bg-surface">
                    {scanResults.ingredients.map((item, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between text-xs gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-on-surface">{item.parsedName}</span>
                          <span className="text-outline ml-2 font-mono">{item.qty}{item.unit}</span>
                          <div className="text-[10px] text-outline-variant truncate">{item.rawName}</div>
                        </div>
                        <div className="shrink-0">
                          {item.matchedId ? (
                            <span className="text-emerald-600 font-bold label-caps flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" /> Matched
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-error font-bold label-caps flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5" /> Missing
                              </span>
                              <button
                                onClick={() => handleCreateScannerIngredient(idx, item.parsedName)}
                                className="px-2 py-1 bg-primary text-white label-caps text-[9px] font-bold rounded-sm"
                              >
                                + Create
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center border-t border-outline-variant pt-4">
                    <button
                      onClick={() => { setScanResults(null); setScanFile(null); setScanError(null); }}
                      className="h-9 px-4 border border-outline-variant text-xs font-bold label-caps rounded-sm hover:bg-surface-container"
                    >
                      Scan Again
                    </button>
                    <button
                      onClick={handleCommitScan}
                      disabled={scanResults.ingredients.every(i => !i.matchedId)}
                      className="h-9 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 disabled:opacity-50"
                    >
                      Populate Form
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const ChefHatIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 18V6a4 4 0 0 1 8 0v12"></path>
    <path d="M18 18V9a4 4 0 0 0-8 0v9"></path>
    <path d="M3 18h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"></path>
  </svg>
);
export default Kitchen;
