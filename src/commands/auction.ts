import {
  type ChatInputCommandInteraction,
  type TextChannel,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import { requireAdmin, requireMember, isAdmin } from '../utils/permissions.js';
import { isGuildConfigured } from '../db/registry.js';
import {
  buildAssignmentPreviewEmbed,
  buildAnnouncementEmbed,
  buildPerPersonEmbed,
  buildPrintPreviewEmbed,
  buildSubLogsEmbed,
  buildAuctionLogsEmbed,
  chunkEmbeds,
  type ItemInfo,
  type QueueInfo,
} from '../utils/embeds.js';
import { getItems } from '../db/items.js';
import { rotateTop, getSubscriptions, getRecentSubLogs, moveToTop, moveToPosition, getItemQueue } from '../db/subscriptions.js';
import { logAssignment, getRecentAuctionLogs } from '../db/auctionLog.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

export async function handleAuctionCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'help') {
    return handleAuctionHelp(interaction);
  }

  if (subcommand === 'store') {
    return handleAuctionStore(interaction);
  }

  // Queue requires member role
  if (subcommand === 'queue') {
    await interaction.deferReply({ ephemeral: true });
    if (!(await requireMember(interaction))) return;
    return handleAuctionQueue(interaction);
  }

  // Setup is special: we handle its response lifecycle directly to avoid timeout issues
  if (subcommand === 'setup') {
    console.log(`[handleAuctionCommand] Routing to handleAuctionSetup...`);
    return handleAuctionSetup(interaction);
  }

  console.log(`[handleAuctionCommand] Deferring reply for ${subcommand}...`);
  await interaction.deferReply({ ephemeral: true });
  console.log(`[handleAuctionCommand] Reply deferred successfully.`);

  // Admin-only subcommands beyond this point
  if (!(await requireAdmin(interaction))) {
    console.log(`[handleAuctionCommand] requireAdmin failed for ${subcommand}.`);
    return;
  }
  console.log(`[handleAuctionCommand] requireAdmin passed for ${subcommand}.`);

  if (subcommand === 'print-sub-logs') {
    return handleAuctionPrintSubLogs(interaction);
  } else if (subcommand === 'print-auction-logs') {
    return handleAuctionPrintAuctionLogs(interaction);
  } else if (subcommand === 'cut-line') {
    return handleAuctionCutLine(interaction);
  } else if (subcommand === 'publish') {
    return handleAuctionPublish(interaction);
  }
}

export async function handleAuctionSetup(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  console.log(`[handleAuctionSetup] Starting setup checks...`);
  
  const guildId = interaction.guildId!;

  // Custom permissions check for setup
  const isConfigured = await isGuildConfigured(guildId);
  console.log(`[handleAuctionSetup] isConfigured: ${isConfigured}`);
  const isNativeAdmin = interaction.memberPermissions?.has('Administrator') || interaction.memberPermissions?.has('ManageGuild');
  const isCustomAdmin = isConfigured && (await isAdmin(guildId, interaction.member as import('discord.js').GuildMember));
  const hasLiteralRole = (interaction.member as import('discord.js').GuildMember).roles.cache.some(role => role.name === 'Auction Admin');

  if (!isNativeAdmin && !isCustomAdmin && !hasLiteralRole) {
    await interaction.reply({
      content: '❌ Only Discord Server Administrators, those with Manage Server permissions, or users with an "Auction Admin" role can run setup.',
      ephemeral: true,
    });
    return;
  }
  console.log(`[handleAuctionSetup] Permissions checks passed. Sending instructions.`);

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Bot Setup')
    .setColor('#0099ff')
    .setDescription(
      `Welcome to the Universal Auction Bot!\n\n` +
      `To get started, I need to know two things:\n` +
      `• **Admin Role** — Who can manage items and publish auctions?\n` +
      `• **Member Role** — Who can subscribe to item queues?\n\n` +
      `Click the button below to configure your roles.`
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_start_btn')
      .setLabel('Configure Roles')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

export async function handleAuctionHelp(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const isUserAdmin = await isAdmin(interaction.guildId!, interaction.member as import('discord.js').GuildMember);

  let description = '';

  if (isUserAdmin) {
    description = `
**👑 Admin Commands**

*Manage the Queue/Subscriptions:*
\`/auction sub\` — View and manage your own, or anyone else's, subscriptions.
\`/auction cut-line\` — Instantly move a specific user up, down, top, or bottom of an item's queue. (Navigate categories, pick an item, then pick a user to move).
\`/auction remove-member\` — Select a member and instantly delete all their subscriptions.

*Viewing Info:*
\`/auction store\` — View a static list of all available auction items by category.
\`/auction queue\` — View the live stand-by queues for all items. Use ◀ Prev and Next ▶ to flip through categories.

*Publishing & Logs:*
\`/auction publish\` — Pick items/quantities. The bot auto-assigns the items round-robin to the top subscribers, rotates them to the back, and posts an announcement!
\`/auction print-sub-logs\` — Print the last 7 days of subscription activity (who joined/left what).
\`/auction print-auction-logs\` — Print the last 7 days of auction winners.

*Danger Zone:*
\`/auction setup\` — Initialize the Discord bot configuration or update Role mappings.
\`/auction reset\` — Completely wipe all items, queues, and logs from the database.

**👤 Member Commands (Available to Everyone)**
\`/auction sub\` — Open personal subscription dashboard.
\`/auction queue\` — View live queues.
\`/auction store\` — View all items.
\`/auction help\` — Show this help page.
`;
  } else {
    description = `
**👤 Member Commands**

*Manage Your Subscriptions:*
\`/auction sub\` — Open your personal subscription dashboard.
- Use ◀ Prev and Next ▶ to browse categories.
- Tap \`➕ Subscribe\` to join queues, or \`➖ Unsubscribe\` to leave them.

*View Queues:*
\`/auction queue\` — View the live stand-by line for all items. Use ◀ Prev and Next ▶ to flip through categories.

*How it works: When an item drops and the admins publish the auction, the person at the top of the queue receives the item and is rotated to the back of the line.*

*Browse Catalog:*
\`/auction store\` — View all available auction items that you can subscribe to.

*Help:*
\`/auction help\` — Show this help page.
`;
  }

  const embed = new EmbedBuilder()
    .setTitle('📖 Auction Bot Help')
    .setDescription(description)
    .setColor('#0099ff');

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAuctionStore(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const items = getItems();
  if (items.length === 0) {
    await interaction.reply({ content: '📦 The store is empty — no items configured.', ephemeral: true });
    return;
  }

  // Group by category
  const grouped = new Map<string, { name: string; icon: string }[]>();
  for (const item of items) {
    const cat = item.category || 'Uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push({ name: item.name, icon: item.icon || '' });
  }

  // One embed per category to stay under the 4096 char description limit
  const embeds: EmbedBuilder[] = [];
  for (const [category, catItems] of grouped) {
    const lines = catItems.map(({ name, icon }) => `${icon} ${name}`);
    embeds.push(
      new EmbedBuilder()
        .setTitle(category)
        .setDescription(lines.join('\n'))
        .setColor(0x57f287),
    );
  }

  // Discord allows up to 10 embeds per message
  embeds[embeds.length - 1].setFooter({ text: `${items.length} item(s) available` });

  await interaction.reply({ embeds, ephemeral: true });
}


interface PublishState {
  selectedItems: { itemName: string; quantity: number }[];
  currentCategory?: string;
  currentItemName?: string;
  currentQty?: number;
  channelId?: string;
}

const publishStates = new Map<string, PublishState>();

function safeIcon(icon: string | undefined): string {
  if (!icon) return '';
  if (icon.match(/^<a?:\w+:\d+>$/)) return icon;
  console.error(`[safeIcon] Invalid emoji format: ${icon}`);
  return '';
}

function buildPublishUI(state: PublishState, stateKey: string): {
  content: string | null;
  embeds: import('discord.js').EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
} {
  const allItems = getItems();
  const allCategories = [...new Set(allItems.map((i) => i.category || 'Uncategorized'))].sort();
  const lines: string[] = [];

  if (state.selectedItems.length > 0) {
    const grouped = new Map<string, { name: string; qty: number; icon: string }[]>();
    for (const sel of state.selectedItems) {
      const item = allItems.find((i) => i.name === sel.itemName);
      const cat = item?.category || 'Uncategorized';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push({ name: sel.itemName, qty: sel.quantity, icon: safeIcon(item?.icon) });
    }
    for (const [category, catItems] of grouped) {
      lines.push(`**${category}**`);
      for (const { name, qty, icon } of catItems) {
        lines.push(`  ${icon} ${name} × ${qty}`);
      }
    }
  } else {
    lines.push('*No items selected yet.*');
  }

  const embed = new EmbedBuilder()
    .setTitle('🎯 Publish Auction — Select Items')
    .setDescription(lines.join('\n'))
    .setColor(0x5865f2)
    .setFooter({ text: 'Pick an item and quantity, then click Add. Click Done when finished.' });

  // --- Category selector ---

  const catSelect = new StringSelectMenuBuilder()
    .setCustomId(`publish_cat_select_${stateKey}`)
    .setPlaceholder(state.currentCategory ? `Category: ${state.currentCategory}` : 'Select a category...')
    .addOptions(allCategories.slice(0, 25).map((c) => ({ label: c, value: c, default: c === state.currentCategory })));

  // --- Item selector (filtered to category) ---
  const catItems = state.currentCategory
    ? allItems.filter((i) => (i.category || 'Uncategorized') === state.currentCategory)
    : [];

  const itemOptions = catItems.map((item) => {
    const match = item.icon?.match(/^<(a?):(\w+):(\d+)>$/);
    return {
      label: item.name,
      value: item.name,
      emoji: match ? { id: match[3], name: match[2], animated: match[1] === 'a' } : undefined,
    };
  });

  const itemSelect = new StringSelectMenuBuilder()
    .setCustomId(`publish_item_select_${stateKey}`)
    .setPlaceholder(state.currentItemName ? `Item: ${state.currentItemName}` : 'Select an item...')
    .setDisabled(catItems.length === 0)
    .addOptions(itemOptions.length > 0 ? itemOptions.slice(0, 25) : [{ label: 'No items', value: '__none__' }]);

  const qtyOptions = Array.from({ length: 10 }, (_, i) => ({
    label: `${i + 1}`,
    value: `${i + 1}`,
    default: state.currentQty === i + 1,
  }));

  const qtySelect = new StringSelectMenuBuilder()
    .setCustomId(`publish_qty_select_${stateKey}`)
    .setPlaceholder('Select quantity...')
    .addOptions(qtyOptions);

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`publish_add_${stateKey}`)
      .setLabel('➕ Add Item')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!state.currentItemName || !state.currentQty),
  ];

  if (state.selectedItems.length > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`publish_done_${stateKey}`)
        .setLabel('✅ Done')
        .setStyle(ButtonStyle.Success),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId('auction_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(catSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(itemSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(qtySelect),
    new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
  ];

  if (state.selectedItems.length > 0) {
    const removeOptions = state.selectedItems.map((sel, idx) => {
      const item = allItems.find((i) => i.name === sel.itemName);
      const m = item?.icon?.match(/^<(a?):(\w+):(\d+)>$/);
      return {
        label: `${sel.itemName} × ${sel.quantity}`,
        value: `${idx}`,
        emoji: m ? { id: m[3], name: m[2], animated: m[1] === 'a' } : undefined,
      };
    });
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`publish_remove_select_${stateKey}`)
          .setPlaceholder('🗑️ Remove an item...')
          .addOptions(removeOptions),
      ),
    );
  }

  return { content: null, embeds: [embed], components };
}

async function handleAuctionPublish(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const items = getItems();
  if (items.length === 0) {
    await interaction.editReply('❌ No items configured in items.json.');
    return;
  }

  const stateKey = `pub_${Date.now()}`;
  console.log(`[Publish] Starting new publish interaction. StateKey: ${stateKey}`);
  const state: PublishState = { selectedItems: [] };
  publishStates.set(stateKey, state);

  const ui = buildPublishUI(state, stateKey);
  await interaction.editReply(ui);
}

export async function handlePublishCatSelect(
  interaction: import('discord.js').StringSelectMenuInteraction,
  stateKey: string,
): Promise<void> {
  const state = publishStates.get(stateKey);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Run `/auction publish` again.', ephemeral: true });
    return;
  }
  state.currentCategory = interaction.values[0];
  state.currentItemName = undefined;
  state.currentQty = undefined;
  const ui = buildPublishUI(state, stateKey);
  await interaction.update(ui);
}

export async function handlePublishItemSelect(

  interaction: import('discord.js').StringSelectMenuInteraction,
  stateKey: string,
): Promise<void> {
  const state = publishStates.get(stateKey);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Run `/auction publish` again.', ephemeral: true });
    return;
  }
  state.currentItemName = interaction.values[0];
  const ui = buildPublishUI(state, stateKey);
  await interaction.update(ui);
}

export async function handlePublishQtySelect(
  interaction: import('discord.js').StringSelectMenuInteraction,
  stateKey: string,
): Promise<void> {
  const state = publishStates.get(stateKey);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Run `/auction publish` again.', ephemeral: true });
    return;
  }
  state.currentQty = parseInt(interaction.values[0], 10);
  const ui = buildPublishUI(state, stateKey);
  await interaction.update(ui);
}

export async function handlePublishAddItem(
  interaction: import('discord.js').ButtonInteraction,
  stateKey: string,
): Promise<void> {
  const state = publishStates.get(stateKey);
  if (!state || !state.currentItemName || !state.currentQty) {
    await interaction.reply({ content: '❌ Please select both an item and quantity first.', ephemeral: true });
    return;
  }
  const existing = state.selectedItems.find((s) => s.itemName === state.currentItemName);
  if (existing) {
    console.log(`[Publish] Updated item ${state.currentItemName} qty to ${state.currentQty} (StateKey: ${stateKey})`);
    existing.quantity = state.currentQty;
  } else {
    console.log(`[Publish] Added item ${state.currentItemName} qty ${state.currentQty} (StateKey: ${stateKey})`);
    state.selectedItems.push({ itemName: state.currentItemName, quantity: state.currentQty });
  }
  state.currentItemName = undefined;
  state.currentQty = undefined;
  const ui = buildPublishUI(state, stateKey);
  await interaction.update(ui);
}

export async function handlePublishRemoveItem(
  interaction: import('discord.js').StringSelectMenuInteraction,
  stateKey: string,
): Promise<void> {
  const state = publishStates.get(stateKey);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Run `/auction publish` again.', ephemeral: true });
    return;
  }
  const idx = parseInt(interaction.values[0], 10);
  if (idx >= 0 && idx < state.selectedItems.length) {
    state.selectedItems.splice(idx, 1);
  }
  const ui = buildPublishUI(state, stateKey);
  await interaction.update(ui);
}

export async function handlePublishDone(
  interaction: import('discord.js').ButtonInteraction,
  stateKey: string,
): Promise<void> {
  const state = publishStates.get(stateKey);
  if (!state || state.selectedItems.length === 0) {
    console.log(`[Publish] Done clicked but no items selected or session expired. StateKey: ${stateKey}`);
    await interaction.reply({ content: '❌ No items selected.', ephemeral: true });
    return;
  }
  
  console.log(`[Publish] Done clicked. Finalizing assignments for ${state.selectedItems.length} items. StateKey: ${stateKey}`);

  const allItems = getItems();
  const assignments: {
    item: ItemInfo;
    quantity: number;
    assigned: { userId: string; displayName: string; position: number }[];
    unassignedQty: number;
  }[] = [];

  for (const { itemName, quantity } of state.selectedItems) {
    const item = allItems.find((i) => i.name === itemName);
    if (!item) continue;
    const subs = await getSubscriptions(interaction.guildId!, item.name);
    
    const assigned: { userId: string; displayName: string; position: number }[] = [];
    let unassignedQty = 0;

    if (subs.length === 0) {
      unassignedQty = quantity;
    } else {
      for (let i = 0; i < quantity; i++) {
        const sub = subs[i % subs.length];
        assigned.push({
          userId: sub.userId,
          displayName: sub.displayName,
          position: (i % subs.length) + 1,
        });
      }
    }
    
    assignments.push({ item, quantity, assigned, unassignedQty });
  }

  const embeds = buildAssignmentPreviewEmbed(assignments);

  const auctionStateKey = `auction_${Date.now()}`;
  pendingAuctions.set(auctionStateKey, {
    assignments,
    selectedItems: assignments.map((a) => ({ item: a.item, quantity: a.quantity })),
    channelId: interaction.channelId || undefined,
  });

  publishStates.delete(stateKey);

  const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`auction_channel_${auctionStateKey}`)
      .setPlaceholder('Select announcement channel...')
      .setChannelTypes(ChannelType.GuildText)
      .setDefaultChannels(interaction.channelId ? [interaction.channelId] : []),
  );

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`auction_confirm_${auctionStateKey}`)
      .setLabel('✅ Publish & Rotate')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('auction_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.update({
    embeds,
    components: [channelRow, buttonRow],
  });
}
// ─── Pending auction publish state ──────────────────────────────────────────

interface PendingAuction {
  assignments: {
    item: ItemInfo;
    quantity: number;
    assigned: { userId: string; displayName: string; position: number }[];
    unassignedQty: number;
  }[];
  selectedItems: { item: ItemInfo; quantity: number }[];
  channelId?: string;
}

const pendingAuctions = new Map<string, PendingAuction>();

// ─── Auction Handlers ───────────────────────────────────────────────────────

/**
 * Publishes the auction results and rotates queues.
 */
export async function handleAuctionConfirm(
  interaction: import('discord.js').ButtonInteraction,
  stateKey: string,
): Promise<void> {
  const pending = pendingAuctions.get(stateKey);
  if (!pending) {
    await interaction.update({
      content: '❌ Auction session expired. Please run `/auction` again.',
      embeds: [],
      components: [],
    });
    return;
  }

  await interaction.update({
    content: '⏳ Publishing assignments and rotating queues...',
    embeds: [],
    components: [],
  });

  console.log(`[Publish] Confirm clicked. Re-reading queues and executing rotation for StateKey: ${stateKey}`);

  const today = new Date().toISOString().split('T')[0];
  const warnings: string[] = [];

  // Re-calculate assignments from live queue state (fixes race condition)
  const liveAssignments: typeof pending.assignments = [];
  for (const { item, quantity } of pending.selectedItems) {
    const subs = await getSubscriptions(interaction.guildId!, item.name);
    const assigned: { userId: string; displayName: string; position: number }[] = [];
    let unassignedQty = 0;

    if (subs.length === 0) {
      unassignedQty = quantity;
    } else {
      for (let i = 0; i < quantity; i++) {
        const sub = subs[i % subs.length];
        assigned.push({
          userId: sub.userId,
          displayName: sub.displayName,
          position: (i % subs.length) + 1,
        });
      }
    }
    liveAssignments.push({ item, quantity, assigned, unassignedQty });
  }

  // Check if assignments changed since preview
  for (let i = 0; i < liveAssignments.length; i++) {
    const live = liveAssignments[i];
    const preview = pending.assignments[i];
    if (!preview) continue;
    const liveNames = live.assigned.map(a => a.userId).join(',');
    const previewNames = preview.assigned.map(a => a.userId).join(',');
    if (liveNames !== previewNames) {
      warnings.push(`⚠️ **${live.item.name}**: assignments changed since preview (queue was modified)`);
    }
  }

  // Rotate queues
  for (const { item, quantity } of pending.selectedItems) {
    await rotateTop(interaction.guildId!, item.name, quantity);
  }

  // Log to Auction_Log
  for (const a of liveAssignments) {
    if (a.assigned.length > 0) {
      const assignedNames = a.assigned.map((m) => m.displayName).join(', ');
      const assignedIds = a.assigned.map((m) => m.userId).join(', ');
      await logAssignment(interaction.guildId!, today, a.item.name, a.item.category, assignedNames, assignedIds, a.quantity);
    }
  }

  // Post announcement
  const channelId = pending.channelId;
  try {
    const guild = interaction.guild;
    if (guild && channelId) {
      const channel = await guild.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        const announcementEmbeds = buildAnnouncementEmbed(
          liveAssignments.filter((a) => a.assigned.length > 0),
          today,
        );
        const chunks = chunkEmbeds(announcementEmbeds);
        for (const chunk of chunks) {
          await (channel as TextChannel).send({ embeds: chunk });
        }

        // Post per-person bidding guide
        const perPersonEmbeds = buildPerPersonEmbed(
          liveAssignments.filter((a) => a.assigned.length > 0),
          today,
        );
        const perPersonChunks = chunkEmbeds(perPersonEmbeds);
        for (const chunk of perPersonChunks) {
          await (channel as TextChannel).send({ embeds: chunk });
        }
      }
    }
  } catch (error) {
    console.error('Error posting announcement:', error);
  }

  // Clean up state
  pendingAuctions.delete(stateKey);

  const warningText = warnings.length > 0 ? `\n\n${warnings.join('\n')}` : '';
  await interaction.editReply(
    `✅ Auction published! Assignments posted and queues rotated.${warningText}`,
  );
}

/**
 * Handles the selection of a new announcement channel.
 */
export async function handleAuctionChannelSelect(
  interaction: import('discord.js').ChannelSelectMenuInteraction,
): Promise<void> {
  const stateKey = interaction.customId.replace('auction_channel_', '');
  const pending = pendingAuctions.get(stateKey);
  if (!pending) {
    await interaction.reply({
      content: '❌ Auction session expired. Please run `/auction` again.',
      ephemeral: true,
    });
    return;
  }

  // Save the selected channel ID
  pending.channelId = interaction.values[0];
  await interaction.deferUpdate();
}

// ─── Print Handlers ─────────────────────────────────────────────────────────

interface QueueState {
  categories: string[];
  currentPage: number;
}
const queueStates = new Map<string, QueueState>();

async function buildQueueCategoryPage(
  guildId: string,
  state: QueueState,
  items: ItemInfo[],
): Promise<{
  content: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const category = state.categories[state.currentPage];
  const catItems = items.filter((i) => (i.category || 'Uncategorized') === category);
  const isOnePage = state.categories.length <= 1;

  const queues: QueueInfo[] = [];
  for (const item of catItems) {
    const queue = await getSubscriptions(guildId, item.name);
    queues.push({ item, queue });
  }

  const embeds = buildPrintPreviewEmbed(queues);

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('queue_prev')
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isOnePage || state.currentPage === 0),
      new ButtonBuilder()
        .setCustomId('queue_next')
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isOnePage || state.currentPage >= state.categories.length - 1),
    ),
  );

  return {
    content: `📋 **Queue** — Category: **${category}** (${state.currentPage + 1}/${state.categories.length})`,
    embeds: embeds.slice(0, 10), // Truncate chunks if we somehow exceed 10 embeds per message (Discord limit)
    components,
  };
}

async function handleAuctionQueue(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const items = getItems();
  if (items.length === 0) {
    await interaction.editReply('❌ No items configured in the catalog.');
    return;
  }

  const categories = [...new Set(items.map((i) => i.category || 'Uncategorized'))].sort();
  const state: QueueState = { categories, currentPage: 0 };
  
  const stateKey = interaction.id;
  queueStates.set(stateKey, state);
  setTimeout(() => queueStates.delete(stateKey), 14 * 60 * 1000);

  const ui = await buildQueueCategoryPage(interaction.guildId!, state, items);
  await interaction.editReply(ui);
}

export async function handleQueueNav(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const stateKey = interaction.message.interaction?.id ?? interaction.message.id;
  const state = queueStates.get(stateKey);
  if (!state) {
    await interaction.update({
      content: '❌ Session expired. Please run `/auction queue` again.',
      embeds: [],
      components: [],
    });
    return;
  }

  if (interaction.customId === 'queue_prev' && state.currentPage > 0) {
    state.currentPage--;
  } else if (interaction.customId === 'queue_next' && state.currentPage < state.categories.length - 1) {
    state.currentPage++;
  }

  const ui = await buildQueueCategoryPage(interaction.guildId!, state, getItems());
  await interaction.update(ui);
}

// ─── Print Logs Handlers ────────────────────────────────────────────────────

type PendingLogs =
  | { type: 'sub'; logs: import('../db/subscriptions.js').SubLogEntry[]; channelId?: string }
  | { type: 'auction'; logs: import('../db/auctionLog.js').AuctionLogEntry[]; channelId?: string };

const pendingLogs = new Map<string, PendingLogs>();

async function handleAuctionPrintSubLogs(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const logs = await getRecentSubLogs(interaction.guildId!, 7);
  const items = getItems();
  const embeds = buildSubLogsEmbed(logs, '📋 Preview: Subscription Logs (Last 7 Days)', items);
  
  const stateKey = `print_logs_${Date.now()}`;
  pendingLogs.set(stateKey, { type: 'sub', logs, channelId: interaction.channelId || undefined });

  const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`print_logs_channel_${stateKey}`)
      .setPlaceholder('Select announcement channel...')
      .setChannelTypes(ChannelType.GuildText)
      .setDefaultChannels(interaction.channelId ? [interaction.channelId] : []),
  );

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`print_logs_confirm_${stateKey}`)
      .setLabel('✅ Publish Logs')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('auction_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  const chunks = chunkEmbeds(embeds);

  // Only show the first chunk in the ephemeral preview to avoid massive walls of private text
  const previewEmbeds = [...(chunks[0] || [])];
  
  if (chunks.length > 1 && previewEmbeds.length > 0) {
    const lastEmbed = previewEmbeds[previewEmbeds.length - 1];
    const currentDesc = lastEmbed.data.description || '';
    lastEmbed.setDescription(`${currentDesc}\n\n*(...preview truncated due to length limits. Full logs will be printed publicly.)*`);
  }

  await interaction.editReply({
    embeds: previewEmbeds,
    components: [channelRow, buttonRow],
  });
}

async function handleAuctionPrintAuctionLogs(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const logs = await getRecentAuctionLogs(interaction.guildId!, 7);
  const items = getItems();
  const embeds = buildAuctionLogsEmbed(logs, '📋 Preview: Auction Logs (Last 7 Days)', items);
  
  const stateKey = `print_logs_${Date.now()}`;
  pendingLogs.set(stateKey, { type: 'auction', logs, channelId: interaction.channelId || undefined });

  const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`print_logs_channel_${stateKey}`)
      .setPlaceholder('Select announcement channel...')
      .setChannelTypes(ChannelType.GuildText)
      .setDefaultChannels(interaction.channelId ? [interaction.channelId] : []),
  );

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`print_logs_confirm_${stateKey}`)
      .setLabel('✅ Publish Logs')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('auction_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  const chunks = chunkEmbeds(embeds);

  // Only show the first chunk in the ephemeral preview to avoid massive walls of private text
  const previewEmbeds = [...(chunks[0] || [])];
  
  if (chunks.length > 1 && previewEmbeds.length > 0) {
    const lastEmbed = previewEmbeds[previewEmbeds.length - 1];
    const currentDesc = lastEmbed.data.description || '';
    lastEmbed.setDescription(`${currentDesc}\n\n*(...preview truncated due to length limits. Full logs will be printed publicly.)*`);
  }

  await interaction.editReply({
    embeds: previewEmbeds,
    components: [channelRow, buttonRow],
  });
}

export async function handleLogsChannelSelect(
  interaction: import('discord.js').ChannelSelectMenuInteraction,
): Promise<void> {
  const stateKey = interaction.customId.replace('print_logs_channel_', '');
  const pending = pendingLogs.get(stateKey);
  if (!pending) {
    await interaction.reply({
      content: '❌ Session expired. Please run the print command again.',
      ephemeral: true,
    });
    return;
  }

  pending.channelId = interaction.values[0];
  await interaction.deferUpdate();
}

export async function handleLogsPrintConfirm(
  interaction: import('discord.js').ButtonInteraction,
  stateKey: string,
  sendHere = false,
): Promise<void> {
  const pending = pendingLogs.get(stateKey);
  if (!pending) {
    await interaction.update({
      content: '❌ Session expired. Please run the print command again.',
      embeds: [],
      components: [],
    });
    return;
  }

  await interaction.update({
    content: '⏳ Publishing logs...',
    embeds: [],
    components: [],
  });

  const channelId = pending.channelId;
  let targetChannel: import('discord.js').TextBasedChannel | null = null;
  
  if (sendHere) {
    if (interaction.channel && interaction.channel.isTextBased()) {
      targetChannel = interaction.channel as import('discord.js').TextChannel;
    }
  } else if (interaction.guild && channelId) {
    const channel = await interaction.guild.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      targetChannel = channel as import('discord.js').TextChannel;
    }
  }

  try {
    if (targetChannel) {
      const items = getItems();
      const embeds = pending.type === 'sub'
        ? buildSubLogsEmbed(pending.logs as import('../db/subscriptions.js').SubLogEntry[], '📋 Subscription Logs (Last 7 Days)', items)
        : buildAuctionLogsEmbed(pending.logs as import('../db/auctionLog.js').AuctionLogEntry[], '📋 Auction Logs (Last 7 Days)', items);
      
      if ('send' in targetChannel) {
        const chunks = chunkEmbeds(embeds);
        for (const chunk of chunks) {
          await (targetChannel as import('discord.js').TextChannel).send({ embeds: chunk });
        }
      }
    }
  } catch (error) {
    console.error('Error posting logs announcement:', error);
  }

  pendingLogs.delete(stateKey);

  await interaction.editReply(
    '✅ Logs have been published to the selected channel!',
  );
}

// ─── Cut-Line Handlers ──────────────────────────────────────────────────────

interface CutLineState {
  categories: string[];
  currentPage: number; // index into `categories`
  itemName: string | null;
  selectedUserId: string | null;
}

const cutLineStates = new Map<string, CutLineState>();

async function buildCutLineCategoryPage(
  guildId: string,
  state: CutLineState,
  items: ItemInfo[],
): Promise<{
  content: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
}> {
  const category = state.categories[state.currentPage];
  const catItems = items.filter((i) => (i.category || 'Uncategorized') === category);
  const isOnePage = state.categories.length <= 1;

  const embeds: EmbedBuilder[] = [];
  const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

  // Item selector is always present to allow picking/changing items
  const itemOptions = catItems.map((i) => ({ label: i.name, value: i.name, default: i.name === state.itemName }));
  if (itemOptions.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('cutline_item')
          .setPlaceholder(state.itemName ?? 'Select an item...')
          .addOptions(itemOptions.slice(0, 25)),
      ),
    );
  }

  if (!state.itemName) {
    // Step 1: No item selected. Display list of items in category.
    let catText = '';
    for (const item of catItems) {
       catText += `  ${item.icon ?? '📦'} ${item.name}\n`;
    }
    embeds.push(
      new EmbedBuilder()
        .setTitle(`📂 ${category} — Select an item`)
        .setDescription(catItems.length > 0 ? catText : 'No items in this category.')
        .setColor(0x99aab5)
    );
  } else {
    // Step 2: Item selected. Display queue for that item only.
    const item = catItems.find(i => i.name === state.itemName);
    if (item) {
        const queue = await getItemQueue(guildId, item.name);
        const icon = item.icon ?? '';

        let queueText: string;
        if (queue.length === 0) {
          queueText = '*No subscribers*';
        } else {
          queueText = queue.map((e, idx) => {
            const marker = (e.userId === state.selectedUserId) ? '👉 ' : '';
            return `${marker}${idx + 1}. ${e.displayName}`;
          }).join('\n');
        }

        embeds.push(
          new EmbedBuilder()
            .setTitle(`${icon} ${item.name}`)
            .setDescription(queueText)
            .setColor(0xe67e22)
        );

        // User selector (only if item has subscribers)
        if (queue.length > 0) {
          const userOptions = queue.slice(0, 25).map((e) => ({
            label: e.displayName,
            value: e.userId,
            default: e.userId === state.selectedUserId,
          }));
          components.push(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('cutline_user_select')
                .setPlaceholder(state.selectedUserId ? queue.find(e => e.userId === state.selectedUserId)?.displayName ?? 'Select a user...' : 'Select a user...')
                .addOptions(userOptions),
            ),
          );
        }
        
        // Back to items button
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('cutline_back_items')
              .setLabel('◀ Back to Items')
              .setStyle(ButtonStyle.Secondary)
          )
        );
    } else {
       // fallback if item somehow deleted/missing
       embeds.push(new EmbedBuilder().setTitle('Error').setDescription('Item not found.').setColor(0xed4245));
    }
  }

  const hasUser = !!state.selectedUserId;
  // Nav + action buttons (max 5)
  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('cutline_prev')
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isOnePage || state.currentPage === 0),
      new ButtonBuilder()
        .setCustomId('cutline_next')
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isOnePage || state.currentPage >= state.categories.length - 1),
      new ButtonBuilder()
        .setCustomId('cutline_move_top')
        .setLabel('⬆️ Top')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasUser),
      new ButtonBuilder()
        .setCustomId('cutline_move_up')
        .setLabel('↑ Up')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!hasUser),
      new ButtonBuilder()
        .setCustomId('cutline_move_down')
        .setLabel('↓ Down')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!hasUser),
    ),
  );

  return {
    content: `✂️ **Cut-Line** — Category: **${category}** (${state.currentPage + 1}/${state.categories.length})${state.itemName ? ` — **${state.itemName}**` : ''}`,
    embeds: embeds.slice(0, 10), // Discord max 10 embeds
    components,
  };
}

async function handleAuctionCutLine(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const items = getItems();
  if (items.length === 0) {
    await interaction.editReply('❌ No items configured in the catalog.');
    return;
  }

  const categories = [...new Set(items.map((i) => i.category || 'Uncategorized'))].sort();
  const state: CutLineState = { categories, currentPage: 0, itemName: null, selectedUserId: null };
  cutLineStates.set(interaction.id, state);
  setTimeout(() => cutLineStates.delete(interaction.id), 14 * 60 * 1000);

  const ui = await buildCutLineCategoryPage(interaction.guildId!, state, items);
  await interaction.editReply(ui);
}

export async function handleCutLineCategorySelect(
  interaction: import('discord.js').StringSelectMenuInteraction,
): Promise<void> {
  // No-op: category navigation is now done via Prev/Next buttons
  await interaction.deferUpdate();
}

export async function handleCutLineItemSelect(
  interaction: import('discord.js').StringSelectMenuInteraction,
): Promise<void> {
  const stateKey = interaction.message.interaction?.id ?? interaction.message.id;
  let state = cutLineStates.get(stateKey);
  if (!state) {
    // If state lost (e.g. restart), recover categories from items
    const items = getItems();
    const categories = [...new Set(items.map((i) => i.category || 'Uncategorized'))].sort();
    state = { categories, currentPage: 0, itemName: null, selectedUserId: null };
    cutLineStates.set(stateKey, state);
  }

  state.itemName = interaction.values[0];
  state.selectedUserId = null; // Reset user selection when item changes

  const ui = await buildCutLineCategoryPage(interaction.guildId!, state, getItems());
  await interaction.update(ui);
}

export async function handleCutLineUserSelect(
  interaction: import('discord.js').StringSelectMenuInteraction,
): Promise<void> {
  const stateKey = interaction.message.interaction?.id ?? interaction.message.id;
  const state = cutLineStates.get(stateKey);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Please run `/auction cut-line` again.', ephemeral: true });
    return;
  }

  state.selectedUserId = interaction.values[0];

  const ui = await buildCutLineCategoryPage(interaction.guildId!, state, getItems());
  await interaction.update(ui);
}

export async function handleCutLineBackToCategories(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  // No longer used in the new pager flow, but kept for safety
  await interaction.deferUpdate();
}

export async function handleCutLineBackToItems(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const stateKey = interaction.message.interaction?.id ?? interaction.message.id;
  const state = cutLineStates.get(stateKey);
  if (!state) {
    await interaction.deferUpdate();
    return;
  }
  
  state.itemName = null;
  state.selectedUserId = null;
  
  const ui = await buildCutLineCategoryPage(interaction.guildId!, state, getItems());
  await interaction.update(ui);
}

export async function handleCutLineNav(
  interaction: import('discord.js').ButtonInteraction,
  direction: 'prev' | 'next',
): Promise<void> {
  const stateKey = interaction.message.interaction?.id ?? interaction.message.id;
  const state = cutLineStates.get(stateKey);
  if (!state) {
    await interaction.reply({ content: '❌ Session expired. Please run `/auction cut-line` again.', ephemeral: true });
    return;
  }

  state.currentPage = direction === 'prev'
    ? Math.max(0, state.currentPage - 1)
    : Math.min(state.categories.length - 1, state.currentPage + 1);
  // Reset selections when category changes
  state.itemName = null;
  state.selectedUserId = null;

  const ui = await buildCutLineCategoryPage(interaction.guildId!, state, getItems());
  await interaction.update(ui);
}

export async function handleCutLineMoveUser(
  interaction: import('discord.js').ButtonInteraction,
  direction: 'top' | 'up' | 'down',
): Promise<void> {
  const stateKey = interaction.message.interaction?.id ?? interaction.message.id;
  const state = cutLineStates.get(stateKey);
  if (!state?.itemName || !state.selectedUserId) {
    await interaction.reply({ content: '❌ Select an item and user first.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  if (direction === 'top') {
    await moveToTop(interaction.guildId!, state.itemName, state.selectedUserId);
  } else {
    const queue = await getItemQueue(interaction.guildId!, state.itemName);
    const idx = queue.findIndex((e) => e.userId === state.selectedUserId);
    if (idx !== -1) {
      const targetIdx = direction === 'up' ? Math.max(0, idx - 1) : Math.min(queue.length - 1, idx + 1);
      if (targetIdx !== idx) {
        await moveToPosition(interaction.guildId!, state.itemName, state.selectedUserId!, targetIdx);
      }
    }
  }

  const ui = await buildCutLineCategoryPage(interaction.guildId!, state, getItems());
  await interaction.editReply(ui);
}
