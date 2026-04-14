import { EmbedBuilder } from 'discord.js';

export interface ItemInfo {
  name: string;
  category: string;
  icon: string;
}

export interface SubscriptionInfo extends ItemInfo {
  position: number;
  total: number;
}

export interface QueueInfo {
  item: ItemInfo;
  queue: { userId: string; displayName: string }[];
}

const DEFAULT_ICON = '📦';

function getIcon(icon: string | undefined | null): string {
  return icon && icon.trim() ? icon.trim() : DEFAULT_ICON;
}

/**
 * Groups items by category and formats them as embed description text.
 */
export function formatItemsByCategory(items: ItemInfo[]): string {
  const grouped = new Map<string, ItemInfo[]>();
  for (const item of items) {
    const cat = item.category || 'Uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  const lines: string[] = [];
  for (const [category, categoryItems] of grouped) {
    lines.push(`**${category}** (${categoryItems.length})`);
    for (const item of categoryItems) {
      lines.push(`  ${getIcon(item.icon)} ${item.name}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Formats subscriptions grouped by category with position info.
 */
export function formatSubscriptionsByCategory(
  subs: SubscriptionInfo[],
): string {
  const grouped = new Map<string, SubscriptionInfo[]>();
  for (const sub of subs) {
    const cat = sub.category || 'Uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(sub);
  }

  const lines: string[] = [];
  for (const [category, categorySubs] of grouped) {
    lines.push(`**${category}**`);
    for (const sub of categorySubs) {
      lines.push(
        `  ${getIcon(sub.icon)} ${sub.name} — Position: ${sub.position}/${sub.total}`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Creates the item catalog embeds for /items.
 */
export function buildItemCatalogEmbed(items: ItemInfo[]): EmbedBuilder[] {
  const grouped = new Map<string, ItemInfo[]>();
  for (const item of items) {
    const cat = item.category || 'Uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  const embeds: EmbedBuilder[] = [];
  let currentEmbed = new EmbedBuilder()
    .setTitle(`📦 Current Auction Items (${items.length} total)`)
    .setColor(0x5865f2);

  if (items.length === 0) {
    currentEmbed.setDescription('No items configured yet. Use **Add Items** to get started.');
    return [currentEmbed];
  }

  let currentDescCount = 0;

  for (const [category, categoryItems] of grouped) {
    let catText = `**${category}** (${categoryItems.length})\n`;
    for (const item of categoryItems) {
      catText += `  ${getIcon(item.icon)} ${item.name}\n`;
    }
    catText += '\n';

    if (currentDescCount + catText.length > 3800) {
      embeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(catText);
      currentDescCount = catText.length;
    } else {
      const existingDesc = currentEmbed.data.description || '';
      currentEmbed.setDescription(existingDesc + catText);
      currentDescCount += catText.length;
    }
  }

  embeds.push(currentEmbed);
  return embeds;
}

/**
 * Creates the subscription overview embeds for /mysubs.
 * Returns one embed per category for pagination.
 */
export function buildMySubsEmbed(
  subs: SubscriptionInfo[],
  username: string,
  allCategories: string[],
): { embeds: EmbedBuilder[], categories: string[] } {
  const grouped = new Map<string, SubscriptionInfo[]>();
  for (const sub of subs) {
    const cat = sub.category || 'Uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(sub);
  }

  const embeds: EmbedBuilder[] = [];

  if (allCategories.length === 0) {
    const emptyEmbed = new EmbedBuilder()
      .setTitle(`📋 ${username}'s Subscriptions`)
      .setColor(0x57f287)
      .setDescription('No items configured in the catalog.');
    return { embeds: [emptyEmbed], categories: ['None'] };
  }

  for (const [index, category] of allCategories.entries()) {
    const categorySubs = grouped.get(category) || [];
    const embed = new EmbedBuilder()
      .setTitle(`📋 ${username}'s Subscriptions`)
      .setColor(0x57f287)
      .setFooter({ text: `Page ${index + 1} of ${allCategories.length} • Category: ${category}` });

    let catText = `**${category}**\n`;
    if (categorySubs.length > 0) {
      for (const sub of categorySubs) {
        catText += `  ${getIcon(sub.icon)} ${sub.name} — Position: ${sub.position}/${sub.total}\n`;
      }
    } else {
      catText += '\n*No active subscriptions in this category.*\n*Use **Subscribe** to join a queue.*';
    }
    
    embed.setDescription(catText);
    embeds.push(embed);
  }

  return { embeds, categories: allCategories };
}

/**
 * Creates the assignment preview embeds for /auction.
 */
export function buildAssignmentPreviewEmbed(
  assignments: {
    item: ItemInfo;
    quantity: number;
    assigned: { userId: string; displayName: string; position: number }[];
    unassignedQty: number;
  }[],
  skippedMembers: { userId: string; displayName: string }[] = [],
): EmbedBuilder[] {
  const grouped = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const cat = a.item.category || 'Uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(a);
  }

  const embeds: EmbedBuilder[] = [];
  const currentEmbed = new EmbedBuilder()
    .setTitle('📋 Assignment Preview')
    .setColor(0xfee75c);
  let currentDescCount = 0;
  let isTruncated = false;

  for (const [category, catAssignments] of grouped) {
    if (isTruncated) break;

    let catText = `**${category}**\n`;
    for (const a of catAssignments) {
      catText += `${getIcon(a.item.icon)} ${a.item.name} (${a.quantity}x):\n`;
      for (const member of a.assigned) {
        catText += `  → ${member.displayName} (#${member.position})\n`;
      }
      if (a.unassignedQty > 0) {
        catText += `  ⚠️ ${a.unassignedQty} unassigned (not enough subscribers)\n`;
      }
    }
    catText += '\n';

    if (currentDescCount + catText.length > 3800) {
      const remainingBytes = 4000 - currentDescCount;
      if (remainingBytes > 100) {
        currentEmbed.setDescription((currentEmbed.data.description || '') + catText.slice(0, remainingBytes) + '\n\n*(...preview truncated due to Discord length limits. Full results will be published.)*');
      } else {
        currentEmbed.setDescription((currentEmbed.data.description || '') + '\n\n*(...preview truncated due to Discord length limits. Full results will be published.)*');
      }
      isTruncated = true;
      break;
    } else {
      const existingDesc = currentEmbed.data.description || '';
      currentEmbed.setDescription(existingDesc + catText);
      currentDescCount += catText.length;
    }
  }

  embeds.push(currentEmbed);

  // Add skipped members section if any
  if (skippedMembers.length > 0) {
    const skippedText = skippedMembers
      .map((m) => `${m.displayName} (<@${m.userId}>)`)
      .join(', ');
    const skippedEmbed = new EmbedBuilder()
      .setTitle('⚔️ Skipped — Did Not Do Guild War')
      .setColor(0xed4245)
      .setDescription(skippedText);
    embeds.push(skippedEmbed);
  }

  return embeds;
}

/**
 * Creates the published auction announcement embeds.
 */
export function buildAnnouncementEmbed(
  assignments: {
    item: ItemInfo;
    quantity: number;
    assigned: { userId: string; displayName: string }[];
  }[],
  date: string,
  skippedMembers: { userId: string; displayName: string }[] = [],
): EmbedBuilder[] {
  const grouped = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const cat = a.item.category || 'Uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(a);
  }

  const embeds: EmbedBuilder[] = [];
  let currentEmbed = new EmbedBuilder()
    .setTitle(`🎯 Auction Assignments — ${date}`)
    .setColor(0xed4245);
  let currentDescCount = 0;

  for (const [category, catAssignments] of grouped) {
    let catText = `**${category}**\n`;
    for (const a of catAssignments) {
      const members = a.assigned
        .map((m) => `${m.displayName} (<@${m.userId}>)`)
        .join(', ');
      catText += `${getIcon(a.item.icon)} ${a.item.name} (${a.quantity}x) → ${members}\n`;
    }
    catText += '\n';

    if (currentDescCount + catText.length > 3800) {
      embeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setDescription(catText);
      currentDescCount = catText.length;
    } else {
      const existingDesc = currentEmbed.data.description || '';
      currentEmbed.setDescription(existingDesc + catText);
      currentDescCount += catText.length;
    }
  }

  embeds.push(currentEmbed);

  // Add skipped members section if any
  if (skippedMembers.length > 0) {
    const skippedText = skippedMembers
      .map((m) => `${m.displayName} (<@${m.userId}>)`)
      .join(', ');
    const skippedEmbed = new EmbedBuilder()
      .setTitle('⚔️ Skipped — Did Not Do Guild War')
      .setColor(0xed4245)
      .setDescription(skippedText);
    embeds.push(skippedEmbed);
  }

  return embeds;
}

/**
 * Creates the per-person bidding guide embeds.
 * Shows each user what items to bid on, with copy numbers when quantity > 1.
 */
export function buildPerPersonEmbed(
  assignments: {
    item: ItemInfo;
    quantity: number;
    assigned: { userId: string; displayName: string }[];
  }[],
  date: string,
): EmbedBuilder[] {
  // Build a map of userId → list of { item, copyNumber, totalQty }
  const userItems = new Map<string, {
    displayName: string;
    items: { icon: string | undefined; name: string; copyNumber: number; totalQty: number }[];
  }>();

  for (const a of assignments) {
    for (let copyIdx = 0; copyIdx < a.assigned.length; copyIdx++) {
      const member = a.assigned[copyIdx];
      if (!userItems.has(member.userId)) {
        userItems.set(member.userId, { displayName: member.displayName, items: [] });
      }
      userItems.get(member.userId)!.items.push({
        icon: a.item.icon,
        name: a.item.name,
        copyNumber: copyIdx + 1,
        totalQty: a.quantity,
      });
    }
  }

  // Format lines
  const lines: string[] = [];
  for (const [userId, data] of userItems) {
    const itemStrs = data.items.map((i) => {
      const suffix = i.totalQty > 1 ? `(#${i.copyNumber})` : '';
      return `${getIcon(i.icon)} ${i.name}${suffix}`;
    });
    lines.push(`${data.displayName} (<@${userId}>): ${itemStrs.join(', ')}`);
  }

  // Build embeds with pagination
  const embeds: EmbedBuilder[] = [];
  let currentEmbed = new EmbedBuilder()
    .setTitle(`📌 Your Bidding Guide — ${date}`)
    .setColor(0x5865f2);
  let currentDescCount = 0;
  let currentText = '';

  for (const line of lines) {
    if (currentDescCount + line.length + 1 > 3800) {
      currentEmbed.setDescription(currentText);
      embeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder().setColor(0x5865f2);
      currentText = line + '\n';
      currentDescCount = line.length + 1;
    } else {
      currentText += line + '\n';
      currentDescCount += line.length + 1;
    }
  }

  if (currentText) {
    currentEmbed.setDescription(currentText);
    embeds.push(currentEmbed);
  }

  return embeds;
}

/**
 * Creates the remove member summary embed.
 */
export function buildRemoveMemberSummaryEmbed(
  userId: string,
  subs: SubscriptionInfo[],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🗑️ Remove <@${userId}>'s Subscriptions?`)
    .setColor(0xed4245);

  if (subs.length === 0) {
    embed.setDescription('This member has no active subscriptions.');
  } else {
    const desc = formatSubscriptionsByCategory(subs);
    embed.setDescription(
      `The following subscriptions will be removed:\n\n${desc}\nTotal: **${subs.length}** subscriptions`,
    );
  }

  return embed;
}

/**
 * Creates the preview embeds for /auction print.
 */
export function buildPrintPreviewEmbed(queues: QueueInfo[]): EmbedBuilder[] {
  const grouped = new Map<string, typeof queues>();
  for (const q of queues) {
    const cat = q.item.category || 'Uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(q);
  }

  const embeds: EmbedBuilder[] = [];
  let currentEmbed = new EmbedBuilder()
    .setTitle('🖨️ Queue Print Preview')
    .setColor(0x3498db)
    .setDescription('Here is how the current item queues will look when printed.\n\n');
  
  let currentDescCount = currentEmbed.data.description!.length;

  for (const [category, catQueues] of grouped) {
    let catText = `**${category}**\n`;
    for (const q of catQueues) {
      if (q.queue.length === 0) {
        catText += `${getIcon(q.item.icon)} ${q.item.name}: *(Empty)*\n`;
      } else {
        const members = q.queue.map((m, i) => `${i + 1}. ${m.displayName}`).join(', ');
        catText += `${getIcon(q.item.icon)} ${q.item.name} (${q.queue.length}): ${members}\n`;
      }
    }
    catText += '\n';

    // Discord description limit is 4096. We split at ~3800 to be safe.
    if (currentDescCount + catText.length > 3800) {
      embeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setDescription(catText);
      currentDescCount = catText.length;
    } else {
      currentEmbed.setDescription(currentEmbed.data.description! + catText);
      currentDescCount += catText.length;
    }
  }

  embeds.push(currentEmbed);
  return embeds;
}

/**
 * Creates the preview embeds for subscription logs.
 */
export function buildSubLogsEmbed(
  logs: import('../db/subscriptions.js').SubLogEntry[],
  title: string,
  items: ItemInfo[],
): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [];
  let currentEmbed = new EmbedBuilder().setTitle(title).setColor(0x99aab5);
  
  if (logs.length === 0) {
    currentEmbed.setDescription('No subscription actions in the last 7 days.');
    return [currentEmbed];
  }

  const lines = logs.map((l) => {
    const itemName = l['Item Name'];
    const item = items.find(i => i.name === itemName);
    return `\`${new Date(l.Date).toISOString().split('T')[0]}\` **${l.Action.toUpperCase()}** — ${getIcon(item?.icon)} ${itemName} — <@${l['Discord User ID']}>`;
  });
  
  // Discord limit is 10 embeds per message. 200 logs is safe.
  if (lines.length > 200) {
    lines.length = 200;
    lines.push('*(Displaying latest 200 logs...)*');
  }

  let currentDescCount = 0;
  let currentText = '';

  for (const line of lines) {
    if (currentDescCount + line.length > 3800) {
      currentEmbed.setDescription(currentText);
      embeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder().setColor(0x99aab5);
      currentText = line + '\n';
      currentDescCount = line.length + 1;
    } else {
      currentText += line + '\n';
      currentDescCount += line.length + 1;
    }
  }

  if (currentText) {
    currentEmbed.setDescription(currentText);
    embeds.push(currentEmbed);
  }

  return embeds;
}

/**
 * Creates the preview embeds for auction logs.
 */
export function buildAuctionLogsEmbed(
  logs: import('../db/auctionLog.js').AuctionLogEntry[],
  title: string,
  items: ItemInfo[],
): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [];
  let currentEmbed = new EmbedBuilder().setTitle(title).setColor(0xffee58);

  if (logs.length === 0) {
    currentEmbed.setDescription('No auctions published in the last 7 days.');
    return [currentEmbed];
  }

  const lines = logs.map((l) => {
    const itemName = l.Item;
    const item = items.find(i => i.name === itemName);
    return `\`${l.Date}\` ${getIcon(item?.icon)} **${itemName} (${l.Quantity}x)** → ${l['Assigned To']}`;
  });
  
  if (lines.length > 200) {
    lines.length = 200;
    lines.push('*(Displaying latest 200 logs...)*');
  }

  let currentDescCount = 0;
  let currentText = '';

  for (const line of lines) {
    if (currentDescCount + line.length > 3800) {
      currentEmbed.setDescription(currentText);
      embeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder().setColor(0xffee58);
      currentText = line + '\n';
      currentDescCount = line.length + 1;
    } else {
      currentText += line + '\n';
      currentDescCount += line.length + 1;
    }
  }

  if (currentText) {
    currentEmbed.setDescription(currentText);
    embeds.push(currentEmbed);
  }

  return embeds;
}


/**
 * Chunks an array of EmbedBuilders into arrays of arrays,
 * where each inner array is safe to send as a single Discord message
 * (max 10 embeds, max 6000 total characters per message).
 */
export function chunkEmbeds(embeds: EmbedBuilder[]): EmbedBuilder[][] {
  const chunks: EmbedBuilder[][] = [];
  let currentChunk: EmbedBuilder[] = [];
  let currentChunkChars = 0;

  for (const embed of embeds) {
    const embedLength = embed.length; // Uses discord.js built-in length getter

    if (
      currentChunk.length >= 10 ||
      currentChunkChars + embedLength > 6000
    ) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = [embed];
      currentChunkChars = embedLength;
    } else {
      currentChunk.push(embed);
      currentChunkChars += embedLength;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
