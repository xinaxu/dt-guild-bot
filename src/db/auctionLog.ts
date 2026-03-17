import { PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { dynamo, TABLE } from './dynamo.js';

export interface AuctionLogEntry {
  Date: string;
  Item: string;
  Category: string;
  'Assigned To': string;
  'Assigned User IDs': string;
  Quantity: string;
}

export async function logAssignment(
  guildId: string,
  date: string,
  item: string,
  category: string,
  assignedToNames: string,
  assignedToIds: string,
  quantity: number,
): Promise<void> {
  await dynamo.send(new PutItemCommand({
    TableName: TABLE,
    Item: {
      PK: { S: `GUILD#${guildId}` },
      SK: { S: `AUCTLOG#${date}#${item}` },
      item: { S: item },
      category: { S: category },
      assignedTo: { S: assignedToNames },
      assignedUserIds: { S: assignedToIds },
      quantity: { N: quantity.toString() },
      timestamp: { S: date },
    },
  }));
}

export async function getRecentAuctionLogs(guildId: string, days: number): Promise<AuctionLogEntry[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString();

  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': { S: `GUILD#${guildId}` },
      ':start': { S: `AUCTLOG#${cutoffStr}` },
      ':end': { S: `AUCTLOG#~` },
    },
  }));

  return (result.Items ?? []).map((item) => ({
    Date: item.timestamp?.S ?? '',
    Item: item.item?.S ?? '',
    Category: item.category?.S ?? '',
    'Assigned To': item.assignedTo?.S ?? '',
    'Assigned User IDs': item.assignedUserIds?.S ?? '',
    Quantity: item.quantity?.N ?? '0',
  }));
}
