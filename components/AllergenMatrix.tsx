
import React from 'react';
import { Allergen } from '../types';

// 14 EU mandatory allergens — fixed order, 2 rows of 7
const ALL_ALLERGENS: Allergen[] = [
  Allergen.MILK,
  Allergen.EGGS,
  Allergen.FISH,
  Allergen.CRUSTACEANS,
  Allergen.MOLLUSCS,
  Allergen.PEANUTS,
  Allergen.TREE_NUTS,
  Allergen.SESAME,
  Allergen.SOYA,
  Allergen.WHEAT,
  Allergen.CELERY,
  Allergen.MUSTARD,
  Allergen.SULPHITES,
  Allergen.LUPIN,
];

interface AllergenMatrixProps {
  /** The allergens that are present / active */
  active: Allergen[];
  /** If provided, clicking a cell toggles the allergen */
  onToggle?: (allergen: Allergen) => void;
  className?: string;
}

export const AllergenMatrix: React.FC<AllergenMatrixProps> = ({ active, onToggle, className = '' }) => {
  const activeSet = new Set(active);

  return (
    <div className={`grid grid-cols-7 gap-1 ${className}`}>
      {ALL_ALLERGENS.map(a => {
        const isActive = activeSet.has(a);
        const isInteractive = !!onToggle;

        return (
          <button
            key={a}
            type="button"
            disabled={!isInteractive}
            onClick={() => onToggle?.(a)}
            title={a}
            className={`
              px-1 py-1.5 text-[8px] font-bold uppercase leading-none text-center transition-colors border
              ${isActive
                ? 'bg-[#c8a96e] text-black border-[#c8a96e]'
                : 'bg-transparent text-[#444] border-[#2a2a2a]'}
              ${isInteractive && !isActive ? 'hover:border-[#c8a96e] hover:text-[#c8a96e] cursor-pointer' : ''}
              ${!isInteractive ? 'cursor-default' : ''}
            `}
          >
            {a}
          </button>
        );
      })}
    </div>
  );
};
