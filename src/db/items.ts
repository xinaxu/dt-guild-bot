import type { ItemInfo } from '../utils/embeds.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ─── Static item catalog loaded from items.json at startup ──────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load items once at module init (program startup)
// At runtime: __dirname = dist/sheets/, items.json lives at src/items.json
// Go up 2 levels (dist/sheets → dist → project root) then into src/
const rawJson = readFileSync(join(__dirname, '..', '..', 'src', 'items.json'), 'utf-8');
const itemJsonEntries: unknown = JSON.parse(rawJson);

// ─── Input Validation ────────────────────────────────────────────────────────
if (!Array.isArray(itemJsonEntries)) {
  throw new Error('items.json must be a JSON array');
}

const ALL_ITEMS: ItemInfo[] = [];
for (let i = 0; i < itemJsonEntries.length; i++) {
  const entry = itemJsonEntries[i] as Record<string, unknown>;
  if (!entry || typeof entry !== 'object') {
    throw new Error(`items.json[${i}]: each entry must be an object`);
  }
  if (typeof entry.category !== 'string' || !entry.category) {
    throw new Error(`items.json[${i}]: missing or invalid "category" (must be a non-empty string)`);
  }
  if (!entry.items || typeof entry.items !== 'object' || Array.isArray(entry.items)) {
    throw new Error(`items.json[${i}]: missing or invalid "items" (must be an object)`);
  }
  const items = entry.items as Record<string, string>;
  const itemCount = Object.keys(items).length;
  if (itemCount > 25) {
    throw new Error(`items.json[${i}] category "${entry.category}": has ${itemCount} items, max is 25 (Discord select menu limit)`);
  }
  for (const [name, icon] of Object.entries(items)) {
    if (typeof icon !== 'string') {
      throw new Error(`items.json[${i}] item "${name}": icon must be a string`);
    }
    if (icon && !icon.match(/^<a?:\w+:\d+>$/)) {
      console.warn(`⚠️ items.json[${i}] item "${name}": icon "${icon}" may not be a valid Discord custom emoji`);
    }
    ALL_ITEMS.push({ name, category: entry.category, icon });
  }
}

console.log(`✅ Loaded ${ALL_ITEMS.length} item(s) from items.json (${itemJsonEntries.length} categories)`);

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
