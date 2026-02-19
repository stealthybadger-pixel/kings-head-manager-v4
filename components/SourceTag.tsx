
import React from 'react';

interface SourceTagProps {
  type: 'ingredient' | 'recipe' | 'dish';
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export const SourceTag: React.FC<SourceTagProps> = ({ type, active, onClick, className = '' }) => {
  const baseColor = type === 'recipe' ? 'text-[#A65D43]' : type === 'dish' ? 'text-[#c8a96e]' : 'text-[#7D8C7C]';
  const activeColor = 'text-[#C8A96E]';
  const colorClass = active ? activeColor : baseColor;
  const label = type === 'recipe' ? 'R' : type === 'dish' ? 'D' : 'I';
  const title = type === 'recipe' ? 'Inspect Recipe' : type === 'dish' ? 'Dish' : 'Inspect Ingredient';

  return (
    <span
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick(e);
        }
      }}
      className={`font-mono text-[10px] pr-3 cursor-pointer hover:text-white transition-colors ${colorClass} ${className}`}
      title={title}
    >
      [{label}]
    </span>
  );
};
