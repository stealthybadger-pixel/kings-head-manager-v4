import React, { useState, useMemo, useEffect, useRef } from 'react';
import { supplierBadgeClass } from '../utils/supplierColors';
import { useIngredients, useIngredientMutations, useSupplierSearchQuery, useDishes } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import { Search, Plus, Trash2, AlertCircle, FileText, CheckCircle2, ListTodo, Check, ArrowRight } from 'lucide-react';
import { Ingredient, IngredientCategory, SupplierName, Unit, Allergen, IngredientSupplier } from '../types';

// Self-contained catalog search for a single supplier row
const CatalogRowSearch: React.FC<{
  onSelect: (prod: { supplier: string; packCost: number; packSize: number; packUnit: string }) => void;
}> = ({ onSelect }) => {
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(term), 350);
    return () => clearTimeout(t);
  }, [term]);

  const { data: results = [] } = useSupplierSearchQuery(debouncedTerm, 'All');

  return (
    <div className="relative w-full" ref={ref}>
      <div className="flex items-center gap-1 border border-outline-variant rounded-sm px-2 py-1 bg-surface-container-lowest">
        <Search className="h-3 w-3 text-outline shrink-0" />
        <input
          type="text"
          placeholder="Search catalog…"
          value={term}
          onChange={e => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="flex-1 text-xs bg-transparent outline-none min-w-0"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-surface border border-outline-variant rounded shadow-lg max-h-48 overflow-y-auto">
          {results.slice(0, 20).map(prod => (
            <button
              key={prod.id}
              type="button"
              onMouseDown={() => {
                onSelect({ supplier: prod.supplier, packCost: prod.packCost, packSize: prod.packSize, packUnit: prod.packUnit });
                setTerm('');
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-surface-container text-xs border-b border-outline-variant/40 last:border-0"
            >
              <div className="font-semibold text-on-surface truncate">{prod.name}</div>
              <div className="text-outline">{prod.supplier} · £{prod.packCost.toFixed(2)} / {prod.packSize}{prod.packUnit}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
import { cleanProductName } from '../utils/matching';
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
  if (unit === 'kg' || unit === 'g') {
    const perKg = unit === 'kg' ? cost / size : (cost / size) * 1000;
    return `£${perKg.toFixed(2)} / kg`;
  }
  if (unit === 'l' || unit === 'ml') {
    const perL = unit === 'l' ? cost / size : (cost / size) * 1000;
    return `£${perL.toFixed(2)} / l`;
  }
  return `£${(cost / size).toFixed(2)} / ea`;
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
  const { addIngredient, updateIngredient, deleteIngredient } = useIngredientMutations();
  
  const selectedId = useStore((state) => state.selectedIngredientId);
  const selectIngredient = useStore((state) => state.selectIngredient);
  const showToast = useStore((state) => state.showToast);
  const navigateToCatalogWithSearch = useStore((state) => state.navigateToCatalogWithSearch);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
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
  const suppliersList: SupplierName[] = ['David Catt', 'Urban', 'Cranbrook', 'Crouch', 'Booker', 'Glovers', 'Internal'];
  const units: Unit[] = ['g', 'ml', 'ea', 'kg', 'l'];
  const allergensList: Allergen[] = ['Milk', 'Eggs', 'Fish', 'Crustaceans', 'Molluscs', 'Peanuts', 'Nuts', 'Sesame', 'Soya', 'Wheat (Gluten)', 'Celery', 'Mustard', 'Sulphites', 'Lupin'];

  // Filtered ingredients
  const filteredIngredients = useMemo(() => {
    const filtered = ingredients.filter(ing => {
      const matchSearch = ing.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === 'All' || ing.category === selectedCategory;
      return matchSearch && matchCat;
    });
    if (pantrySort === 'date') {
      return [...filtered].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients, searchQuery, selectedCategory, pantrySort]);

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

  const { data: catalogProducts = [] } = useSupplierSearchQuery(
    activeIngredient ? activeIngredient.name : '',
    'All'
  );

  const cheaperCatalogOption = useMemo(() => {
    if (!activeIngredient) return null;
    
    // Find preferred supplier unit rate
    const prefSup = activeIngredient.suppliers?.find(s => s.isPreferred) || activeIngredient.suppliers?.[0];
    if (!prefSup) return null;

    const getBaseRate = (cost: number, size: number, unit: string) => {
      if (unit === 'kg' || unit === 'l') return cost / (size * 1000);
      return cost / size;
    };

    const getBaseUnit = (unit: string) => {
      if (unit === 'kg' || unit === 'g') return 'g';
      if (unit === 'l' || unit === 'ml') return 'ml';
      return 'ea';
    };

    const currentRate = getBaseRate(prefSup.packCost, prefSup.packSize, prefSup.packUnit);
    const currentBaseUnit = getBaseUnit(prefSup.packUnit);

    // Look for matching product in catalog
    let bestCheaperProd: any = null;
    let maxSavingPercent = 0;

    catalogProducts.forEach(prod => {
      const prodBaseUnit = getBaseUnit(prod.packUnit);
      if (prodBaseUnit !== currentBaseUnit) return;

      const cleanProd = cleanProductName(prod.name);
      const cleanIng = cleanProductName(activeIngredient.name);

      if (cleanProd === cleanIng || cleanProd.includes(cleanIng) || cleanIng.includes(cleanProd)) {
        const prodRate = getBaseRate(prod.packCost, prod.packSize, prod.packUnit);
        if (prodRate < currentRate - 0.00001) {
          const saving = ((currentRate - prodRate) / currentRate) * 100;
          if (saving > maxSavingPercent) {
            maxSavingPercent = saving;
            bestCheaperProd = prod;
          }
        }
      }
    });

    if (bestCheaperProd) {
      return {
        product: bestCheaperProd,
        savingPercent: maxSavingPercent
      };
    }

    return null;
  }, [activeIngredient, catalogProducts]);

  const handleStartNew = () => {
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
        await updateIngredient.mutateAsync({ id: formState.id, data: formState });
        showToast(`Ingredient "${formState.name}" updated successfully!`, "success");
      }
      setIsEditing(false);
      setIsNew(false);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to save ingredient", "error");
    }
  };

  // Supplier packaging management
  const suppliersListRef = useRef<HTMLDivElement>(null);

  const handleAddSupplier = () => {
    setFormState(prev => ({
      ...prev,
      suppliers: [
        ...prev.suppliers,
        { name: 'Internal', packCost: 0, packSize: 1, packUnit: 'kg', isPreferred: prev.suppliers.length === 0 }
      ]
    }));
    setTimeout(() => {
      suppliersListRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  const handleUpdateSupplier = (index: number, field: string, value: any) => {
    setFormState(prev => {
      const updated = [...prev.suppliers];
      updated[index] = { ...updated[index], [field]: value };
      
      // If setting preferred, unset preferred on all others
      if (field === 'isPreferred' && value === true) {
        updated.forEach((sup, i) => {
          if (i !== index) sup.isPreferred = false;
        });
      }
      
      return { ...prev, suppliers: updated };
    });
  };

  const handleRemoveSupplier = (index: number) => {
    setFormState(prev => ({
      ...prev,
      suppliers: prev.suppliers.filter((_, i) => i !== index)
    }));
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
      
      {/* 1. LEFT COLUMN: SEARCH & CATALOG LIST (35%) */}
      <div className="w-[35%] border-r border-outline-variant h-full flex flex-col bg-surface-container-lowest">
        <div className="p-4 border-b border-outline-variant bg-surface flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="label-caps text-outline font-bold">Pantry Directory</span>
            <div className="flex gap-2">
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
                  New
                </button>
              </div>
              <button
                onClick={() => setShowMenuAuditor(true)}
                className="h-8 px-3 border border-outline text-[10px] label-caps font-bold rounded-sm bg-surface hover:bg-surface-container-low"
              >
                Auditor
              </button>
              <button
                onClick={handleStartNew}
                className="h-8 w-8 bg-primary text-white flex items-center justify-center rounded-sm hover:bg-opacity-90"
              >
                <Plus className="h-4 w-4" />
              </button>
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

          {/* Filter Category Select */}
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full text-xs font-semibold px-2 py-1.5 border border-outline-variant bg-surface-container-lowest"
          >
            <option value="All">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Directory List */}
        <div className="flex-1 overflow-y-auto divide-y divide-outline-variant">
          {filteredIngredients.map((ing, idx) => {
            const preferred = ing.suppliers?.find(s => s.isPreferred) || ing.suppliers?.[0];
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
                    {preferred && <span className={supplierBadgeClass(preferred.name)}>{preferred.name}</span>}
                  </div>
                </div>
                {preferred && (
                  <div className="data-tabular text-sm text-primary font-bold">
                    £{preferred.packCost.toFixed(2)} / {preferred.packSize} {preferred.packUnit}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. RIGHT COLUMN: WORKSPACE PROFILE EDITOR (65%) */}
      <div className="flex-1 h-full p-8 overflow-y-auto bg-surface-container-lowest flex flex-col gap-6">
        {isEditing ? (
          <>
            <div className="flex justify-between items-center border-b border-outline-variant pb-4">
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
              <div className="flex gap-4">
                {!isNew && (
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
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="label-caps text-outline block mb-2">Ingredient Name</label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm"
                  placeholder="e.g., Maris Piper Potatoes"
                />
              </div>

              <div>
                <label className="label-caps text-outline block mb-2">Category</label>
                <select 
                  value={formState.category}
                  onChange={(e) => setFormState(prev => ({ ...prev, category: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm"
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="label-caps text-outline block mb-2">Waste Percentage (%)</label>
                <input 
                  type="number" 
                  value={formState.wastePercent}
                  onChange={(e) => setFormState(prev => ({ ...prev, wastePercent: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm data-tabular"
                />
              </div>

              <div>
                <label className="label-caps text-outline block mb-2">Calories (kcal per 100g)</label>
                <input 
                  type="number" 
                  value={formState.kcalPer100}
                  onChange={(e) => setFormState(prev => ({ ...prev, kcalPer100: Math.max(0, parseInt(e.target.value) || 0) }))}
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
                      onClick={() => setFormState(prev => {
                        const current = prev.allergens || [];
                        return {
                          ...prev,
                          allergens: active
                            ? current.filter(a => a !== allergen)
                            : [...current, allergen]
                        };
                      })}
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

            {cheaperCatalogOption && (
              <div className="bg-success-container border border-success p-4 rounded-sm text-on-success-container flex items-center justify-between text-xs mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💡</span>
                  <div>
                    <span className="font-bold">Cheaper Catalog Option Available!</span>
                    <p className="mt-0.5 text-on-success-variant flex items-center flex-wrap gap-1">
                      {cheaperCatalogOption.product.supplier} offers
                      <button
                        onClick={() => navigateToCatalogWithSearch(cheaperCatalogOption.product.name)}
                        className="font-bold text-primary hover:underline bg-transparent border-none p-0 cursor-pointer inline-flex items-center gap-0.5 align-baseline"
                        title="View option in supplier catalogue"
                      >
                        "{cheaperCatalogOption.product.name}"
                        <ArrowRight className="h-3 w-3" />
                      </button>
                      at £{cheaperCatalogOption.product.packCost.toFixed(2)} for {cheaperCatalogOption.product.packSize} {cheaperCatalogOption.product.packUnit} (Saves {Math.round(cheaperCatalogOption.savingPercent)}%).
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const prod = cheaperCatalogOption.product;
                    const newSupplier: IngredientSupplier = {
                      name: prod.supplier,
                      packCost: prod.packCost,
                      packSize: prod.packSize,
                      packUnit: prod.packUnit,
                      isPreferred: true
                    };
                    
                    setFormState(prev => {
                      let updated = [...(prev.suppliers || [])];
                      updated = updated.map(s => ({ ...s, isPreferred: false }));
                      const existingIndex = updated.findIndex(s => s.name === prod.supplier);
                      if (existingIndex >= 0) {
                        updated[existingIndex] = newSupplier;
                      } else {
                        updated.push(newSupplier);
                      }
                      return { ...prev, suppliers: updated };
                    });
                  }}
                  className="h-8 px-3 bg-success text-white font-bold label-caps rounded-sm hover:opacity-90 flex-shrink-0"
                >
                  Apply Catalog Price
                </button>
              </div>
            )}

            {/* Supplier Catalog Sub-Section */}
            <div className="mt-4 border-t border-outline-variant pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="label-caps text-on-surface font-bold">Supplier Options & Pricing</h3>
                <button 
                  onClick={handleAddSupplier}
                  className="h-8 px-3 border border-outline text-[10px] label-caps font-bold rounded-sm bg-surface hover:bg-surface-container"
                >
                  + Add Supplier Option
                </button>
              </div>

              {formState.suppliers.length === 0 ? (
                <div className="p-8 text-center bg-surface border border-outline-variant rounded-sm text-sm text-outline">
                  No suppliers defined. Add a supplier option to compute recipe costs.
                </div>
              ) : (
                <div className="flex flex-col gap-3" ref={suppliersListRef}>
                  {formState.suppliers.map((sup, idx) => (
                    <div key={idx} className="flex flex-col gap-3 bg-surface p-4 border border-outline-variant rounded-sm">
                      <div>
                        <label className="text-[10px] label-caps text-outline block mb-1">Search Catalog to Pre-fill</label>
                        <CatalogRowSearch
                          onSelect={({ supplier, packCost, packSize, packUnit }) => {
                            setFormState(prev => {
                              const updated = [...prev.suppliers];
                              updated[idx] = { ...updated[idx], name: supplier as any, packCost, packSize, packUnit: packUnit as any };
                              return { ...prev, suppliers: updated };
                            });
                          }}
                        />
                      </div>
                      <div className="flex gap-4 items-center">
                      <div className="w-1/4">
                        <label className="text-[10px] label-caps text-outline block mb-1">Wholesale Partner</label>
                        <select
                          value={sup.name}
                          onChange={(e) => handleUpdateSupplier(idx, 'name', e.target.value)}
                          className="w-full px-2 py-1.5 border border-outline-variant bg-surface-container-lowest text-xs"
                        >
                          {suppliersList.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>

                      <div className="w-1/6">
                        <label className="text-[10px] label-caps text-outline block mb-1">Pack Cost (£)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          value={sup.packCost}
                          onChange={(e) => handleUpdateSupplier(idx, 'packCost', Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full px-2 py-1 border border-outline-variant text-xs data-tabular"
                        />
                      </div>

                      <div className="w-1/6">
                        <label className="text-[10px] label-caps text-outline block mb-1">Pack Size</label>
                        <input 
                          type="number" 
                          value={sup.packSize}
                          onChange={(e) => handleUpdateSupplier(idx, 'packSize', Math.max(1, parseFloat(e.target.value) || 1))}
                          className="w-full px-2 py-1 border border-outline-variant text-xs data-tabular"
                        />
                      </div>

                      <div className="w-1/6">
                        <label className="text-[10px] label-caps text-outline block mb-1">Size Unit</label>
                        <select 
                          value={sup.packUnit}
                          onChange={(e) => handleUpdateSupplier(idx, 'packUnit', e.target.value as any)}
                          className="w-full px-2 py-1.5 border border-outline-variant bg-surface-container-lowest text-xs"
                        >
                          {units.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>

                      <div className="flex flex-col items-start mt-4 min-w-[90px]">
                        <span className="text-[10px] label-caps text-outline block mb-1">Unit Rate</span>
                        <span className="text-xs font-mono font-semibold text-primary data-tabular mt-0.5">
                          {formatSupplierUnitPrice(sup.packCost, sup.packSize, sup.packUnit)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-4 ml-auto">
                        <input 
                          type="checkbox" 
                          checked={sup.isPreferred}
                          onChange={(e) => handleUpdateSupplier(idx, 'isPreferred', e.target.checked)}
                          className="h-4 w-4"
                        />
                        <span className="text-xs font-semibold text-outline">Preferred</span>
                      </div>

                      <button 
                        onClick={() => handleRemoveSupplier(idx)}
                        className="p-1 text-error hover:bg-error-container mt-4 ml-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 flex items-center gap-2 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
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
