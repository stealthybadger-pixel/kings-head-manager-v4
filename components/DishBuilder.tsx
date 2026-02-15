
import React, { useState, useMemo } from 'react';
import { Dish, DishItem, Unit } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES } from '../constants';
import StagingBox from './StagingBox';

interface DishBuilderProps {
  onPushRecipe: () => void;
  onPushIngredient: () => void;
  stagedItemId: string | null;
  stagedItemType: 'ingredient' | 'recipe';
  clearStaged: () => void;
}

export const DishBuilder: React.FC<DishBuilderProps> = ({ 
  onPushRecipe, 
  onPushIngredient,
  stagedItemId,
  stagedItemType,
  clearStaged
}) => {
  const { ingredients, recipes, saveRecipe } = useKitchenData(); // Note: we'll need saveDish in hooks
  const { confirm } = useConfirmation();

  const [dishName, setDishName] = useState('New Service Dish');
  const [targetGP, setTargetGP] = useState(70);
  const [items, setItems] = useState<DishItem[]>([]);
  const [instructions, setInstructions] = useState('');

  const stagedObject = stagedItemType === 'ingredient' 
    ? ingredients.find(i => i.id === stagedItemId) 
    : recipes.find(r => r.id === stagedItemId);

  const addItem = (newItem: any) => {
    setItems(prev => [...prev, {
      id: newItem.ingredientId,
      type: stagedItemType,
      quantity: newItem.quantity,
      unit: newItem.unit
    }]);
    clearStaged();
  };

  const calculateTotalCost = () => {
    return items.reduce((acc, item) => {
      if (item.type === 'ingredient') {
        const ing = ingredients.find(i => i.id === item.id);
        if (!ing) return acc;
        // Simplified for brevity: cost logic
        const cpu = ing.packCost / ing.packSize;
        return acc + (item.quantity * cpu);
      } else {
        const rec = recipes.find(r => r.id === item.id);
        if (!rec) return acc;
        // Mocked cost per batch for recipe
        return acc + 1.50; // Replace with recursive cost calc
      }
    }, 0);
  };

  const totalCost = calculateTotalCost();
  const sellPrice = totalCost / (1 - (targetGP / 100));

  return (
    <div className="flex flex-col h-full bg-[#111111] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#333333] bg-[#1c1c1c] flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Service Module // DISH BUILDER</span>
          <input 
            value={dishName}
            onChange={e => setDishName(e.target.value)}
            className="bg-transparent border-b border-[#333333] focus:border-[#c8a96e] text-lg font-sans font-bold px-1 outline-none w-80"
          />
        </div>
        <div className="flex gap-4">
          <div className="text-right">
             <div className={UI_STYLES.label}>Target GP</div>
             <input 
               type="number" 
               value={targetGP} 
               onChange={e => setTargetGP(parseInt(e.target.value))}
               className="bg-transparent text-right font-mono text-xl text-[#c8a96e] w-16 outline-none"
             />
             <span className="text-[#c8a96e] text-sm font-mono">%</span>
          </div>
          <button className={`${UI_STYLES.button} bg-[#c8a96e] text-black`}>Save Dish</button>
        </div>
      </div>

      {/* Staging Area */}
      <div className="p-4 border-b border-[#333333] bg-[#0d0d0d]">
        {stagedObject ? (
          <StagingBox item={stagedObject} onAdd={addItem} onCancel={clearStaged} />
        ) : (
          <div className="flex gap-4">
            <button onClick={onPushIngredient} className="flex-1 p-4 border border-dashed border-[#333333] text-[10px] uppercase font-bold text-[#666666] hover:border-[#c8a96e] hover:text-[#c8a96e] transition-all">
              + Add Missing Ingredient
            </button>
            <button onClick={onPushRecipe} className="flex-1 p-4 border border-dashed border-[#333333] text-[10px] uppercase font-bold text-[#666666] hover:border-[#c8a96e] hover:text-[#c8a96e] transition-all">
              + Add Missing Sub-Recipe
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
         <div className="border border-[#333333] divide-y divide-[#333333]">
           {items.length === 0 ? (
             <div className="p-12 text-center text-[#444444] font-mono text-xs uppercase">No components added to service</div>
           ) : (
             items.map((item, idx) => (
               <div key={idx} className="p-3 flex justify-between items-center group hover:bg-[#1c1c1c]">
                 <div className="flex items-center gap-4">
                    <span className="text-[10px] font-mono text-[#444]">{idx+1}</span>
                    <span className="text-xs font-bold uppercase">{item.type === 'ingredient' ? ingredients.find(i => i.id === item.id)?.name : recipes.find(r => r.id === item.id)?.name}</span>
                 </div>
                 <div className="flex items-center gap-8">
                    <span className="text-xs font-mono">{item.quantity} {item.unit}</span>
                    <button className="text-[#444] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">X</button>
                 </div>
               </div>
             ))
           )}
         </div>
      </div>

      {/* Footer HUD */}
      <div className="p-4 border-t border-[#333333] bg-[#1c1c1c] flex justify-between">
         <div className="flex gap-12">
            <div>
              <label className={UI_STYLES.label}>Plate Cost</label>
              <div className="text-2xl font-mono">£{totalCost.toFixed(2)}</div>
            </div>
            <div>
              <label className={UI_STYLES.label}>Suggested Sell (@{targetGP}%)</label>
              <div className="text-2xl font-mono text-[#c8a96e]">£{sellPrice.toFixed(2)}</div>
            </div>
         </div>
      </div>
    </div>
  );
};
