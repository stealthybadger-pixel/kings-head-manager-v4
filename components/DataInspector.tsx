
import React, { useMemo } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { UI_STYLES } from '../constants';
import { Ingredient, Recipe } from '../types';

interface DataInspectorProps {
  id: string;
  type: 'ingredient' | 'recipe';
  onClose: () => void;
}

export const DataInspector: React.FC<DataInspectorProps> = ({ id, type, onClose }) => {
  const { ingredients, recipes } = useKitchenData();

  const item = useMemo(() => {
    if (type === 'ingredient') return ingredients.find(i => i.id === id);
    return recipes.find(r => r.id === id);
  }, [id, type, ingredients, recipes]);

  if (!item) return null;

  const isRecipe = type === 'recipe';
  const recipe = item as Recipe;
  const ingredient = item as Ingredient;

  return (
    <div className="absolute top-0 right-0 h-full w-1/3 min-w-[320px] bg-[#111111] border-l border-[#c8a96e] z-[300] flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] animate-slide-in-right">
      {/* Header */}
      <div className="p-4 border-b border-[#333333] flex justify-between items-start bg-[#1c1c1c]">
        <div>
           <div className="text-[8px] font-mono text-[#c8a96e] uppercase tracking-widest mb-1">
             System Inspector // {type.toUpperCase()}
           </div>
           <h2 className="text-lg font-bold text-white uppercase leading-none">{item.name}</h2>
        </div>
        <button onClick={onClose} className="text-[#666] hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Ingredient Specifics */}
        {!isRecipe && (
          <>
            <section>
               <label className={UI_STYLES.label}>Category Classification</label>
               <div className="text-sm text-[#e0e0e0] font-mono border border-[#333] p-2 inline-block">
                 {ingredient.category}
               </div>
            </section>

            <section>
               <label className={UI_STYLES.label}>Supply Chain</label>
               <div className="space-y-2">
                 {ingredient.suppliers.map((s, idx) => (
                   <div key={idx} className={`p-3 border ${s.isPreferred ? 'border-[#c8a96e] bg-[#c8a96e]/10' : 'border-[#333]'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold uppercase text-white">{s.name}</span>
                        {s.isPreferred && <span className="text-[8px] bg-[#c8a96e] text-black px-1 font-bold">PREFERRED</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-[10px] font-mono text-[#888]">
                         <div>Pack: {s.packSize}{s.packUnit}</div>
                         <div>Cost: £{s.packCost.toFixed(2)}</div>
                         <div className="col-span-2 text-[#c8a96e]">
                           Unit Cost: £{(s.packCost / s.packSize).toFixed(4)} / {s.packUnit}
                         </div>
                      </div>
                   </div>
                 ))}
               </div>
            </section>

            <section>
               <label className={UI_STYLES.label}>Allergen Profile</label>
               <div className="flex flex-wrap gap-2">
                 {ingredient.allergens.length > 0 ? ingredient.allergens.map(a => (
                   <span key={a} className="px-2 py-1 bg-[#1c1c1c] border border-red-900 text-red-400 text-[9px] font-bold uppercase">{a}</span>
                 )) : <span className="text-[10px] text-[#444] font-mono">NO_RISKS_DECLARED</span>}
               </div>
            </section>

            <section>
               <label className={UI_STYLES.label}>Live Inventory</label>
               <div className="text-2xl font-mono text-white">{ingredient.stockLevel} <span className="text-sm text-[#666]">units</span></div>
            </section>
          </>
        )}

        {/* Recipe Specifics */}
        {isRecipe && (
           <>
             <section className="grid grid-cols-2 gap-4">
                <div>
                  <label className={UI_STYLES.label}>Batch Output</label>
                  <div className="text-xl font-mono text-white">{recipe.batchSize} {recipe.batchUnit}</div>
                </div>
                <div>
                  <label className={UI_STYLES.label}>Components</label>
                  <div className="text-xl font-mono text-white">{recipe.items.length}</div>
                </div>
             </section>

             <section>
               <label className={UI_STYLES.label}>Formulation</label>
               <div className="border border-[#333] divide-y divide-[#333]">
                 {recipe.items.map((i, idx) => {
                   // Shallow lookup for name display
                   const subItem = i.type === 'ingredient' 
                      ? ingredients.find(ing => ing.id === i.id) 
                      : recipes.find(r => r.id === i.id);
                   
                   return (
                     <div key={idx} className="p-2 flex justify-between items-center text-[10px]">
                        <span className="text-[#e0e0e0] uppercase font-bold">{subItem?.name || 'Unknown Item'}</span>
                        <span className="font-mono text-[#888]">{i.quantity} {i.unit}</span>
                     </div>
                   );
                 })}
               </div>
             </section>

             <section>
               <label className={UI_STYLES.label}>Method</label>
               <div className="p-4 bg-[#1c1c1c] border border-[#333] text-[11px] font-sans text-[#ccc] whitespace-pre-wrap leading-relaxed">
                 {recipe.instructions || "No instructions defined."}
               </div>
             </section>
           </>
        )}
      </div>
      
      <div className="p-4 border-t border-[#333333] bg-[#0d0d0d]">
        <div className="text-[8px] font-mono text-[#444] uppercase tracking-widest text-center">
           READ_ONLY_MODE // EDIT_VIA_BUILDER
        </div>
      </div>
    </div>
  );
};
