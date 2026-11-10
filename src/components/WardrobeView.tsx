import { useState, useEffect, useCallback } from 'react';
import { Shirt, Plus, Search, LogOut, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchWardrobeItems, deleteWardrobeItem } from '@/lib/wardrobe';
import { CATEGORIES, type WardrobeItem, type Category } from '@/types/wardrobe';
import WardrobeItemCard from '@/components/WardrobeItemCard';
import AddItemModal from '@/components/AddItemModal';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import OutfitsView from '@/components/OutfitsView';

export default function WardrobeView() {
  const { user, signOut } = useAuth();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WardrobeItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WardrobeItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [tab, setTab] = useState<'wardrobe' | 'outfits'>('wardrobe');

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWardrobeItems();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wardrobe.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // ── Merge a single updated item into the list (no full reload needed) ──────
  const handleItemUpdated = useCallback((updated: WardrobeItem) => {
    setItems((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i))
    );
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWardrobeItem(deleteTarget.id, deleteTarget.image_path);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item.');
    } finally {
      setDeleting(false);
    }
  };

  // Filtered items
  const filtered = items.filter((item) => {
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.color?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (item.brand?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const itemCountByCategory = (cat: Category) => items.filter((i) => i.category === cat).length;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-stone-900 rounded-xl">
              <Shirt className="w-5 h-5 text-amber-100" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-lg font-semibold font-display text-stone-900 leading-tight">ClosetMuse</h1>
              <p className="text-xs text-stone-400">{items.length} items in your wardrobe</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-stone-500">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              {user?.email}
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Section tabs */}
        <div className="inline-flex p-1 mb-6 bg-stone-100 rounded-xl">
          {(['wardrobe', 'outfits'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 text-sm font-medium rounded-lg capitalize transition-all ${
                tab === t ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'outfits' ? (
          loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">{error}</div>
              )}
              <OutfitsView items={items} />
            </>
          )
        ) : (
        <>
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, color, or brand..."
              className="input-field pl-11"
            />
          </div>

          {/* Category filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as Category | 'all')}
            className="select-field sm:w-48"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} ({itemCountByCategory(c.value)})
              </option>
            ))}
          </select>

          {/* Add button */}
          <button
            onClick={() => {
              setEditingItem(null);
              setShowAddModal(true);
            }}
            className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-stone-300 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center fade-in">
            <div className="flex items-center justify-center w-20 h-20 bg-stone-100 rounded-3xl mb-6">
              <Sparkles className="w-10 h-10 text-stone-300" strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-semibold text-stone-800 mb-2">
              {items.length === 0 ? 'Your wardrobe is empty' : 'No items match your search'}
            </h2>
            <p className="text-stone-400 text-sm mb-6 max-w-sm">
              {items.length === 0
                ? 'Start by adding your first clothing item — upload a photo and fill in the details.'
                : 'Try adjusting your search or category filter.'}
            </p>
            {items.length === 0 && (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setShowAddModal(true);
                }}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add your first item
              </button>
            )}
          </div>
        ) : (
          /* Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map((item) => (
              <WardrobeItemCard
                key={item.id}
                item={item}
                onEdit={(i) => {
                  setEditingItem(i);
                  setShowAddModal(true);
                }}
                onDelete={(i) => setDeleteTarget(i)}
                onUpdated={handleItemUpdated}
              />
            ))}
          </div>
        )}
        </>
        )}
      </main>

      {/* Modals */}
      {showAddModal && (
        <AddItemModal
          editingItem={editingItem}
          onClose={() => {
            setShowAddModal(false);
            setEditingItem(null);
          }}
          onSaved={loadItems}
          onItemCreated={handleItemUpdated}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          itemName={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
