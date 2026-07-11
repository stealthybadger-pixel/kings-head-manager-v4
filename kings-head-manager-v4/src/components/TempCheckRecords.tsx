import React, { useMemo, useState } from 'react';
import { ClipboardList, Search, CheckCircle2, XCircle } from 'lucide-react';
import { useFoodTempChecksHistory, useEquipmentChecksHistory } from '../hooks/useKitchenData';

interface UnifiedRecord {
  id: string;
  itemName: string;
  detail: string;
  temperatureC: number;
  minC: number;
  maxC?: number;
  pass: boolean;
  userDisplayName: string;
  checkedAt: string;
  checkDate: string;
}

export const TempCheckRecords: React.FC = () => {
  const { data: foodChecks = [], isLoading: foodLoading } = useFoodTempChecksHistory();
  const { data: equipmentChecks = [], isLoading: equipmentLoading } = useEquipmentChecksHistory();
  const [search, setSearch] = useState('');

  const records = useMemo<UnifiedRecord[]>(() => {
    const food: UnifiedRecord[] = foodChecks.map(r => ({
      id: r.id,
      itemName: r.itemName,
      detail: `${r.checkType} — min ${r.requiredMinC}°C`,
      temperatureC: r.temperatureC,
      minC: r.requiredMinC,
      pass: r.pass,
      userDisplayName: r.userDisplayName,
      checkedAt: r.checkedAt,
      checkDate: r.checkDate
    }));
    const equipment: UnifiedRecord[] = equipmentChecks.map(r => ({
      id: r.id,
      itemName: r.equipmentName,
      detail: `Equipment — ${r.minC}°C to ${r.maxC}°C`,
      temperatureC: r.temperatureC,
      minC: r.minC,
      maxC: r.maxC,
      pass: r.pass,
      userDisplayName: r.userDisplayName,
      checkedAt: r.checkedAt,
      checkDate: r.checkDate
    }));
    return [...food, ...equipment].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
  }, [foodChecks, equipmentChecks]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter(r =>
      r.itemName.toLowerCase().includes(term) ||
      r.detail.toLowerCase().includes(term) ||
      r.userDisplayName.toLowerCase().includes(term)
    );
  }, [records, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, UnifiedRecord[]>();
    for (const r of filtered) {
      const list = groups.get(r.checkDate) ?? [];
      list.push(r);
      groups.set(r.checkDate, list);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const isLoading = foodLoading || equipmentLoading;

  return (
    <div className="p-8 h-full overflow-y-auto bg-surface-container-lowest">
      <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-12">
        <div className="border-b border-outline-variant pb-6">
          <div className="flex items-center gap-3 text-primary">
            <ClipboardList className="h-8 w-8" />
            <h1 className="display-lg text-on-surface font-bold">Temp Check Records</h1>
          </div>
          <p className="text-sm text-outline mt-2">
            Every recorded food and equipment temperature check, newest first.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 h-10 rounded-sm border border-outline-variant bg-surface">
          <Search className="h-4 w-4 text-outline shrink-0" />
          <input
            type="text"
            placeholder="Search by item, check type, or who checked it..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-on-surface focus:outline-none"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-outline">Loading...</p>
        ) : grouped.length === 0 ? (
          <div className="bg-surface p-6 border border-outline-variant rounded-sm shadow-sm">
            <p className="text-sm text-on-surface-variant">No records yet.</p>
          </div>
        ) : (
          grouped.map(([day, dayRecords]) => (
            <div key={day} className="flex flex-col gap-2">
              <h2 className="text-xs font-bold label-caps tracking-widest text-outline">{day}</h2>
              {dayRecords.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 bg-surface p-4 border border-outline-variant rounded-sm shadow-sm">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{r.itemName}</p>
                    <p className="text-xs text-outline">
                      {r.detail} — {r.temperatureC}&deg;C — {r.userDisplayName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.pass ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-[10px] font-bold label-caps tracking-widest text-outline">
                      {new Date(r.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TempCheckRecords;
