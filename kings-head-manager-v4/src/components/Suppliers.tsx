import React, { useState } from 'react';
import { useSuppliers, useSupplierMutations } from '../hooks/useKitchenData';
import { Supplier } from '../types';
import { Plus, Truck, Phone, Mail, Calendar, Package, MapPin, FileText, Trash2, Edit2, Check, X } from 'lucide-react';
import { supplierBadgeClass } from '../utils/supplierColors';

const EMPTY_SUPPLIER: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  deliveryDays: '',
  minimumOrder: 0,
  notes: '',
};

const SupplierForm: React.FC<{
  initial: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>;
  onSave: (data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
  isSaving: boolean;
}> = ({ initial, onSave, onCancel, isSaving }) => {
  const [form, setForm] = useState(initial);
  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] label-caps text-outline block mb-1">Supplier Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} className="w-full px-2 py-1.5 border border-outline-variant text-sm rounded-sm" placeholder="e.g. David Catt" />
        </div>
        <div>
          <label className="text-[10px] label-caps text-outline block mb-1">Contact Name</label>
          <input value={form.contactName} onChange={e => set('contactName', e.target.value)} className="w-full px-2 py-1.5 border border-outline-variant text-sm rounded-sm" />
        </div>
        <div>
          <label className="text-[10px] label-caps text-outline block mb-1">Phone</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)} className="w-full px-2 py-1.5 border border-outline-variant text-sm rounded-sm" />
        </div>
        <div>
          <label className="text-[10px] label-caps text-outline block mb-1">Email</label>
          <input value={form.email} onChange={e => set('email', e.target.value)} className="w-full px-2 py-1.5 border border-outline-variant text-sm rounded-sm" type="email" />
        </div>
        <div>
          <label className="text-[10px] label-caps text-outline block mb-1">Delivery Days</label>
          <input value={form.deliveryDays} onChange={e => set('deliveryDays', e.target.value)} className="w-full px-2 py-1.5 border border-outline-variant text-sm rounded-sm" placeholder="e.g. Mon, Wed, Fri" />
        </div>
        <div>
          <label className="text-[10px] label-caps text-outline block mb-1">Minimum Order (£)</label>
          <input type="number" value={form.minimumOrder} onChange={e => setForm(prev => ({ ...prev, minimumOrder: parseFloat(e.target.value) || 0 }))} className="w-full px-2 py-1.5 border border-outline-variant text-sm rounded-sm" placeholder="0" />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] label-caps text-outline block mb-1">Address</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} className="w-full px-2 py-1.5 border border-outline-variant text-sm rounded-sm" />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] label-caps text-outline block mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="w-full px-2 py-1.5 border border-outline-variant text-sm rounded-sm resize-none" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="h-9 px-4 border border-outline-variant text-xs font-bold rounded-sm hover:bg-surface-container">Cancel</button>
        <button onClick={() => onSave(form)} disabled={isSaving || !form.name} className="h-9 px-4 bg-primary text-white text-xs font-bold rounded-sm disabled:opacity-50">
          {isSaving ? 'Saving…' : 'Save Supplier'}
        </button>
      </div>
    </div>
  );
};

const Suppliers: React.FC = () => {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const { addSupplier, updateSupplier, deleteSupplier } = useSupplierMutations();
  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async (data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => {
    await addSupplier.mutateAsync(data);
    setAddingNew(false);
  };

  const handleUpdate = async (id: string, data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => {
    await updateSupplier.mutateAsync({ id, data });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteSupplier.mutateAsync(id);
    setDeletingId(null);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">Loading…</div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <span className="font-bold text-on-surface">Suppliers</span>
          <span className="text-xs text-on-surface-variant">({suppliers.length})</span>
        </div>
        <button onClick={() => setAddingNew(true)} className="flex items-center gap-1.5 h-9 px-4 bg-primary text-white text-xs font-bold rounded-sm">
          <Plus className="h-4 w-4" /> Add Supplier
        </button>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-4">
        {addingNew && (
          <div className="border border-primary/40 bg-surface p-6 rounded-sm">
            <h3 className="label-caps text-primary font-bold mb-4">New Supplier</h3>
            <SupplierForm
              initial={EMPTY_SUPPLIER}
              onSave={handleAdd}
              onCancel={() => setAddingNew(false)}
              isSaving={addSupplier.isPending}
            />
          </div>
        )}

        {suppliers.map(sup => (
          <div key={sup.id} className="border border-outline-variant bg-surface rounded-sm p-6">
            {editingId === sup.id ? (
              <>
                <h3 className="label-caps text-on-surface font-bold mb-4">Edit Supplier</h3>
                <SupplierForm
                  initial={{ name: sup.name, contactName: sup.contactName || '', phone: sup.phone || '', email: sup.email || '', address: sup.address || '', deliveryDays: sup.deliveryDays || '', minimumOrder: sup.minimumOrder || 0, notes: sup.notes || '' }}
                  onSave={(data) => handleUpdate(sup.id, data)}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateSupplier.isPending}
                />
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <span className={`${supplierBadgeClass(sup.name)} text-base font-bold`}>{sup.name}</span>
                    {sup.contactName && <p className="text-xs text-on-surface-variant mt-0.5">{sup.contactName}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setEditingId(sup.id)} className="p-1.5 text-outline hover:text-primary border border-outline-variant rounded-sm">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    {deletingId === sup.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(sup.id)} className="p-1.5 text-white bg-error rounded-sm"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeletingId(null)} className="p-1.5 border border-outline-variant rounded-sm"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setDeletingId(sup.id)} className="p-1.5 text-outline hover:text-error border border-outline-variant rounded-sm">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                  {sup.phone && <div className="flex items-center gap-2 text-on-surface-variant"><Phone className="h-3.5 w-3.5 shrink-0" />{sup.phone}</div>}
                  {sup.email && <div className="flex items-center gap-2 text-on-surface-variant"><Mail className="h-3.5 w-3.5 shrink-0" />{sup.email}</div>}
                  {sup.deliveryDays && <div className="flex items-center gap-2 text-on-surface-variant"><Calendar className="h-3.5 w-3.5 shrink-0" />{sup.deliveryDays}</div>}
                  {sup.minimumOrder > 0 && <div className="flex items-center gap-2 text-on-surface-variant"><Package className="h-3.5 w-3.5 shrink-0" />£{sup.minimumOrder} min order</div>}
                  {sup.address && <div className="flex items-center gap-2 text-on-surface-variant col-span-2"><MapPin className="h-3.5 w-3.5 shrink-0" />{sup.address}</div>}
                  {sup.notes && <div className="flex items-center gap-2 text-on-surface-variant col-span-2"><FileText className="h-3.5 w-3.5 shrink-0" />{sup.notes}</div>}
                </div>
              </>
            )}
          </div>
        ))}

        {suppliers.length === 0 && !addingNew && (
          <div className="text-center py-16 text-on-surface-variant">
            <Truck className="h-12 w-12 mx-auto opacity-20 mb-4" />
            <p className="text-sm">No suppliers yet. Add your first one above.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Suppliers;
