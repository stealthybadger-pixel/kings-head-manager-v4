import React, { useMemo, useState } from 'react';
import { Trash2, PlusCircle, Search, SkipForward, CheckCircle2, ShieldAlert } from 'lucide-react';
import {
  useSupplierProducts,
  useIngredients,
  useIngredientMutations,
  useSupplierProductMutations
} from '../../src/hooks/useKitchenData';
import { findBestIngredientMatch, cleanProductName } from '../../src/utils/matching';
import { inferIngredientDefaults } from '../../src/utils/ingredientAutofill';
import { useStore } from '../../src/store/useStore';
import ItemPicker from '../../src/components/ItemPicker';
import { SupplierProduct } from '../../src/types';
import { AUTO_REJECT_RULES } from './rules';

// Standalone tool — deliberately NOT part of the main app (no route, no nav
// entry, own Vite HTML entry point at tools/catalogue-matcher/index.html).
// Links supplierProducts to Pantry Ingredients ("Supplier Product -> Pantry
// Ingredient Matching Engine"). Runs against whatever Firestore firebase.ts
// is pointed at, which in dev is always the local emulator (see firebase.ts's
// `if (import.meta.env.DEV)` block) — this tool should never run against
// production directly.
//
// Every decision (accept/reject/create/link) commits immediately as a normal
// mutation, same as the rest of the app. Since that's already happening
// against the emulator, not production, there is no separate "session file"
// needed for crash-safety in this MVP — closing and reopening the tool just
// resumes wherever the emulator's data was left, because the emulator IS the
// scratch copy. A production export/reconcile step happens separately, later,
// once a review pass is complete.

function scoreToConfidence(score: number): { pct: number; label: string } {
  if (score === 0) return { pct: 99, label: 'Exact match' };
  if (score === 1) return { pct: 82, label: '1 extra word' };
  return { pct: 65, label: `${score} extra words` };
}

export const CatalogueMatcher: React.FC = () => {
  const { data: allProducts = [], isLoading: loadingProducts } = useSupplierProducts();
  const { data: ingredients = [], isLoading: loadingIngredients } = useIngredients();
  const { addIngredient } = useIngredientMutations();
  const { updateSupplierProduct, deleteSupplierProduct, bulkDeleteSupplierProducts } = useSupplierProductMutations();
  const showToast = useStore((s) => s.showToast);

  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [pickingDifferent, setPickingDifferent] = useState(false);

  const undecided = useMemo(() => allProducts.filter((p) => !p.ingredientId), [allProducts]);

  // Products matching an auto-reject rule (see rules.ts) never enter the
  // normal one-at-a-time queue below — they're surfaced separately as a bulk
  // action instead, since re-litigating a already-decided blanket rule
  // ("no exceptions") one item at a time would defeat the point of it.
  const ruleMatched = useMemo(
    () => undecided.filter((p) => AUTO_REJECT_RULES.some((r) => r.test(p))),
    [undecided]
  );
  const ruleMatchedIds = useMemo(() => new Set(ruleMatched.map((p) => p.id)), [ruleMatched]);

  const unmatched = useMemo(
    () => undecided.filter((p) => !skippedIds.has(p.id) && !ruleMatchedIds.has(p.id)),
    [undecided, skippedIds, ruleMatchedIds]
  );
  const matchedCount = allProducts.filter((p) => !!p.ingredientId).length;
  const totalCount = allProducts.length;

  const handleApplyRules = async () => {
    if (ruleMatched.length === 0) return;
    const preview = ruleMatched.slice(0, 5).map((p) => `${p.supplier} — ${p.name}`).join('\n');
    const more = ruleMatched.length > 5 ? `\n…and ${ruleMatched.length - 5} more` : '';
    if (!confirm(`Delete ${ruleMatched.length} product(s) matching the auto-reject rules?\n\n${preview}${more}`)) return;
    try {
      await bulkDeleteSupplierProducts.mutateAsync(ruleMatched.map((p) => p.id));
      showToast(`Removed ${ruleMatched.length} rule-matched product(s).`, 'success');
    } catch (e: any) {
      showToast('Error applying rules: ' + e.message, 'error');
    }
  };

  const current: SupplierProduct | undefined = unmatched[0];

  const suggestion = useMemo(() => {
    if (!current) return null;
    return findBestIngredientMatch(current.name, ingredients);
  }, [current, ingredients]);

  const advance = () => setPickingDifferent(false);

  const handleReject = async () => {
    if (!current) return;
    try {
      await deleteSupplierProduct.mutateAsync(current.id);
      advance();
    } catch (e: any) {
      showToast('Error deleting: ' + e.message, 'error');
    }
  };

  const handleSkip = () => {
    if (!current) return;
    setSkippedIds((prev) => new Set(prev).add(current.id));
    advance();
  };

  const linkTo = async (ingredientId: string) => {
    if (!current) return;
    try {
      await updateSupplierProduct.mutateAsync({ id: current.id, data: { ingredientId } });
      advance();
    } catch (e: any) {
      showToast('Error linking: ' + e.message, 'error');
    }
  };

  const handleAcceptSuggestion = () => {
    if (!suggestion) return;
    linkTo(suggestion.ingredient.id);
  };

  const handleCreateNew = async () => {
    if (!current) return;
    const name = current.originalName || cleanProductName(current.name)
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const guess = inferIngredientDefaults(name);
    try {
      const created = await addIngredient.mutateAsync({
        name,
        category: (guess.category ?? 'Dry Store') as any,
        subCategory: guess.subCategory ?? undefined,
        wastePercent: guess.wastePercent ?? 0,
        kcalPer100: guess.kcalPer100 ?? 0,
        stockLevel: 0,
        allergens: guess.allergens,
        suppliers: [],
        audited: false,
        incomplete: true
      });
      await linkTo(created.id);
      showToast(`Created "${created.name}" and linked.`, 'success');
    } catch (e: any) {
      showToast('Error creating ingredient: ' + e.message, 'error');
    }
  };

  if (loadingProducts || loadingIngredients) {
    return (
      <div className="flex items-center justify-center h-full text-outline text-sm">Loading catalogue…</div>
    );
  }

  return (
    <div className="p-6 sm:p-10 h-full overflow-y-auto bg-surface-container-lowest flex flex-col items-center">
      <div className="w-full max-w-xl flex flex-col gap-6">
        {/* Auto-reject rules */}
        {ruleMatched.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-sm p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-700 flex-shrink-0" />
              <span className="text-xs text-amber-900">
                <strong>{ruleMatched.length}</strong> product(s) match an auto-reject rule
                ({AUTO_REJECT_RULES.map((r) => r.label).join(', ')}) and are held out of the queue below.
              </span>
            </div>
            <button
              onClick={handleApplyRules}
              disabled={bulkDeleteSupplierProducts.isPending}
              className="h-9 px-4 bg-amber-700 text-white text-xs font-bold label-caps rounded-sm hover:opacity-90 disabled:opacity-50 flex-shrink-0"
            >
              Review &amp; Delete
            </button>
          </div>
        )}

        {/* Progress */}
        <div className="flex items-center justify-between text-xs text-outline label-caps font-bold">
          <span>{matchedCount} matched</span>
          <span>{unmatched.length} remaining{skippedIds.size > 0 ? ` (+${skippedIds.size} skipped)` : ''}</span>
          <span>{totalCount} total</span>
        </div>
        <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: totalCount > 0 ? `${(matchedCount / totalCount) * 100}%` : '0%' }}
          />
        </div>

        {!current ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <h2 className="font-bold text-on-surface">
              {skippedIds.size > 0 ? 'Nothing left except skipped items.' : 'All caught up.'}
            </h2>
            <p className="text-xs text-outline max-w-xs">
              {skippedIds.size > 0
                ? `${skippedIds.size} item(s) were skipped this session — reload the tool to see them again.`
                : 'Every supplier product is either linked to a Pantry Ingredient or removed.'}
            </p>
          </div>
        ) : (
          <>
            {/* Product card */}
            <div className="bg-surface border border-outline-variant rounded-sm p-6">
              <span className="text-[10px] label-caps font-bold text-outline">{current.supplier}</span>
              <h2 className="headline-sm font-semibold text-on-surface mt-1">{current.name}</h2>
              <div className="text-sm text-outline mt-2">
                £{current.packCost.toFixed(2)} · {current.packSize} {current.packUnit}
              </div>
            </div>

            {/* Suggestion */}
            {!pickingDifferent && (
              <div className="bg-surface border border-outline-variant rounded-sm p-6 flex flex-col gap-4">
                <span className="label-caps text-outline font-bold text-xs">AI Suggestion</span>
                {suggestion ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-on-surface">{suggestion.ingredient.name}</div>
                      <div className="text-xs text-outline mt-0.5">
                        {scoreToConfidence(suggestion.score).pct}% confidence — {scoreToConfidence(suggestion.score).label}
                      </div>
                    </div>
                    <button
                      onClick={handleAcceptSuggestion}
                      disabled={updateSupplierProduct.isPending}
                      className="h-10 px-5 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:opacity-90 disabled:opacity-50"
                    >
                      Accept
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-outline">No confident match found — search manually below.</span>
                )}
              </div>
            )}

            {/* Search / choose different */}
            {pickingDifferent || !suggestion ? (
              <div className="bg-surface border border-outline-variant rounded-sm p-6">
                <span className="label-caps text-outline font-bold text-xs block mb-3">
                  <Search className="h-3.5 w-3.5 inline mr-1.5" />
                  Search Pantry
                </span>
                <ItemPicker
                  ingredients={ingredients}
                  recipes={[]}
                  placeholder="Search pantry ingredients..."
                  actionLabel="Link"
                  onSelectIngredient={(ing) => linkTo(ing.id)}
                />
              </div>
            ) : (
              <button
                onClick={() => setPickingDifferent(true)}
                className="self-start text-xs font-bold text-primary hover:underline"
              >
                Choose a different ingredient instead
              </button>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleCreateNew}
                disabled={addIngredient.isPending}
                className="h-10 px-4 border border-primary text-primary text-xs font-bold label-caps rounded-sm hover:bg-primary/5 flex items-center gap-1.5 disabled:opacity-50"
              >
                <PlusCircle className="h-3.5 w-3.5" /> Create New Pantry Ingredient
              </button>
              <button
                onClick={handleSkip}
                className="h-10 px-4 border border-outline text-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container flex items-center gap-1.5"
              >
                <SkipForward className="h-3.5 w-3.5" /> Skip
              </button>
              <button
                onClick={handleReject}
                disabled={deleteSupplierProduct.isPending}
                className="h-10 px-4 border border-red-500/40 text-red-600 text-xs font-bold label-caps rounded-sm hover:bg-red-500/10 flex items-center gap-1.5 ml-auto disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Reject (Delete)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CatalogueMatcher;
