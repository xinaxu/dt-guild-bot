import { PutItemCommand, QueryCommand, BatchWriteItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { dynamo, TABLE } from './dynamo.js';
import type { SubscriptionInfo } from '../utils/embeds.js';

// ─── In-Memory Queue Cache ────────────────────────────────────────────────────

interface QueueEntry {
  userId: string;
  displayName: string;
}

// Map<guildId, Map<itemName, QueueEntry[]>>
const queueCache = new Map<string, Map<string, QueueEntry[]>>();

function getGuildCache(guildId: string): Map<string, QueueEntry[]> {
  if (!queueCache.has(guildId)) queueCache.set(guildId, new Map());
  return queueCache.get(guildId)!;
}

/**
 * Load a single item's queue from DynamoDB into cache.
 */
async function loadQueue(guildId: string, itemName: string): Promise<QueueEntry[]> {
  const cache = getGuildCache(guildId);
  if (cache.has(itemName)) return cache.get(itemName)!;

  const prefix = `SUB#${itemName}#`;
  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': { S: `GUILD#${guildId}` },
      ':prefix': { S: prefix },
    },
  }));

  const entries: QueueEntry[] = (result.Items ?? [])
    .sort((a, b) => {
      const posA = parseInt(a.SK?.S?.split('#').pop() ?? '0', 10);
      const posB = parseInt(b.SK?.S?.split('#').pop() ?? '0', 10);
      return posA - posB;
    })
    .map((item) => ({
      userId: item.userId?.S ?? '',
      displayName: item.displayName?.S ?? '',
    }));

  cache.set(itemName, entries);
  return entries;
}

/**
 * Persist an entire queue to DynamoDB (full overwrite).
 * Deletes all existing entries then writes new ones.
 */
async function persistQueue(guildId: string, itemName: string, entries: QueueEntry[]): Promise<void> {
  const pk = `GUILD#${guildId}`;
  const prefix = `SUB#${itemName}#`;

  // First, query existing entries to delete them
  const existing = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': { S: pk },
      ':prefix': { S: prefix },
    },
    ProjectionExpression: 'SK',
  }));

  const newKeys = new Set(entries.map((_, idx) => `${prefix}${String(idx).padStart(5, '0')}`));

  const deleteRequests = (existing.Items ?? [])
    .filter((item) => !newKeys.has(item.SK!.S!))
    .map((item) => ({
      DeleteRequest: {
        Key: { PK: { S: pk }, SK: item.SK! },
      },
    }));

  const putRequests = entries.map((entry, idx) => ({
    PutRequest: {
      Item: {
        PK: { S: pk },
        SK: { S: `${prefix}${String(idx).padStart(5, '0')}` },
        userId: { S: entry.userId },
        displayName: { S: entry.displayName },
      },
    },
  }));

  // Execute Deletes fully first
  for (let i = 0; i < deleteRequests.length; i += 25) {
    const batch = deleteRequests.slice(i, i + 25);
    await dynamo.send(new BatchWriteItemCommand({
      RequestItems: { [TABLE]: batch },
    }));
  }

  // Execute Puts heavily second
  for (let i = 0; i < putRequests.length; i += 25) {
    const batch = putRequests.slice(i, i + 25);
    await dynamo.send(new BatchWriteItemCommand({
      RequestItems: { [TABLE]: batch },
    }));
  }
}

// ─── Per-Guild Concurrency Lock ──────────────────────────────────────────────

const guildWriteLocks = new Map<string, Promise<void>>();

/**
 * Per-guild serial write lock to prevent interleaving of async operations.
 * Each guild has its own lock so busy guilds don't block others.
 */
function withWriteLock<T>(guildId: string, fn: () => Promise<T>): Promise<T> {
  const prev = guildWriteLocks.get(guildId) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  guildWriteLocks.set(guildId, next);
  return prev.then(async () => {
    try {
      return await fn();
    } finally {
      resolve!();
    }
  });
}

// ─── Subscription Log ────────────────────────────────────────────────────────

async function logSubscriptionAction(
  guildId: string,
  action: 'subscribe' | 'unsubscribe' | 'remove-member' | 'cut-line',
  userId: string,
  displayName: string,
  itemName: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await dynamo.send(new PutItemCommand({
      TableName: TABLE,
      Item: {
        PK: { S: `GUILD#${guildId}` },
        SK: { S: `SUBLOG#${now}#${userId}` },
        action: { S: action },
        displayName: { S: displayName },
        itemName: { S: itemName },
        timestamp: { S: now },
      },
    }));
  } catch (error) {
    console.error('Error logging subscription action:', error);
  }
}

export interface SubLogEntry {
  Date: string;
  Action: string;
  'Discord User ID': string;
  'Display Name': string;
  'Item Name': string;
}

export async function getRecentSubLogs(guildId: string, days: number): Promise<SubLogEntry[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString();

  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': { S: `GUILD#${guildId}` },
      ':start': { S: `SUBLOG#${cutoffStr}` },
      ':end': { S: `SUBLOG#~` }, // ~ sorts after all ISO dates
    },
  }));

  return (result.Items ?? []).map((item) => ({
    Date: item.timestamp?.S ?? '',
    Action: item.action?.S ?? '',
    'Discord User ID': item.SK?.S?.split('#').pop() ?? '',
    'Display Name': item.displayName?.S ?? '',
    'Item Name': item.itemName?.S ?? '',
  }));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getSubscriptions(
  guildId: string,
  itemName: string,
): Promise<{ userId: string; displayName: string }[]> {
  return loadQueue(guildId, itemName);
}

export async function subscribe(
  guildId: string,
  itemName: string,
  userId: string,
  displayName: string,
): Promise<boolean> {
  return withWriteLock(guildId, async () => {
    const queue = await loadQueue(guildId, itemName);

    // Check for duplicate
    if (queue.some((e) => e.userId === userId)) return false;

    queue.push({ userId, displayName });
    await persistQueue(guildId, itemName, queue);
    await logSubscriptionAction(guildId, 'subscribe', userId, displayName, itemName);
    return true;
  });
}

export async function unsubscribe(
  guildId: string,
  itemName: string,
  userId: string,
): Promise<boolean> {
  return withWriteLock(guildId, async () => {
    const queue = await loadQueue(guildId, itemName);
    const index = queue.findIndex((e) => e.userId === userId);
    if (index === -1) return false;

    const displayName = queue[index].displayName;
    queue.splice(index, 1);
    await persistQueue(guildId, itemName, queue);
    await logSubscriptionAction(guildId, 'unsubscribe', userId, displayName, itemName);
    return true;
  });
}

export async function getUserSubscriptions(
  guildId: string,
  userId: string,
): Promise<SubscriptionInfo[]> {
  const { getItems } = await import('./items.js');
  const allItems = getItems();


  const subs: SubscriptionInfo[] = [];
  for (const item of allItems) {
    const queue = await loadQueue(guildId, item.name);
    const index = queue.findIndex((e) => e.userId === userId);
    if (index !== -1) {
      subs.push({
        name: item.name,
        category: item.category ?? 'Unknown',
        icon: item.icon ?? '',
        position: index + 1,
        total: queue.length,
      });
    }
  }

  return subs;
}

export async function rotateTop(
  guildId: string,
  itemName: string,
  count: number,
): Promise<{ userId: string; displayName: string; position: number }[]> {
  return withWriteLock(guildId, async () => {
    const queue = await loadQueue(guildId, itemName);
    if (queue.length === 0) return [];

    const actualCount = Math.min(count, queue.length);
    const assigned = queue.slice(0, actualCount).map((e, i) => ({
      userId: e.userId,
      displayName: e.displayName,
      position: i + 1,
    }));

    // Move top N to bottom
    const rotated = [...queue.slice(actualCount), ...queue.slice(0, actualCount)];
    const cache = getGuildCache(guildId);
    cache.set(itemName, rotated);
    await persistQueue(guildId, itemName, rotated);

    return assigned;
  });
}

export async function moveToTop(
  guildId: string,
  itemName: string,
  userId: string,
): Promise<boolean> {
  return withWriteLock(guildId, async () => {
    const queue = await loadQueue(guildId, itemName);
    const index = queue.findIndex((e) => e.userId === userId);
    if (index === -1) return false;
    if (index === 0) return true;

    const [entry] = queue.splice(index, 1);
    queue.unshift(entry);

    const cache = getGuildCache(guildId);
    cache.set(itemName, queue);
    await persistQueue(guildId, itemName, queue);
    await logSubscriptionAction(guildId, 'cut-line', entry.userId, entry.displayName, itemName);
    return true;
  });
}

export async function moveToBottom(
  guildId: string,
  itemName: string,
  userId: string,
): Promise<boolean> {
  return withWriteLock(guildId, async () => {
    const queue = await loadQueue(guildId, itemName);
    const index = queue.findIndex((e) => e.userId === userId);
    if (index === -1) return false;
    if (index === queue.length - 1) return true;

    const [entry] = queue.splice(index, 1);
    queue.push(entry);

    const cache = getGuildCache(guildId);
    cache.set(itemName, queue);
    await persistQueue(guildId, itemName, queue);
    await logSubscriptionAction(guildId, 'cut-line', entry.userId, entry.displayName, itemName);
    return true;
  });
}

/**
 * Atomically move a user to a specific position in the queue.
 * Used by cut-line Up/Down to avoid O(n) separate DB writes.
 */
export async function moveToPosition(
  guildId: string,
  itemName: string,
  userId: string,
  newIndex: number,
): Promise<boolean> {
  return withWriteLock(guildId, async () => {
    const queue = await loadQueue(guildId, itemName);
    const currentIndex = queue.findIndex((e) => e.userId === userId);
    if (currentIndex === -1) return false;
    if (currentIndex === newIndex) return true;

    const safeIndex = Math.max(0, Math.min(queue.length - 1, newIndex));
    const [entry] = queue.splice(currentIndex, 1);
    queue.splice(safeIndex, 0, entry);

    const cache = getGuildCache(guildId);
    cache.set(itemName, queue);
    await persistQueue(guildId, itemName, queue);
    await logSubscriptionAction(guildId, 'cut-line', entry.userId, entry.displayName, itemName);
    return true;
  });
}

export interface QueueEntryInfo {
  userId: string;
  displayName: string;
}

export async function getItemQueue(
  guildId: string,
  itemName: string,
): Promise<QueueEntryInfo[]> {
  const queue = await loadQueue(guildId, itemName);
  return queue.map((e) => ({ userId: e.userId, displayName: e.displayName }));
}

export async function removeUserFromAll(
  guildId: string,
  userId: string,
): Promise<SubscriptionInfo[]> {
  const subs = await getUserSubscriptions(guildId, userId);

  return withWriteLock(guildId, async () => {
    for (const sub of subs) {
      const queue = await loadQueue(guildId, sub.name);
      const index = queue.findIndex((e) => e.userId === userId);
      if (index !== -1) {
        const displayName = queue[index].displayName;
        queue.splice(index, 1);
        await persistQueue(guildId, sub.name, queue);
        await logSubscriptionAction(guildId, 'remove-member', userId, displayName, sub.name);
      }
    }
    return subs;
  });
}

/**
 * Remove an item's subscriptions from all lookups (used by reset).
 */
export async function removeItemFromAllSubs(guildId: string, itemName: string): Promise<void> {
  const cache = getGuildCache(guildId);
  cache.delete(itemName);

  // Delete from DynamoDB
  const pk = `GUILD#${guildId}`;
  const prefix = `SUB#${itemName}#`;
  const existing = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': { S: pk },
      ':prefix': { S: prefix },
    },
    ProjectionExpression: 'SK',
  }));

  const deleteRequests = (existing.Items ?? []).map((item) => ({
    DeleteRequest: {
      Key: { PK: { S: pk }, SK: item.SK! },
    },
  }));

  for (let i = 0; i < deleteRequests.length; i += 25) {
    await dynamo.send(new BatchWriteItemCommand({
      RequestItems: { [TABLE]: deleteRequests.slice(i, i + 25) },
    }));
  }
}

/**
 * Clear ALL data for a guild (queues, logs, config) — used by reset.
 */
export async function clearAllGuildData(guildId: string): Promise<void> {
  return withWriteLock(guildId, async () => {
  // Clear in-memory cache for this guild
  queueCache.delete(guildId);

  const pk = `GUILD#${guildId}`;

  // Query all items for this guild
  let lastKey: Record<string, AttributeValue> | undefined;
  const allKeys: { PK: AttributeValue; SK: AttributeValue }[] = [];

  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': { S: pk } },
      ProjectionExpression: 'PK, SK',
      ExclusiveStartKey: lastKey,
    }));

    for (const item of result.Items ?? []) {
      // Don't delete the CONFIG entry — reset should keep the guild configured
      if (item.SK?.S === 'CONFIG') continue;
      allKeys.push({ PK: item.PK!, SK: item.SK! });
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  // Batch delete (25 at a time)
  for (let i = 0; i < allKeys.length; i += 25) {
    const batch = allKeys.slice(i, i + 25);
    await dynamo.send(new BatchWriteItemCommand({
      RequestItems: {
        [TABLE]: batch.map((key) => ({
          DeleteRequest: { Key: key },
        })),
      },
    }));
  }
  }); // end withWriteLock
}
