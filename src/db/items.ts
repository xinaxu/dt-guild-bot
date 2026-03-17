import type { ItemInfo } from '../utils/embeds.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ─── Static item catalog loaded from items.json at startup ──────────────────

interface ItemJsonEntry {
  category: string;
  items: Record<string, string>; // { "Item Name": "<:emoji:id>" }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load items once at module init (program startup)
// At runtime: __dirname = dist/sheets/, items.json lives at src/items.json
// Go up 2 levels (dist/sheets → dist → project root) then into src/
const rawJson = readFileSync(join(__dirname, '..', '..', 'src', 'items.json'), 'utf-8');
const itemJsonEntries: ItemJsonEntry[] = JSON.parse(rawJson);

const ALL_ITEMS: ItemInfo[] = [];
for (const entry of itemJsonEntries) {
  for (const [name, icon] of Object.entries(entry.items)) {
    ALL_ITEMS.push({ name, category: entry.category, icon });
  }
}

console.log(`✅ Loaded ${ALL_ITEMS.length} item(s) from items.json`);

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns all items from the static catalog.
 */
export function getItems(): ItemInfo[] {
  return ALL_ITEMS;
}

/**
 * Returns unique category names.
 */
export function getCategories(): string[] {
  const categories = new Set<string>();
  for (const item of ALL_ITEMS) {
    if (item.category) categories.add(item.category);
  }
  return [...categories];
}

/**
 * Looks up an item by its name.
 */
export function getItemByName(name: string): ItemInfo | undefined {
  return ALL_ITEMS.find((item) => item.name === name);
}

/**
 * Sanitize a string for use as a Google Sheet tab name.
 * Tab names cannot contain: / \\ * ? : [ ]
 */
export function sanitizeTabName(name: string): string {
  return name.replace(/[/\\\\*?:[\\]]/g, '_');
}
