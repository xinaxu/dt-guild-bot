import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from './config.js';

const commands = [
  new SlashCommandBuilder()
    .setName('auction')
    .setDescription('Guild auction management')
    .addSubcommand((sub) =>
      sub.setName('store').setDescription('View all available auction items'),
    )
    .addSubcommand((sub) =>
      sub.setName('publish').setDescription('Set up and publish today\'s auction assignments (Admin only)'),
    )
    .addSubcommand((sub) =>
      sub.setName('queue').setDescription('View the current stand-by line for all items'),
    )
    .addSubcommand((sub) =>
      sub.setName('print-sub-logs').setDescription('Preview and post subscription logs from the last 7 days (Admin only)'),
    )
    .addSubcommand((sub) =>
      sub.setName('print-auction-logs').setDescription('Preview and post auction logs from the last 7 days (Admin only)'),
    )
    .addSubcommand((sub) =>
      sub.setName('cut-line').setDescription('Move a user to the top of the queue for an item (Admin only)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Initializes the bot for this server (Server Admin only)')
    )
    .addSubcommand((sub) =>
      sub.setName('sub').setDescription('View and manage auction subscriptions'),
    )
    .addSubcommand((sub) =>
      sub.setName('help').setDescription('View instructions on how to use the bot'),
    )
    .addSubcommand((sub) =>
      sub.setName('remove-member').setDescription('Remove all subscriptions for a member (Admin only)'),
    )
    .addSubcommand((sub) =>
      sub.setName('reset').setDescription('Reset all bot data — removes all items, subscriptions, and logs (Admin only)'),
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(config.botToken);

async function deploy(): Promise<void> {
  try {
    console.log(`Registering ${commands.length} global slash command(s)...`);

    // NOTE: To clear guild commands that shadow global ones, you must pass the guild ID as an argument:
    // yarn deploy-commands <guild_id>
    const guildIdToClear = process.argv[2];
    if (guildIdToClear) {
      console.log(`Clearing existing guild commands for guild: ${guildIdToClear}`);
      try {
        await rest.put(
          Routes.applicationGuildCommands(config.clientId, guildIdToClear),
          { body: [] },
        );
        console.log(`✅ Cleared guild commands for ${guildIdToClear}`);
      } catch (err) {
        console.warn(`⚠️ Failed to clear guild commands (might not exist):`, err);
      }
    }

    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands },
    );

    console.log('✅ Global slash commands registered successfully. (Note: Discord can take up to an hour to propagate global commands initially, though usually much faster)');
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
}

deploy();
