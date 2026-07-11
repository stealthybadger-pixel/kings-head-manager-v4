import React, { useMemo, useState } from 'react';
import { Thermometer, CheckCircle2, XCircle, X, Plus, Search } from 'lucide-react';
import { useDishes, useRecipes, useIngredients, useFoodTempChecksToday, useFoodTempCheckMutations, todayCheckDate } from '../hooks/useKitchenData';
import { buildFoodTempChecklist, FOOD_TEMP_THRESHOLDS, FoodTempChecklistItem } from '../utils/tempChecks';
import { useAuth } from '../hooks/useAuth';
import { useStore } from '../store/useStore';
import { FoodCheckType } from '../types';

function tileKey(dishId: string, checkType: FoodCheckType) {
  return `${dishId}|${checkType}`;
}

export const FoodTempChecks: React.FC = () => {
  const { data: dishes = [] } = useDishes();
  const { data: recipes = [] } = useRecipes();
  const { data: ingredients = [] } = useIngredients();
  const { data: todaysChecks = [] } = useFoodTempChecksToday();
  const { recordCheck } = useFoodTempCheckMutations();
  const { appUser } = useAuth();
  const showToast = useStore((s) => s.showToast);

  // The full tag-derived list is a pool of ELIGIBLE checks, not a mandatory
  // checklist — kitchens sample a handful per shift, they don't probe
  // every live dish every day. "Today's Checks" is a working subset the
  // user opts into via the picker below.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  const [activeTile, setActiveTile] = useState<FoodTempChecklistItem | null>(null);
  const [tempInput, setTempInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const eligiblePool = useMemo(
    () => buildFoodTempChecklist(dishes, recipes, ingredients),
    [dishes, recipes, ingredients]
  );

  const latestByTile = useMemo(() => {
    const map = new Map<string, typeof todaysChecks[number]>();
    for (const check of todaysChecks) {
      const key = tileKey(check.dishId, check.checkType);
      const existing = map.get(key);
      if (!existing || check.checkedAt > existing.checkedAt) map.set(key, check);
    }
    return map;
  }, [todaysChecks]);

  // Anything already recorded today stays visible even after a reload,
  // merged with whatever's been picked this session but not yet recorded.
  const todaysTiles = useMemo(() => {
    const byKey = new Map<string, FoodTempChecklistItem>();
    for (const item of eligiblePool) {
      const key = tileKey(item.dishId, item.checkType);
      if (selectedKeys.has(key) || latestByTile.has(key)) byKey.set(key, item);
    }
    return Array.from(byKey.values());
  }, [eligiblePool, selectedKeys, latestByTile]);

  const pickerOptions = useMemo(() => {
    const search = pickerSearch.trim().toLowerCase();
    return eligiblePool.filter((item) => {
      const key = tileKey(item.dishId, item.checkType);
      if (selectedKeys.has(key) || latestByTile.has(key)) return false;
      if (!search) return true;
      return item.dishName.toLowerCase().includes(search) || item.checkType.toLowerCase().includes(search);
    });
  }, [eligiblePool, selectedKeys, latestByTile, pickerSearch]);

  const addToToday = (item: FoodTempChecklistItem) => {
    setSelectedKeys((prev) => new Set(prev).add(tileKey(item.dishId, item.checkType)));
  };

  const removeFromToday = (item: FoodTempChecklistItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = tileKey(item.dishId, item.checkType);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const openTile = (item: FoodTempChecklistItem) => {
    setActiveTile(item);
    setTempInput('');
    setNotesInput('');
  };

  const closeModal = () => setActiveTile(null);

  const parsedTemp = parseFloat(tempInput);
  const hasValidTemp = tempInput.trim() !== '' && !Number.isNaN(parsedTemp);
  const requiredMinC = activeTile ? FOOD_TEMP_THRESHOLDS[activeTile.checkType] : 0;
  const willPass = hasValidTemp && parsedTemp >= requiredMinC;

  const handleRecord = async () => {
    if (!activeTile || !hasValidTemp || !appUser) return;
    setSubmitting(true);
    try {
      await recordCheck.mutateAsync({
        dishId: activeTile.dishId,
        dishName: activeTile.dishName,
        checkType: activeTile.checkType,
        temperatureC: parsedTemp,
        requiredMinC,
        pass: willPass,
        correctiveNotes: willPass ? undefined : (notesInput.trim() || undefined),
        userId: appUser.uid,
        userDisplayName: appUser.displayName,
        checkedAt: new Date().toISOString(),
        checkDate: todayCheckDate()
      });
      showToast(`${activeTile.dishName} — ${activeTile.checkType} recorded (${willPass ? 'Pass' : 'Fail'})`, willPass ? 'success' : 'error');
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
            Pick a handful of today's live dishes to probe — this isn't a mandatory list.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold label-caps tracking-widest text-outline">Today's Checks</h2>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-primary text-on-primary text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Check
          </button>
        </div>

        {todaysTiles.length === 0 ? (
          <div className="bg-surface p-6 border border-outline-variant rounded-sm shadow-sm">
            <p className="text-sm text-on-surface-variant">
              Nothing picked yet. Tap "Add Check" to choose which live dishes to probe today.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {todaysTiles.map((item) => {
              const key = tileKey(item.dishId, item.checkType);
              const check = latestByTile.get(key);
              return (
                <button
                  key={key}
                  onClick={() => openTile(item)}
                  className="flex items-center justify-between gap-3 bg-surface p-4 border border-outline-variant rounded-sm shadow-sm text-left hover:bg-surface-container-low transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{item.dishName}</p>
                    <p className="text-xs text-outline">{item.checkType}</p>
                  </div>
                  {check ? (
                    check.pass ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                    )
                  ) : (
                    <span
                      role="button"
                      onClick={(e) => removeFromToday(item, e)}
                      title="Remove from today's list"
                      className="text-outline hover:text-red-500 shrink-0 p-1 -m-1"
                    >
                      <X className="h-4 w-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowPicker(false)}>
          <div
            className="w-full max-w-sm max-h-[80vh] bg-surface p-6 border border-outline-variant rounded-sm shadow-lg flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-on-surface">Add a check</p>
              <button onClick={() => setShowPicker(false)} className="p-1 min-w-[32px] min-h-[32px] flex items-center justify-center">
                <X className="h-4 w-4 text-outline" />
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 h-10 rounded-sm border border-outline-variant bg-surface-container-lowest">
              <Search className="h-4 w-4 text-outline shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Search dishes..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-on-surface focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {pickerOptions.length === 0 ? (
                <p className="text-xs text-outline">
                  {eligiblePool.length === 0
                    ? "No eligible checks yet — tag a live dish's meat/fish ingredient or recipe with a Food Temp Check, or mark a dish as requiring Hot Hold."
                    : 'Nothing left to add — everything eligible is already on today\'s list.'}
                </p>
              ) : (
                pickerOptions.map((item) => (
                  <button
                    key={tileKey(item.dishId, item.checkType)}
                    onClick={() => addToToday(item)}
                    className="flex items-center justify-between gap-3 p-3 rounded-sm border border-outline-variant text-left hover:bg-surface-container-low transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{item.dishName}</p>
                      <p className="text-xs text-outline">{item.checkType}</p>
                    </div>
                    <Plus className="h-4 w-4 text-primary shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTile && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div
            className="w-full max-w-sm bg-surface p-6 border border-outline-variant rounded-sm shadow-lg flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-on-surface">{activeTile.dishName}</p>
                <p className="text-xs text-outline">{activeTile.checkType} — min {requiredMinC}&deg;C</p>
              </div>
              <button onClick={closeModal} className="p-1 min-w-[32px] min-h-[32px] flex items-center justify-center">
                <X className="h-4 w-4 text-outline" />
              </button>
            </div>

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
              <div className={`flex items-center gap-2 p-2.5 rounded-sm ${willPass ? 'bg-emerald-950/95 text-emerald-100' : 'bg-red-950/95 text-red-100'}`}>
                {willPass ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                <span className="text-xs font-semibold">{willPass ? 'Pass' : 'Fail'}</span>
              </div>
            )}

            {hasValidTemp && !willPass && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold label-caps tracking-widest text-outline">Corrective action notes</label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  rows={3}
                  className="px-3 py-2 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <button
              onClick={handleRecord}
              disabled={!hasValidTemp || submitting}
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
