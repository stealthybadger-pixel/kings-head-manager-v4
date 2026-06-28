import React, { useState } from 'react';
import { useSuppliers, useSupplierMutations } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import { Supplier } from '../types';
import { Plus, Pencil, Trash2, Phone, Mail, MapPin, Calendar, PoundSterling, FileText, X, Check } from 'lucide-react';

const EMPTY_FORM: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  deliveryDays: '',
  minimumOrder: 0,
  notes: ''
};

const SupplierForm: React.FC<{
  initial: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>;
  onSave: (data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
  isSaving: boolean;
}> = ({ initial, onSave, onCancel, isSaving }) => {
  const [form, setForm] = useState(initial);
  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Supplier Name *</label>
          <input
            className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. David Catt"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Contact Name</label>
          <input
            className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            value={form.contactName}
            onChange={e => set('contactName', e.target.value)}
            placeholder="e.g. Sales Desk"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Phone</label>
          <input
            className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="01622 743264"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Email</label>
          <input
            className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="orders@supplier.co.uk"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Delivery Days</label>
          <input
            className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            value={form.deliveryDays}
            onChange={e => set('deliveryDays', e.target.value)}
            placeholder="Mon, Wed, Fri"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Minimum Order (£)</label>
          <input
            type="number"
            min={0}
            className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            value={form.minimumOrder}
            onChange={e => set('minimumOrder', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Address</label>
          <input
            className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
            value={form.address ?? ''}
            onChange={e => set('address', e.target.value)}
            placeholder="Street, Town, Postcode"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Notes</label>
          <textarea
            rows={2}
            className="w-full bg-surface-container border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Any useful notes…"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
        <button
          disabled={!form.name.trim() || isSaving}
          onClick={() => onSave(form)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded bg-primary text-on-primary font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Check className="h-4 w-4" /> {isSaving ? 'Saving…' : 'Save Supplier'}
        </button>
      </div>
    </div>
  );
};

const Suppliers: React.FC = () => {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const { addSupplier, updateSupplier, deleteSupplier } = useSupplierMutations();
  const showToast = useStore(s => s.showToast);

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sorted = [...suppliers].sort((a, b) => a.name.localeCompare(b.name));

  const handleAdd = (data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => {
    addSupplier.mutate(data, {
      onSuccess: () => { showToast(`Supplier "${data.name}" added`); setShowAdd(false); },
      onError: () => showToast('Failed to add supplier', 'error')
    });
  };

  const handleUpdate = (id: string, data: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => {
    updateSupplier.mutate({ id, data }, {
      onSuccess: () => { showToast(`Supplier "${data.name}" updated`); setEditingId(null); },
      onError: () => showToast('Failed to update supplier', 'error')
    });
  };

  const handleDelete = (id: string, name: string) => {
    deleteSupplier.mutate(id, {
      onSuccess: () => { showToast(`Supplier "${name}" deleted`); setConfirmDeleteId(null); },
      onError: () => showToast('Failed to delete supplier', 'error')
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
        Loading suppliers…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-on-surface-variant">{sorted.length} supplier{sorted.length !== 1 ? 's' : ''}</p>
          <button
            onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" /> Add Supplier
          </button>
        </div>

        {/* Add Form */}
        {showAdd && (
          <div className="bg-surface-container border border-primary/40 rounded-lg p-5">
            <h3 className="text-sm font-bold text-primary mb-4 uppercase tracking-wide">New Supplier</h3>
            <SupplierForm
              initial={EMPTY_FORM}
              onSave={handleAdd}
              onCancel={() => setShowAdd(false)}
              isSaving={addSupplier.isPending}
            />
          </div>
        )}

        {/* Supplier Cards */}
        {sorted.map(supplier => (
          <div key={supplier.id} className="bg-surface-container border border-outline-variant rounded-lg overflow-hidden">
            {editingId === supplier.id ? (
              <div className="p-5">
                <h3 className="text-sm font-bold text-on-surface mb-4">Editing: {supplier.name}</h3>
                <SupplierForm
                  initial={{
                    name: supplier.name,
                    contactName: supplier.contactName,
                    phone: supplier.phone,
                    email: supplier.email,
                    address: supplier.address ?? '',
                    deliveryDays: supplier.deliveryDays,
                    minimumOrder: supplier.minimumOrder,
                    notes: supplier.notes
                  }}
                  onSave={(data) => handleUpdate(supplier.id, data)}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateSupplier.isPending}
                />
              </div>
            ) : (
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 mb-3">
                      <h2 className="text-base font-bold text-on-surface">{supplier.name}</h2>
                      {supplier.contactName && (
                        <span className="text-xs text-on-surface-variant">— {supplier.contactName}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-on-surface-variant">
                      {supplier.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span>{supplier.phone}</span>
                        </div>
                      )}
                      {supplier.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{supplier.email}</span>
                        </div>
                      )}
                      {supplier.deliveryDays && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>{supplier.deliveryDays}</span>
                        </div>
                      )}
                      {supplier.minimumOrder > 0 && (
                        <div className="flex items-center gap-1.5">
                          <PoundSterling className="h-3.5 w-3.5 shrink-0" />
                          <span>Min. order £{supplier.minimumOrder}</span>
                        </div>
                      )}
                      {supplier.address && (
                        <div className="flex items-center gap-1.5 col-span-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span>{supplier.address}</span>
                        </div>
                      )}
                      {supplier.notes && (
                        <div className="flex items-start gap-1.5 col-span-2 mt-1">
                          <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="text-on-surface-variant/70">{supplier.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditingId(supplier.id); setShowAdd(false); }}
                      className="p-2 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {confirmDeleteId === supplier.id ? (
                      <div className="flex items-center gap-1 ml-1">
                        <span className="text-xs text-error font-semibold">Delete?</span>
                        <button
                          onClick={() => handleDelete(supplier.id, supplier.name)}
                          className="px-2 py-1 text-xs bg-error text-on-error rounded font-semibold hover:opacity-90"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs border border-outline-variant rounded text-on-surface-variant hover:bg-surface-container-high"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(supplier.id)}
                        className="p-2 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-error transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {sorted.length === 0 && !showAdd && (
          <div className="text-center py-16 text-on-surface-variant text-sm">
            No suppliers yet. Add one above.
          </div>
        )}
      </div>
    </div>
  );
};

export default Suppliers;
