import {
  type ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { requireAdmin } from '../utils/permissions.js';
import {
  buildRemoveMemberSummaryEmbed,
} from '../utils/embeds.js';
import { getUserSubscriptions, removeUserFromAll } from '../db/subscriptions.js';

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
  );

  await interaction.editReply({
    content: '🗑️ **Remove Member Subscriptions**\nSelect the member whose subscriptions you want to remove:',
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
 * Shows the summary of subscriptions to be removed.
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
