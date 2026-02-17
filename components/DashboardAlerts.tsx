
import React, { useMemo } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES } from '../constants';
import { IngredientSupplier } from '../types';

const getNormalizedCostPerBaseUnit = (s: IngredientSupplier): number => {
    // Avoid division by zero
    if (!s.packSize || s.packSize === 0) return Infinity;
    
    let cost = s.packCost / s.packSize; // Cost per declared unit
    
    // Normalize to grams or ml
    if (s.packUnit === 'kg') return cost / 1000;
    if (s.packUnit === 'l') return cost / 1000;
    
    return cost;
};

export const DashboardAlerts: React.FC = () => {
    const { ingredients, recipes, dishes, updateIngredient } = useKitchenData();
    const { confirm } = useConfirmation();

    const overspends = useMemo(() => {
        return ingredients.reduce((acc, ing) => {
            if (!ing.suppliers || ing.suppliers.length < 2) return acc;
            
            const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
            const prefCost = getNormalizedCostPerBaseUnit(pref);

            // Find valid alternative with lower cost
            const betterOption = ing.suppliers.reduce((best, curr) => {
                const currCost = getNormalizedCostPerBaseUnit(curr);
                // Ensure we handle floating point noise and valid costs
                if (currCost > 0 && currCost < best.cost) {
                    return { s: curr, cost: currCost };
                }
                return best;
            }, { s: pref, cost: prefCost });

            if (betterOption.s.name !== pref.name && betterOption.cost < prefCost) {
                acc.push({
                    ingredient: ing,
                    current: pref,
                    currentCost: prefCost,
                    better: betterOption.s,
                    betterCost: betterOption.cost,
                    savingsPercent: ((prefCost - betterOption.cost) / prefCost) * 100
                });
            }
            return acc;
        }, [] as any[]);
    }, [ingredients]);

    const getImpactAnalysis = (ingId: string) => {
        // 1. Direct Recipe Usage
        const affectedRecipes = recipes.filter(r => 
            r.items.some(i => i.type === 'ingredient' && i.id === ingId)
        );
        
        // 2. Direct Dish Usage
        const directDishes = dishes.filter(d => 
            d.items.some(i => i.type === 'ingredient' && i.id === ingId)
        );

        // 3. Indirect Dish Usage (via Recipe)
        const recipeIds = new Set(affectedRecipes.map(r => r.id));
        const indirectDishes = dishes.filter(d => 
            d.items.some(i => i.type === 'recipe' && recipeIds.has(i.id))
        );
        
        const totalUniqueDishes = new Set([...directDishes.map(d => d.id), ...indirectDishes.map(d => d.id)]).size;

        return {
            recipeCount: affectedRecipes.length,
            dishCount: totalUniqueDishes
        };
    };

    const handleSwitchAll = async (alert: typeof overspends[0]) => {
        const impact = getImpactAnalysis(alert.ingredient.id);
        
        const message = `CONFIRM GLOBAL SUPPLIER PIVOT\n\n` +
            `Ingredient: ${alert.ingredient.name}\n` +
            `Switching: ${alert.current.name} -> ${alert.better.name}\n` +
            `Variance: -${alert.savingsPercent.toFixed(1)}% Cost Reduction\n\n` +
            `GLOBAL RIPPLE EFFECT:\n` +
            `• Updates ${impact.recipeCount} Recipe Formulations\n` +
            `• Impacts ${impact.dishCount} Service Dishes\n\n` +
            `Proceed with bulk update?`;

        const ok = await confirm(message);
        if (ok) {
            const updatedSuppliers = alert.ingredient.suppliers.map((s: IngredientSupplier) => ({
                ...s,
                isPreferred: s.name === alert.better.name
            }));
            
            await updateIngredient(alert.ingredient.id, { suppliers: updatedSuppliers });
        }
    };

    if (overspends.length === 0) return null;

    return (
        <div className={`mb-6 ${UI_STYLES.panel} border-l-4 border-l-[#c8a96e] bg-[#1c1c1c]`}>
            <div className="p-3 border-b border-[#333333] flex justify-between items-center bg-[#151515]">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-none bg-[#c8a96e] animate-pulse"></div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#c8a96e]">Supplier Overspend Detected</h3>
                </div>
                <div className="text-[9px] font-mono text-[#666] uppercase">{overspends.length} ACTIONABLE ITEMS</div>
            </div>
            
            <div className="divide-y divide-[#333333]">
                {overspends.map((item, idx) => (
                    <div key={idx} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:bg-black/40 transition-colors">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold uppercase text-white">{item.ingredient.name}</span>
                                <span className="text-[8px] font-mono text-[#c8a96e] border border-[#c8a96e] px-1">-{item.savingsPercent.toFixed(0)}%</span>
                            </div>
                            <div className="grid grid-cols-2 gap-8 text-[9px] font-mono uppercase text-[#666]">
                                <div>
                                    Current: <span className="text-white">{item.current.name}</span>
                                    <span className="ml-2 text-red-400">£{(item.current.packCost / item.current.packSize).toFixed(4)}/{item.current.packUnit}</span>
                                </div>
                                <div>
                                    Available: <span className="text-[#c8a96e]">{item.better.name}</span>
                                    <span className="ml-2 text-green-400">£{(item.better.packCost / item.better.packSize).toFixed(4)}/{item.better.packUnit}</span>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleSwitchAll(item)}
                            className={`${UI_STYLES.button} bg-[#c8a96e] text-black hover:bg-white border-none whitespace-nowrap min-w-[120px]`}
                        >
                            SWITCH ALL
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
