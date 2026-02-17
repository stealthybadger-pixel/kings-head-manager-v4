
import React from 'react';

interface SourceTagProps {
  type: 'ingredient' | 'recipe';
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export const SourceTag: React.FC<SourceTagProps> = ({ type, active, onClick, className = '' }) => {
  const baseColor = type === 'recipe' ? 'text-[#A65D43]' : 'text-[#7D8C7C]';
  const activeColor = 'text-[#C8A96E]';
  const colorClass = active ? activeColor : baseColor;

  return (
    <span 
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick(e);
        }
      }}
      className={`font-mono text-[10px] pr-3 cursor-pointer hover:text-white transition-colors ${colorClass} ${className}`}
      title={type === 'recipe' ? 'Inspect Recipe' : 'Inspect Ingredient'}
    >
      [{type === 'recipe' ? 'R' : 'I'}]
    </span>
  );
};
