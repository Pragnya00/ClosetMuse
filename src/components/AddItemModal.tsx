import { useState, useEffect, useRef, type FormEvent } from 'react';
import { X, Upload, Loader2, ImageIcon, Sparkles } from 'lucide-react';
import {
  CATEGORIES,
  SEASONS,
  type WardrobeItem,
  type Category,
  type Season,
} from '@/types/wardrobe';
import {
  uploadItemImage,
  createWardrobeItem,
  updateWardrobeItem,
  getItemImageUrl,
  analyzeWardrobeItem,
} from '@/lib/wardrobe';
import { useAuth } from '@/context/AuthContext';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  /**
   * Called with the full saved item immediately after creation so the parent can
   * add it to its list and trigger an in-place AI status update later.
   */
  onItemCreated?: (item: WardrobeItem) => void;
  editingItem?: WardrobeItem | null;
}

export default function AddItemModal({ onClose, onSaved, onItemCreated, editingItem }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(editingItem?.name ?? '');
  const [category, setCategory] = useState<Category>(editingItem?.category ?? 'tops');
  const [color, setColor] = useState(editingItem?.color ?? '');
  const [season, setSeason] = useState<Season | ''>(editingItem?.season ?? '');
  const [brand, setBrand] = useState(editingItem?.brand ?? '');
  const [notes, setNotes] = useState(editingItem?.notes ?? '');
  const [autoAnalyse, setAutoAnalyse] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing image preview when editing
  useEffect(() => {
    if (editingItem?.image_path) {
      getItemImageUrl(editingItem.image_path).then((url) => {
        if (url) setPreviewUrl(url);
      });
    }
  }, [editingItem]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB.');
      return;
    }

    setFile(selected);
    setError(null);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!editingItem && !file) {
      setError('Please upload an image of your clothing item.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (editingItem) {
        // ── Edit existing item ──────────────────────────────────────────────
        let imagePath = editingItem.image_path;
        if (file) {
          imagePath = await uploadItemImage(file, user.id);
        }
        await updateWardrobeItem(editingItem.id, {
          name,
          category,
          color: color || null,
          season: (season || null) as Season | null,
          brand: brand || null,
          notes: notes || null,
          image_path: imagePath,
        });
        onSaved();
        onClose();
      } else {
        // ── Create new item ─────────────────────────────────────────────────
        const imagePath = await uploadItemImage(file!, user.id);
        const newItem = await createWardrobeItem({
          name,
          category,
          color: color || null,
          season: (season || null) as Season | null,
          brand: brand || null,
          notes: notes || null,
          image_path: imagePath,
        });

        // Notify parent immediately so the item appears in the grid
        onItemCreated?.(newItem);
        onSaved();
        onClose();

        // Fire-and-forget background analysis (does not block the modal close)
        if (autoAnalyse) {
          analyzeWardrobeItem(newItem.id, false)
            .then((attrs) => {
              onItemCreated?.({
                ...newItem,
                ai_attributes: attrs,
                ai_status: 'ready',
                ai_error: null,
                ai_analyzed_at: new Date().toISOString(),
              });
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : 'Analysis failed.';
              onItemCreated?.({ ...newItem, ai_status: 'failed', ai_error: msg });
            });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm fade-in">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-xl font-semibold text-stone-900">
            {editingItem ? 'Edit Item' : 'Add to Wardrobe'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Item Photo</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative cursor-pointer group"
            >
              {previewUrl ? (
                <div className="relative w-full h-52 rounded-xl overflow-hidden bg-stone-100">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/30 transition-all duration-300 flex items-center justify-center">
                    <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">
                      Change photo
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full h-52 rounded-xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center gap-2 text-stone-400 hover:border-stone-300 hover:bg-stone-50 transition-all">
                  <ImageIcon className="w-8 h-8" strokeWidth={1.5} />
                  <span className="text-sm">Click to upload an image</span>
                  <span className="text-xs text-stone-300">PNG, JPG up to 10 MB</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Blue Denim Jacket"
              className="input-field"
            />
          </div>

          {/* Category + Color */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="select-field"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Color</label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="e.g. Navy blue"
                className="input-field"
              />
            </div>
          </div>

          {/* Season + Brand */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Season</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value as Season)}
                className="select-field"
              >
                <option value="">Any season</option>
                {SEASONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Brand</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Levi's"
                className="input-field"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details about fit, material, etc."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          {/* Auto-analyse toggle (only for new items) */}
          {!editingItem && (
            <label className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors">
              <input
                type="checkbox"
                checked={autoAnalyse}
                onChange={(e) => setAutoAnalyse(e.target.checked)}
                className="w-4 h-4 accent-stone-900"
              />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Analyse with AI after saving
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Gemini will detect category, colour, pattern and style from your photo.
                </p>
              </div>
            </label>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>{editingItem ? 'Save Changes' : 'Add Item'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
