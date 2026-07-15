import React from 'react';
import { useIngredientsCount, useRecipesCount, useDishesCount } from '../hooks/useKitchenData';
import { FileText, TrendingUp, Thermometer, Refrigerator, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';

export const Dashboard: React.FC = () => {
  const { data: totalIngredients = 0, isLoading: loadingIngs } = useIngredientsCount();
  const { data: totalRecipes = 0, isLoading: loadingRecs } = useRecipesCount();
  const { data: totalDishes = 0, isLoading: loadingDishes } = useDishesCount();
  const setView = useStore((state) => state.setView);

  const isLoading = loadingIngs || loadingRecs || loadingDishes;

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full bg-surface-container-lowest">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <span className="label-caps text-outline">Loading Dashboard data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 h-full overflow-y-auto flex flex-col gap-4 sm:gap-8 bg-surface-container-lowest">
      {/* 1. TOP STATS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {/* Stat Card: Ingredients */}
        <div 
          onClick={() => setView('pantry')}
          className="bg-surface border border-outline-variant p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex justify-between items-start">
            <span className="label-caps text-outline">Master Pantry</span>
            <DatabaseIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="display-lg text-primary mt-2 data-tabular">{totalIngredients}</div>
        </div>

        {/* Stat Card: Recipes */}
        <div 
          onClick={() => setView('kitchen')}
          className="bg-surface border border-outline-variant p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex justify-between items-start">
            <span className="label-caps text-outline">Formulations (Recipes)</span>
            <ChefHatIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="display-lg text-primary mt-2 data-tabular">{totalRecipes}</div>
          <div className="flex items-center gap-1.5 mt-2">
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-on-surface font-semibold">Active Prep Base</span>
          </div>
        </div>

        {/* Stat Card: Dishes */}
        <div 
          onClick={() => setView('service')}
          className="bg-surface border border-outline-variant p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex justify-between items-start">
            <span className="label-caps text-outline">Menu Dishes</span>
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div className="display-lg text-primary mt-2 data-tabular">{totalDishes}</div>
        </div>
      </div>

      {/* 1b. QUICK ACCESS DURING SERVICE */}
      <div className="grid grid-cols-3 gap-4 sm:gap-6">
        <div
          onClick={() => setView('food-temp')}
          className="bg-surface border border-outline-variant p-4 sm:p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 text-center sm:text-left"
        >
          <Thermometer className="h-5 w-5 text-primary flex-shrink-0" />
          <span className="label-caps text-on-surface font-bold">Food Temps</span>
        </div>

        <div
          onClick={() => setView('equipment-temp')}
          className="bg-surface border border-outline-variant p-4 sm:p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 text-center sm:text-left"
        >
          <Refrigerator className="h-5 w-5 text-primary flex-shrink-0" />
          <span className="label-caps text-on-surface font-bold">Fridge Temps</span>
        </div>

        <div
          onClick={() => setView('stock-waste')}
          className="bg-surface border border-outline-variant p-4 sm:p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 text-center sm:text-left"
        >
          <Trash2 className="h-5 w-5 text-primary flex-shrink-0" />
          <span className="label-caps text-on-surface font-bold">Wastage</span>
        </div>
      </div>
    </div>
  );
};

// Simple inline icons to avoid extra imports
const DatabaseIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
    <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
    <path d="M3 12A9 3 0 0 0 21 12"></path>
  </svg>
);

const ChefHatIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 18V6a4 4 0 0 1 8 0v12"></path>
    <path d="M18 18V9a4 4 0 0 0-8 0v9"></path>
    <path d="M3 18h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"></path>
  </svg>
);
export default Dashboard;
