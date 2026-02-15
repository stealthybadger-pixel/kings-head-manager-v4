import React, { useState, useMemo } from 'react';
import { Ingredient, Recipe } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES, COLORS } from '../constants';

interface SidebarProps {
  onSelectItem: (id: string, type: 'ingredient' | 'recipe') => void;
  activeTab: 'ingredients' | 'recipes';
  availableTabs: ('ingredients' | 'recipes')[];
  onTabChange: (tab: 'ingredients' | 'recipes') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onSelectItem, activeTab, availableTabs, onTabChange }) => {
  const { ingredients, recipes, loading, seedDatabase, connectionStatus } = useKitchenData();
  const { confirm } = useConfirmation();
  const [search, setSearch] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');

  const suppliers = useMemo(() => ['ALL', ...Array.from(new Set(ingredients.map(i => i.supplier))).sort()], [ingredients]);
  const categories = useMemo(() => ['ALL', ...Array.from(new Set(ingredients.map(i => i.category))).sort()], [ingredients]);

  const filteredItems = useMemo(() => {
    const term = search.toLowerCase();
    if (activeTab === 'ingredients') {
      return ingredients.filter(i => {
        const matchesSearch = i.name.toLowerCase().includes(term);
        const matchesSupplier = filterSupplier === 'ALL' || i.supplier === filterSupplier;
        const matchesCategory = filterCategory === 'ALL' || i.category === filterCategory;
        return matchesSearch && matchesSupplier && matchesCategory;
      });
    }
    return recipes.filter(r => r.name.toLowerCase().includes(term));
  }, [ingredients, recipes, search, activeTab, filterSupplier, filterCategory]);

  const handleSeed = async () => {
    const ok = await confirm("Initialize database with default ingredients? This will write to your Firestore.");
    if (ok) {
      seedDatabase();
    }
  };

  const showIngredientsTab = availableTabs.includes('ingredients');
  const showRecipesTab = availableTabs.includes('recipes');
  const showTabSwitcher = availableTabs.length > 1;

  return (
    <div className="flex flex-col h-full bg-[#111111]">
      <div className="p-4 border-b border-[#333333] space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#c8a96e] mb-1 flex items-center gap-2">
          Library
          {!showTabSwitcher && (
            <>
              <span className="text-[#333333] font-normal">//</span>
              <span className="text-[#888888]">{activeTab}</span>
            </>
          )}
        </h2>
        
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`w-full ${UI_STYLES.input} !text-xs !py-1.5`}
        />

        {activeTab === 'ingredients' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col">
              <label className="text-[8px] font-bold uppercase text-[#666666] mb-1">Supplier</label>
              <select 
                value={filterSupplier}
                onChange={e => setFilterSupplier(e.target.value)}
                className={`${UI_STYLES.input} !py-1 !px-2 !text-[9px] w-full`}
              >
                {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex flex-col">
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
        )}

        {showTabSwitcher && (
          <div className="flex border border-[#333333] mt-2">
            {showIngredientsTab && (
              <button
                onClick={() => onTabChange('ingredients')}
                className={`flex-1 text-[10px] uppercase font-bold py-2 ${activeTab === 'ingredients' ? 'bg-[#c8a96e] text-black' : 'text-[#888888] hover:bg-[#1c1c1c]'}`}
              >
                Ingredients
              </button>
            )}
            {showRecipesTab && (
              <button
                onClick={() => onTabChange('recipes')}
                className={`flex-1 text-[10px] uppercase font-bold py-2 border-l border-[#333333] ${activeTab === 'recipes' ? 'bg-[#c8a96e] text-black' : 'text-[#888888] hover:bg-[#1c1c1c]'}`}
              >
                Recipes
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs font-mono text-[#666666]">Loading data...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center">
             <div className="text-[10px] text-[#666666] font-mono mb-4 uppercase tracking-widest">No items found</div>
             {activeTab === 'ingredients' && (
               <div className="space-y-2">
                 {connectionStatus === 'connected' ? (
                   <button 
                    onClick={handleSeed}
                    className={`${UI_STYLES.button} w-full border border-[#333333] text-[#c8a96e] hover:bg-[#333333]`}
                   >
                     Initialize Library
                   </button>
                 ) : (
                    <div className="text-[9px] text-yellow-600 font-mono">
                      {connectionStatus === 'connecting' ? 'Connecting to database...' : 'Check connection'}
                    </div>
                 )}
               </div>
             )}
          </div>
        ) : (
          filteredItems.map(item => (
            <div
              key={item.id}
              onClick={() => onSelectItem(item.id, activeTab === 'ingredients' ? 'ingredient' : 'recipe')}
              className="px-4 py-3 border-b border-[#333333] hover:bg-[#1c1c1c] cursor-pointer group transition-colors"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-sans group-hover:text-white transition-colors uppercase tracking-tight truncate pr-2">{item.name}</span>
                <span className="text-[10px] font-mono text-[#666666] flex-shrink-0">{item.id.slice(0, 4)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 border border-[#333333] text-[#666666]">
                  {activeTab === 'ingredients' ? (item as Ingredient).category : 'Sub-Recipe'}
                </span>
                {activeTab === 'ingredients' && (
                  <span className="text-[10px] font-mono text-[#c8a96e]">
                    £{((item as Ingredient).packCost / (item as Ingredient).packSize).toFixed(4)}/{(item as Ingredient).packUnit}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Sidebar;