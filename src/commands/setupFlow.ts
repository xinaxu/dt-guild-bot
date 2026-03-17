import {
  type RoleSelectMenuInteraction,
  type ButtonInteraction,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { updateGuildConfig } from '../db/registry.js';

// ─── Setup State ─────────────────────────────────────────────────────────────

interface SetupState {
  adminRoleId: string;
  memberRoleId: string;
}

const setupStates = new Map<string, SetupState>();

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * Start button → show both role selectors at once + save button.
 */
export async function handleSetupStartButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  setupStates.set(guildId, { adminRoleId: '', memberRoleId: '' });

  const adminRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('setup_admin_role')
      .setPlaceholder('Select the Admin role...'),
  );

  const memberRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('setup_member_role')
      .setPlaceholder('Select the Member role...'),
  );

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_complete_btn')
      .setLabel('💾 Save Configuration')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('auction_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content:
      '**Configure Roles**\n\n' +
      '• **Admin Role** — Who can manage auctions and publish.\n' +
      '• **Member Role** — Who can subscribe to item queues.\n\n' +
      'Select both roles below, then click **Save Configuration**.',
    components: [adminRow, memberRow, buttonRow],
    ephemeral: true,
  });
}

/**
 * Role select handler — stores the selected role in state.
 */
export async function handleSetupRoleSelect(
  interaction: RoleSelectMenuInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  let state = setupStates.get(guildId);
  if (!state) {
    state = { adminRoleId: '', memberRoleId: '' };
    setupStates.set(guildId, state);
  }

  const roleId = interaction.values[0];

  if (interaction.customId === 'setup_admin_role') {
    state.adminRoleId = roleId;
  } else if (interaction.customId === 'setup_member_role') {
    state.memberRoleId = roleId;
  }

  // Just acknowledge the selection without changing the UI
  await interaction.deferUpdate();
}

/**
 * Complete setup — save config to DynamoDB.
 */
export async function handleSetupCompleteButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const state = setupStates.get(guildId);

  if (!state || !state.adminRoleId || !state.memberRoleId) {
    await interaction.reply({
      content: '❌ Please select **both** the Admin role and Member role before saving.',
      ephemeral: true,
    });
    return;
  }

  await interaction.update({
    content: '⏳ Saving configuration...',
    components: [],
  });

  try {
    await updateGuildConfig({
      guildId,
      adminRoleId: state.adminRoleId,
      memberRoleId: state.memberRoleId,
    });

    setupStates.delete(guildId);

    await interaction.editReply({
      content:
        `✅ **Server Setup Complete!**\n\n` +
        `• Admin Role: <@&${state.adminRoleId}>\n` +
        `• Member Role: <@&${state.memberRoleId}>\n\n` +
        `Your server is now configured. Use \`/auction store\` to browse items, or \`/auction help\` for all commands.`,
    });
  } catch (error) {
    console.error('Error saving guild config:', error);
    await interaction.editReply({
      content: `❌ **Failed to save configuration.**\n\nError: \`${(error as Error).message}\`\n\nPlease try again.`,
    });
  }
}
