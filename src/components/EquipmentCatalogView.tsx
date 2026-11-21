import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, QrCode, Search, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  EquipmentCondition,
  EquipmentRecord,
  EquipmentStatus,
  LabRecord,
  UserPublic,
} from '../shared/types';
import { QrModal } from './QrModal';
import { StatusText } from './StatusText';

interface EquipmentCatalogViewProps {
  user: UserPublic;
}

export function EquipmentCatalogView({ user }: EquipmentCatalogViewProps) {
  const isAdmin = user.role === 'ADMIN';

  const [equipment, setEquipment] = useState<EquipmentRecord[]>([]);
  const [labs, setLabs] = useState<LabRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [labFilter, setLabFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [qrTarget, setQrTarget] = useState<EquipmentRecord | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<EquipmentRecord | null>(null);

  // Add form state
  const [newTag, setNewTag] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('IoT Controller Kit');
  const [newManufacturer, setNewManufacturer] = useState('');
  const [newSerial, setNewSerial] = useState('');
  const [newLabId, setNewLabId] = useState<number>(1);
  const [newPurchaseDate, setNewPurchaseDate] = useState('2026-11-21');
  const [newCondition, setNewCondition] = useState<EquipmentCondition>('Good');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit form state
  const [editStatus, setEditStatus] = useState<EquipmentStatus>('AVAILABLE');
  const [editCondition, setEditCondition] = useState<EquipmentCondition>('Good');
  const [editLabId, setEditLabId] = useState<number>(1);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (labFilter !== 'ALL') params.set('lab_id', labFilter);

      const [eqRes, labRes] = await Promise.all([
        apiRequest<{ equipment: EquipmentRecord[] }>(`/api/equipment?${params.toString()}`),
        apiRequest<{ labs: LabRecord[] }>('/api/labs'),
      ]);
      setEquipment(eqRes.equipment);
      setLabs(labRes.labs);
      if (labRes.labs.length > 0) {
        setNewLabId((prev) => prev || labRes.labs[0].lab_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, labFilter]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest('/api/equipment', {
        method: 'POST',
        body: JSON.stringify({
          lab_id: newLabId,
          asset_tag: newTag.trim(),
          name: newName.trim(),
          category: newCategory.trim(),
          manufacturer: newManufacturer.trim(),
          serial_no: newSerial.trim(),
          purchase_date: newPurchaseDate,
          condition: newCondition,
          status: 'AVAILABLE',
        }),
      });
      setShowAddModal(false);
      setNewTag('');
      setNewName('');
      setNewManufacturer('');
      setNewSerial('');
      setFeedback('Equipment record registered successfully.');
      await loadCatalog();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to register equipment.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest(`/api/equipment/${editTarget.equipment_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          lab_id: editLabId,
          status: editStatus,
          condition: editCondition,
        }),
      });
      setEditTarget(null);
      setFeedback(`Updated ${editTarget.asset_tag} successfully.`);
      await loadCatalog();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update equipment.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetire(item: EquipmentRecord) {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest(`/api/equipment/${item.equipment_id}`, {
        method: 'DELETE',
      });
      setFeedback(`Retired asset ${item.asset_tag}.`);
      await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to retire equipment.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search equipment by name, asset tag, category, or serial"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tag, name, category, serial..."
              className="w-full pl-9 pr-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
            />
          </div>

          <select
            aria-label="Filter by availability status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs text-slate-700 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
          >
            <option value="ALL">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ISSUED">In Use / Unavailable</option>
            <option value="UNDER_MAINTENANCE">Under Maintenance</option>
            <option value="RETIRED">Retired</option>
          </select>

          <select
            aria-label="Filter by laboratory"
            value={labFilter}
            onChange={(e) => setLabFilter(e.target.value)}
            className="px-3 py-2 text-xs text-slate-700 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
          >
            <option value="ALL">All Laboratories</option>
            {labs.map((lab) => (
              <option key={lab.lab_id} value={lab.lab_id}>
                {lab.lab_name}
              </option>
            ))}
          </select>
        </div>

        {isAdmin ? (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Register Equipment
          </button>
        ) : (
          <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
            View-Only Catalog Access
          </span>
        )}
      </div>

      {feedback && (
        <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="px-4 py-3 font-medium">Asset Tag</th>
                <th className="px-4 py-3 font-medium">Equipment Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Laboratory</th>
                <th className="px-4 py-3 font-medium">Condition</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading laboratory inventory...
                  </td>
                </tr>
              ) : equipment.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No equipment matches your current filter criteria.
                  </td>
                </tr>
              ) : (
                equipment.map((item) => (
                  <tr key={item.equipment_id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {item.asset_tag}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.manufacturer} · S/N <span className="font-mono">{item.serial_no}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.category}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span>{item.lab_name}</span>
                      {item.room_no && (
                        <span className="text-slate-400"> · {item.room_no}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{item.condition}</td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={
                          !isAdmin && item.status === 'ISSUED' ? 'In Use' : item.status
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQrTarget(item)}
                          aria-label={`View QR code for ${item.asset_tag}`}
                          className="p-1.5 text-slate-600 hover:text-blue-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setFormError(null);
                                setEditTarget(item);
                                setEditStatus(item.status);
                                setEditCondition(item.condition);
                                setEditLabId(item.lab_id);
                              }}
                              aria-label={`Edit ${item.asset_tag}`}
                              className="p-1.5 text-slate-600 hover:text-blue-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {item.status !== 'RETIRED' && item.status !== 'ISSUED' && (
                              <button
                                type="button"
                                onClick={() => handleRetire(item)}
                                aria-label={`Retire ${item.asset_tag}`}
                                className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <QrModal equipment={qrTarget} onClose={() => setQrTarget(null)} />

      {isAdmin && showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-equip-title"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="add-equip-title" className="text-base font-semibold text-slate-900">
                Register Laboratory Equipment
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close register equipment dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="add-tag" className="block text-xs font-medium text-slate-700 mb-1">
                    Unique Asset Tag
                  </label>
                  <input
                    id="add-tag"
                    required
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="e.g. UEM-IOT-013"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="add-lab" className="block text-xs font-medium text-slate-700 mb-1">
                    Laboratory
                  </label>
                  <select
                    id="add-lab"
                    value={newLabId}
                    onChange={(e) => setNewLabId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  >
                    {labs.map((lab) => (
                      <option key={lab.lab_id} value={lab.lab_id}>
                        {lab.lab_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="add-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Equipment Name
                </label>
                <input
                  id="add-name"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Keysight U1242C Handheld Multimeter"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="add-cat" className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <input
                    id="add-cat"
                    required
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="add-mfg" className="block text-xs font-medium text-slate-700 mb-1">
                    Manufacturer
                  </label>
                  <input
                    id="add-mfg"
                    required
                    value={newManufacturer}
                    onChange={(e) => setNewManufacturer(e.target.value)}
                    placeholder="e.g. Keysight"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="add-serial" className="block text-xs font-medium text-slate-700 mb-1">
                    Serial Number
                  </label>
                  <input
                    id="add-serial"
                    required
                    value={newSerial}
                    onChange={(e) => setNewSerial(e.target.value)}
                    placeholder="SN-10293"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="add-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Purchase Date
                  </label>
                  <input
                    id="add-date"
                    type="date"
                    value={newPurchaseDate}
                    onChange={(e) => setNewPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label htmlFor="add-cond" className="block text-xs font-medium text-slate-700 mb-1">
                    Condition
                  </label>
                  <select
                    id="add-cond"
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value as EquipmentCondition)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                  >
                    <option value="Good">Good</option>
                    <option value="Minor Wear">Minor Wear</option>
                    <option value="Fair">Fair</option>
                    <option value="Faulty">Faulty</option>
                  </select>
                </div>
              </div>

              {formError && (
                <div role="alert" className="p-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : 'Save Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAdmin && editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-equip-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 id="edit-equip-title" className="text-base font-semibold text-slate-900">
                  Update {editTarget.asset_tag}
                </h2>
                <p className="text-xs text-slate-500">{editTarget.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                aria-label="Close edit equipment dialog"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label htmlFor="edit-lab" className="block text-xs font-medium text-slate-700 mb-1">
                  Laboratory Location
                </label>
                <select
                  id="edit-lab"
                  value={editLabId}
                  onChange={(e) => setEditLabId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                >
                  {labs.map((lab) => (
                    <option key={lab.lab_id} value={lab.lab_id}>
                      {lab.lab_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-status" className="block text-xs font-medium text-slate-700 mb-1">
                  Asset Status
                </label>
                <select
                  id="edit-status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as EquipmentStatus)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="ISSUED">Issued</option>
                  <option value="UNDER_MAINTENANCE">Under Maintenance</option>
                  <option value="RETIRED">Retired</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-cond" className="block text-xs font-medium text-slate-700 mb-1">
                  Physical Condition
                </label>
                <select
                  id="edit-cond"
                  value={editCondition}
                  onChange={(e) => setEditCondition(e.target.value as EquipmentCondition)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
                >
                  <option value="Good">Good</option>
                  <option value="Minor Wear">Minor Wear</option>
                  <option value="Fair">Fair</option>
                  <option value="Faulty">Faulty</option>
                </select>
              </div>

              {formError && (
                <div role="alert" className="p-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-md hover:bg-blue-800 disabled:opacity-60"
                >
                  {submitting ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
