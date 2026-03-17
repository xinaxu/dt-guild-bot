import {
  ChatInputCommandInteraction,
  GuildMember,
  ButtonInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { getGuildConfig, isGuildConfigured } from '../db/registry.js';

type SupportedInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | ModalSubmitInteraction;

export async function isAdmin(guildId: string, member: GuildMember): Promise<boolean> {
  const config = await getGuildConfig(guildId);
  if (!config) return false;
  return member.roles.cache.has(config.adminRoleId);
}

export async function isMember(guildId: string, member: GuildMember): Promise<boolean> {
  const config = await getGuildConfig(guildId);
  if (!config) return false;
  return (
    member.roles.cache.has(config.memberRoleId) ||
    member.roles.cache.has(config.adminRoleId)
  );
}

export async function requireAdmin(
  interaction: SupportedInteraction,
): Promise<boolean> {
  if (!interaction.guildId) return false;

  // If they are trying to run /setup, we should let them bypass this check
  // That is handled uniquely inside the /setup command logic!
  if (interaction.isChatInputCommand() && interaction.commandName === 'auction' && interaction.options.getSubcommand() === 'setup') {
    return true; // We do a different native admin check inside the handler
  }
  
  if (!(await isGuildConfigured(interaction.guildId))) {


    const content = '❌ This server has not been configured yet. An administrator must run `/auction setup` first.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
    return false;
  }

  const member = interaction.member as GuildMember;
  if (!(await isAdmin(interaction.guildId, member))) {
    const content = '❌ You need the Admin role to use this command.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
    return false;
  }
  return true;
}

export async function requireMember(
  interaction: SupportedInteraction,
): Promise<boolean> {
  if (!interaction.guildId) return false;

  if (!(await isGuildConfigured(interaction.guildId))) {
    const content = '❌ This server has not been configured yet. An administrator must run `/auction setup` first.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
    return false;
  }

  const member = interaction.member as GuildMember;
  if (!(await isMember(interaction.guildId, member))) {
    const content = '❌ You need the Member role to use this command.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
    return false;
  }
  return true;
}
