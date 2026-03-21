import {
  type ChatInputCommandInteraction,
  type Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { requireAdmin } from '../utils/permissions.js';
import {
  buildRemoveMemberSummaryEmbed,
} from '../utils/embeds.js';
import { getUserSubscriptions, removeUserFromAll, findUsersByDisplayName } from '../db/subscriptions.js';

// Store selected user IDs for the confirm step
const pendingRemovals = new Map<string, string>();

export async function handleRemoveMemberCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireAdmin(interaction))) return;

  const selectRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('removemember_select')
      .setPlaceholder('Select a member...'),
  );

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('removemember_continue')
      .setLabel('Continue →')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('removemember_manual')
      .setLabel('✏️ Enter Manually')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    content: '🗑️ **Remove Member Subscriptions**\nSelect the member whose subscriptions you want to remove, or click **Enter Manually** to look up by User ID or display name:',
    components: [selectRow, buttonRow],
  });
}

/**
 * Handles user select menu interaction.
 */
export async function handleRemoveMemberSelect(
  interaction: import('discord.js').UserSelectMenuInteraction,
): Promise<void> {
  const userId = interaction.values[0];
  pendingRemovals.set(interaction.message.id, userId);
  await interaction.deferUpdate();
}

/**
 * Opens a modal for manual user ID / display name entry.
 */
export async function handleRemoveMemberManualButton(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('removemember_manual_modal')
    .setTitle('Remove Member — Manual Lookup');

  const input = new TextInputBuilder()
    .setCustomId('removemember_manual_input')
    .setLabel('User ID or Display Name')
    .setPlaceholder('e.g. 123456789012345678 or SomeUser')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

/**
 * Handles the modal submission for manual member removal.
 * Resolves the input as user ID or display name.
 */
export async function handleRemoveMemberManualSubmit(
  interaction: import('discord.js').ModalSubmitInteraction,
  client: Client,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const input = interaction.fields.getTextInputValue('removemember_manual_input').trim();
  if (!input) {
    await interaction.editReply('❌ No input provided.');
    return;
  }

  const guildId = interaction.guildId!;

  // Check if input looks like a user ID (numeric, 17-20 digits)
  const isUserId = /^\d{17,20}$/.test(input);
  // Also handle mention format <@123456>
  const mentionMatch = input.match(/^<@!?(\d{17,20})>$/);
  const resolvedId = mentionMatch ? mentionMatch[1] : isUserId ? input : null;

  if (resolvedId) {
    // ─── Resolve by User ID ───
    let userTag = resolvedId;
    try {
      const user = await client.users.fetch(resolvedId);
      userTag = user.tag;
    } catch {
      // User may not exist or be fetchable — still proceed using the ID
    }

    await showRemovalSummary(interaction, guildId, resolvedId, userTag);
  } else {
    // ─── Resolve by Display Name ───
    const matches = await findUsersByDisplayName(guildId, input);

    if (matches.length === 0) {
      await interaction.editReply(`❌ No subscriptions found for display name **${input}**.`);
    } else if (matches.length === 1) {
      const match = matches[0];
      let userTag = match.displayName;
      try {
        const user = await client.users.fetch(match.userId);
        userTag = user.tag;
      } catch {
        // Couldn't fetch — use display name
      }
      await showRemovalSummary(interaction, guildId, match.userId, userTag);
    } else {
      // Ambiguous — show all matches
      const lines = matches.map((m) => `• **${m.displayName}** — ID: \`${m.userId}\``);
      await interaction.editReply(
        `⚠️ Multiple users match **${input}**:\n${lines.join('\n')}\n\nPlease re-run the command and enter the exact **User ID** instead.`,
      );
    }
  }
}

/**
 * Shows the summary embed and confirm/cancel buttons for a resolved user.
 */
async function showRemovalSummary(
  interaction: import('discord.js').ModalSubmitInteraction,
  guildId: string,
  userId: string,
  userTag: string,
): Promise<void> {
  const subs = await getUserSubscriptions(guildId, userId);
  const embed = buildRemoveMemberSummaryEmbed(userId, subs);

  if (subs.length === 0) {
    await interaction.editReply({
      content: `No active subscriptions found for **${userTag}** (\`${userId}\`).`,
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('removemember_cancel')
            .setLabel('OK')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return;
  }

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`removemember_confirm_${userId}`)
      .setLabel('✅ Confirm Removal')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('removemember_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    content: `Found subscriptions for **${userTag}** (\`${userId}\`):`,
    embeds: [embed],
    components: [buttonRow],
  });
}

/**
 * Shows the summary of subscriptions to be removed (from dropdown flow).
 */
export async function handleRemoveMemberContinue(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const userId = pendingRemovals.get(interaction.message.id);
  if (!userId) {
    await interaction.update({
      content: '❌ Please select a member first.',
      components: [],
    });
    return;
  }

  const subs = await getUserSubscriptions(interaction.guildId!, userId);
  const embed = buildRemoveMemberSummaryEmbed(userId, subs);

  if (subs.length === 0) {
    await interaction.update({
      content: null,
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('removemember_cancel')
            .setLabel('OK')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return;
  }

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`removemember_confirm_${userId}`)
      .setLabel('✅ Confirm Removal')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('removemember_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: null,
    embeds: [embed],
    components: [buttonRow],
  });
}

/**
 * Executes the member removal.
 */
export async function handleRemoveMemberConfirm(
  interaction: import('discord.js').ButtonInteraction,
  userId: string,
): Promise<void> {
  await interaction.update({
    content: '⏳ Removing subscriptions...',
    embeds: [],
    components: [],
  });

  try {
    const removed = await removeUserFromAll(interaction.guildId!, userId);
    const itemList = removed
      .map((s) => `  ${s.icon || '📦'} ${s.name}`)
      .join('\n');
    await interaction.editReply(
      `✅ Removed <@${userId}> from ${removed.length} subscription(s):\n${itemList}`,
    );
  } catch (error) {
    console.error('Error removing member:', error);
    await interaction.editReply('❌ Failed to remove subscriptions. Check the logs.');
  }

  pendingRemovals.delete(interaction.message.id);
}
