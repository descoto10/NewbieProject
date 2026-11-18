// Product + creative agent: 3-5 designs per niche, screened for trademarks and
// look-alikes before anything goes live. v0 uses phrase templates; next is an image model
// plus a learned creative score. Owner: Person 3

import { mulberry32 } from '../core/rng.ts';

export interface Design {
  id: string;
  nicheId: string;
  title: string;
  product: 'tee' | 'hoodie' | 'mug' | 'poster' | 'printable';
  score: number;             // 0-1 creative score (placeholder heuristic)
  screening: 'passed' | 'flagged';
  flagReason?: string;
}

// Words that must never appear in a design (brands, characters, leagues).
export const TRADEMARK_BLOCKLIST = [
  'nike', 'just do it', 'disney', 'marvel', 'pokemon', 'pikachu', 'nfl', 'nba', 'starbucks',
  'patagonia', 'the north face', 'yeti', 'harry potter', 'star wars', 'hello kitty',
];

// Existing listings we must not copy (stand-in for a marketplace similarity search).
export const EXISTING_LISTINGS = [
  'not all who wander are lost mountain tee',
  'crazy plant lady mug',
  'cat dad like a regular dad but cooler',
];

const BANK: Record<string, { product: Design['product']; phrases: string[] }> = {
  hiking: { product: 'tee', phrases: ['Sunset Switchback Club', 'Elevation Over Everything', 'Trail Mix Enthusiast', 'Not All Who Wander Are Lost Mountain', 'Just Hike It', 'Weekend Summit Society'] },
  plants: { product: 'mug', phrases: ['Photosynthesis Is My Cardio', 'Crazy Plant Lady', 'Root Mean Squared', 'Leaf Me Alone', 'Monstera Mondays'] },
  nurse: { product: 'tee', phrases: ['Powered By Night Shift', 'Running On Coffee And Charting', '3AM Club', 'Scrub Life'] },
  climb: { product: 'hoodie', phrases: ['Send It Quietly', 'Chalk Up', 'Crimp Season', 'The North Face Of Monday', 'Beta Spray Not Welcome'] },
  cats: { product: 'mug', phrases: ['Cat Dad Like A Regular Dad But Cooler', 'Professional Lap', 'Purrsonal Space', 'Fur Real Tired'] },
  study: { product: 'printable', phrases: ['Finals Week Survival Planner', 'Semester At A Glance', 'Deep Work Tracker', 'Pomodoro Grid'] },
  gym: { product: 'tee', phrases: ['Leg Day Survivor', 'Rest Day Rebel', 'Spotter Wanted', 'Just Do It Again'] },
  vinyl: { product: 'poster', phrases: ['Side B Society', 'Needle Drop', 'Crate Digger', 'Analog Heart'] },
};

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean));

export function jaccard(a: string, b: string): number {
  const A = words(a), B = words(b);
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
}

export function screenDesign(title: string): { ok: boolean; reason?: string } {
  const t = title.toLowerCase();
  const hit = TRADEMARK_BLOCKLIST.find(w => t.includes(w));
  if (hit) return { ok: false, reason: `trademark: "${hit}"` };
  const similar = EXISTING_LISTINGS.find(l => jaccard(title, l) >= 0.6);
  if (similar) return { ok: false, reason: `too similar to existing listing "${similar}"` };
  return { ok: true };
}

/** Generate n candidate designs (default 5) and screen each one. */
export function generateDesigns(nicheId: string, n = 5, seed = 1): Design[] {
  const bank = BANK[nicheId];
  if (!bank) return [];
  const rng = mulberry32(seed + nicheId.length * 31);
  return bank.phrases.slice(0, Math.min(n, bank.phrases.length)).map((title, i) => {
    const s = screenDesign(title);
    return {
      id: `${nicheId}_d${i + 1}`, nicheId, title, product: bank.product,
      score: Math.round((0.45 + rng() * 0.5) * 100) / 100,
      screening: s.ok ? 'passed' : 'flagged', flagReason: s.reason,
    };
  });
}

/** Only screened designs go live; best-scoring first. */
export const launchable = (designs: Design[]) =>
  designs.filter(d => d.screening === 'passed').sort((a, b) => b.score - a.score);
