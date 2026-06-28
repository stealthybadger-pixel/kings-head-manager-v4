import React from 'react';
import { BookOpen, HelpCircle, Package, Scale, Trash2, TrendingUp, RefreshCw, AlertTriangle } from 'lucide-react';

export const Help: React.FC = () => {
  return (
    <div className="p-8 h-full overflow-y-auto bg-surface-container-lowest">
      <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-12">
        
        {/* Header */}
        <div className="border-b border-outline-variant pb-6">
          <div className="flex items-center gap-3 text-primary">
            <HelpCircle className="h-8 w-8" />
            <h1 className="display-lg text-on-surface font-bold">Help & Glossary</h1>
          </div>
          <p className="text-sm text-outline mt-2">
            A comprehensive, easy-to-understand guide to the core terms, workflows, and calculations in the King's Head Manager.
          </p>
        </div>

        {/* Section 1: Core Terms */}
        <div className="flex flex-col gap-4">
          <h2 className="headline-sm font-semibold border-b border-outline-variant pb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            1. Core Concepts & Terms
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="bg-surface p-5 border border-outline-variant rounded-sm flex flex-col gap-2 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-sm text-primary">
                <Package className="h-4 w-4" />
                Pantry (Master Ingredients)
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                The master register of ingredients. This is the <strong>source of truth</strong> for ingredient metadata (allergens, calories, default container, waste %, etc.). Recipes and dishes link to these master items rather than suppliers, allowing you to swap suppliers without rewriting your formulations.
              </p>
            </div>

            <div className="bg-surface p-5 border border-outline-variant rounded-sm flex flex-col gap-2 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-sm text-primary">
                <BookOpen className="h-4 w-4" />
                Supplier Catalog
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                A live database of raw catalog items you buy from suppliers (like Booker, David Catt, etc.) listing their actual pack costs, sizes, and units. You link these catalog products to your master Pantry ingredients to feed them live pricing.
              </p>
            </div>

            <div className="bg-surface p-5 border border-outline-variant rounded-sm flex flex-col gap-2 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-sm text-primary">
                <TrendingUp className="h-4 w-4" />
                Preferred Supplier
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                For each master ingredient, you choose one supplier product as the <strong>Preferred Supplier</strong>. The system uses this preferred price to calculate the costs of all recipes and dishes that contain it.
              </p>
            </div>

            <div className="bg-surface p-5 border border-outline-variant rounded-sm flex flex-col gap-2 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-sm text-primary">
                <Scale className="h-4 w-4" />
                Piece Weight (g per each)
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                The estimated weight in grams of a single count or bunch of an ingredient (e.g. 50g for fresh thyme, 400g for a cucumber). Since suppliers sell by the piece (<code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">ea</code>) but recipes measure by weight (<code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">g</code>), this weight allows the app to compute gram costs.
              </p>
            </div>

            <div className="bg-surface p-5 border border-outline-variant rounded-sm flex flex-col gap-2 shadow-sm md:col-span-2">
              <div className="flex items-center gap-2 font-bold text-sm text-primary">
                <Trash2 className="h-4 w-4" />
                Waste % (Yield Loss)
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                The percentage of an ingredient lost during prep (e.g., onion skins, carrot peelings, thyme stems). If an ingredient has a 10% waste factor, it means only 90% is usable. The system automatically inflates the cost in recipes (e.g., multiplying the base cost by <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">1.11</code>) to cover the cost of the discarded waste.
              </p>
            </div>

          </div>
        </div>

        {/* Section 2: How Calculations Work */}
        <div className="flex flex-col gap-4">
          <h2 className="headline-sm font-semibold border-b border-outline-variant pb-2 flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            2. How Calculations Work
          </h2>
          
          <div className="bg-surface p-6 border border-outline-variant rounded-sm flex flex-col gap-4 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-on-surface mb-1">A. Plate Cost & Gross Profit (GP%)</h3>
              <p className="text-xs leading-relaxed text-on-surface-variant mb-2">
                A <strong>Dish</strong> rolls up the cost of all its ingredients and batch recipes to compute a single <strong>Plate Cost</strong>.
              </p>
              <div className="bg-surface-container p-3 rounded-sm font-mono text-xs flex flex-col gap-1 border border-outline-variant">
                <div>Plate Cost = Sum of (Ingredient Costs × (1 + Waste %))</div>
                <div>Actual GP % = ((Retail Price / 1.2) - Plate Cost) / (Retail Price / 1.2) × 100</div>
                <div className="text-[10px] text-outline mt-1 font-sans">* Assumes 20% standard VAT rate (dividing by 1.2 to get net price).</div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-on-surface mb-1">B. Unit Conversions (Piece to Weight)</h3>
              <p className="text-xs leading-relaxed text-on-surface-variant mb-2">
                If an ingredient is bought by the piece (<code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">ea</code>) but used in recipes by weight (<code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">g</code>), the app converts it using the Piece Weight:
              </p>
              <div className="bg-surface-container p-3 rounded-sm font-mono text-xs border border-outline-variant">
                <div>Cost per Gram = Pack Cost / (Pack Size [ea] × Piece Weight [g])</div>
                <div className="mt-1">Example: A cucumber costs £1.00 (Size = 1 ea, Piece Weight = 400g).</div>
                <div className="text-primary font-semibold mt-1">Cost of 75g = 75g × (£1.00 / 400g) = £0.19</div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Smart Auto-Matching rules */}
        <div className="flex flex-col gap-4">
          <h2 className="headline-sm font-semibold border-b border-outline-variant pb-2 flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            3. Troubleshooting Supplier Catalog Linking
          </h2>
          
          <div className="bg-surface p-6 border border-outline-variant rounded-sm flex flex-col gap-4 shadow-sm">
            <p className="text-xs leading-relaxed text-on-surface-variant">
              When you search in the <strong>Supplier Catalog</strong>, the system automatically tries to match catalog items to your master Pantry ingredients. To keep your calculations safe and prevent errors, the auto-linker follows these strict rules:
            </p>
            
            <ul className="list-disc list-inside text-xs leading-relaxed text-on-surface-variant flex flex-col gap-2 pl-2">
              <li>
                <strong>Strict Modifier Check</strong>: If the master ingredient has a descriptive word (like <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">"wholemeal"</code> in <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">"Flour, Wholemeal, Bread"</code>) that is missing from the supplier product name (like <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">"Flour, Bread"</code>), <strong>the match is rejected</strong>. This prevents generic bread flour from auto-linking to wholemeal.
              </li>
              <li>
                <strong>Short Word Protection</strong>: Words with 5 characters or less (e.g. <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">pork</code>, <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">pears</code>, <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">bread</code>, <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">rice</code>) have fuzzy edit-distance matching disabled. This stops different words (like <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">"bread"</code> and <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">"bream"</code>, or <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">"pork"</code> and <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">"port"</code>) from getting cross-linked.
              </li>
              <li>
                <strong>Spelling & Typos</strong>: Transpositions of adjacent letters (e.g. spelling <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">"fluor"</code> instead of <code className="font-mono text-[10px] bg-surface-container px-1 py-0.5 rounded">"flour"</code>) are detected and correctly matched.
              </li>
              <li>
                <strong>Manual Overrides</strong>: If a product is not auto-matched, you can simply click the <strong>Link</strong> button on the catalog page, select the correct master ingredient, and save it. This sets the link permanently.
              </li>
            </ul>

            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 p-4 rounded-sm">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold leading-relaxed">
                Important: If an ingredient has incorrect pricing roll-ups on recipes (e.g. costing way too much), check its preferred supplier details or verify if its <strong>Piece Weight</strong> or <strong>Waste %</strong> is configured correctly in the Pantry.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
export default Help;
