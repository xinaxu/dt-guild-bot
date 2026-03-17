import {
  type ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { requireAdmin } from '../utils/permissions.js';
import { clearAllGuildData } from '../db/subscriptions.js';

export async function handleResetCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireAdmin(interaction))) return;

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('reset_confirm')
      .setLabel('⚠️ Yes, delete everything')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('reset_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    content:
      '🚨 **Are you absolutely sure?**\n\n' +
      'This will:\n' +
      '• Delete **all** subscription queues\n' +
      '• Delete **all** auction logs\n' +
      '• Delete **all** subscription logs\n\n' +
      'Your server configuration (roles) will be kept.\n' +
      'This action **cannot be undone**.',
    components: [buttonRow],
  });
}

export async function handleResetConfirm(
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  await interaction.update({
    content: '⏳ Resetting all data...',
    components: [],
  });

  try {
    await clearAllGuildData(interaction.guildId!);

    await interaction.editReply(
      '✅ All data has been reset. Subscriptions, queues, and all logs have been cleared.',
    );
  } catch (error) {
    console.error('Error resetting data:', error);
    await interaction.editReply('❌ Failed to reset data. Check the logs.');
  }
}
