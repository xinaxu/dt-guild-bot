import type { ModalSubmitInteraction } from 'discord.js';

export async function handleModalInteraction(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const id = interaction.customId;

  try {
    // No modals currently — setup no longer uses modals.
    // This handler is kept as a placeholder for future modal interactions.
    console.warn(`Unhandled modal interaction: ${id}`);
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
