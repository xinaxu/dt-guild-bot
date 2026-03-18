import {
  type ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { requireMember, isAdmin } from '../utils/permissions.js';
import { buildMySubsEmbed } from '../utils/embeds.js';
import { getItems } from '../db/items.js';
import {
  getUserSubscriptions,
  subscribe,
  unsubscribe,
} from '../db/subscriptions.js';
import {
  buildSelectPage,
  getSelectState,
  handleSelectMenuUpdate,
  createMySubsPagination,
  getMySubsState,
  buildMySubsPage,
} from '../utils/pagination.js';
import type { GuildMember } from 'discord.js';

// Track target user per message for button interactions
const targetUsers = new Map<string, { id: string; displayName: string }>();

export function getTargetUser(
  messageId: string,
): { id: string; displayName: string } | undefined {
  return targetUsers.get(messageId);
}

export async function handleSubCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireMember(interaction))) return;

  const callerMember = interaction.member as GuildMember;

  // Admin: show user select menu first
  if (await isAdmin(interaction.guildId!, callerMember)) {

    const selectRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('sub_user_select')
        .setPlaceholder('Select a member to manage...'),
    );

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('sub_view_own')
        .setLabel('📋 View My Own')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      content: '**Manage Subscriptions**\nSelect a member, or view your own:',
      components: [selectRow, buttonRow],
    });
    return;
  }

  // Member: go straight to their own subscriptions
  await showSubsForUser(interaction, callerMember.id, callerMember.displayName);
}

/**
 * Admin selected a user from the user select menu.
 */
export async function handleSubUserSelect(
  interaction: import('discord.js').UserSelectMenuInteraction,
): Promise<void> {
  await interaction.update({
    content: '⏳ Loading their subscriptions...',
    embeds: [],
    components: [],
  });

  const targetUserId = interaction.values[0];

  let targetDisplayName: string;
  try {
    const targetMember = await interaction.guild!.members.fetch(targetUserId);
    targetDisplayName = targetMember.displayName;
  } catch {
    targetDisplayName = `User ${targetUserId}`;
  }

  await showSubsForUser(interaction, targetUserId, targetDisplayName, true);
}

/**
 * Admin clicked "View My Own" button.
 */
async function getCategorySubState(
  guildId: string,
  userId: string,
  category: string
): Promise<{ canSubscribe: boolean; canUnsubscribe: boolean }> {
  if (category === 'None') {
    return { canSubscribe: true, canUnsubscribe: false };
  }
  const allItems = getItems();
  const userSubs = await getUserSubscriptions(guildId, userId);
  
  const catItemsCount = allItems.filter(i => (i.category || 'Uncategorized') === category).length;
  const catSubsCount = userSubs.filter(s => (s.category || 'Uncategorized') === category).length;
  
  return {
    canSubscribe: catSubsCount < catItemsCount,
    canUnsubscribe: catSubsCount > 0
  };
}

/**
 * Handles "View My Subs" action from /auction select.
 */
export async function handleSubViewOwn(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  // Immediately show loading state so the user knows it's processing
  await interaction.update({
    content: '⏳ Loading your subscriptions...',
    embeds: [],
    components: [],
  });

  const member = interaction.member as GuildMember;

  const subs = await getUserSubscriptions(interaction.guildId!, member.id);
  const allCategories = [...new Set(getItems().map((i) => i.category || 'Uncategorized'))].sort();
  const { embeds, categories } = buildMySubsEmbed(subs, member.displayName, allCategories);

  const state = createMySubsPagination(interaction.message.id, embeds, categories, member.id);
  const currentCategory = state.categories[state.currentPage];
  const { canSubscribe, canUnsubscribe } = await getCategorySubState(interaction.guildId!, member.id, currentCategory);
  const page = buildMySubsPage(state, canSubscribe, canUnsubscribe);

  await interaction.editReply({
    content: null,
    embeds: page.embeds,
    components: page.components,
  });

  targetUsers.set(interaction.message.id, { id: member.id, displayName: member.displayName });
  setTimeout(() => targetUsers.delete(interaction.message.id), 14 * 60 * 1000);
}

/**
 * Shows subscriptions for a given user with subscribe/unsubscribe buttons.
 */
async function showSubsForUser(
  interaction: ChatInputCommandInteraction | import('discord.js').UserSelectMenuInteraction | import('discord.js').ButtonInteraction,
  userId: string,
  displayName: string,
  isUpdate = false,
): Promise<void> {
  // Always defer immediately to avoid 3-second timeout
  if (isUpdate && 'deferUpdate' in interaction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
  } else if (!interaction.deferred && !interaction.replied && 'deferReply' in interaction) {
    await interaction.deferReply({ ephemeral: true });
  }

  const callerMember = interaction.member as GuildMember;
  const isProxy = userId !== callerMember.id;

  const subs = await getUserSubscriptions(interaction.guildId!, userId);
  const allCategories = [...new Set(getItems().map((i) => i.category || 'Uncategorized'))].sort();
  const { embeds, categories } = buildMySubsEmbed(subs, displayName, allCategories);

  if (isProxy && embeds.length > 0) {
    embeds.forEach(e => e.setTitle(`📋 ${displayName}'s Subscriptions (managed by you)`));
  }

  const messageId = isUpdate && 'message' in interaction ? interaction.message.id : 
                    (interaction.replied || interaction.deferred ? (await interaction.fetchReply()).id : interaction.id);

  const state = createMySubsPagination(messageId, embeds, categories, userId);
  const currentCategory = state.categories[state.currentPage];
  const { canSubscribe, canUnsubscribe } = await getCategorySubState(interaction.guildId!, userId, currentCategory);
  const page = buildMySubsPage(state, canSubscribe, canUnsubscribe);

  await interaction.editReply({
    content: null,
    embeds: page.embeds,
    components: page.components,
  });

  // Store the target user for subsequent button interactions
  targetUsers.set(messageId, { id: userId, displayName });
  setTimeout(() => targetUsers.delete(messageId), 14 * 60 * 1000);
}

// ─── Category → Item Selection State ─────────────────────────────────────────

interface SubSelectState {
  purpose: 'subscribe' | 'unsubscribe';
  items: import('../utils/embeds.js').ItemInfo[];   // available items
  selected: Set<string>;                         // selected item names (across all categories)
  currentCategory: string | null;
}

const subSelectStates = new Map<string, SubSelectState>();

function buildCategoryUI(state: SubSelectState, title: string) {
  // Group available items by category
  const categories = new Map<string, number>();
  for (const item of state.items) {
    const cat = item.category || 'Uncategorized';
    categories.set(cat, (categories.get(cat) ?? 0) + 1);
  }

  const selectedCount = state.selected.size;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      selectedCount > 0
        ? `${selectedCount} item(s) selected. Pick a category to add more, or click **Done**.`
        : 'Pick a category to browse items.',
    )
    .setColor(0x5865f2);

  if (selectedCount > 0) {
    const selectedList = [...state.selected].slice(0, 20).join(', ');
    embed.addFields({ name: 'Selected', value: selectedList + (state.selected.size > 20 ? '...' : '') });
  }

  const catOptions = [...categories.entries()].map(([cat, count]) => ({
    label: cat,
    value: cat,
    description: `${count} item(s)`,
  }));

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (catOptions.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`sub_category_${state.purpose}`)
      .setPlaceholder('Select a category...')
      .addOptions(catOptions);

    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    );
  }

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`sub_cat_done_${state.purpose}`)
      .setLabel(`✅ Done (${selectedCount} selected)`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(selectedCount === 0),
    new ButtonBuilder()
      .setCustomId('sub_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(buttonRow);

  return { embeds: [embed], components };
}

function buildItemsUI(state: SubSelectState, title: string) {
  const cat = state.currentCategory!;
  const catItems = state.items.filter((i) => (i.category || 'Uncategorized') === cat);

  if (catItems.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(`${title} — ${cat}`)
      .setDescription(`There are no items available to ${state.purpose} in this category!`)
      .setColor(0x5865f2);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`sub_back_${state.purpose}`)
        .setLabel('◀ Back to Categories')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('sub_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [buttonRow] };
  }

  const embed = new EmbedBuilder()
    .setTitle(`${title} — ${cat}`)
    .setDescription(`Select items from **${cat}**, then go back to pick another category or click Done.`)
    .setColor(0x5865f2);

  const options = catItems.map((item) => {
    const emojiMatch = item.icon?.match(/^<(a?):(\w+):(\d+)>$/);
    const emoji = emojiMatch
      ? { id: emojiMatch[3], name: emojiMatch[2], animated: emojiMatch[1] === 'a' }
      : undefined;
    return {
      label: item.name,
      value: item.name,
      emoji,
      default: state.selected.has(item.name),
    };
  });

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  // Discord select max 25 options — categories should always be under 25
  const select = new StringSelectMenuBuilder()
    .setCustomId(`sub_items_${state.purpose}`)
    .setPlaceholder('Select items...')
    .setMinValues(0)
    .setMaxValues(catItems.length)
    .addOptions(options);

  components.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
  );

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`sub_back_${state.purpose}`)
      .setLabel('◀ Back to Categories')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`sub_cat_done_${state.purpose}`)
      .setLabel(`✅ Done (${state.selected.size} selected)`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(state.selected.size === 0),
    new ButtonBuilder()
      .setCustomId('sub_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(buttonRow);

  return { embeds: [embed], components };
}

/**
 * Shows category select for subscribing to new items, or skips straight to
 * items if navigating from a paginated MySubs view.
 */
export async function handleSubscribeButton(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const target = targetUsers.get(interaction.message.id);
  const targetId = target?.id ?? (interaction.member as GuildMember).id;

  const allItems = getItems();
  const userSubs = await getUserSubscriptions(interaction.guildId!, targetId);
  const subscribedNames = new Set(userSubs.map((s) => s.name));

  const availableItems = allItems.filter(
    (item) => !subscribedNames.has(item.name),
  );

  if (availableItems.length === 0) {
    const who = target && target.id !== (interaction.member as GuildMember).id
      ? target.displayName
      : 'You';
    await interaction.reply({
      content: `${who === 'You' ? 'You are' : `${who} is`} already subscribed to all available items! 🎉`,
      ephemeral: true,
    });
    return;
  }

  // Check if we are coming from a paginated view
  const mySubsState = getMySubsState(interaction.message.id);
  const scopedCategory = mySubsState && mySubsState.categories.length > 0 
    ? mySubsState.categories[mySubsState.currentPage] 
    : null;

  const state: SubSelectState = {
    purpose: 'subscribe',
    items: availableItems,
    selected: new Set(),
    currentCategory: scopedCategory,
  };
  subSelectStates.set(interaction.message.id, state);

  if (scopedCategory && scopedCategory !== 'None') {
    const catItems = availableItems.filter((i) => (i.category || 'Uncategorized') === scopedCategory);
    if (catItems.length === 0) {
      subSelectStates.delete(interaction.message.id);
      await interaction.reply({
        content: `All items in **${scopedCategory}** are already subscribed! 🎉`,
        ephemeral: true,
      });
      return;
    }

    // Skip category select, go straight to items for this category
    const ui = buildItemsUI(state, '➕ Subscribe to Items');
    await interaction.update({ content: null, ...ui });
  } else {
    // Show normal category select
    const ui = buildCategoryUI(state, '➕ Subscribe to Items');
    await interaction.update({ content: null, ...ui });
  }
}

/**
 * Shows category select for unsubscribing from items, or skips straight to
 * items if navigating from a paginated MySubs view.
 */
export async function handleUnsubscribeButton(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const target = targetUsers.get(interaction.message.id);
  const targetId = target?.id ?? (interaction.member as GuildMember).id;

  const userSubs = await getUserSubscriptions(interaction.guildId!, targetId);

  if (userSubs.length === 0) {
    await interaction.reply({
      content: 'No active subscriptions to remove.',
      ephemeral: true,
    });
    return;
  }

  // Check if we are coming from a paginated view
  const mySubsState = getMySubsState(interaction.message.id);
  const scopedCategory = mySubsState && mySubsState.categories.length > 0 
    ? mySubsState.categories[mySubsState.currentPage] 
    : null;

  const state: SubSelectState = {
    purpose: 'unsubscribe',
    items: userSubs,
    selected: new Set(),
    currentCategory: scopedCategory,
  };
  subSelectStates.set(interaction.message.id, state);

  if (scopedCategory && scopedCategory !== 'None') {
    const catItems = userSubs.filter((i) => (i.category || 'Uncategorized') === scopedCategory);
    if (catItems.length === 0) {
      subSelectStates.delete(interaction.message.id);
      await interaction.reply({
        content: `No active subscriptions in **${scopedCategory}** to remove.`,
        ephemeral: true,
      });
      return;
    }

    // Skip category select, go straight to items for this category
    const ui = buildItemsUI(state, '➖ Unsubscribe from Items');
    await interaction.update({ content: null, ...ui });
  } else {
    const ui = buildCategoryUI(state, '➖ Unsubscribe from Items');
    await interaction.update({ content: null, ...ui });
  }
}

/**
 * User selected a category → show items in that category.
 */
export async function handleSubCategorySelect(
  interaction: import('discord.js').StringSelectMenuInteraction,
): Promise<void> {
  const state = subSelectStates.get(interaction.message.id);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Run `/auction sub` again.', ephemeral: true });
    return;
  }

  state.currentCategory = interaction.values[0];
  const title = state.purpose === 'subscribe' ? '➕ Subscribe to Items' : '➖ Unsubscribe from Items';
  const ui = buildItemsUI(state, title);
  await interaction.update({ content: null, ...ui });
}

/**
 * User selected/deselected items within a category.
 */
export async function handleSubItemsSelect(
  interaction: import('discord.js').StringSelectMenuInteraction,
): Promise<void> {
  const state = subSelectStates.get(interaction.message.id);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Run `/auction sub` again.', ephemeral: true });
    return;
  }

  // Clear current category's selections and re-add
  const catItems = state.items.filter((i) => (i.category || 'Uncategorized') === state.currentCategory);
  for (const item of catItems) {
    state.selected.delete(item.name);
  }
  for (const value of interaction.values) {
    state.selected.add(value);
  }

  const title = state.purpose === 'subscribe' ? '➕ Subscribe to Items' : '➖ Unsubscribe from Items';
  const ui = buildItemsUI(state, title);
  await interaction.update({ content: null, ...ui });
}

/**
 * User clicked "Back to Categories".
 */
export async function handleSubBackToCategories(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const purpose = interaction.customId.replace('sub_back_', '') as 'subscribe' | 'unsubscribe';
  const state = subSelectStates.get(interaction.message.id);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Run `/auction sub` again.', ephemeral: true });
    return;
  }

  state.currentCategory = null;
  const title = purpose === 'subscribe' ? '➕ Subscribe to Items' : '➖ Unsubscribe from Items';
  const ui = buildCategoryUI(state, title);
  await interaction.update({ content: null, ...ui });
}

/**
 * User clicked "Done" from category/item selection.
 */
export async function handleSubCatDone(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const purpose = interaction.customId.replace('sub_cat_done_', '') as 'subscribe' | 'unsubscribe';
  const state = subSelectStates.get(interaction.message.id);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Run `/auction sub` again.', ephemeral: true });
    return;
  }

  const selected = [...state.selected];
  subSelectStates.delete(interaction.message.id);

  if (purpose === 'subscribe') {
    await handleSubscribeDone(interaction, selected);
  } else {
    await handleUnsubscribeDone(interaction, selected);
  }
}

/**
 * User clicked "Cancel" from sub/unsub selection.
 */
export async function handleSubCancel(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const target = targetUsers.get(interaction.message.id);
  const targetId = target?.id ?? (interaction.member as GuildMember).id;
  const targetName = target?.displayName ?? (interaction.member as GuildMember).displayName;
  
  subSelectStates.delete(interaction.message.id);

  // Return to the MySubs view
  const updatedSubs = await getUserSubscriptions(interaction.guildId!, targetId);
  const allCategories = [...new Set(getItems().map((i) => i.category || 'Uncategorized'))].sort();
  const { embeds, categories } = buildMySubsEmbed(updatedSubs, targetName, allCategories);
  const isProxy = targetId !== (interaction.member as GuildMember).id;
  if (isProxy && embeds.length > 0) {
    embeds.forEach(e => e.setTitle(`📋 ${targetName}'s Subscriptions (managed by you)`));
  }

  const messageId = interaction.message.id;
  
  // Preserve the category page the user was on
  const oldState = getMySubsState(messageId);
  const oldCategory = oldState && oldState.categories.length > 0
    ? oldState.categories[oldState.currentPage]
    : null;

  const state = createMySubsPagination(messageId, embeds, categories, targetId);
  
  if (oldCategory) {
    const newIndex = categories.indexOf(oldCategory);
    if (newIndex !== -1) {
      state.currentPage = newIndex;
    }
  }

  const currentCategory = state.categories[state.currentPage];
  const { canSubscribe, canUnsubscribe } = await getCategorySubState(interaction.guildId!, targetId, currentCategory);
  const page = buildMySubsPage(state, canSubscribe, canUnsubscribe);

  await interaction.update({
    content: null,
    embeds: page.embeds,
    components: page.components,
  });
}

/**
 * Executes subscribe action.
 */
export async function handleSubscribeDone(
  interaction: import('discord.js').ButtonInteraction,
  selectedItems: string[],
): Promise<void> {
  if (selectedItems.length === 0) {
    await interaction.update({
      content: '❌ No items selected.',
      embeds: [],
      components: [],
    });
    return;
  }

  await interaction.update({
    content: '⏳ Subscribing...',
    embeds: [],
    components: [],
  });

  const target = targetUsers.get(interaction.message.id);
  const targetId = target?.id ?? (interaction.member as GuildMember).id;
  const targetName = target?.displayName ?? (interaction.member as GuildMember).displayName;
  const results: string[] = [];

  console.log(`[Subscribe] Processing ${selectedItems.length} items for user ${targetName} (${targetId})`);

  for (const itemName of selectedItems) {
    const success = await subscribe(interaction.guildId!, itemName, targetId, targetName);
    results.push(
      success
        ? `  ✅ ${itemName}`
        : `  ⚠️ ${itemName} (already subscribed)`,
    );
  }

  // Show updated subscription list
  const updatedSubs = await getUserSubscriptions(interaction.guildId!, targetId);
  const allCategories = [...new Set(getItems().map((i) => i.category || 'Uncategorized'))].sort();
  const { embeds, categories } = buildMySubsEmbed(updatedSubs, targetName, allCategories);
  const isProxy = targetId !== (interaction.member as GuildMember).id;
  if (isProxy && embeds.length > 0) {
    embeds.forEach(e => e.setTitle(`📋 ${targetName}'s Subscriptions (managed by you)`));
  }

  const messageId = interaction.message.id;
  
  // Preserve the category page the user was on
  const oldState = getMySubsState(messageId);
  const oldCategory = oldState && oldState.categories.length > 0
    ? oldState.categories[oldState.currentPage]
    : null;

  const state = createMySubsPagination(messageId, embeds, categories, targetId);
  
  if (oldCategory) {
    const newIndex = categories.indexOf(oldCategory);
    if (newIndex !== -1) {
      state.currentPage = newIndex;
    }
  }

  const currentCategory = state.categories[state.currentPage];
  const { canSubscribe, canUnsubscribe } = await getCategorySubState(interaction.guildId!, targetId, currentCategory);
  const page = buildMySubsPage(state, canSubscribe, canUnsubscribe);

  await interaction.editReply({
    content: `Subscription results for **${targetName}**:\n${results.join('\n')}`,
    embeds: page.embeds,
    components: page.components,
  });
}

/**
 * Executes unsubscribe action.
 */
export async function handleUnsubscribeDone(
  interaction: import('discord.js').ButtonInteraction,
  selectedItems: string[],
): Promise<void> {
  if (selectedItems.length === 0) {
    await interaction.update({
      content: '❌ No items selected.',
      embeds: [],
      components: [],
    });
    return;
  }

  await interaction.update({
    content: '⏳ Unsubscribing...',
    embeds: [],
    components: [],
  });

  const target = targetUsers.get(interaction.message.id);
  const targetId = target?.id ?? (interaction.member as GuildMember).id;
  const targetName = target?.displayName ?? (interaction.member as GuildMember).displayName;
  const results: string[] = [];

  console.log(`[Unsubscribe] Processing ${selectedItems.length} items for user ${targetName} (${targetId})`);

  for (const itemName of selectedItems) {
    const success = await unsubscribe(interaction.guildId!, itemName, targetId);
    results.push(
      success
        ? `  ✅ Removed from ${itemName}`
        : `  ⚠️ ${itemName} (not found)`,
    );
  }

  // Show updated subscription list
  const updatedSubs = await getUserSubscriptions(interaction.guildId!, targetId);
  const allCategories = [...new Set(getItems().map((i) => i.category || 'Uncategorized'))].sort();
  const { embeds, categories } = buildMySubsEmbed(updatedSubs, targetName, allCategories);
  const isProxy = targetId !== (interaction.member as GuildMember).id;
  if (isProxy && embeds.length > 0) {
    embeds.forEach(e => e.setTitle(`📋 ${targetName}'s Subscriptions (managed by you)`));
  }

  const messageId = interaction.message.id;

  // Preserve the category page the user was on
  const oldState = getMySubsState(messageId);
  const oldCategory = oldState && oldState.categories.length > 0
    ? oldState.categories[oldState.currentPage]
    : null;

  const state = createMySubsPagination(messageId, embeds, categories, targetId);
  
  if (oldCategory) {
    const newIndex = categories.indexOf(oldCategory);
    if (newIndex !== -1) {
      state.currentPage = newIndex;
    }
  }

  const currentCategory = state.categories[state.currentPage];
  const { canSubscribe, canUnsubscribe } = await getCategorySubState(interaction.guildId!, targetId, currentCategory);
  const page = buildMySubsPage(state, canSubscribe, canUnsubscribe);

  await interaction.editReply({
    content: `Unsubscription results for **${targetName}**:\n${results.join('\n')}`,
    embeds: page.embeds,
    components: page.components,
  });
}

/**
 * Handles select page navigation for sub.
 */
export async function handleSubSelectNav(
  interaction: import('discord.js').ButtonInteraction,
  purpose: string,
  action: 'prev' | 'next',
): Promise<void> {
  const state = getSelectState(interaction.message.id);
  if (!state) {
    await interaction.update({
      content: '❌ Session expired. Please run `/auction sub` again.',
      embeds: [],
      components: [],
    });
    return;
  }

  if (action === 'prev') {
    state.currentPage = Math.max(0, state.currentPage - 1);
  } else {
    state.currentPage = Math.min(state.totalPages - 1, state.currentPage + 1);
  }

  const title =
    purpose === 'subscribe'
      ? '➕ Subscribe to Items'
      : '➖ Unsubscribe from Items';
  const page = buildSelectPage(state, title);
  await interaction.update(page);
}

/**
 * Handles select menu changes for sub.
 */
export async function handleSubSelectMenu(
  interaction: import('discord.js').StringSelectMenuInteraction,
): Promise<void> {
  const state = getSelectState(interaction.message.id);
  if (!state) {
    await interaction.reply({
      content: '❌ Session expired. Please run `/auction sub` again.',
      ephemeral: true,
    });
    return;
  }

  handleSelectMenuUpdate(state, interaction.values);

  const title =
    state.purpose === 'subscribe'
      ? '➕ Subscribe to Items'
      : '➖ Unsubscribe from Items';
  const page = buildSelectPage(state, title);
  await interaction.update(page);
}

/**
 * Handles select page navigation for /mysubs category viewer.
 */
export async function handleMySubsNav(
  interaction: import('discord.js').ButtonInteraction,
  action: 'prev' | 'next',
): Promise<void> {
  const state = getMySubsState(interaction.message.id);
  if (!state) {
    await interaction.update({
      content: '❌ Session expired. Please run `/auction sub` again.',
      embeds: [],
      components: [],
    });
    return;
  }

  if (action === 'prev') {
    state.currentPage = Math.max(0, state.currentPage - 1);
  } else {
    state.currentPage = Math.min(state.categories.length - 1, state.currentPage + 1);
  }

  // The button disabled state handles whether they can subscribe/unsubscribe
  const currentCategory = state.categories[state.currentPage];
  const { canSubscribe, canUnsubscribe } = await getCategorySubState(interaction.guildId!, state.userId, currentCategory);
  
  const page = buildMySubsPage(state, canSubscribe, canUnsubscribe);
  await interaction.update(page);
}
