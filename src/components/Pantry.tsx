import React, { useState, useMemo, useEffect, useRef } from 'react';
import { supplierBadgeClass } from '../utils/supplierColors';
import { useIngredients, useIngredientMutations, useSupplierProductsForIngredient, useLinkedSupplierProductMutations, useDishes, useSuppliers } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import { Search, Plus, Trash2, AlertCircle, FileText, CheckCircle2, ListTodo, Check, ArrowRight, ArrowLeft, ExternalLink } from 'lucide-react';
import { getSupplierUrl, getSupplierSearchLinks } from '../utils/supplierUrls';
import { Ingredient, IngredientCategory, SupplierName, Unit, Allergen, SupplierProduct } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAuth } from '../hooks/useAuth';
import { inferIngredientDefaults, DRY_STORE_SUBCATEGORIES, VEGETABLE_SUBCATEGORIES } from '../utils/ingredientAutofill';
import { getBaseRate, getBaseUnit } from '../utils/costing';

import { cleanProductName } from '../utils/matching';
import { tokenizeSearchQuery, matchesSearchTokens } from '../utils/search';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.worker.min.mjs';

const COMMON_INGREDIENTS = [
  'samphire', 'wild garlic', 'duck breast', 'tarragon', 'watermelon', 'tofu', 'lumpfish roe', 
  'cream cheese', 'pesto', 'sweet chilli sauce', 'balsamic', 'tuna', 'brisket', 'croutons', 
  'tomato chutney', 'red wine jus', 'brioche bun', 'sea bass', 'chicken breast', 'double cream', 
  'butter', 'olive oil', 'olives', 'garlic', 'chicken', 'lettuce', 'onion', 'chips', 'salmon', 
  'goat\'s cheese', 'pine nuts', 'orange', 'tomato', 'cashew nuts', 'mushrooms', 'lime', 
  'peanuts', 'mint', 'egg', 'wild mushrooms', 'haddock', 'prawns', 'anchovies', 'pork belly', 
  'beef', 'bacon', 'cheddar', 'peas', 'halloumi', 'oysters', 'rainbow chard', 'courgettes', 
  'potatoes', 'bread', 'avocado', 'shallots', 'basil', 'cod', 'coriander', 'cucumber', 
  'ginger', 'honey', 'pork', 'lamb', 'lemon', 'rosemary', 'thyme', 'sage', 'parsley', 
  'spinach', 'apple', 'chilli', 'watercress', 'rocket', 'parmesan', 'fennel', 'celeriac', 
  'beetroot', 'walnuts', 'almonds', 'macaroni', 'flour', 'milk', 'cheese'
];

const isIngredientMatched = (candName: string, dbIngredients: Ingredient[]) => {
  const cleanCand = cleanProductName(candName);
  if (!cleanCand) return false;
  
  const candWords = cleanCand.split(/\s+/).filter(w => w.length > 0);
  
  return dbIngredients.some(ing => {
    const cleanIng = cleanProductName(ing.name);
    const ingWords = cleanIng.split(/\s+/).filter(w => w.length > 0);
    
    if (cleanIng.includes(cleanCand) || cleanCand.includes(cleanIng)) return true;
    
    const overlap = candWords.filter(cw => ingWords.some(iw => cw === iw || (cw.length >= 3 && iw.includes(cw))));
    if (candWords.length === 1 && overlap.length === 1) return true;
    if (candWords.length > 1 && overlap.length >= Math.min(2, candWords.length)) return true;
    
    return false;
  });
};

const formatSupplierUnitPrice = (cost: number, size: number, unit: string): string => {
  if (!size || size <= 0) return '£0.00';
  if (unit === 'kg' || unit === 'g' || unit === 'oz') {
    const perKg = unit === 'kg' ? cost / size : (cost / size) * (unit === 'oz' ? (1000 / 28.3495231) : 1000);
    return `£${perKg.toFixed(2)} / kg`;
  }
  if (unit === 'l' || unit === 'ml') {
    const perL = unit === 'l' ? cost / size : (cost / size) * 1000;
    return `£${perL.toFixed(2)} / l`;
  }
  return `£${(cost / size).toFixed(2)} / ea`;
};

const PRICE_STALE_DAYS = 30;

const formatPriceAge = (priceUpdatedAt: string | undefined): { label: string; isStale: boolean } | null => {
  if (!priceUpdatedAt) return null;
  const then = new Date(priceUpdatedAt).getTime();
  if (Number.isNaN(then)) return null;
  const daysAgo = Math.floor((Date.now() - then) / 86400000);
  const label = daysAgo <= 0 ? 'Priced today' : daysAgo === 1 ? 'Priced 1d ago' : `Priced ${daysAgo}d ago`;
  return { label, isStale: daysAgo > PRICE_STALE_DAYS };
};

export interface AuditTask {
  id: string;
  type: 'ingredient' | 'dish' | 'recipe';
  title: string;
  subtitle: string;
  completed: boolean;
}

export const Pantry: React.FC = () => {
  const { data: ingredients = [], isLoading } = useIngredients();
  const { data: dishes = [] } = useDishes();
  const { data: dbSuppliers = [] } = useSuppliers();
  const { addIngredient, updateIngredient, deleteIngredient } = useIngredientMutations();
  
  const selectedId = useStore((state) => state.selectedIngredientId);
  const selectIngredient = useStore((state) => state.selectIngredient);
  const isMobile = useIsMobile();
  const showToast = useStore((state) => state.showToast);
  const navigateToCatalogWithSearch = useStore((state) => state.navigateToCatalogWithSearch);
  const navigateToCatalogAndHighlightProduct = useStore((state) => state.navigateToCatalogAndHighlightProduct);
  const navigateToCatalogToLinkSupplier = useStore((state) => state.navigateToCatalogToLinkSupplier);
  const { appUser } = useAuth();
  const isManager = appUser?.role === 'manager';

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('All');
  const [pantrySort, setPantrySort] = useState<'name' | 'date'>('name');

  // Menu Auditor Modal state
  const [showMenuAuditor, setShowMenuAuditor] = useState(false);
  const [auditorFile, setAuditorFile] = useState<File | null>(null);
  const [auditorLogs, setAuditorLogs] = useState<string[]>([]);
  const [auditTasks, setAuditTasks] = useState<AuditTask[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Form edit state (active item copy)
  const [isEditing, setIsEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [newChildYield, setNewChildYield] = useState('');
  const [formState, setFormState] = useState<Omit<Ingredient, 'id'> & { id?: string }>({
    name: '',
    category: 'Dry Store',
    wastePercent: 0,
    kcalPer100: 0,
    stockLevel: 0,
    allergens: [],
    suppliers: []
  });

  const categories: IngredientCategory[] = ['Vegetable', 'Fruit', 'Meat', 'Fish', 'Dry Store', 'Frozen', 'Dairy', 'Alcohol', 'Non Consumables'];
  // Live list of suppliers so newly-added suppliers show up here immediately,
  // rather than requiring a code change to a hardcoded list.
  const FALLBACK_SUPPLIERS = ['David Catt', 'Urban', 'Cranbrook', 'Crouch', 'Booker', 'Glovers', 'Internal'];
  const suppliersList: string[] = dbSuppliers.length > 0 ? dbSuppliers.map(s => s.name) : FALLBACK_SUPPLIERS;
  const units: Unit[] = ['g', 'ml', 'ea', 'kg', 'l', 'oz'];
  const allergensList: Allergen[] = ['Milk', 'Eggs', 'Fish', 'Crustaceans', 'Molluscs', 'Peanuts', 'Nuts', 'Sesame', 'Soya', 'Wheat (Gluten)', 'Celery', 'Mustard', 'Sulphites', 'Lupin'];

  // Filtered ingredients
  const filteredIngredients = useMemo(() => {
    const queryTokens = tokenizeSearchQuery(searchQuery);
    const filtered = ingredients.filter(ing => {
      const matchSearch = matchesSearchTokens(ing.name, queryTokens);
      const matchCat = selectedCategory === 'All' || ing.category === selectedCategory;
      const matchSubCat = (selectedCategory !== 'Dry Store' && selectedCategory !== 'Vegetable') || selectedSubCategory === 'All' || ing.subCategory === selectedSubCategory;
      return matchSearch && matchCat && matchSubCat;
    });
    if (pantrySort === 'date') {
      return [...filtered].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients, searchQuery, selectedCategory, selectedSubCategory, pantrySort]);

  // Active selected ingredient
  const activeIngredient = useMemo(() => {
    return ingredients.find(i => i.id === selectedId) || null;
  }, [ingredients, selectedId]);

  // Set up form when active ingredient changes
  React.useEffect(() => {
    if (activeIngredient) {
      setFormState(activeIngredient);
      setIsEditing(true);
      setIsNew(false);
    } else {
      setIsEditing(false);
    }
  }, [activeIngredient]);

  // Supplier Products — the single source of truth for this ingredient's supplier options
  // (supplierProducts docs where ingredientId === this ingredient's id). Replaces the old
  // name-prefix catalogue lookup and the manually-maintained ingredient.suppliers[] editor;
  // suppliers[] is still written, but only as an auto-synced cache (see useKitchenData.ts's
  // useLinkedSupplierProductMutations) for costing.ts to keep reading synchronously.
  const { data: linkedProducts = [], isLoading: loadingLinkedProducts } = useSupplierProductsForIngredient(formState.id);
  const { addLinked, updateLinked, deleteLinked, setPreferred } = useLinkedSupplierProductMutations(formState.id || '');

  const preferredLinkedProduct = useMemo(
    () => linkedProducts.find(p => p.isPreferred) || linkedProducts[0] || null,
    [linkedProducts]
  );

  // Flags a cheaper linked alternative to the current preferred product. Replaces the old
  // two separate checks (catalogue-vs-preferred, and listed-supplier-vs-preferred) — both
  // collapse into one now that "the catalogue" and "the ingredient's supplier list" are the
  // same set of linked supplierProducts.
  const cheaperLinkedOption = useMemo(() => {
    if (!preferredLinkedProduct || !preferredLinkedProduct.packCost || linkedProducts.length < 2) return null;
    const prefRate = getBaseRate(preferredLinkedProduct.packCost, preferredLinkedProduct.packSize, preferredLinkedProduct.packUnit);
    const prefBase = getBaseUnit(preferredLinkedProduct.packUnit);

    let best: SupplierProduct | null = null;
    let bestSaving = 0;
    for (const p of linkedProducts) {
      if (p.id === preferredLinkedProduct.id) continue;
      if (!p.packCost || p.packCost <= 0) continue;           // skip Internal / no-cost rows
      if (getBaseUnit(p.packUnit) !== prefBase) continue;      // only compare like-for-like units
      const rate = getBaseRate(p.packCost, p.packSize, p.packUnit);
      if (rate < prefRate - 0.00001) {
        const saving = ((prefRate - rate) / prefRate) * 100;
        if (saving > bestSaving) { bestSaving = saving; best = p; }
      }
    }

    if (!best) return null;
    return { product: best, savingPercent: bestSaving, preferredName: preferredLinkedProduct.supplier };
  }, [preferredLinkedProduct, linkedProducts]);

  // Tracks which auto-fillable fields the user has manually overridden for the
  // ingredient currently being created, so typing more of the name doesn't clobber them.
  const autofillTouched = useRef({ category: false, subCategory: false, wastePercent: false, kcalPer100: false, allergens: false });

  const handleStartNew = () => {
    autofillTouched.current = { category: false, subCategory: false, wastePercent: false, kcalPer100: false, allergens: false };
    setFormState({
      name: '',
      category: 'Dry Store',
      wastePercent: 0,
      kcalPer100: 0,
      stockLevel: 0,
      allergens: [],
      suppliers: []
    });
    setIsNew(true);
    setIsEditing(true);
    selectIngredient(null);
  };

  const handleNameChange = (name: string) => {
    setFormState(prev => {
      const next = { ...prev, name };
      if (!isNew) return next;
      const guess = inferIngredientDefaults(name);
      const touched = autofillTouched.current;
      if (!touched.category && guess.category) next.category = guess.category as any;
      if (!touched.subCategory && guess.subCategory) next.subCategory = guess.subCategory;
      if (!touched.wastePercent && guess.wastePercent !== null) next.wastePercent = guess.wastePercent;
      if (!touched.kcalPer100 && guess.kcalPer100 !== null) next.kcalPer100 = guess.kcalPer100;
      if (!touched.allergens && guess.allergens.length > 0) next.allergens = guess.allergens;
      return next;
    });
  };

  // Trigger create new master ingredient view when selectedId is 'new'
  React.useEffect(() => {
    if (selectedId === 'new') {
      handleStartNew();
    }
  }, [selectedId]);

  const isSaving = addIngredient.isPending || updateIngredient.isPending;

  const handleSave = async () => {
    if (!formState.name) {
      showToast("Ingredient name is required", "error");
      return;
    }
    
    try {
      if (isNew) {
        await addIngredient.mutateAsync(formState);
        showToast(`Ingredient "${formState.name}" created successfully!`, "success");
      } else if (formState.id) {
        // suppliers[] is excluded here — it's a derived cache regenerated from linked
        // supplierProducts (see useLinkedSupplierProductMutations), not something this form
        // edits directly. Saving the stale in-memory copy here would clobber a sync that
        // happened while this form was open.
        const { suppliers: _suppliers, ...dataWithoutSuppliers } = formState;
        await updateIngredient.mutateAsync({ id: formState.id, data: dataWithoutSuppliers });
        showToast(`Ingredient "${formState.name}" updated successfully!`, "success");
      }
      setIsEditing(false);
      setIsNew(false);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to save ingredient", "error");
    }
  };

  // Whole-item breakdown ("child ingredients") — cuts of the currently open
  // ingredient, each a real, independently-selectable Ingredient document
  // that derives its cost from this parent rather than being priced itself.
  const childIngredients = useMemo(() => {
    if (!formState.id) return [];
    return ingredients.filter(i => i.parentIngredientId === formState.id);
  }, [ingredients, formState.id]);

  const handleAddChildCut = async () => {
    const yieldPct = parseFloat(newChildYield);
    if (!newChildName.trim()) {
      showToast("Enter a name for the new cut", "error");
      return;
    }
    if (!yieldPct || yieldPct <= 0 || yieldPct > 100) {
      showToast("Enter a yield % between 1 and 100", "error");
      return;
    }
    if (!formState.id) {
      showToast("Save this ingredient first, then add cuts", "error");
      return;
    }
    try {
      await addIngredient.mutateAsync({
        name: newChildName.trim(),
        category: formState.category,
        wastePercent: 0,
        kcalPer100: formState.kcalPer100 || 0,
        stockLevel: 0,
        allergens: formState.allergens || [],
        suppliers: [],
        parentIngredientId: formState.id,
        childYieldPercent: yieldPct
      });
      showToast(`Added "${newChildName.trim()}" as a child cut`, "success");
      setNewChildName('');
      setNewChildYield('');
    } catch (err: any) {
      showToast(err.message || "Failed to add child cut", "error");
    }
  };

  const handleUpdateChildYield = async (childId: string, yieldPct: number) => {
    if (!yieldPct || yieldPct <= 0 || yieldPct > 100) return;
    try {
      await updateIngredient.mutateAsync({ id: childId, data: { childYieldPercent: yieldPct } });
    } catch (err: any) {
      showToast(err.message || "Failed to update yield %", "error");
    }
  };

  const handleRemoveChildCut = async (child: Ingredient) => {
    if (!confirm(`Remove "${child.name}" as a child cut? This deletes it as an ingredient entirely.`)) return;
    try {
      await deleteIngredient.mutateAsync(child.id);
      showToast(`Removed "${child.name}"`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to remove child cut", "error");
    }
  };

  // Supplier Products management — every action here writes straight to the linked
  // supplierProducts docs; ingredient.suppliers[] is regenerated automatically afterwards
  // (see useLinkedSupplierProductMutations), so this is the one place a user manages
  // supplier data for an ingredient.
  const suppliersListRef = useRef<HTMLDivElement>(null);
  const [newProductForm, setNewProductForm] = useState({ supplier: 'Internal', name: '', packCost: 0, packSize: 1, packUnit: 'kg' as SupplierProduct['packUnit'] });

  const handleAddSupplierProduct = async () => {
    if (!formState.id) {
      showToast("Save this ingredient first, then add supplier products", "error");
      return;
    }
    if (!newProductForm.name.trim()) {
      showToast("Enter a product name", "error");
      return;
    }
    try {
      await addLinked.mutateAsync({
        name: newProductForm.name.trim(),
        supplier: newProductForm.supplier,
        packCost: newProductForm.packCost,
        packSize: newProductForm.packSize,
        packUnit: newProductForm.packUnit,
        unitPrice: newProductForm.packSize > 0 ? newProductForm.packCost / newProductForm.packSize : 0,
        isPreferred: linkedProducts.length === 0
      });
      setNewProductForm(prev => ({ ...prev, name: '', packCost: 0, packSize: 1 }));
      showToast("Supplier product added", "success");
      setTimeout(() => {
        suppliersListRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } catch (err: any) {
      showToast(err.message || "Failed to add supplier product", "error");
    }
  };

  const handleUpdateLinkedProduct = (id: string, field: 'supplier' | 'name' | 'packCost' | 'packSize' | 'packUnit', value: any) => {
    const data: Partial<SupplierProduct> = { [field]: value };
    if (field === 'packCost' || field === 'packSize') {
      const product = linkedProducts.find(p => p.id === id);
      const packCost = field === 'packCost' ? value : (product?.packCost ?? 0);
      const packSize = field === 'packSize' ? value : (product?.packSize ?? 1);
      data.unitPrice = packSize > 0 ? packCost / packSize : 0;
    }
    updateLinked.mutate({ id, data });
  };

  const handleDeleteLinkedProduct = (product: SupplierProduct) => {
    if (!confirm(`Remove "${product.name}" (${product.supplier}) as a supplier option for this ingredient?`)) return;
    deleteLinked.mutate(product.id);
  };

  // "Find on Supplier Catalogue" needs a real ingredient id to link back to. For a brand-new,
  // not-yet-saved ingredient there isn't one yet — auto-save it first (same validation as the
  // normal Save button) so the search can happen immediately after typing a name, rather than
  // forcing a separate manual save step first.
  const [isLinkingNewIngredient, setIsLinkingNewIngredient] = useState(false);
  const handleFindOnCatalogue = async () => {
    if (formState.id) {
      navigateToCatalogToLinkSupplier(formState.id, formState.name);
      return;
    }
    if (!formState.name) {
      showToast("Ingredient name is required before searching the catalogue", "error");
      return;
    }
    setIsLinkingNewIngredient(true);
    try {
      const created = await addIngredient.mutateAsync(formState);
      showToast(`Ingredient "${created.name}" created — searching catalogue...`, "success");
      navigateToCatalogToLinkSupplier(created.id, created.name);
    } catch (err: any) {
      showToast(err.message || "Failed to save ingredient", "error");
    } finally {
      setIsLinkingNewIngredient(false);
    }
  };

  // Menu Auditor PDF Scanner Action
  const handleRunMenuAuditor = () => {
    if (!auditorFile) return;
    setScanning(true);
    setAuditorLogs(['Reading PDF text stream...']);
    setAuditTasks([]);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      if (!arrayBuffer) {
        setAuditorLogs(prev => [...prev, 'Error: Failed to read file data.']);
        setScanning(false);
        return;
      }
      
      try {
        const uint8Array = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const pdf = await loadingTask.promise;
        
        setAuditorLogs(prev => [...prev, `PDF loaded successfully. Pages: ${pdf.numPages}`, 'Extracting text content...']);
        
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item: any) => item.str).join(' ');
          text += pageText + '\n';
        }
        
        setAuditorLogs(prev => [...prev, 'Comparing menu details against Pantry Master Ingredients...']);
        
        // Extract Dishes
        const priceRegex = /-\s*£\s*\d+(?:\.\d{2})?/g;
        const priceMatches = [...text.matchAll(priceRegex)];

        const dishBlocks: { name: string; price: string; startIndex: number; priceIndex: number; endIndex: number; description: string; textToScan: string }[] = [];
        let lastEndIdx = 0;

        const cleanDishName = (name: string) => {
          name = name.replace(/^.*?£\s*\d+/gi, '').trim();
          name = name.replace(/^[A-Z\s'’‘’–\-&““”\"]{3,}\b(?=[^a-z]*[a-z])/g, '').trim();
          name = name.replace(/^[\.,\-\s\/&]+/, '').trim();
          return name;
        };

        for (let i = 0; i < priceMatches.length; i++) {
          const match = priceMatches[i];
          const priceIndex = match.index!;
          const priceText = match[0];
          const prevChunk = text.substring(lastEndIdx, priceIndex).trim();
          
          const separators = [
            /\.\s+/g,
            /\bGF\b/g,
            /\bV\b/g,
            /\bVegan\b/g,
            /\bserved with\b/gi,
            /(?:SUGGESTED\s+)?WINE\s+PAIRING\s*:\s*/gi,
            /LUNCH menu/gi,
            /STARTERS/gi,
            /pub classics/gi,
            /farmer specials/gi,
            /sharing boards/gi,
            /dry-aged meat/gi,
            /sides/gi
          ];
          
          let splitIndex = 0;
          for (const sep of separators) {
            let m;
            while ((m = sep.exec(prevChunk)) !== null) {
              const endPos = m.index + m[0].length;
              if (endPos > splitIndex) {
                splitIndex = endPos;
              }
            }
          }
          
          let dishName = prevChunk.substring(splitIndex).trim();
          dishName = cleanDishName(dishName);
          
          if (!dishName || dishName.length > 80) {
            dishName = prevChunk.split(/\s+/).slice(-5).join(' ');
          }

          dishBlocks.push({
            name: dishName,
            price: priceText,
            startIndex: lastEndIdx,
            priceIndex: priceIndex,
            endIndex: 0,
            description: '',
            textToScan: ''
          });
          
          if (i > 0) {
            const prevBlock = dishBlocks[i - 1];
            const descStart = prevBlock.priceIndex + prevBlock.price.length;
            const descEnd = lastEndIdx + splitIndex;
            prevBlock.description = text.substring(descStart, descEnd).trim();
            prevBlock.endIndex = descEnd;
            prevBlock.textToScan = (prevBlock.name + " " + prevBlock.description).toLowerCase();
          }
          
          lastEndIdx = priceIndex + priceText.length;
        }

        if (dishBlocks.length > 0) {
          const lastBlock = dishBlocks[dishBlocks.length - 1];
          lastBlock.description = text.substring(lastBlock.priceIndex + lastBlock.price.length).trim();
          lastBlock.endIndex = text.length;
          lastBlock.textToScan = (lastBlock.name + " " + lastBlock.description).toLowerCase();
        }

        // Run Audit
        const unrecognized = new Map<string, Set<string>>();
        
        COMMON_INGREDIENTS.forEach(keyword => {
          const isMatched = isIngredientMatched(keyword, ingredients);
          if (isMatched) return;
          
          dishBlocks.forEach(d => {
            if (d.textToScan.includes(keyword.toLowerCase())) {
              let set = unrecognized.get(keyword);
              if (!set) {
                set = new Set();
                unrecognized.set(keyword, set);
              }
              set.add(d.name);
            }
          });
        });

        // Check for missing dishes and incomplete recipes
        const missingDishes: string[] = [];
        const incompleteRecipes: string[] = [];

        dishBlocks.forEach(d => {
          const cleanParsed = cleanProductName(d.name);
          if (!cleanParsed) return;

          // Look for matching dish in db
          const matchedDish = dishes.find(dbDish => {
            const cleanDb = cleanProductName(dbDish.name);
            return cleanDb === cleanParsed || cleanDb.includes(cleanParsed) || cleanParsed.includes(cleanDb);
          });

          if (!matchedDish) {
            missingDishes.push(d.name);
          } else if (!matchedDish.items || matchedDish.items.length === 0) {
            incompleteRecipes.push(d.name);
          }
        });

        const compiledTasks: AuditTask[] = [];

        // 1. Unrecognized ingredients -> tasks
        Array.from(unrecognized.entries()).forEach(([ing, dishesSet]) => {
          const titleCaseIng = ing.charAt(0).toUpperCase() + ing.slice(1);
          compiledTasks.push({
            id: `ingredient-${ing}`,
            type: 'ingredient',
            title: `Add "${titleCaseIng}" to Pantry`,
            subtitle: `Found in menu description of: ${Array.from(dishesSet).join(', ')}`,
            completed: false
          });
        });

        // 2. Missing dishes -> tasks
        missingDishes.forEach(name => {
          compiledTasks.push({
            id: `dish-${name}`,
            type: 'dish',
            title: `Create "${name}" dish in Service`,
            subtitle: `Missing from Service/Dishes page database`,
            completed: false
          });
        });

        // 3. Incomplete recipes -> tasks
        incompleteRecipes.forEach(name => {
          compiledTasks.push({
            id: `recipe-${name}`,
            type: 'recipe',
            title: `Build recipe for "${name}"`,
            subtitle: `Dish exists but has 0 ingredients linked`,
            completed: false
          });
        });

        setAuditTasks(compiledTasks);
        setAuditorLogs(prev => [
          ...prev,
          `Audit completed! Found ${compiledTasks.length} action items.`
        ]);
      } catch (err) {
        console.error(err);
        setAuditorLogs(prev => [...prev, 'Error parsing PDF: ' + (err as Error).message]);
      } finally {
        setScanning(false);
      }
    };
    reader.onerror = () => {
      setAuditorLogs(prev => [...prev, 'Error reading file.']);
      setScanning(false);
    };
    reader.readAsArrayBuffer(auditorFile);
  };

  const toggleTaskCompleted = (id: string) => {
    setAuditTasks(prev => prev.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const removeTask = (id: string) => {
    setAuditTasks(prev => prev.filter(task => task.id !== id));
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-container-lowest">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-surface-container-lowest">

      {/* 1. LEFT COLUMN: SEARCH & CATALOG LIST (35% desktop / full-width mobile list view) */}
      <div className={`${isMobile ? (isEditing ? 'hidden' : 'w-full') : 'w-[35%]'} border-r border-outline-variant h-full flex flex-col bg-surface-container-lowest`}>
        <div className="p-4 border-b border-outline-variant bg-surface flex flex-col gap-3">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="label-caps text-outline font-bold">Pantry Directory</span>
            <div className="flex gap-2 flex-wrap">
              <div className="flex border border-outline-variant rounded-sm overflow-hidden text-[10px] font-bold label-caps">
                <button
                  onClick={() => setPantrySort('name')}
                  className={`h-8 px-2.5 transition-colors ${pantrySort === 'name' ? 'bg-primary text-white' : 'bg-surface text-outline hover:bg-surface-container-low'}`}
                >
                  A–Z
                </button>
                <button
                  onClick={() => setPantrySort('date')}
                  className={`h-8 px-2.5 border-l border-outline-variant transition-colors ${pantrySort === 'date' ? 'bg-primary text-white' : 'bg-surface text-outline hover:bg-surface-container-low'}`}
                >
                  Recent
                </button>
              </div>
              {isManager && (
                <>
                  <button
                    onClick={() => setShowMenuAuditor(true)}
                    className="h-8 px-3 border border-outline text-[10px] label-caps font-bold rounded-sm bg-surface hover:bg-surface-container-low"
                  >
                    Auditor
                  </button>
                  <button
                    onClick={handleStartNew}
                    title="Create new ingredient"
                    className="h-8 w-8 bg-primary text-white flex items-center justify-center rounded-sm hover:bg-opacity-90"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search Box */}
          <div className="relative flex items-center bg-surface-container-lowest border border-outline-variant rounded-sm px-3 py-1.5 focus-within:border-primary">
            <Search className="h-4 w-4 text-outline mr-2" />
            <input 
              type="text" 
              placeholder="Search master ingredients..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none border-none focus:ring-0 p-0"
            />
          </div>

          {/* Filter Category & Sub-Category Selects */}
          <div className="flex flex-col gap-2">
            <select 
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setSelectedSubCategory('All'); }}
              className="w-full text-xs font-semibold px-2 py-1.5 border border-outline-variant bg-surface-container-lowest"
            >
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {(selectedCategory === 'Dry Store' || selectedCategory === 'Vegetable') && (
              <select
                value={selectedSubCategory}
                onChange={(e) => setSelectedSubCategory(e.target.value)}
                className="w-full text-xs font-semibold px-2 py-1.5 border border-outline-variant bg-surface-container-lowest"
              >
                <option value="All">All Sub-Categories</option>
                {(selectedCategory === 'Dry Store' ? DRY_STORE_SUBCATEGORIES : VEGETABLE_SUBCATEGORIES).map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Directory List */}
        <div className="flex-1 overflow-y-auto divide-y divide-outline-variant">
          {filteredIngredients.map((ing, idx) => {
            const preferred = ing.suppliers?.find(s => s.isPreferred) || ing.suppliers?.[0];
            const parent = ing.parentIngredientId ? ingredients.find(i => i.id === ing.parentIngredientId) : undefined;
            return (
              <div
                key={ing.id}
                onClick={() => selectIngredient(ing.id)}
                className={`p-4 hover:bg-surface-container cursor-pointer flex justify-between items-center transition-colors ${
                  selectedId === ing.id
                    ? 'bg-surface-container'
                    : idx % 2 === 0
                      ? 'bg-transparent'
                      : 'bg-black/[0.0075]'
                }`}
              >
                <div>
                  <div className="font-semibold text-sm text-on-surface">{ing.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-on-surface-variant">{ing.category}</span>
                    {parent ? (
                      <span className="text-[9px] bg-secondary-container text-primary px-1.5 py-0.5 rounded-sm font-semibold">
                        ↳ {ing.childYieldPercent}% of {parent.name}
                      </span>
                    ) : (
                      preferred && <span className={supplierBadgeClass(preferred.name)}>{preferred.name}</span>
                    )}
                  </div>
                </div>
                {parent ? (
                  <div className="data-tabular text-xs text-outline">derived</div>
                ) : preferred && (
                  <div className="text-right">
                    <div className="data-tabular text-sm text-primary font-bold">
                      £{preferred.packCost.toFixed(2)} / {preferred.packSize} {preferred.packUnit}
                    </div>
                    {(() => {
                      const age = formatPriceAge(preferred.priceUpdatedAt);
                      return age && (
                        <div className={`text-[10px] mt-0.5 ${age.isStale ? 'text-amber-600 font-semibold' : 'text-outline'}`}>
                          {age.label}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. RIGHT COLUMN: WORKSPACE PROFILE EDITOR (65% desktop / full-width mobile detail view) */}
      <div className={`${isMobile ? (isEditing ? 'w-full' : 'hidden') : 'flex-1'} h-full p-4 sm:p-8 overflow-y-auto bg-surface-container-lowest flex flex-col gap-6`}>
        {isEditing ? (
          <>
            {isMobile && (
              <button
                onClick={() => { selectIngredient(null); setIsEditing(false); setIsNew(false); }}
                className="flex items-center gap-1.5 text-xs font-bold label-caps text-outline -mb-2 min-h-[44px]"
              >
                <ArrowLeft className="h-4 w-4" /> Back to list
              </button>
            )}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b border-outline-variant pb-4">
              <div>
                <h2 className="headline-sm font-semibold">{isNew ? 'Create New Ingredient' : formState.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-outline label-caps">MASTER pantry RECORD</span>
                  {!isNew && (
                    <>
                      <span className="text-outline-variant">•</span>
                      <button
                        onClick={() => navigateToCatalogWithSearch(formState.name)}
                        className="text-xs text-primary font-bold hover:underline flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
                      >
                        Search Supplier Catalogue <ArrowRight className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {!isManager && (
                  <span className="text-[10px] text-outline label-caps">View only — ask a manager to save changes</span>
                )}
                {isManager && !isNew && (
                  <button
                    onClick={async () => {
                      if (confirm("Delete this ingredient permanently?")) {
                        try {
                          await deleteIngredient.mutateAsync(formState.id!);
                          showToast("Ingredient deleted successfully", "success");
                          selectIngredient(null);
                        } catch (err: any) {
                          showToast(err.message || "Failed to delete ingredient", "error");
                        }
                      }
                    }}
                    disabled={isSaving}
                    className="h-10 px-4 border border-error text-error text-xs font-bold label-caps rounded-sm hover:bg-error-container disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                )}
                {isManager && (
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
                      'Save Profile'
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Child-cut banner: this ingredient is a yield-based cut of a
                whole-item parent (e.g. Chicken Supreme from Whole Chicken).
                Its cost is always derived from the parent, not priced here. */}
            {formState.parentIngredientId && (() => {
              const parent = ingredients.find(i => i.id === formState.parentIngredientId);
              return (
                <div className="bg-secondary-container border border-[#90a8ff] p-4 rounded-sm mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 text-xs text-on-surface">
                    This is a child cut of{' '}
                    <button
                      onClick={() => parent && selectIngredient(parent.id)}
                      className="font-bold text-primary hover:underline bg-transparent border-none p-0 cursor-pointer"
                    >
                      {parent?.name || 'Unknown Ingredient'}
                    </button>
                    . Its cost is automatically derived from the parent's price — it has no supplier pricing of its own.
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <label className="text-[10px] label-caps text-outline">Yield %</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={formState.childYieldPercent ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormState(prev => ({
                          ...prev,
                          childYieldPercent: val === '' ? undefined : Math.max(1, Math.min(100, parseFloat(val) || 1))
                        }));
                      }}
                      className="w-20 px-2 py-1.5 border border-outline-variant rounded-sm text-sm data-tabular text-center bg-surface"
                    />
                  </div>
                </div>
              );
            })()}

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="label-caps text-outline block mb-2">Ingredient Name</label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm"
                  placeholder="e.g., Maris Piper Potatoes"
                />
                {isNew && <span className="text-[10px] text-outline mt-1 block">Category, waste %, calories and allergens auto-fill as you type — edit any field to override.</span>}
                {isNew && formState.name.trim() && (
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-outline">Search:</span>
                    {getSupplierSearchLinks(formState.name.trim()).map(({ supplier, url }) => (
                      <a
                        key={supplier}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${supplierBadgeClass(supplier)} hover:underline inline-flex items-center gap-1`}
                      >
                        {supplier}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="label-caps text-outline block mb-2">Category</label>
                <select
                  value={formState.category}
                  onChange={(e) => { autofillTouched.current.category = true; setFormState(prev => ({ ...prev, category: e.target.value as any })); }}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm"
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              {(formState.category === 'Dry Store' || formState.category === 'Vegetable') && (
                <div>
                  <label className="label-caps text-outline block mb-2">
                    {formState.category === 'Dry Store' ? 'Dry Store Sub-Category' : 'Vegetable Sub-Category'}
                  </label>
                  <select
                    value={formState.subCategory || ''}
                    onChange={(e) => { autofillTouched.current.subCategory = true; setFormState(prev => ({ ...prev, subCategory: e.target.value || undefined })); }}
                    className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm"
                  >
                    <option value="">— None —</option>
                    {(formState.category === 'Dry Store' ? DRY_STORE_SUBCATEGORIES : VEGETABLE_SUBCATEGORIES).map(sub => <option key={sub} value={sub}>{sub}</option>)}
                  </select>
                </div>
              )}

              {(formState.category === 'Meat' || formState.category === 'Fish') && (
                <div>
                  <label className="label-caps text-outline block mb-2">Food Temp Check</label>
                  <select
                    value={formState.tempCheckType || ''}
                    onChange={(e) => setFormState(prev => ({ ...prev, tempCheckType: (e.target.value || undefined) as any }))}
                    className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm"
                  >
                    <option value="">— Not used raw in a dish —</option>
                    <option value="Cooked Core">Cooked Core (used raw, cooked to order)</option>
                    <option value="Reheat">Reheat (already cooked before use)</option>
                  </select>
                  <span className="text-[10px] text-outline mt-1 block">
                    Only needed if this ingredient is added directly to a dish rather than via a recipe.
                  </span>
                </div>
              )}

              <div>
                <label className="label-caps text-outline block mb-2">Waste Percentage (%)</label>
                <input
                  type="number"
                  value={formState.wastePercent}
                  onChange={(e) => { autofillTouched.current.wastePercent = true; setFormState(prev => ({ ...prev, wastePercent: Math.max(0, parseFloat(e.target.value) || 0) })); }}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm data-tabular"
                />
              </div>

              <div>
                <label className="label-caps text-outline block mb-2">Calories (kcal per 100g)</label>
                <input
                  type="number"
                  value={formState.kcalPer100}
                  onChange={(e) => { autofillTouched.current.kcalPer100 = true; setFormState(prev => ({ ...prev, kcalPer100: Math.max(0, parseInt(e.target.value) || 0) })); }}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm data-tabular"
                />
              </div>

              <div>
                <label className="label-caps text-outline block mb-2">Piece Weight (g per each/bunch)</label>
                <input 
                  type="number" 
                  value={formState.pieceWeight !== undefined ? formState.pieceWeight : (formState.eaWeight !== undefined ? formState.eaWeight : '')}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setFormState(prev => {
                      const copy = { ...prev };
                      if (val > 0) {
                        copy.pieceWeight = val;
                        copy.eaWeight = val;
                      } else {
                        copy.pieceWeight = undefined;
                        copy.eaWeight = undefined;
                      }
                      return copy;
                    });
                  }}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm data-tabular"
                  placeholder="e.g., 400 for Cucumber"
                />
              </div>
             </div>

            {/* Allergens */}
            <div className="mt-6 border-t border-outline-variant pt-4">
              <label className="label-caps text-outline block mb-3">Allergens</label>
              <div className="flex flex-wrap gap-2">
                {allergensList.map(allergen => {
                  const active = (formState.allergens || []).includes(allergen);
                  return (
                    <button
                      key={allergen}
                      type="button"
                      onClick={() => { autofillTouched.current.allergens = true; setFormState(prev => {
                        const current = prev.allergens || [];
                        return {
                          ...prev,
                          allergens: active
                            ? current.filter(a => a !== allergen)
                            : [...current, allergen]
                        };
                      }); }}
                      className={`px-2.5 py-1 text-xs font-semibold border transition-all ${
                        active
                          ? 'bg-error text-white border-error'
                          : 'bg-transparent border-outline-variant text-outline hover:border-primary hover:text-on-surface'
                      }`}
                    >
                      {allergen}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Breakdown: define whole-item child cuts on this ingredient's
                own page (e.g. Whole Chicken → Chicken Supreme, Chicken Leg).
                Only for top-level ingredients — a child can't itself have
                children, and only makes sense once the ingredient exists. */}
            {!formState.parentIngredientId && !isNew && (
              <div className="mt-4 border-t border-outline-variant pt-6">
                <h3 className="label-caps text-on-surface font-bold mb-1">Breakdown (Whole-Item Cuts)</h3>
                <p className="text-[10px] text-outline mb-4">
                  Define this ingredient's child cuts and what % of its weight each yields (e.g. Whole Chicken → Supreme 30%, Leg 25%). Yields don't need to sum to 100% — the remainder is trim/carcass waste. Each cut becomes its own selectable ingredient in recipes/dishes, costed automatically from this parent's price.
                </p>

                {childIngredients.length > 0 && (
                  <div className="flex flex-col gap-2 mb-4">
                    {childIngredients.map(child => (
                      <div key={child.id} className="flex items-center gap-3 bg-surface p-3 border border-outline-variant rounded-sm">
                        <button
                          onClick={() => selectIngredient(child.id)}
                          className="flex-1 text-left text-sm font-semibold text-primary hover:underline bg-transparent border-none p-0 cursor-pointer truncate"
                        >
                          {child.name}
                        </button>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            defaultValue={child.childYieldPercent}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (val !== child.childYieldPercent) handleUpdateChildYield(child.id, val);
                            }}
                            className="w-16 px-2 py-1 border border-outline-variant rounded-sm text-xs data-tabular text-center"
                          />
                          <span className="text-xs text-outline">%</span>
                        </div>
                        <button
                          onClick={() => handleRemoveChildCut(child)}
                          className="p-1 text-error hover:bg-error-container rounded-sm flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 bg-surface p-3 border border-outline-variant rounded-sm">
                  <input
                    type="text"
                    value={newChildName}
                    onChange={(e) => setNewChildName(e.target.value)}
                    placeholder="e.g. Chicken Supreme"
                    className="flex-1 px-3 py-1.5 border border-outline-variant rounded-sm text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={newChildYield}
                      onChange={(e) => setNewChildYield(e.target.value)}
                      placeholder="Yield %"
                      className="w-24 px-3 py-1.5 border border-outline-variant rounded-sm text-sm data-tabular"
                    />
                    <button
                      onClick={handleAddChildCut}
                      disabled={addIngredient.isPending}
                      className="h-9 px-4 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 disabled:opacity-50 flex-shrink-0"
                    >
                      + Add Cut
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Child cuts derive their cost from the parent — no supplier
                pricing section or catalog-price-comparison for them. */}
            {!formState.parentIngredientId && <>
            {cheaperLinkedOption && (
              <div className="bg-success-container border border-success p-4 rounded-sm text-on-success-container flex items-center justify-between text-xs mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💡</span>
                  <div>
                    <span className="font-bold">Cheaper Supplier Option Available!</span>
                    <p className="mt-0.5 text-on-success-variant flex items-center flex-wrap gap-1">
                      <b>{cheaperLinkedOption.product.supplier}</b>'s "{cheaperLinkedOption.product.name}"
                      undercuts your preferred <b>{cheaperLinkedOption.preferredName}</b> by {Math.round(cheaperLinkedOption.savingPercent)}%
                      {' '}({formatSupplierUnitPrice(cheaperLinkedOption.product.packCost, cheaperLinkedOption.product.packSize, cheaperLinkedOption.product.packUnit)}).
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreferred.mutate(cheaperLinkedOption.product.id)}
                  className="h-8 px-3 bg-success text-white font-bold label-caps rounded-sm hover:opacity-90 flex-shrink-0"
                >
                  Make Preferred
                </button>
              </div>
            )}

            {/* Supplier Products Sub-Section — sourced live from supplierProducts docs whose
                ingredientId matches this ingredient; see useSupplierProductsForIngredient. */}
            <div className="mt-4 border-t border-outline-variant pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="label-caps text-on-surface font-bold">Supplier Products</h3>
                {formState.id ? (
                  <button
                    onClick={handleFindOnCatalogue}
                    title="Search the full supplier catalogue and link a matching product to this ingredient"
                    className="h-8 px-3 border border-primary text-primary text-[10px] label-caps font-bold rounded-sm bg-surface hover:bg-primary/5"
                  >
                    Find on Supplier Catalogue
                  </button>
                ) : (
                  <span title="Type an ingredient name first, then save it to add supplier products"
                    className="h-8 px-3 border border-outline-variant text-outline/50 text-[10px] label-caps font-bold rounded-sm flex items-center cursor-not-allowed">
                    Find on Supplier Catalogue
                  </span>
                )}
              </div>

              {!formState.id ? (
                <div className="p-8 text-center bg-surface border border-outline-variant rounded-sm text-sm text-outline">
                  Save this ingredient first, then add supplier products.
                </div>
              ) : loadingLinkedProducts ? (
                <div className="p-8 text-center bg-surface border border-outline-variant rounded-sm text-sm text-outline">
                  Loading supplier products…
                </div>
              ) : (
                <>
                {linkedProducts.length === 0 ? (
                  <div className="p-8 text-center bg-surface border border-outline-variant rounded-sm text-sm text-outline">
                    No supplier products linked. Add one below to compute recipe costs.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3" ref={suppliersListRef}>
                    {linkedProducts.map((prod) => (
                      <div key={prod.id} className="flex flex-col gap-3 bg-surface p-4 border border-outline-variant rounded-sm">
                        <div className="flex flex-wrap md:flex-nowrap gap-2 items-center">
                          <div className="w-[110px] flex-shrink-0">
                            <label className="text-[9px] label-caps text-outline flex items-center gap-1 mb-1">
                              Supplier
                              <a
                                href={getSupplierUrl(prod)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View this product on the supplier site"
                                className="text-outline hover:text-primary transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </label>
                            <select
                              value={prod.supplier}
                              onChange={(e) => handleUpdateLinkedProduct(prod.id, 'supplier', e.target.value)}
                              className="w-full px-1.5 py-1 border border-outline-variant bg-surface-container-lowest text-[11px]"
                            >
                              {suppliersList.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>

                          <div className="w-[140px] flex-shrink-0">
                            <label className="text-[9px] label-caps text-outline block mb-1">Product Name</label>
                            <input
                              type="text"
                              value={prod.name}
                              onChange={(e) => handleUpdateLinkedProduct(prod.id, 'name', e.target.value)}
                              className="w-full px-1.5 py-0.5 border border-outline-variant text-[11px]"
                            />
                          </div>

                          <div className="w-[65px] flex-shrink-0">
                            <label className="text-[9px] label-caps text-outline block mb-1">Unit Cost (£)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={prod.packCost}
                              onChange={(e) => handleUpdateLinkedProduct(prod.id, 'packCost', Math.max(0, parseFloat(e.target.value) || 0))}
                              className="w-full px-1.5 py-0.5 border border-outline-variant text-[11px] font-mono font-semibold"
                            />
                          </div>

                          <div className="w-[55px] flex-shrink-0">
                            <label className="text-[9px] label-caps text-outline block mb-1">Pack Size</label>
                            <input
                              type="number"
                              value={prod.packSize}
                              onChange={(e) => handleUpdateLinkedProduct(prod.id, 'packSize', Math.max(1, parseFloat(e.target.value) || 1))}
                              className="w-full px-1.5 py-0.5 border border-outline-variant text-[11px] font-mono font-semibold"
                            />
                          </div>

                          <div className="w-[60px] flex-shrink-0">
                            <label className="text-[9px] label-caps text-outline block mb-1">Size Unit</label>
                            <select
                              value={prod.packUnit}
                              onChange={(e) => handleUpdateLinkedProduct(prod.id, 'packUnit', e.target.value as any)}
                              className="w-full px-1.5 py-1 border border-outline-variant bg-surface-container-lowest text-[11px]"
                            >
                              {units.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>

                          <div className="flex flex-col items-start mt-4 w-[75px] flex-shrink-0">
                            <span className="text-[9px] label-caps text-outline block mb-1">Current Price</span>
                            <span className="text-[11px] font-mono font-semibold text-primary mt-0.5">
                              {formatSupplierUnitPrice(prod.packCost, prod.packSize, prod.packUnit)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-4 w-[85px] flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={!!prod.isPreferred}
                              onChange={() => { if (!prod.isPreferred) setPreferred.mutate(prod.id); }}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-[11px] font-semibold text-outline">Preferred</span>
                          </div>

                          <button
                            onClick={() => handleDeleteLinkedProduct(prod)}
                            className="p-1 text-error hover:bg-error-container mt-4 w-[24px] flex-shrink-0 flex items-center justify-center"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Supplier Product — creates the supplierProduct doc with
                    ingredientId already set to this ingredient; no separate linking step. */}
                <div className="flex flex-wrap md:flex-nowrap gap-2 items-end bg-surface p-4 border border-dashed border-outline-variant rounded-sm mt-3">
                  <div className="w-[110px] flex-shrink-0">
                    <label className="text-[9px] label-caps text-outline block mb-1">Supplier</label>
                    <select
                      value={newProductForm.supplier}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, supplier: e.target.value }))}
                      className="w-full px-1.5 py-1 border border-outline-variant bg-surface-container-lowest text-[11px]"
                    >
                      {suppliersList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="w-[140px] flex-shrink-0">
                    <label className="text-[9px] label-caps text-outline block mb-1">Product Name</label>
                    <input
                      type="text"
                      value={newProductForm.name}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Parmesan - Vegan"
                      className="w-full px-1.5 py-0.5 border border-outline-variant text-[11px]"
                    />
                  </div>
                  <div className="w-[65px] flex-shrink-0">
                    <label className="text-[9px] label-caps text-outline block mb-1">Unit Cost (£)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newProductForm.packCost}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, packCost: Math.max(0, parseFloat(e.target.value) || 0) }))}
                      className="w-full px-1.5 py-0.5 border border-outline-variant text-[11px] font-mono font-semibold"
                    />
                  </div>
                  <div className="w-[55px] flex-shrink-0">
                    <label className="text-[9px] label-caps text-outline block mb-1">Pack Size</label>
                    <input
                      type="number"
                      value={newProductForm.packSize}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, packSize: Math.max(1, parseFloat(e.target.value) || 1) }))}
                      className="w-full px-1.5 py-0.5 border border-outline-variant text-[11px] font-mono font-semibold"
                    />
                  </div>
                  <div className="w-[60px] flex-shrink-0">
                    <label className="text-[9px] label-caps text-outline block mb-1">Size Unit</label>
                    <select
                      value={newProductForm.packUnit}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, packUnit: e.target.value as SupplierProduct['packUnit'] }))}
                      className="w-full px-1.5 py-1 border border-outline-variant bg-surface-container-lowest text-[11px]"
                    >
                      {units.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={handleAddSupplierProduct}
                    disabled={addLinked.isPending}
                    className="h-8 px-3 bg-primary text-white text-[10px] label-caps font-bold rounded-sm hover:bg-opacity-90 disabled:opacity-50 flex-shrink-0"
                  >
                    {addLinked.isPending ? 'Adding…' : '+ Add Supplier Product'}
                  </button>
                </div>
                </>
              )}
              {/* Bottom "Save Changes" removed — every Supplier Product edit above commits
                  immediately; the sticky "Save Profile" button only covers the ingredient's
                  own fields (name, category, etc). */}
            </div>
            </>}
          </>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-outline">
            <DatabaseIcon className="h-12 w-12 text-outline mb-2" />
            <span className="label-caps">Select an ingredient to view profile</span>
          </div>
        )}
      </div>

      {/* 3. MENU AUDITOR SLIDE-OVER / MODAL */}
      {showMenuAuditor && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col relative p-6 max-h-[90vh]">
            <h2 className="headline-sm font-semibold border-b border-outline-variant pb-3 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Menu Scanner & Auditor
              </span>
              <button
                onClick={() => {
                  setShowMenuAuditor(false);
                  setAuditorFile(null);
                  setAuditorLogs([]);
                  setAuditTasks([]);
                }}
                className="text-outline hover:text-on-surface text-sm"
              >
                ✕
              </button>
            </h2>

            <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
              {auditTasks.length === 0 && !scanning && auditorLogs.length === 0 ? (
                <>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Upload your new seasonal Menu PDF. The scanner will read the text descriptions, cross-check them against your 300 pantry ingredients, and highlight what fresh items you still need to set up.
                  </p>

                  <div className="border-2 border-dashed border-outline-variant p-10 text-center bg-surface hover:bg-surface-container cursor-pointer transition-colors rounded-sm">
                    <input 
                      type="file" 
                      onChange={(e) => setAuditorFile(e.target.files?.[0] || null)}
                      className="hidden" 
                      id="auditor-file-input"
                      accept="application/pdf"
                    />
                    <label htmlFor="auditor-file-input" className="cursor-pointer flex flex-col items-center gap-2">
                      <FileText className="h-8 w-8 text-outline" />
                      {auditorFile ? (
                        <span className="font-semibold text-sm text-primary">{auditorFile.name}</span>
                      ) : (
                        <span className="text-xs text-outline label-caps">Click to select Menu PDF</span>
                      )}
                    </label>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* File status header */}
                  <div className="flex justify-between items-center bg-surface p-3 border border-outline-variant rounded-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-on-surface truncate max-w-xs sm:max-w-md">
                        {auditorFile?.name || 'Uploaded PDF'}
                      </span>
                    </div>
                    {!scanning && (
                      <button
                        onClick={() => {
                          setAuditorFile(null);
                          setAuditorLogs([]);
                          setAuditTasks([]);
                        }}
                        className="text-[10px] label-caps font-bold px-2 py-1 border border-outline hover:bg-surface-container rounded-sm"
                      >
                        Reset / Scan New
                      </button>
                    )}
                  </div>

                  {scanning && (
                    <div className="flex flex-col items-center justify-center p-8 gap-4">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                      <span className="text-xs text-outline font-semibold label-caps">Running Menu Audit...</span>
                    </div>
                  )}

                  {!scanning && auditorLogs.length > 0 && (
                    <div className="flex flex-col gap-4">
                      {auditTasks.length === 0 ? (
                        <div className="flex flex-col items-center text-center p-8 bg-surface border border-outline-variant rounded-sm gap-2">
                          <CheckCircle2 className="h-10 w-10 text-primary animate-bounce" />
                          <div className="font-bold text-sm text-on-surface">Menu Fully Setup!</div>
                          <div className="text-xs text-on-surface-variant max-w-md">
                            All matched dishes are created, and all seasonal ingredients match existing pantry ingredients. No outstanding tasks found.
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          <div className="text-xs font-bold text-outline label-caps">
                            Interactive To-Do List ({auditTasks.filter(t => !t.completed).length} pending / {auditTasks.length} total)
                          </div>

                          <div className="divide-y divide-outline-variant border border-outline-variant bg-surface rounded-sm overflow-hidden">
                            {auditTasks.map(task => (
                              <div key={task.id} className="p-3.5 flex gap-3 hover:bg-surface-container-low transition-colors items-start">
                                <button
                                  onClick={() => toggleTaskCompleted(task.id)}
                                  className={`h-5 w-5 flex-shrink-0 border rounded flex items-center justify-center transition-colors mt-0.5 ${
                                    task.completed
                                      ? 'bg-primary border-primary text-white'
                                      : 'border-outline hover:border-primary bg-surface'
                                  }`}
                                >
                                  {task.completed && <Check className="h-3.5 w-3.5" />}
                                </button>
                                
                                <div className="flex-1 min-w-0">
                                  <div className={`text-sm font-semibold text-on-surface transition-colors ${
                                    task.completed ? 'line-through text-outline' : ''
                                  }`}>
                                    {task.title}
                                  </div>
                                  <div className={`text-xs text-on-surface-variant mt-0.5 transition-colors ${
                                    task.completed ? 'opacity-60' : ''
                                  }`}>
                                    {task.subtitle}
                                  </div>
                                </div>

                                <button
                                  onClick={() => removeTask(task.id)}
                                  className="p-1 text-outline hover:text-error hover:bg-error-container rounded-sm transition-colors"
                                  title="Remove from list"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Execution Logs toggle */}
                      <div className="border border-outline-variant rounded-sm overflow-hidden">
                        <button
                          onClick={() => setShowLogs(!showLogs)}
                          className="w-full px-3 py-2 bg-surface text-left text-xs font-semibold label-caps text-outline hover:bg-surface-container flex justify-between items-center"
                        >
                          <span>Scanner Execution Logs</span>
                          <span>{showLogs ? 'Hide' : 'Show'}</span>
                        </button>
                        {showLogs && (
                          <div className="bg-surface-container p-3 border-t border-outline-variant font-mono text-[10px] max-h-40 overflow-y-auto flex flex-col gap-1 text-on-surface-variant">
                            {auditorLogs.map((log, i) => (
                              <div key={i}>{log}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-outline-variant pt-4 mt-4">
              <button 
                onClick={() => {
                  setShowMenuAuditor(false);
                  setAuditorFile(null);
                  setAuditorLogs([]);
                  setAuditTasks([]);
                }}
                className="h-10 px-4 border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container"
              >
                Close
              </button>
              {(auditTasks.length === 0 && !scanning && auditorLogs.length === 0) && (
                <button 
                  onClick={handleRunMenuAuditor}
                  disabled={!auditorFile || scanning}
                  className="h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 disabled:opacity-50"
                >
                  Scan Menu
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Inline icons
const DatabaseIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
    <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
    <path d="M3 12A9 3 0 0 0 21 12"></path>
  </svg>
);

export default Pantry;
