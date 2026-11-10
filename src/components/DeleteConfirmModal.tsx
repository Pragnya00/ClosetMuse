import { AlertCircle } from 'lucide-react';

interface Props {
  itemName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export default function DeleteConfirmModal({ itemName, onConfirm, onCancel, loading }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm fade-in">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 scale-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 bg-red-50 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-stone-900">Delete this item?</h2>
        </div>
        <p className="text-sm text-stone-500 mb-6">
          "{itemName}" will be permanently removed from your wardrobe. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
