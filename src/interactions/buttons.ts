import type {
  ButtonInteraction,
} from 'discord.js';
import {
  handleAuctionConfirm,
  handleLogsPrintConfirm,
} from '../commands/auction.js';
import { requireAdmin } from '../utils/permissions.js';
import {
  handleRemoveMemberContinue,
  handleRemoveMemberConfirm,
  handleRemoveMemberManualButton,
} from '../commands/removemember.js';
import { handleResetConfirm } from '../commands/reset.js';
import {
  handleSubscribeButton,
  handleUnsubscribeButton,
  handleSubscribeDone,
  handleUnsubscribeDone,
  handleSubSelectNav,
  handleSubViewOwn,
  handleMySubsNav,
  handleSubCancel,
} from '../commands/mysubs.js';
import {
  getSelectState,
  deleteSelectState,
} from '../utils/pagination.js';

export async function handleButtonInteraction(
  interaction: ButtonInteraction,
): Promise<void> {
  const id = interaction.customId;

  try {
    // ─── Select Pagination (subscribe, unsubscribe) ───
    if (id.startsWith('select_prev_')) {
      const purpose = id.replace('select_prev_', '');
      await handleSubSelectNav(interaction, purpose, 'prev');
    } else if (id.startsWith('select_next_')) {
      const purpose = id.replace('select_next_', '');
      await handleSubSelectNav(interaction, purpose, 'next');
    } else if (id.startsWith('select_done_')) {
      const purpose = id.replace('select_done_', '');
      const state = getSelectState(interaction.message.id);
      if (!state) {
        await interaction.update({
          content: '❌ Session expired.',
          embeds: [],
          components: [],
        });
        return;
      }
      const selected = [...state.selected];
      deleteSelectState(interaction.message.id);

      if (purpose === 'subscribe') {
        await handleSubscribeDone(interaction, selected);
      } else if (purpose === 'unsubscribe') {
        await handleUnsubscribeDone(interaction, selected);
      }

    } else if (id.startsWith('auction_confirm_')) {
      if (!(await requireAdmin(interaction))) return;
      const stateKey = id.replace('auction_confirm_', '');
      await handleAuctionConfirm(interaction, stateKey);
    } else if (id.startsWith('print_logs_confirm_')) {
      if (!(await requireAdmin(interaction))) return;
      const stateKey = id.replace('print_logs_confirm_', '');
      await handleLogsPrintConfirm(interaction, stateKey);
    } else if (id.startsWith('print_logs_send_here_')) {
      if (!(await requireAdmin(interaction))) return;
      const stateKey = id.replace('print_logs_send_here_', '');
      await handleLogsPrintConfirm(interaction, stateKey, true);
    } else if (id === 'auction_cancel') {
      await interaction.update({
        content: 'Cancelled.',
        embeds: [],
        components: [],
      });

    // ─── Remove Member ───
    } else if (id === 'removemember_continue') {
      if (!(await requireAdmin(interaction))) return;
      await handleRemoveMemberContinue(interaction);
    } else if (id === 'removemember_manual') {
      if (!(await requireAdmin(interaction))) return;
      await handleRemoveMemberManualButton(interaction);
    } else if (id.startsWith('removemember_confirm_')) {
      if (!(await requireAdmin(interaction))) return;
      const userId = id.replace('removemember_confirm_', '');
      await handleRemoveMemberConfirm(interaction, userId);
    } else if (id === 'removemember_cancel') {
      await interaction.update({
        content: 'Cancelled.',
        embeds: [],
        components: [],
      });

    // ─── Sub ───
    } else if (id === 'sub_view_own') {
      await handleSubViewOwn(interaction);
    } else if (id === 'sub_subscribe' || id === 'mysubs_sub') {
      await handleSubscribeButton(interaction);
    } else if (id === 'sub_unsubscribe' || id === 'mysubs_unsub') {
      await handleUnsubscribeButton(interaction);
    } else if (id === 'mysubs_prev') {
      await handleMySubsNav(interaction, 'prev');
    } else if (id === 'mysubs_next') {
      await handleMySubsNav(interaction, 'next');
    } else if (id === 'sub_cancel') {
      await handleSubCancel(interaction);

    // ─── Reset ───
    } else if (id === 'reset_confirm') {
      if (!(await requireAdmin(interaction))) return;
      await handleResetConfirm(interaction);
    } else if (id === 'reset_cancel') {
      await interaction.update({
        content: 'Reset cancelled.',
        components: [],
      });
    }
  } catch (error) {
    console.error('Error handling button interaction:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ An error occurred.',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred.',
          ephemeral: true,
        });
      }
    } catch {
      // Ignore follow-up errors
    }
  }
}
