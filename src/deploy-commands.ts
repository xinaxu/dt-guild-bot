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
    )
    .addSubcommand((sub) =>
      sub.setName('time').setDescription('View the next auction time'),
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(config.botToken);

async function deploy(): Promise<void> {
  try {
    const guildId = process.argv[2] ?? process.env.GUILD_ID;

    if (guildId) {
      console.log(`🚀 Deploying commands to guild: ${guildId} (Instant propagation)`);
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, guildId),
        { body: commands },
      );
      console.log(`✅ Guild commands registered for ${guildId}`);
    } else {
      console.log('🌍 Registering global slash commands...');
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands },
      );
      console.log('✅ Global slash commands registered successfully.');
      console.log('💡 Note: Global commands can take up to an hour to propagate.');
    }
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
}

deploy();
