import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from 'discord.js';
import type { ItemInfo } from './embeds.js';

const DEFAULT_ICON = '📦';

function getIcon(icon: string | undefined | null): string {
  return icon && icon.trim() ? icon.trim() : DEFAULT_ICON;
}

// ─── Paginated Quantity Selection (for /auction) ────────────────────────────

const ITEMS_PER_AUCTION_PAGE = 4;
const MAX_QTY = 10;

export interface AuctionPaginationState {
  items: ItemInfo[];
  quantities: Map<string, number>;
  currentPage: number;
  totalPages: number;
}

const auctionStates = new Map<string, AuctionPaginationState>();

export function createAuctionPagination(
  interactionId: string,
  items: ItemInfo[],
): AuctionPaginationState {
  const state: AuctionPaginationState = {
    items,
    quantities: new Map(),
    currentPage: 0,
    totalPages: Math.ceil(items.length / ITEMS_PER_AUCTION_PAGE),
  };
  auctionStates.set(interactionId, state);

  // Auto-expire after 14 minutes
  setTimeout(
    () => auctionStates.delete(interactionId),
    14 * 60 * 1000,
  );

  return state;
}

export function getAuctionState(
  interactionId: string,
): AuctionPaginationState | undefined {
  return auctionStates.get(interactionId);
}

export function deleteAuctionState(interactionId: string): void {
  auctionStates.delete(interactionId);
}

/**
 * Builds the message components for a single auction page.
 */
export function buildAuctionPage(state: AuctionPaginationState): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
} {
  const start = state.currentPage * ITEMS_PER_AUCTION_PAGE;
  const pageItems = state.items.slice(
    start,
    start + ITEMS_PER_AUCTION_PAGE,
  );

  // Group page items by category for the embed description
  const lines: string[] = [];
  let lastCategory = '';
  for (let i = 0; i < pageItems.length; i++) {
    const item = pageItems[i];
    const cat = item.category || 'Uncategorized';
    if (cat !== lastCategory) {
      // Check if this category started on a previous page
      const firstOfCat = state.items.findIndex(
        (it) => (it.category || 'Uncategorized') === cat,
      );
      if (firstOfCat < start) {
        lines.push(`\n**${cat}** (cont.)`);
      } else {
        lines.push(`\n**${cat}**`);
      }
      lastCategory = cat;
    }
    const currentQty = state.quantities.get(item.name) ?? 0;
    const qtyLabel = currentQty === 0 ? 'Skip' : `${currentQty}`;
    lines.push(`${getIcon(item.icon)} ${item.name} — Qty: **${qtyLabel}**`);
  }

  const embed = new EmbedBuilder()
    .setTitle(
      `🎯 Today's Auction Setup (Page ${state.currentPage + 1}/${state.totalPages})`,
    )
    .setDescription(lines.join('\n'))
    .setColor(0x5865f2)
    .setFooter({ text: 'Select quantity for each item, then click Done' });

  // Build select menus (1 per item on this page)
  const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];
  for (let i = 0; i < pageItems.length; i++) {
    const item = pageItems[i];
    const currentQty = state.quantities.get(item.name) ?? 0;

    const options = [
      { label: 'Skip', value: '0', default: currentQty === 0 },
      ...Array.from({ length: MAX_QTY }, (_, n) => ({
        label: `${n + 1}`,
        value: `${n + 1}`,
        default: currentQty === n + 1,
      })),
    ];

    const select = new StringSelectMenuBuilder()
      .setCustomId(`auction_qty_${item.name}`)
      .setPlaceholder(`${getIcon(item.icon)} ${item.name}: ${currentQty === 0 ? 'Skip' : currentQty}`)
      .addOptions(options);

    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    );
  }

  // Pagination + Done buttons
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('auction_prev')
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentPage === 0),
    new ButtonBuilder()
      .setCustomId('auction_page_indicator')
      .setLabel(`Page ${state.currentPage + 1}/${state.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('auction_next')
      .setLabel('▶ Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentPage >= state.totalPages - 1),
    new ButtonBuilder()
      .setCustomId('auction_done')
      .setLabel('✅ Done')
      .setStyle(ButtonStyle.Success),
  );
  components.push(buttonRow);

  return { embeds: [embed], components };
}

// ─── Paginated MySubs Viewer (for /mysubs) ───────────────────────────────────

export interface MySubsPaginationState {
  embeds: EmbedBuilder[];
  categories: string[];
  currentPage: number;
  userId: string;
}

const mySubsStates = new Map<string, MySubsPaginationState>();

export function createMySubsPagination(
  interactionId: string,
  embeds: EmbedBuilder[],
  categories: string[],
  userId: string,
): MySubsPaginationState {
  const state: MySubsPaginationState = {
    embeds,
    categories,
    currentPage: 0,
    userId,
  };
  mySubsStates.set(interactionId, state);

  setTimeout(
    () => mySubsStates.delete(interactionId),
    14 * 60 * 1000,
  );

  return state;
}

export function getMySubsState(
  interactionId: string,
): MySubsPaginationState | undefined {
  return mySubsStates.get(interactionId);
}

export function deleteMySubsState(interactionId: string): void {
  mySubsStates.delete(interactionId);
}

export function buildMySubsPage(
  state: MySubsPaginationState,
  canSubscribe: boolean,
  canUnsubscribe: boolean
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const isOnePage = state.categories.length <= 1;

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('mysubs_prev')
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isOnePage || state.currentPage === 0),
    new ButtonBuilder()
      .setCustomId('mysubs_sub')
      .setLabel('➕ Subscribe')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canSubscribe),
    new ButtonBuilder()
      .setCustomId('mysubs_unsub')
      .setLabel('➖ Unsubscribe')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canUnsubscribe),
    new ButtonBuilder()
      .setCustomId('mysubs_next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isOnePage || state.currentPage >= state.categories.length - 1),
  );

  return {
    embeds: [state.embeds[state.currentPage] || state.embeds[0]],
    components: [buttonRow],
  };
}


// ─── Paginated Multi-Select (for /items remove, /mysubs sub/unsub) ─────────

const ITEMS_PER_SELECT_PAGE = 25;

export interface SelectPaginationState {
  items: ItemInfo[];
  selected: Set<string>;
  currentPage: number;
  totalPages: number;
  purpose: string; // e.g. 'remove_items', 'subscribe', 'unsubscribe'
}

const selectStates = new Map<string, SelectPaginationState>();

export function createSelectPagination(
  interactionId: string,
  items: ItemInfo[],
  purpose: string,
): SelectPaginationState {
  const state: SelectPaginationState = {
    items,
    selected: new Set(),
    currentPage: 0,
    totalPages: Math.max(1, Math.ceil(items.length / ITEMS_PER_SELECT_PAGE)),
    purpose,
  };
  selectStates.set(interactionId, state);

  setTimeout(
    () => selectStates.delete(interactionId),
    14 * 60 * 1000,
  );

  return state;
}

export function getSelectState(
  interactionId: string,
): SelectPaginationState | undefined {
  return selectStates.get(interactionId);
}

export function deleteSelectState(interactionId: string): void {
  selectStates.delete(interactionId);
}

/**
 * Builds the message components for a paginated multi-select.
 */
export function buildSelectPage(
  state: SelectPaginationState,
  title: string,
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
} {
  const start = state.currentPage * ITEMS_PER_SELECT_PAGE;
  const pageItems = state.items.slice(
    start,
    start + ITEMS_PER_SELECT_PAGE,
  );

  const selectedCount = state.selected.size;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      `Page ${state.currentPage + 1}/${state.totalPages} — ${selectedCount} selected`,
    )
    .setColor(0x5865f2);

  const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  if (pageItems.length > 0) {
    const options = pageItems.map((item) => {
      // Parse custom emoji string (e.g. <:name:123> or <a:name:123>) into emoji object
      const emojiMatch = item.icon?.match(/^<(a?):(\w+):(\d+)>$/);
      const emoji = emojiMatch
        ? { id: emojiMatch[3], name: emojiMatch[2], animated: emojiMatch[1] === 'a' }
        : undefined;
      return {
        label: item.name,
        value: item.name,
        description: item.category || undefined,
        emoji,
        default: state.selected.has(item.name),
      };
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId(`select_${state.purpose}`)
      .setPlaceholder('Select items...')
      .setMinValues(0)
      .setMaxValues(pageItems.length)
      .addOptions(options);

    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    );
  }

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`select_prev_${state.purpose}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentPage === 0),
    new ButtonBuilder()
      .setCustomId(`select_page_${state.purpose}`)
      .setLabel(`Page ${state.currentPage + 1}/${state.totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`select_next_${state.purpose}`)
      .setLabel('▶ Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentPage >= state.totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`select_done_${state.purpose}`)
      .setLabel('✅ Done')
      .setStyle(ButtonStyle.Success),
  );
  components.push(buttonRow);

  return { embeds: [embed], components };
}

/**
 * Handles a select menu interaction for paginated select.
 * Updates the selected set based on current page selections.
 */
export function handleSelectMenuUpdate(
  state: SelectPaginationState,
  selectedValues: string[],
): void {
  // Clear selections for current page items first
  const start = state.currentPage * ITEMS_PER_SELECT_PAGE;
  const pageItems = state.items.slice(
    start,
    start + ITEMS_PER_SELECT_PAGE,
  );
  for (const item of pageItems) {
    state.selected.delete(item.name);
  }
  // Re-add the ones that are selected
  for (const value of selectedValues) {
    state.selected.add(value);
  }
}
