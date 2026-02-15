import React, { useState, useEffect } from 'react';
import { Ingredient, Recipe, RecipeItem, Unit } from '../types';
import { UI_STYLES, COLORS } from '../constants';

interface StagingBoxProps {
  item: Ingredient | Recipe;
  onAdd: (item: RecipeItem) => void;
  onCancel: () => void;
}

const StagingBox: React.FC<StagingBoxProps> = ({ item, onAdd, onCancel }) => {
  const [qty, setQty] = useState<string>('0');
  const [unit, setUnit] = useState<Unit>('g');

  const isIngredient = 'packSize' in item;

  useEffect(() => {
    if (isIngredient) {
      setUnit((item as Ingredient).packUnit);
    } else {
      setUnit('ea'); 
    }
  }, [item, isIngredient]);

  const handleAdd = () => {
    const numericQty = parseFloat(qty);
    if (isNaN(numericQty) || numericQty <= 0) return;

    onAdd({
      type: 'ingredient',
      ingredientId: item.id,
      quantity: numericQty,
      unit: unit
    });
  };

  return (
    <div className={`p-4 ${UI_STYLES.panel} bg-[#1c1c1c] grid grid-cols-4 gap-6 items-end`}>
      <div className="col-span-1 pb-1">
        <label className={UI_STYLES.label}>Selected Item</label>
        <div className="text-sm font-bold uppercase truncate text-[#c8a96e]">{item.name}</div>
        <div className="text-[10px] text-[#666666] font-mono mt-0.5">ID: {item.id.slice(0, 8)}</div>
      </div>

      <div>
        <label className={UI_STYLES.label}>Quantity</label>
        <input 
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className={`w-full ${UI_STYLES.input}`}
          autoFocus
        />
      </div>

      <div>
        <label className={UI_STYLES.label}>Unit</label>
        <select 
          value={unit}
          onChange={(e) => setUnit(e.target.value as Unit)}
          className={`w-full ${UI_STYLES.input}`}
        >
          <option value="g">Grams (g)</option>
          <option value="ml">Milliliters (ml)</option>
          <option value="kg">Kilograms (kg)</option>
          <option value="l">Liters (l)</option>
          <option value="ea">Each (ea)</option>
        </select>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={handleAdd}
          className={`${UI_STYLES.button} flex-1 bg-[#c8a96e] text-black hover:bg-[#b8985e] border border-black/20`}
        >
          Add to Grid
        </button>
        <button 
          onClick={onCancel}
          className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:bg-[#333333]`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default StagingBox;