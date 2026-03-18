# DT Guild Bot

A Discord bot for managing guild auction item queues. Members subscribe to items they want; admins publish auctions that auto-assign from the queue and rotate subscribers.

## Dragon Traveller Guild

If you're part of the Dragon Traveller guild, just use the existing bot — no setup needed:

**[Invite Bot to Your Server](https://discord.com/oauth2/authorize?client_id=1482850011799621644&permissions=355328&integration_type=0&scope=bot+applications.commands)**

Once invited, run `/auction setup` in your server to configure admin and member roles.

---

## Self-Hosting

If you want to run your own instance of this bot, follow the instructions below.

## Features

- **Item Catalog** — Browse available items by category (`/auction store`)
- **Subscriptions** — Members join item queues via a paginated dashboard (`/auction sub`)
- **Queue Management** — Admins can reorder queues (`/auction cut-line`) or remove members (`/auction remove-member`)
- **Publish Auctions** — Select items and quantities, auto-assign to top subscribers, and post public announcements (`/auction publish`)
- **Audit Logs** — Print subscription and auction history (`/auction print-sub-logs`, `/auction print-auction-logs`)
- **Multi-Guild** — One bot instance supports multiple Discord servers with isolated data

## Quick Start

### Prerequisites

- Node.js 20+
- Yarn 1.22+
- An AWS account with a DynamoDB table
- A Discord bot application (with the `bot` and `applications.commands` scopes)

### 1. Clone & Install

```bash
git clone https://github.com/xinaxu/dt-guild-bot.git
cd dt-guild-bot
yarn install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Your Discord bot token |
| `CLIENT_ID` | Your Discord application client ID |
| `AWS_REGION` | AWS region for DynamoDB (e.g. `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | AWS access key (optional if using IAM roles) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key (optional if using IAM roles) |
| `DYNAMODB_TABLE` | DynamoDB table name |
| `GUILD_ID` | *(Optional)* Deploy commands to this guild for instant updates |

### 3. Create DynamoDB Table

Create a table with:
- **Table name**: your `DYNAMODB_TABLE` value
- **Partition key**: `PK` (String)
- **Sort key**: `SK` (String)

No GSIs required.

### 4. Deploy Commands & Start

```bash
# Deploy slash commands (globally or to a specific guild)
yarn deploy-commands          # Global deployment
GUILD_ID=123 yarn deploy-commands  # Guild-specific (instant)

# Build and start
yarn build
yarn start
```

### 5. Invite the Bot

Use this URL template (replace `YOUR_CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147485696&scope=bot+applications.commands
```

Required bot permissions:
- Send Messages
- Embed Links
- Use External Emojis
- Read Message History

Required OAuth2 scopes:
- `bot`
- `applications.commands`

### 6. In-Server Setup

Run `/auction setup` in your Discord server to configure:
- **Admin Role** — Who can manage auctions and publish
- **Member Role** — Who can subscribe to queues

## Docker Deployment

```bash
docker build -t dt-guild-bot .
docker run -d --env-file .env dt-guild-bot
```

The container automatically deploys commands on startup (uses `GUILD_ID` if set).

## Customizing Items

Edit `src/items.json` to define your item catalog. Each entry has a category and a map of item names to Discord emoji strings:

```json
[
  {
    "category": "Category Name",
    "items": {
      "Item Name": "<:emoji_name:emoji_id>"
    }
  }
]
```

**Important**: Each category must have ≤ 25 items (Discord select menu limit).

After editing, rebuild and redeploy.

## Discord Limits & Constraints

The bot is designed around Discord's API limits:

| Limit | Value | Impact |
|-------|-------|--------|
| Select menu options | 25 | **Each category must have ≤ 25 items.** Items beyond 25 are silently hidden. |
| Embeds per message | 10 | `/auction store` will fail if you have more than 10 categories. Use pagination if needed. |
| Embed description | 4096 chars | Long queues are auto-split into multiple embeds at ~3800 chars. |
| Total message chars | 6000 | Embeds are chunked so no single message exceeds this. |
| Action rows per message | 5 | UI layouts are designed to stay within this limit. |
| Component lifespan | 15 min | Interactive sessions (publish, subscribe, cut-line) expire after 14 minutes. |
| Max quantity per publish item | 10 | Configurable in source (`MAX_QTY` in `pagination.ts`). |

## Architecture

See [DESIGN.md](DESIGN.md) for the full architecture and design decisions.