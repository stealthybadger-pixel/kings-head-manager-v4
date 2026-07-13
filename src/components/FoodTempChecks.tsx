import React, { useMemo, useState } from 'react';
import { Thermometer, CheckCircle2, XCircle, X } from 'lucide-react';
import { useDishes, useRecipes, useIngredients, useFoodTempChecksToday, useFoodTempCheckMutations, todayCheckDate } from '../hooks/useKitchenData';
import { buildFoodTempChecklist, FOOD_TEMP_THRESHOLDS, FoodTempChecklistItem } from '../utils/tempChecks';
import { useAuth } from '../hooks/useAuth';
import { useStore } from '../store/useStore';
import { FoodCheckType } from '../types';

function tileKey(itemId: string, checkType: FoodCheckType) {
  return `${itemId}|${checkType}`;
}

export const FoodTempChecks: React.FC = () => {
  const { data: dishes = [] } = useDishes();
  const { data: recipes = [] } = useRecipes();
  const { data: ingredients = [] } = useIngredients();
  const { data: todaysChecks = [] } = useFoodTempChecksToday();
  const { recordCheck } = useFoodTempCheckMutations();
  const { appUser } = useAuth();
  const showToast = useStore((s) => s.showToast);

  const [activeTile, setActiveTile] = useState<FoodTempChecklistItem | null>(null);
  const [tempInput, setTempInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Tiles auto-populate from tags set on recipes/ingredients (see
  // utils/tempChecks.ts) — this is an available pool to tap into as
  // needed during a shift, not a mandatory checklist you have to clear.
  // Each tile is the item actually being probed, deduped across every
  // live dish that uses it.
  const checklist = useMemo(
    () => buildFoodTempChecklist(dishes, recipes, ingredients),
    [dishes, recipes, ingredients]
  );

  const latestByTile = useMemo(() => {
    const map = new Map<string, typeof todaysChecks[number]>();
    for (const check of todaysChecks) {
      const key = tileKey(check.itemId, check.checkType);
      const existing = map.get(key);
      if (!existing || check.checkedAt > existing.checkedAt) map.set(key, check);
    }
    return map;
  }, [todaysChecks]);

  const openTile = (item: FoodTempChecklistItem) => {
    setActiveTile(item);
    setTempInput('');
  };

  const closeModal = () => setActiveTile(null);

  const parsedTemp = parseFloat(tempInput);
  const hasValidTemp = tempInput.trim() !== '' && !Number.isNaN(parsedTemp);
  const requiredMinC = activeTile ? FOOD_TEMP_THRESHOLDS[activeTile.checkType] : 0;
  const atTemp = hasValidTemp && parsedTemp >= requiredMinC;

  // Only passing readings get recorded — if it's under temp, the item
  // goes back to cook/reheat further and gets re-probed, rather than
  // logging a failed attempt. Record stays disabled until it passes.
  const handleRecord = async () => {
    if (!activeTile || !atTemp || !appUser) return;
    setSubmitting(true);
    try {
      await recordCheck.mutateAsync({
        itemId: activeTile.itemId,
        itemName: activeTile.itemName,
        itemType: activeTile.itemType,
        checkType: activeTile.checkType,
        temperatureC: parsedTemp,
        requiredMinC,
        pass: true,
        userId: appUser.uid,
        userDisplayName: appUser.displayName,
        checkedAt: new Date().toISOString(),
        checkDate: todayCheckDate()
      });
      showToast(`${activeTile.itemName} — ${activeTile.checkType} recorded (Pass)`, 'success');
      closeModal();
    } catch (err: any) {
      showToast(err?.message || 'Could not record the check', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-surface-container-lowest">
      <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-12">
        <div className="border-b border-outline-variant pb-6">
          <div className="flex items-center gap-3 text-primary">
            <Thermometer className="h-8 w-8" />
            <h1 className="display-lg text-on-surface font-bold">Food Temperature Checks</h1>
          </div>
          <p className="text-sm text-outline mt-2">
            Tap any item to record a reading — probe as many or as few as you need this shift.
          </p>
        </div>

        {checklist.length === 0 ? (
          <div className="bg-surface p-6 border border-outline-variant rounded-sm shadow-sm">
            <p className="text-sm text-on-surface-variant">
              No checks available yet. Tag a live dish's meat/fish recipe or
              ingredient with a Food Temp Check (Recipes / Pantry editor), or
              mark a dish as requiring Hot Hold (Dishes editor).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {checklist.map((item) => {
              const key = tileKey(item.itemId, item.checkType);
              const check = latestByTile.get(key);
              const dishSummary = item.dishNames.length > 2
                ? `${item.dishNames.slice(0, 2).join(', ')} +${item.dishNames.length - 2} more`
                : item.dishNames.join(', ');
              return (
                <button
                  key={key}
                  onClick={() => openTile(item)}
                  className="flex items-center justify-between gap-3 bg-surface p-4 border border-outline-variant rounded-sm shadow-sm text-left hover:bg-surface-container-low transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{item.itemName}</p>
                    <p className="text-xs text-outline">{item.checkType}</p>
                    {item.itemType !== 'dish' && (
                      <p className="text-[10px] text-outline truncate mt-0.5">Used in: {dishSummary}</p>
                    )}
                  </div>
                  {check ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : (
                    <span className="text-[10px] font-bold label-caps tracking-widest text-outline shrink-0">Tap to check</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {activeTile && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div
            className="w-full max-w-sm bg-surface p-6 border border-outline-variant rounded-sm shadow-lg flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-on-surface">{activeTile.itemName}</p>
                <p className="text-xs text-outline">{activeTile.checkType} — min {requiredMinC}&deg;C</p>
              </div>
              <button onClick={closeModal} className="p-1 min-w-[32px] min-h-[32px] flex items-center justify-center">
                <X className="h-4 w-4 text-outline" />
              </button>
            </div>

            {/* Manual entry for now. Once a Bluetooth thermometer (ThermoPro
                TP25) is paired, this same tap-to-open flow will show a live
                BLE reading here instead, with the same confirm-before-save
                step — the user still presses Record, never auto-saved. */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold label-caps tracking-widest text-outline">Temperature (&deg;C)</label>
              <input
                type="number"
                step="0.1"
                autoFocus
                value={tempInput}
                onChange={(e) => setTempInput(e.target.value)}
                className="h-11 px-3 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {hasValidTemp && (
              <div className={`flex items-center gap-2 p-2.5 rounded-sm ${atTemp ? 'bg-emerald-950/95 text-emerald-100' : 'bg-amber-950/95 text-amber-100'}`}>
                {atTemp ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                <span className="text-xs font-semibold">
                  {atTemp ? 'At temperature' : 'Not yet at temperature — return to cook/reheat and re-check'}
                </span>
              </div>
            )}

            <button
              onClick={handleRecord}
              disabled={!atTemp || submitting}
              className="h-11 flex items-center justify-center rounded-sm bg-primary text-on-primary text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? 'Recording...' : 'Record'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FoodTempChecks;
