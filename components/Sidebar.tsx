
import React, { useState, useMemo } from 'react';
import { Ingredient, Recipe, Dish } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES, COLORS } from '../constants';
import { SourceTag } from './SourceTag';

interface SidebarProps {
  onSelectItem: (id: string, type: 'ingredient' | 'recipe' | 'dish') => void;
  activeTab: 'ingredients' | 'recipes' | 'dishes';
  availableTabs: ('ingredients' | 'recipes' | 'dishes')[];
  allTabs?: ('ingredients' | 'recipes' | 'dishes')[];
  onTabChange: (tab: 'ingredients' | 'recipes' | 'dishes') => void;
  onCreateRequest?: (name: string, type: 'ingredient' | 'recipe' | 'dish') => void;
  incompleteOnly?: boolean;
  isHybrid?: boolean; // New Prop for Production Mode
  onInspect?: (id: string, type: 'ingredient' | 'recipe') => void;
  inspectedItem?: {id: string, type: 'ingredient' | 'recipe'} | null;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  onSelectItem, 
  activeTab, 
  availableTabs, 
  allTabs = availableTabs, 
  onTabChange, 
  onCreateRequest, 
  incompleteOnly = false,
  isHybrid = false,
  onInspect,
  inspectedItem
}) => {
  const { ingredients, recipes, dishes, loading } = useKitchenData();
  const [search, setSearch] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');

  const suppliers = useMemo(() => {
    const all = new Set<string>();
    ingredients.forEach(i => i.suppliers.forEach(s => all.add(s.name)));
    return ['ALL', ...Array.from(all).sort()];
  }, [ingredients]);

  const categories = useMemo(() => ['ALL', ...Array.from(new Set(ingredients.map(i => i.category))).sort()], [ingredients]);

  const filteredItems = useMemo(() => {
    const term = search.toLowerCase();

    if (isHybrid) {
      // Hybrid Mode: Combine Ingredients and Recipes
      const iList = ingredients.map(i => ({ ...i, __type: 'ingredient' as const }));
      const rList = recipes.map(r => ({ ...r, __type: 'recipe' as const }));
      
      return [...iList, ...rList]
        .filter(item => item.name.toLowerCase().includes(term))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    // Standard Modes
    if (activeTab === 'ingredients') {
      return ingredients.filter(i => {
        const matchesSearch = i.name.toLowerCase().includes(term);
        const matchesSupplier = filterSupplier === 'ALL' || i.suppliers.some(s => s.name === filterSupplier);
        const matchesCategory = filterCategory === 'ALL' || i.category === filterCategory;
        const matchesIncomplete = !incompleteOnly || i.incomplete;
        return matchesSearch && matchesSupplier && matchesCategory && matchesIncomplete;
      });
    } else if (activeTab === 'recipes') {
      return recipes.filter(r => r.name.toLowerCase().includes(term));
    }
    return dishes.filter(d => d.name.toLowerCase().includes(term));
  }, [ingredients, recipes, dishes, search, activeTab, filterSupplier, filterCategory, incompleteOnly, isHybrid]);

  return (
    <div className="flex flex-col h-full bg-[#111111]">
      <div className="p-4 border-b border-[#333333] flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#c8a96e] mb-1 flex justify-between items-center">
          <div className="flex items-center gap-2">
            LIBRARY
          </div>
          {!isHybrid && activeTab === 'ingredients' && ingredients.some(i => i.incomplete) && (
             <span className="text-[8px] font-mono text-red-500 animate-pulse">! INCOMPLETE_DETECTED</span>
          )}
        </h2>
        
        <input
          type="text"
          placeholder={isHybrid ? "Search components..." : "Search library..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`w-full ${UI_STYLES.input} !text-xs !py-1.5`}
          autoFocus={isHybrid}
        />

        {/* Layout Stabilization: Fixed Height Filter Container */}
        <div className="h-20 w-full flex flex-col justify-end pb-2">
          {!isHybrid && activeTab === 'ingredients' ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col justify-end">
                <label className="text-[8px] font-bold uppercase text-[#666666] mb-1">Supplier</label>
                <select 
                  value={filterSupplier}
                  onChange={e => setFilterSupplier(e.target.value)}
                  className={`${UI_STYLES.input} !py-1 !px-2 !text-[9px] w-full`}
                >
                  {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <label className="text-[8px] font-bold uppercase text-[#666666] mb-1">Category</label>
                <select 
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  className={`${UI_STYLES.input} !py-1 !px-2 !text-[9px] w-full`}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="w-full h-full"></div> 
          )}
        </div>

        {/* Hide Tabs in Hybrid Mode */}
        {!isHybrid && allTabs.length > 1 && (
          <div className="flex border border-[#333333]">
            {allTabs.map(tab => {
              const isAvailable = availableTabs.includes(tab);
              return (
                <button
                  key={tab}
                  disabled={!isAvailable}
                  onClick={() => onTabChange(tab)}
                  className={`flex-1 text-[9px] uppercase font-bold py-2 border-r last:border-r-0 border-[#333333] transition-all
                    ${activeTab === tab ? 'bg-[#c8a96e] text-black' : ''}
                    ${!isAvailable ? 'text-[#333333] cursor-not-allowed bg-[#151515]' : 'text-[#888888] hover:bg-[#1c1c1c]'}
                    ${isAvailable && activeTab !== tab ? 'hover:text-white' : ''}
                  `}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs font-mono text-[#666666]">Loading data...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center">
             <div className="text-[10px] text-[#666666] font-mono mb-6 uppercase tracking-widest">No items found</div>
             {search.length > 0 && onCreateRequest && !isHybrid && activeTab !== 'dishes' && (
               <button 
                onClick={() => onCreateRequest(search, activeTab === 'ingredients' ? 'ingredient' : activeTab === 'recipes' ? 'recipe' : 'dish')}
                className="w-full py-4 border border-[#c8a96e] text-[#c8a96e] text-[10px] font-bold uppercase tracking-widest hover:bg-[#c8a96e] hover:text-black transition-all mb-4"
               >
                 + Add "{search}"
               </button>
             )}
          </div>
        ) : (
          filteredItems.map(item => {
            const itemType = isHybrid ? (item as any).__type : (activeTab === 'ingredients' ? 'ingredient' : activeTab === 'recipes' ? 'recipe' : 'dish');
            const isIncomplete = itemType === 'ingredient' && (item as Ingredient).incomplete;
            const isRecipeDirty = itemType === 'recipe' && (item as Recipe).isDirty;
            const isInspecting = inspectedItem?.id === item.id;
            
            let displayCost = '0.0000';
            let displayUnit = 'unit';
            
            if (itemType === 'ingredient') {
              const ing = item as Ingredient;
              const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
              const cost = pref ? pref.packCost / (pref.packSize || 1) : 0;
              displayCost = cost.toFixed(4);
              displayUnit = pref?.packUnit || 'g';
            }

            return (
              <div
                key={item.id}
                onClick={() => onSelectItem(item.id, itemType)}
                className={`px-4 py-3 cursor-pointer group transition-colors 
                  ${isIncomplete ? 'bg-red-950/10 border-b border-[#333333]' : ''}
                  ${isRecipeDirty ? 'border border-dashed border-[#A65D43] bg-[#A65D43]/5 my-1' : 'border-b border-[#333333] hover:bg-[#1c1c1c]'}
                `}
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2 overflow-hidden w-full">
                    {isIncomplete && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
                    <span className={`text-sm font-sans uppercase tracking-tight truncate flex-1 
                       ${isIncomplete ? 'text-red-400 group-hover:text-red-200' : ''} 
                       ${isRecipeDirty ? 'text-[#A65D43] group-hover:text-white' : 'group-hover:text-white'}
                    `}>
                      {/* Source Tag Logic */}
                      {(isHybrid || itemType !== 'dish') && (
                        <SourceTag 
                          type={itemType === 'recipe' ? 'recipe' : 'ingredient'} 
                          active={isInspecting}
                          onClick={(e) => {
                             if (onInspect) onInspect(item.id, itemType === 'recipe' ? 'recipe' : 'ingredient');
                          }}
                        />
                      )}
                      {item.name}
                      {isRecipeDirty && <span className="ml-2 text-[9px] font-bold text-[#A65D43]">[!]</span>}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 border border-[#333333] ${isIncomplete ? 'text-red-800 border-red-900/40' : 'text-[#666666]'}`}>
                    {itemType === 'ingredient' ? (item as Ingredient).category : itemType === 'recipe' ? 'Recipe' : 'Dish'}
                  </span>
                  {itemType === 'ingredient' && (
                    <span className={`text-[10px] font-mono ${isIncomplete ? 'text-red-900' : 'text-[#c8a96e]'}`}>
                      £{displayCost}/{displayUnit}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Sidebar;
