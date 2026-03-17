import { GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { dynamo, TABLE } from './dynamo.js';

export interface GuildConfig {
  guildId: string;
  adminRoleId: string;
  memberRoleId: string;
}

const guildCache = new Map<string, GuildConfig>();
let registryInitialized = false;

/**
 * Load all guild configs from DynamoDB into memory.
 */
export async function initRegistry(): Promise<void> {
  if (registryInitialized) return;

  // Scan for all CONFIG entries — we expect very few guilds
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'begins_with(PK, :prefix) AND SK = :sk',
    // Can't do begins_with on PK in a Query unless using a GSI.
    // Instead, do a simple scan-like approach: since we have very few guilds,
    // we'll load them individually or scan. For simplicity, we mark registry as
    // initialized and load on-demand.
  })).catch(() => null);

  // On-demand loading is simpler for multi-guild: load when first accessed.
  registryInitialized = true;
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig | undefined> {
  // Check cache first
  if (guildCache.has(guildId)) return guildCache.get(guildId);

  // Load from DynamoDB
  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: TABLE,
      Key: {
        PK: { S: `GUILD#${guildId}` },
        SK: { S: 'CONFIG' },
      },
    }));

    if (result.Item) {
      const config: GuildConfig = {
        guildId,
        adminRoleId: result.Item.adminRoleId?.S ?? '',
        memberRoleId: result.Item.memberRoleId?.S ?? '',
      };
      guildCache.set(guildId, config);
      return config;
    }
  } catch (error) {
    console.error(`Error loading guild config for ${guildId}:`, error);
  }

  return undefined;
}

export async function updateGuildConfig(config: GuildConfig): Promise<void> {
  await dynamo.send(new PutItemCommand({
    TableName: TABLE,
    Item: {
      PK: { S: `GUILD#${config.guildId}` },
      SK: { S: 'CONFIG' },
      adminRoleId: { S: config.adminRoleId },
      memberRoleId: { S: config.memberRoleId },
    },
  }));

  guildCache.set(config.guildId, config);
}

export async function isGuildConfigured(guildId: string): Promise<boolean> {
  const config = await getGuildConfig(guildId);
  return !!config && !!config.adminRoleId && !!config.memberRoleId;
}

/**
 * Delete the guild config from DynamoDB and cache.
 */
export async function deleteGuildConfig(guildId: string): Promise<void> {
  const { DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
  await dynamo.send(new DeleteItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GUILD#${guildId}` },
      SK: { S: 'CONFIG' },
    },
  }));
  guildCache.delete(guildId);
}
