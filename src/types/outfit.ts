/** An outfit suggested by the AI (not saved yet). */
export interface OutfitSuggestion {
  name: string;
  explanation: string;
  /** wardrobe_items.id values, in the order the AI listed them */
  itemIds: string[];
}

/** A row from saved_outfits with its item ids from saved_outfit_items. */
export interface SavedOutfit {
  id: string;
  name: string;
  explanation: string | null;
  created_at: string;
  /** wardrobe_items.id values, ordered by sort_order */
  itemIds: string[];
}
