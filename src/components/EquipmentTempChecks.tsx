import React, { useMemo, useRef, useState } from 'react';
import { Refrigerator, Plus, X, Pencil, CheckCircle2, XCircle } from 'lucide-react';
import {
  useEquipmentList, useEquipmentMutations,
  useEquipmentChecksToday, useEquipmentCheckMutations, todayCheckDate
} from '../hooks/useKitchenData';
import { useAuth } from '../hooks/useAuth';
import { useStore } from '../store/useStore';
import { Equipment, EquipmentType } from '../types';

const DEFAULT_W = 16;
const DEFAULT_H = 18;
const MIN_SIZE = 6;

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  x: number;
  y: number;
  w: number;
  h: number;
}

export const EquipmentTempChecks: React.FC = () => {
  const { appUser } = useAuth();
  const showToast = useStore((s) => s.showToast);
  const isManager = appUser?.role === 'manager';

  const { data: equipmentList = [] } = useEquipmentList();
  const { addEquipment, updateEquipment, deleteEquipment } = useEquipmentMutations();
  const { data: todaysChecks = [] } = useEquipmentChecksToday();
  const { recordCheck } = useEquipmentCheckMutations();

  const planRef = useRef<HTMLDivElement>(null);

  const [editMode, setEditMode] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<EquipmentType>('Fridge');
  const [newMinC, setNewMinC] = useState('0');
  const [newMaxC, setNewMaxC] = useState('5');

  const [activeEquipment, setActiveEquipment] = useState<Equipment | null>(null);
  const [tempInput, setTempInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const latestByEquipment = useMemo(() => {
    const map = new Map<string, typeof todaysChecks[number]>();
    for (const check of todaysChecks) {
      const existing = map.get(check.equipmentId);
      if (!existing || check.checkedAt > existing.checkedAt) map.set(check.equipmentId, check);
    }
    return map;
  }, [todaysChecks]);

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addEquipment.mutateAsync({
        name: newName.trim(),
        type: newType,
        minC: parseFloat(newMinC) || 0,
        maxC: parseFloat(newMaxC) || 0,
        x: 40,
        y: 40,
        w: DEFAULT_W,
        h: DEFAULT_H
      });
      showToast(`Added "${newName.trim()}" — drag it into place`, 'success');
      setNewName('');
      setNewType('Fridge');
      setNewMinC('0');
      setNewMaxC('5');
      setShowAddForm(false);
    } catch (err: any) {
      showToast(err?.message || 'Could not add equipment', 'error');
    }
  };

  const handleRenameEquipment = (equipment: Equipment, name: string) => {
    updateEquipment.mutate({ id: equipment.id, data: { name } });
  };

  const handleDeleteEquipment = async (equipment: Equipment) => {
    if (!confirm(`Remove "${equipment.name}" from the floor plan?`)) return;
    await deleteEquipment.mutateAsync(equipment.id);
  };

  const boxFor = (equipment: Equipment) => {
    const base = { x: equipment.x, y: equipment.y, w: equipment.w ?? DEFAULT_W, h: equipment.h ?? DEFAULT_H };
    return drag && drag.id === equipment.id ? { x: drag.x, y: drag.y, w: drag.w, h: drag.h } : base;
  };

  const handlePointerDownMove = (equipment: Equipment, e: React.PointerEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const box = boxFor(equipment);
    setDrag({ id: equipment.id, mode: 'move', ...box });
  };

  const handlePointerDownResize = (equipment: Equipment, e: React.PointerEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const box = boxFor(equipment);
    setDrag({ id: equipment.id, mode: 'resize', ...box });
  };

  const handlePointerMoveOnPlan = (e: React.PointerEvent) => {
    if (!drag || !planRef.current) return;
    const rect = planRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;

    if (drag.mode === 'move') {
      const x = Math.min(100 - drag.w, Math.max(0, px - drag.w / 2));
      const y = Math.min(100 - drag.h, Math.max(0, py - drag.h / 2));
      setDrag({ ...drag, x, y });
    } else {
      const w = Math.min(100 - drag.x, Math.max(MIN_SIZE, px - drag.x));
      const h = Math.min(100 - drag.y, Math.max(MIN_SIZE, py - drag.y));
      setDrag({ ...drag, w, h });
    }
  };

  const handlePointerUpOnPlan = async () => {
    if (!drag) return;
    const { id, x, y, w, h } = drag;
    setDrag(null);
    await updateEquipment.mutateAsync({ id, data: { x, y, w, h } });
  };

  const openCheck = (equipment: Equipment) => {
    if (editMode) return;
    setActiveEquipment(equipment);
    setTempInput('');
  };

  const closeCheck = () => setActiveEquipment(null);

  const parsedTemp = parseFloat(tempInput);
  const hasValidTemp = tempInput.trim() !== '' && !Number.isNaN(parsedTemp);
  const inRange = activeEquipment ? parsedTemp >= activeEquipment.minC && parsedTemp <= activeEquipment.maxC : false;

  const handleRecord = async () => {
    if (!activeEquipment || !hasValidTemp || !appUser) return;
    setSubmitting(true);
    try {
      await recordCheck.mutateAsync({
        equipmentId: activeEquipment.id,
        equipmentName: activeEquipment.name,
        temperatureC: parsedTemp,
        minC: activeEquipment.minC,
        maxC: activeEquipment.maxC,
        pass: inRange,
        userId: appUser.uid,
        userDisplayName: appUser.displayName,
        checkedAt: new Date().toISOString(),
        checkDate: todayCheckDate()
      });
      showToast(`${activeEquipment.name} recorded (${inRange ? 'Pass' : 'Fail'})`, inRange ? 'success' : 'error');
      closeCheck();
    } catch (err: any) {
      showToast(err?.message || 'Could not record the check', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-surface-container-lowest">
      <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-12">
        <div className="border-b border-outline-variant pb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 text-primary">
              <Refrigerator className="h-8 w-8" />
              <h1 className="display-lg text-on-surface font-bold">Equipment Temperature Checks</h1>
            </div>
            <p className="text-sm text-outline mt-2">
              Tap a fridge or freezer on the floor plan to record a reading.
            </p>
          </div>
          {isManager && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold shrink-0 ${
                editMode ? 'bg-primary text-on-primary' : 'bg-surface border border-outline-variant text-on-surface'
              }`}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editMode ? 'Done Editing' : 'Edit Layout'}
            </button>
          )}
        </div>

        {editMode && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-primary text-on-primary text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Equipment
            </button>
            <p className="text-[11px] text-outline">Drag a box to move it, drag its bottom-right corner to resize.</p>
          </div>
        )}

        {showAddForm && (
          <form onSubmit={handleAddEquipment} className="bg-surface p-4 border border-outline-variant rounded-sm shadow-sm flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-bold label-caps tracking-widest text-outline block mb-1">Name</label>
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Walk-in Freezer"
                  className="w-full h-9 px-2 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold label-caps tracking-widest text-outline block mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as EquipmentType)}
                  className="w-full h-9 px-2 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm"
                >
                  <option value="Fridge">Fridge</option>
                  <option value="Freezer">Freezer</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-bold label-caps tracking-widest text-outline block mb-1">Min &deg;C</label>
                  <input type="number" value={newMinC} onChange={(e) => setNewMinC(e.target.value)} className="w-full h-9 px-2 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold label-caps tracking-widest text-outline block mb-1">Max &deg;C</label>
                  <input type="number" value={newMaxC} onChange={(e) => setNewMaxC(e.target.value)} className="w-full h-9 px-2 rounded-sm border border-outline-variant bg-surface-container-lowest text-sm" />
                </div>
              </div>
            </div>
            <button type="submit" className="self-start px-4 py-2 rounded-sm bg-primary text-on-primary text-xs font-semibold">
              Add to Floor Plan
            </button>
          </form>
        )}

        <div
          ref={planRef}
          onPointerMove={handlePointerMoveOnPlan}
          onPointerUp={handlePointerUpOnPlan}
          className="relative w-full aspect-[4/3] rounded-sm border border-outline-variant overflow-hidden bg-surface select-none"
          style={{
            touchAction: editMode ? 'none' : 'auto',
            backgroundImage: 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
            backgroundSize: '5% 5%'
          }}
        >
          {equipmentList.map((equipment) => {
            const box = boxFor(equipment);
            const check = latestByEquipment.get(equipment.id);
            const statusBorder = check ? (check.pass ? 'border-emerald-500' : 'border-red-500') : 'border-outline';
            const statusBg = check ? (check.pass ? 'bg-emerald-50' : 'bg-red-50') : 'bg-surface-container';
            return (
              <div
                key={equipment.id}
                onPointerDown={(e) => handlePointerDownMove(equipment, e)}
                onClick={() => openCheck(equipment)}
                style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
                className={`absolute rounded-sm border-2 flex flex-col items-center justify-center gap-1 p-1 ${statusBorder} ${statusBg} ${editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
              >
                <Refrigerator className={`h-4 w-4 shrink-0 ${check ? (check.pass ? 'text-emerald-600' : 'text-red-600') : 'text-outline'}`} />
                {editMode ? (
                  <input
                    value={equipment.name}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => handleRenameEquipment(equipment, e.target.value)}
                    className="w-full bg-white/80 rounded-sm px-1 py-0.5 text-[10px] font-semibold text-center text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                ) : (
                  <span className="text-[10px] font-semibold text-on-surface text-center leading-tight px-1">
                    {equipment.name}
                  </span>
                )}

                {editMode && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteEquipment(equipment); }}
                      className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                    <div
                      onPointerDown={(e) => handlePointerDownResize(equipment, e)}
                      className="absolute bottom-0 right-0 h-3 w-3 bg-primary rounded-tl-sm cursor-nwse-resize"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {equipmentList.length === 0 && (
          <p className="text-xs text-outline">
            {isManager ? 'No equipment on the floor plan yet — tap "Edit Layout" to add some.' : 'No equipment on the floor plan yet — ask a manager to add some.'}
          </p>
        )}
      </div>

      {activeEquipment && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={closeCheck}>
          <div
            className="w-full max-w-sm bg-surface p-6 border border-outline-variant rounded-sm shadow-lg flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-on-surface">{activeEquipment.name}</p>
                <p className="text-xs text-outline">Range: {activeEquipment.minC}&deg;C to {activeEquipment.maxC}&deg;C</p>
              </div>
              <button onClick={closeCheck} className="p-1 min-w-[32px] min-h-[32px] flex items-center justify-center">
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
              <div className={`flex items-center gap-2 p-2.5 rounded-sm ${inRange ? 'bg-emerald-950/95 text-emerald-100' : 'bg-red-950/95 text-red-100'}`}>
                {inRange ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                <span className="text-xs font-semibold">{inRange ? 'In range' : 'Out of range'}</span>
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

export default EquipmentTempChecks;
