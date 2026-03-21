import {
  Client,
  GatewayIntentBits,
  Events,
} from 'discord.js';
import { config } from './config.js';
import {
  handleAuctionCommand,
  handleAuctionChannelSelect,
  handleQueueNav,
  handleLogsChannelSelect,
  handleCutLineCategorySelect,
  handleCutLineItemSelect,
  handleCutLineUserSelect,
  handleCutLineNav,
  handleCutLineBackToCategories,
  handleCutLineBackToItems,
  handleCutLineMoveUser,
  handlePublishCatSelect,
  handlePublishItemSelect,
  handlePublishQtySelect,
  handlePublishAddItem,
  handlePublishRemoveItem,
  handlePublishDone,
} from './commands/auction.js';

import { handleRemoveMemberCommand, handleRemoveMemberSelect } from './commands/removemember.js';
import {
  handleSubCommand,
  handleSubSelectMenu,
  handleSubUserSelect,
  handleSubCategorySelect,
  handleSubItemsSelect,
  handleSubBackToCategories,
  handleSubCatDone,
} from './commands/mysubs.js';
import { handleResetCommand } from './commands/reset.js';
import { handleButtonInteraction } from './interactions/buttons.js';
import { handleModalInteraction } from './interactions/modals.js';
import { initRegistry } from './db/registry.js';
import { handleSetupRoleSelect, handleSetupCompleteButton, handleSetupStartButton } from './commands/setupFlow.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Bot is online as ${readyClient.user.tag}`);
  try {
    await initRegistry();
    console.log('✅ Master Registry initialized.');
  } catch (error) {
    console.error('❌ Failed to initialize Master Registry:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ─── Slash Commands ───
    if (interaction.isChatInputCommand()) {
      console.log(`[Interaction] Received /${interaction.commandName} ${interaction.options.getSubcommand(false) || ''} from ${interaction.user.tag}`);
      if (interaction.commandName === 'auction') {
        const sub = interaction.options.getSubcommand();
        switch (sub) {
          case 'publish':
          case 'queue':
          case 'print-sub-logs':
          case 'print-auction-logs':
          case 'cut-line':
          case 'setup':
          case 'store':
          case 'help': {
            await handleAuctionCommand(interaction);
            break;
          }
          case 'sub':
            await handleSubCommand(interaction);
            break;
          case 'remove-member':
            await handleRemoveMemberCommand(interaction);
            break;
          case 'reset':
            await handleResetCommand(interaction);
            break;
        }
      }

    // ─── Buttons ───
    } else if (interaction.isButton()) {
      console.log(`[Interaction] Received Button: ${interaction.customId} from ${interaction.user.tag}`);
      if (interaction.customId === 'setup_complete_btn') {
        await handleSetupCompleteButton(interaction);
      } else if (interaction.customId === 'setup_start_btn') {
        await handleSetupStartButton(interaction);
      } else if (interaction.customId.startsWith('publish_add_')) {
        const stateKey = interaction.customId.replace('publish_add_', '');
        await handlePublishAddItem(interaction, stateKey);
      } else if (interaction.customId.startsWith('publish_done_')) {
        const stateKey = interaction.customId.replace('publish_done_', '');
        await handlePublishDone(interaction, stateKey);
      } else if (interaction.customId.startsWith('sub_back_')) {
        await handleSubBackToCategories(interaction);
      } else if (interaction.customId.startsWith('sub_cat_done_')) {
        await handleSubCatDone(interaction);
      } else if (interaction.customId === 'queue_prev' || interaction.customId === 'queue_next') {
        await handleQueueNav(interaction);
      } else if (interaction.customId === 'cutline_prev') {
        await handleCutLineNav(interaction, 'prev');
      } else if (interaction.customId === 'cutline_next') {
        await handleCutLineNav(interaction, 'next');
      } else if (interaction.customId === 'cutline_back_categories') {
        await handleCutLineBackToCategories(interaction);
      } else if (interaction.customId === 'cutline_back_items') {
        await handleCutLineBackToItems(interaction);
      } else if (interaction.customId === 'cutline_move_top') {
        await handleCutLineMoveUser(interaction, 'top');
      } else if (interaction.customId === 'cutline_move_up') {
        await handleCutLineMoveUser(interaction, 'up');
      } else if (interaction.customId === 'cutline_move_down') {
        await handleCutLineMoveUser(interaction, 'down');
      } else if (interaction.customId === 'auction_cancel') {
        await interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
      } else {
        await handleButtonInteraction(interaction);
      }

    // ─── String Select Menus ───
    } else if (interaction.isStringSelectMenu()) {
      console.log(`[Interaction] Received StringSelect: ${interaction.customId} from ${interaction.user.tag}`);
      const id = interaction.customId;
      if (id.startsWith('publish_cat_select_')) {
        const stateKey = id.replace('publish_cat_select_', '');
        await handlePublishCatSelect(interaction, stateKey);
      } else if (id.startsWith('publish_item_select_')) {
        const stateKey = id.replace('publish_item_select_', '');
        await handlePublishItemSelect(interaction, stateKey);

      } else if (id.startsWith('publish_qty_select_')) {
        const stateKey = id.replace('publish_qty_select_', '');
        await handlePublishQtySelect(interaction, stateKey);
      } else if (id.startsWith('publish_remove_select_')) {
        const stateKey = id.replace('publish_remove_select_', '');
        await handlePublishRemoveItem(interaction, stateKey);
      } else if (id.startsWith('sub_category_')) {
        await handleSubCategorySelect(interaction);
      } else if (id.startsWith('sub_items_')) {
        await handleSubItemsSelect(interaction);
      } else if (id.startsWith('select_')) {
        // Paginated select menu change (subscribe, unsubscribe)
        await handleSubSelectMenu(interaction);
      } else if (id === 'cutline_category') {
        await handleCutLineCategorySelect(interaction);
      } else if (id === 'cutline_item') {
        await handleCutLineItemSelect(interaction);
      } else if (id === 'cutline_user_select') {
        await handleCutLineUserSelect(interaction);
      }

    // ─── Channel Select Menus ───
    } else if (interaction.isChannelSelectMenu()) {
      console.log(`[Interaction] Received ChannelSelect: ${interaction.customId} from ${interaction.user.tag}`);
      const id = interaction.customId;
      if (id.startsWith('auction_channel_')) {
        await handleAuctionChannelSelect(interaction);
      } else if (id.startsWith('print_logs_channel_')) {
        await handleLogsChannelSelect(interaction);
      }

    // ─── User Select Menus ───
    } else if (interaction.isUserSelectMenu()) {
      console.log(`[Interaction] Received UserSelect: ${interaction.customId} from ${interaction.user.tag}`);
      if (interaction.customId === 'removemember_select') {
        await handleRemoveMemberSelect(interaction);
      } else if (interaction.customId === 'sub_user_select') {
        await handleSubUserSelect(interaction);
      }

    // ─── Role Select Menus ───
    } else if (interaction.isRoleSelectMenu()) {
      console.log(`[Interaction] Received RoleSelect: ${interaction.customId} from ${interaction.user.tag}`);
      if (interaction.customId.startsWith('setup_')) {
        await handleSetupRoleSelect(interaction);
      }

    // ─── Modals ───
    } else if (interaction.isModalSubmit()) {
      console.log(`[Interaction] Received ModalSubmit: ${interaction.customId} from ${interaction.user.tag}`);
      await handleModalInteraction(interaction, client);
    }
  } catch (error) {
    const interactionName = interaction.isCommand() ? interaction.commandName : ('customId' in interaction ? interaction.customId : interaction.type);
    console.error(`[InteractionError] Unhandled interaction error processing ${interactionName} for ${interaction.user?.tag || 'Unknown'}:`, error);
  }
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`\n⚠️ Received ${signal}. Shutting down gracefully...`);
  client.destroy();
  console.log('✅ Discord client destroyed. Goodbye!');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

client.login(config.botToken);
