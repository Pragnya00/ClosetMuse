import { useEffect, useState, useCallback } from 'react';
import { MoreVertical, Edit2, Trash2, Sparkles, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { WardrobeItem } from '@/types/wardrobe';
import { getItemImageUrl, analyzeWardrobeItem } from '@/lib/wardrobe';
import AiAnalysisPanel from '@/components/AiAnalysisPanel';

interface Props {
  item: WardrobeItem;
  onEdit: (item: WardrobeItem) => void;
  onDelete: (item: WardrobeItem) => void;
  onUpdated: (item: WardrobeItem) => void;
}

export default function WardrobeItemCard({ item, onEdit, onDelete, onUpdated }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [quickAnalysing, setQuickAnalysing] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  useEffect(() => {
    getItemImageUrl(item.image_path).then(setImageUrl);
  }, [item.image_path]);

  // Trigger analysis without opening the panel (from card button)
  const handleQuickAnalyse = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setQuickError(null);
    setQuickAnalysing(true);
    try {
      const attrs = await analyzeWardrobeItem(item.id, false);
      onUpdated({
        ...item,
        ai_attributes: attrs,
        ai_status: 'ready',
        ai_error: null,
        ai_analyzed_at: new Date().toISOString(),
      });
      // Open panel immediately so user sees the result
      setShowPanel(true);
    } catch (err) {
      console.error('[AI Analysis] handleQuickAnalyse failed:', err);
      const msg = err instanceof Error ? err.message : 'Analysis failed.';
      setQuickError(msg);
      onUpdated({ ...item, ai_status: 'failed', ai_error: msg });
    } finally {
      setQuickAnalysing(false);
    }
  }, [item, onUpdated]);

  const aiStatus = item.ai_status;

  // Status badge at bottom of image
  const StatusBadge = () => {
    if (quickAnalysing || aiStatus === 'analyzing') {
      return (
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-amber-50/95 backdrop-blur-sm rounded-lg text-xs font-medium text-amber-700">
          <Loader2 className="w-3 h-3 animate-spin" />
          Analysing…
        </div>
      );
    }
    if (aiStatus === 'ready') {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); setShowPanel(true); }}
          className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50/95 backdrop-blur-sm rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          <CheckCircle2 className="w-3 h-3" />
          AI Ready
        </button>
      );
    }
    if (aiStatus === 'failed') {
      return (
        <div
          title={item.ai_error ?? 'Analysis failed'}
          className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-red-50/95 backdrop-blur-sm rounded-lg text-xs font-medium text-red-700"
        >
          <AlertCircle className="w-3 h-3" />
          Failed
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <div className="card overflow-hidden group fade-in-up hover:shadow-md transition-shadow duration-300">
        {/* Image */}
        <div className="relative aspect-square bg-stone-100 overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-stone-200" />
          )}

          {/* Category badge */}
          <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-stone-700 capitalize">
            {item.category}
          </div>

          {/* AI status badge */}
          <StatusBadge />

          {/* Quick-analyse sparkle button (shown on hover when not yet analysed) */}
          {(aiStatus === 'none' || aiStatus === 'failed') && !quickAnalysing && (
            <button
              onClick={handleQuickAnalyse}
              title="Analyse with AI"
              className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-stone-700 opacity-0 group-hover:opacity-100 hover:bg-amber-50 hover:text-amber-700 transition-all duration-200"
            >
              <Sparkles className="w-3 h-3" />
              Analyse
            </button>
          )}

          {/* Action menu */}
          <div className="absolute top-3 right-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-stone-600 hover:bg-white hover:text-stone-900 transition-all shadow-sm"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-1 z-20 bg-white rounded-xl shadow-xl border border-stone-100 py-1 w-40 scale-in">
                  <button
                    onClick={() => { setMenuOpen(false); onEdit(item); }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); setShowPanel(true); }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Analysis
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(item); }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quick-error tooltip — placed outside the image container to avoid overflow clipping */}
        {quickError && (
          <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700 mx-3 mt-1">
            {quickError}
          </div>
        )}

        {/* Info */}
        <div className="p-4">
          <h3 className="font-medium text-stone-900 truncate">{item.name}</h3>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {item.color && (
              <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-xs">{item.color}</span>
            )}
            {item.season && (
              <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-xs capitalize">
                {item.season}
              </span>
            )}
            {item.brand && (
              <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-xs">{item.brand}</span>
            )}
            {/* Show AI-detected primary colour if no manual colour set */}
            {!item.color && item.ai_attributes?.primary_colour && (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                {item.ai_attributes.primary_colour}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* AI Analysis Panel */}
      {showPanel && (
        <AiAnalysisPanel
          item={item}
          onClose={() => setShowPanel(false)}
          onUpdated={(updated) => {
            onUpdated(updated);
          }}
        />
      )}
    </>
  );
}
