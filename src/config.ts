import 'dotenv/config';

interface Config {
  botToken: string;
  clientId: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  dynamoTableName: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: Config = {
  botToken: requireEnv('BOT_TOKEN'),
  clientId: requireEnv('CLIENT_ID'),
  awsRegion: requireEnv('AWS_REGION'),
  awsAccessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
  awsSecretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
  dynamoTableName: requireEnv('DYNAMODB_TABLE'),
};
