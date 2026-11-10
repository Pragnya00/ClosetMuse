export type Category = 'tops' | 'bottoms' | 'outerwear' | 'dresses' | 'shoes' | 'accessories' | 'other';
export type Season = 'spring' | 'summer' | 'fall' | 'winter' | 'all';
export type AiStatus = 'none' | 'analyzing' | 'ready' | 'failed';

export interface ClothingAttributes {
  category: string | null;
  subcategory: string | null;
  primary_colour: string | null;
  secondary_colours: string[];
  colour_details: string | null;
  pattern: string | null;
  visible_fabric_characteristics: string[];
  texture: string | null;
  style: string | null;
  visible_attributes: string[];
}

export interface AiAnalysis extends ClothingAttributes {
  confidence: number;
}

export interface WardrobeItem {
  id: string;
  user_id: string;
  name: string;
  category: Category;
  color: string | null;
  season: Season | null;
  brand: string | null;
  notes: string | null;
  image_path: string;
  created_at: string;
  updated_at: string;
  ai_attributes: AiAnalysis | null;
  ai_status: AiStatus;
  ai_error: string | null;
  ai_image_hash: string | null;
  ai_analyzed_at: string | null;
  user_attributes: ClothingAttributes | null;
  attributes_confirmed_at: string | null;
}

export type WardrobeItemInput = Pick<
  WardrobeItem,
  'name' | 'category' | 'color' | 'season' | 'brand' | 'notes' | 'image_path'
>;

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'tops', label: 'Tops' },
  { value: 'bottoms', label: 'Bottoms' },
  { value: 'outerwear', label: 'Outerwear' },
  { value: 'dresses', label: 'Dresses' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'other', label: 'Other' },
];

export const SEASONS: { value: Season; label: string }[] = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
  { value: 'all', label: 'All Seasons' },
];
