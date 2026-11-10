import { useEffect, useState, type ReactNode } from 'react';
import type { WardrobeItem } from '@/types/wardrobe';
import { getItemImageUrl } from '@/lib/wardrobe';

function Piece({ item }: { item: WardrobeItem }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getItemImageUrl(item.image_path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [item.image_path]);

  return (
    <div className="min-w-0">
      <div className="aspect-square rounded-xl overflow-hidden bg-stone-100">
        {url && <img src={url} alt={item.name} className="w-full h-full object-cover" />}
      </div>
      <p className="mt-1.5 text-xs text-stone-600 truncate" title={item.name}>
        {item.name}
      </p>
    </div>
  );
}

interface Props {
  name: string;
  explanation: string | null;
  /** Only items that still exist in the wardrobe. */
  items: WardrobeItem[];
  /** Shown when some pieces were removed from the wardrobe after saving. */
  incompleteNote?: string | null;
  actions: ReactNode;
}

export default function OutfitCard({ name, explanation, items, incompleteNote, actions }: Props) {
  const cols = items.length >= 4 ? 'grid-cols-4' : items.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="card p-5 flex flex-col fade-in-up">
      <h3 className="text-lg font-semibold text-stone-900 mb-3">{name}</h3>

      <div className={`grid ${cols} gap-3`}>
        {items.map((item) => (
          <Piece key={item.id} item={item} />
        ))}
      </div>

      {explanation && <p className="mt-4 text-sm text-stone-600 leading-relaxed">{explanation}</p>}

      {incompleteNote && (
        <p className="mt-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
          {incompleteNote}
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-end gap-2">{actions}</div>
    </div>
  );
}
