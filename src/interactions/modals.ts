import type { ModalSubmitInteraction, Client } from 'discord.js';
import { handleRemoveMemberManualSubmit } from '../commands/removemember.js';

export async function handleModalInteraction(
  interaction: ModalSubmitInteraction,
  client: Client,
): Promise<void> {
  const id = interaction.customId;

  try {
    if (id === 'removemember_manual_modal') {
      await handleRemoveMemberManualSubmit(interaction, client);
    } else {
      console.warn(`Unhandled modal interaction: ${id}`);
    }
  } catch (error) {
    console.error('Error handling modal interaction:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ An error occurred processing your submission.',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred processing your submission.',
          ephemeral: true,
        });
      }
    } catch {
      // Ignore follow-up errors
    }
  }
}
