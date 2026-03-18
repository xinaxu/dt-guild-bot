# DT Guild Bot — Design Document

A Discord bot for managing guild auction item subscriptions, queue rotation, and assignment publishing. Built with discord.js v14, TypeScript, and AWS DynamoDB.

## Architecture

```
src/
├── index.ts              # Entry point, interaction router
├── config.ts             # Environment variables
├── deploy-commands.ts    # Slash command registration
├── items.json            # Static item catalog
├── commands/
│   ├── auction.ts        # /auction help|store|queue|publish|cut-line|print-*
│   ├── mysubs.ts         # /auction sub (subscribe/unsubscribe dashboard)
│   ├── removemember.ts   # /auction remove-member
│   ├── reset.ts          # /auction reset
│   └── setupFlow.ts      # /auction setup (role configuration)
├── db/
│   ├── dynamo.ts         # DynamoDB client
│   ├── items.ts          # Static item loader (from items.json)
│   ├── registry.ts       # Guild config (admin/member roles)
│   ├── subscriptions.ts  # Queue CRUD, rotation, logs
│   └── auctionLog.ts     # Auction assignment logs
├── interactions/
│   ├── buttons.ts        # Button interaction router
│   └── modals.ts         # Modal handler (placeholder)
└── utils/
    ├── embeds.ts         # Embed builders for all views
    ├── pagination.ts     # Paginated UI state machines
    └── permissions.ts    # Role-based access control
```

## Data Model (DynamoDB)

Single table design. All records use `PK = GUILD#<guildId>`.

| SK Pattern | Description |
|------------|-------------|
| `CONFIG` | Guild configuration (admin/member role IDs) |
| `SUB#<itemName>#<position>` | Subscription queue entry |
| `SUBLOG#<timestamp>#<userId>` | Subscription action log |
| `AUCTLOG#<date>#<itemName>` | Auction assignment log |

## Commands

| Command | Role | Description |
|---------|------|-------------|
| `/auction help` | Anyone | Shows help (role-aware) |
| `/auction store` | Anyone | Browse item catalog |
| `/auction queue` | Anyone | View live stand-by queues |
| `/auction sub` | Member | Manage personal subscriptions; admin can manage others |
| `/auction publish` | Admin | Assign items → rotate queues → post announcement |
| `/auction cut-line` | Admin | Reorder users in a queue |
| `/auction remove-member` | Admin | Remove all subscriptions for a user |
| `/auction print-sub-logs` | Admin | Publish subscription activity logs |
| `/auction print-auction-logs` | Admin | Publish auction assignment logs |
| `/auction setup` | Server Admin | Configure admin/member roles |
| `/auction reset` | Admin | Delete all queues and logs |

## Key Design Decisions

### Pagination
Discord limits: 25 select options, 5 action rows, 10 embeds, 4096-char description, 6000-char total per message. We paginate by **category** for:
- `/auction sub` — one page per category
- `/auction queue` — one page per category
- `/auction cut-line` — one page per category

### Queue Rotation
`/auction publish` uses round-robin: the top N subscribers receive the item, then rotate to the back of the queue. If quantity > subscribers, the same users are assigned multiple times.

### Item Catalog
Items are loaded from `src/items.json` at startup. This file is baked into the Docker image. To update items, edit the file and redeploy.

**Limit: ≤ 25 items per category** (Discord select menu max).

### Concurrency
Queue writes are serialized through a `withWriteLock` promise chain in `subscriptions.ts`. This prevents interleaved reads/writes within a single bot instance.

### Multi-Tenancy
All DynamoDB records are partitioned by `GUILD#<guildId>`. Multiple guilds can use the same bot instance. However:
- The item catalog is shared (same `items.json`)
- The write lock is currently global (not per-guild)

### State Management
Interactive flows (publish, cut-line, subscribe) use in-memory Maps keyed by interaction/message IDs. These expire after 14 minutes (matching Discord's component lifespan). State is lost on bot restart.
