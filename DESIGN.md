# DT Guild Bot — Design Document

Discord bot for **Dragon Traveller** mobile game guild, automating auction-item subscriptions and fair-rotation assignments via Google Sheets.

---

## 1. High-Level Architecture

```
┌──────────────┐    Slash Commands     ┌──────────────────┐    googleapis    ┌──────────────────┐
│  Discord     │ ◄──── Modals ────►    │  DT Guild Bot    │ ◄────────────►  │  Google Sheet    │
│  Server      │    Embeds / Messages  │  (Node.js)       │                 │  (Data Store)    │
└──────────────┘                       └──────────────────┘                 └──────────────────┘
                                              │
                                        Docker Container
```

**Stack:** Node.js · Yarn · discord.js v14 · `google-spreadsheet` v4 · Docker

---

## 2. Discord Bot Capabilities & Constraints

Understanding Discord's interaction model is critical because it dictates what UX is achievable.

| Feature | Limit | Notes |
|---|---|---|
| Modal components | **5** action rows max | Each row = 1 select menu OR 1 text input |
| Select menu options | **25** per menu | If >25 items exist, must paginate (see §2.1) |
| Interaction response | Must reply within **3 s** (defer extends to **15 min**) | Always defer first, then edit |
| Ephemeral messages | Only visible to invoking user | Good for previews and confirmations |
| Buttons per row | 5 max | Useful for confirm/cancel and pagination flows |
| Google Sheet tabs | **200** max per spreadsheet | With `Items` + `Auction_Log` + one `Sub_*` per item, supports ~198 items |

### What IS Possible

- ✅ Slash commands that open modals with select menus and text inputs
- ✅ Select menus inside modals (string select, user select — supported since late 2024)
- ✅ Multi-step flows: command → modal → follow-up message with buttons → second modal
- ✅ Ephemeral previews (only the invoking user sees them)
- ✅ Role-based permission gating (check `interaction.member.roles` at handler level)
- ✅ Custom emoji/icons rendered inline in embed text using `<:name:id>` format

### What Is NOT Possible / Has Caveats

- ❌ **Modals cannot be updated dynamically** — once shown, their content is fixed until submitted or dismissed.
- ❌ **Modals cannot contain tables or rich previews** — for "view existing items" the bot should send an embed *before* opening the modal.
- ❌ **Cannot open a modal from a modal** — multi-step flows must go: modal → message with buttons → new modal.
- ⚠️ **Select menus cap at 25 options** — see §2.1 for pagination strategy.
- ⚠️ **A modal can have at most 5 select menus** — this limits how many item types can be configured in a single modal.

### 2.1 Pagination Strategy for >25 Items

Since select menus are hard-capped at 25 options, any flow that lists items will use **paginated ephemeral messages**:

```
┌──────────────────────────────────────────────────┐
│  📦 Items (Page 1/3)                             │
│                                                  │
│  Select items:                                   │
│  [ String Select — 25 options for this page ]    │
│                                                  │
│  [◀ Prev]  [Page 1/3]  [▶ Next]  [✅ Done]       │
└──────────────────────────────────────────────────┘
```

- Items are grouped by **Category** (see §3) across pages when possible
- Each page shows up to 25 items in a string select menu
- `◀ Prev` / `▶ Next` buttons cycle through pages; selections are accumulated across pages
- `✅ Done` finalizes the selection and proceeds to the next step
- Works for: `/auction` item selection, `/items` remove, `/mysubs` subscribe/unsubscribe

---

## 3. Google Sheet Schema

The sheet acts as the single source of truth. The bot reads/writes; admins can also view/edit directly.

> **Tab limit:** Google Sheets supports up to **200 tabs** per spreadsheet. With 2 fixed tabs (`Items`, `Auction_Log`) and one `Sub_*` tab per item, this supports up to **198 unique items** — more than enough for this use case.

### Sheet: `Items`

Master catalog of all subscribable auction items.

| Column A | Column B | Column C | Column D |
|---|---|---|---|
| **Item Name** | **Category** | **Icon** | **Added Date** |
| Dragon Scale | Materials | `<:dragon_scale:123456>` | 2026-03-15 |
| Phoenix Feather | Materials | `<:phoenix_feather:789012>` | 2026-03-15 |
| Fire Sword | Weapons | `<:fire_sword:345678>` | 2026-03-15 |
| ... | ... | ... | ... |

- **Category** — free-text grouping label (e.g., "Materials", "Weapons", "Armor")
- **Icon** — Discord custom emoji string in `<:name:id>` format. Admin uploads emoji to the server and pastes the string here. The bot renders it inline in embed text.

### Sheet: `Sub_<ItemName>` (one tab per item)

Subscription queue for a single item. Order = priority (top = next to receive).

| Column A | Column B |
|---|---|
| **Discord User ID** | **Display Name** |
| 123456789012345678 | Alice |
| 987654321098765432 | Bob |
| ... | ... |

> When a new item is added to the `Items` sheet, the bot automatically creates the corresponding `Sub_<ItemName>` tab.
> When an item is removed, the bot deletes the corresponding tab (with a confirmation warning if subscribers exist).

### Sheet: `Auction_Log`

Audit trail for all published auctions. Admin can review history directly in the sheet.

| Date | Item | Category | Assigned To | Quantity |
|---|---|---|---|---|
| 2026-03-15 | Dragon Scale | Materials | Alice | 1 |
| 2026-03-15 | Phoenix Feather | Materials | Bob, Carol | 2 |

---

## 4. Item Icons in Discord

Admin can upload custom emojis to the Discord server for each item, then store the emoji string in the `Icon` column of the `Items` sheet.

**How it works:**
1. Admin uploads a custom emoji to the Discord server (Server Settings → Emoji → Upload)
2. In Discord chat, type `\:emoji_name:` to get the full format `<:emoji_name:123456789>`
3. Admin stores this string in the `Icon` column of the `Items` sheet (manually or via a future bot command)
4. The bot uses this string in embeds wherever items are displayed

**Where icons appear:**
- `/auction` — in the assignment preview and the published announcement
- `/mysubs` — next to each subscribed item in the embed
- `/items` — in the item catalog listing

**Example embed rendering:**
```
📋 Your Subscriptions

⚔️ Weapons
  <:fire_sword:345678> Fire Sword    — Position: 2 / 10

🧪 Materials
  <:dragon_scale:123456> Dragon Scale    — Position: 3 / 12
  <:phoenix_feather:789012> Phoenix Feather — Position: 1 / 8
```

> **Fallback:** If no icon is set for an item, display a generic `📦` emoji. Icons are optional but recommended for visual richness.

> **Discord server emoji limit:** Free servers can have 50 custom emojis; boosted servers up to 250. This should be sufficient.

---

## 5. Role-Based Access Control

Permissions are enforced **in the bot's command handlers** by checking `interaction.member.roles.cache`.

| Capability | Admin Role | Member Role |
|---|---|---|
| `/items` — manage item catalog | ✅ | ❌ |
| `/auction` — publish today's assignments | ✅ | ❌ |
| `/removemember` — purge a member's subs | ✅ | ❌ |
| `/mysubs` — view/edit own subscriptions | ✅ | ✅ |

Configuration (environment variables):
```
ADMIN_ROLE_ID=<discord role id>
MEMBER_ROLE_ID=<discord role id>
```

---

## 6. Slash Commands — Detailed UX Flows

### 6.1 `/items` (Admin Only) — Manage Item Catalog

Because modals cannot display tables, the flow is **embed first, then modal**. Items are **grouped by category** with icons.

```
Admin types /items
  │
  ▼
Bot sends EPHEMERAL embed:
  ┌──────────────────────────────────────────────────┐
  │  📦 Current Auction Items (12 total)             │
  │                                                  │
  │  ⚔️ Weapons (3)                                   │
  │    <:fire_sword:345678> Fire Sword               │
  │    <:ice_bow:901234> Ice Bow                     │
  │    <:thunder_axe:567890> Thunder Axe              │
  │                                                  │
  │  🧪 Materials (2)                                │
  │    <:dragon_scale:123456> Dragon Scale            │
  │    <:phoenix_feather:789012> Phoenix Feather      │
  │                                                  │
  │  🛡️ Armor (1)                                    │
  │    📦 Shadow Cloak  (no icon set)                │
  │                                                  │
  │  [➕ Add Items]  [➖ Remove Items]                │
  └──────────────────────────────────────────────────┘
  │                          │
  ▼                          ▼
[Add Items] button        [Remove Items] button
opens Modal               opens Paginated Select
(see below)               (see §2.1 for >25 items)
```

**Add Items Modal (5 components — at the modal limit):**

```
┌───────────────────────────────┐
│ Add Items                     │
│                               │
│ 1. Category:                  │
│ [ Select existing ▾ ]         │ ← String select with existing categories
│   (includes "➕ New Category")│   + an option to create new
│                               │
│ 2. New Category Name:         │
│ [ text input ]                │ ← Only used if "New Category" selected
│                               │
│ 3. Item Names (one per line): │
│ [ text input                ] │
│ [ Dragon Fang               ] │
│ [ Shadow Crystal             ]│
│                               │
│ 4. Emoji (one per line,       │
│    matching item order):      │
│ [ text input                ] │
│ [ <:dragon_fang:111>         ]│
│ [ <:shadow_crystal:222>      ]│
│                               │
└───────────────────────────────┘
```

- If admin selects an existing category, the `New Category Name` field is ignored
- If admin picks "➕ New Category", the text input value is used
- All items entered share the same category (for mixed categories, run the command multiple times)
- **Emoji field** is optional — each line maps 1:1 to the item names field. Missing lines default to no icon (`📦` fallback). Admin types `\:emoji_name:` in Discord chat first to get the `<:name:id>` string, then pastes it here.
- Uses 4 of 5 available modal components (1 select + 3 text inputs), leaving room for future additions

**Remove Items:** Uses paginated ephemeral select (§2.1). On confirmation, bot removes items from `Items` sheet and deletes corresponding `Sub_*` tabs.

---

### 6.2 `/auction` (Admin Only) — Publish Today's Assignments

This is the most complex flow. The key UX goal is: **item selection and quantity on the same page**.

**How it works:** Each item gets its own select menu (one per action row) where the options are quantities: `Skip (0)`, `1`, `2`, `3`, … up to `10`. A Discord message can have at most **5 action rows**, so we use **4 select menus + 1 button row** per page = **4 items per page**, with pagination. Admin sets quantities across all pages, then clicks Done.

> With a typical catalog of 15-30 items, this means 4-8 pages — each page takes one click to navigate.

```
Admin types /auction
  │
  ▼
Bot sends EPHEMERAL message — PAGE 1 of 3 (10 items total):
  ┌──────────────────────────────────────────────────────┐
  │  🎯 Today's Auction Setup (Page 1/3)                │
  │                                                     │
  │  ⚔️ Weapons                                         │
  │                                                     │
  │  <:fire_sword:345678> Fire Sword                    │
  │  [ Qty: Skip ▾ ]  ← options: Skip, 1, 2, 3 … 10   │  ← Action Row 1
  │                                                     │
  │  <:ice_bow:901234> Ice Bow                          │
  │  [ Qty: 1 ▾ ]     ← admin picked 1                 │  ← Action Row 2
  │                                                     │
  │  <:thunder_axe:567890> Thunder Axe                  │
  │  [ Qty: Skip ▾ ]                                    │  ← Action Row 3
  │                                                     │
  │  🧪 Materials                                       │
  │                                                     │
  │  <:dragon_scale:123456> Dragon Scale                │
  │  [ Qty: 2 ▾ ]     ← admin picked 2                 │  ← Action Row 4
  │                                                     │
  │  [◀ Prev]  [Page 1/3]  [▶ Next]  [✅ Done]          │  ← Action Row 5
  └──────────────────────────────────────────────────────┘

Admin clicks ▶ Next → message UPDATES IN PLACE to PAGE 2:
  ┌──────────────────────────────────────────────────────┐
  │  🎯 Today's Auction Setup (Page 2/3)                │
  │                                                     │
  │  🧪 Materials (cont.)                               │
  │                                                     │
  │  <:phoenix_feather:789012> Phoenix Feather          │
  │  [ Qty: 1 ▾ ]                                       │  ← Action Row 1
  │                                                     │
  │  <:star_dust:345678> Star Dust                      │
  │  [ Qty: Skip ▾ ]                                    │  ← Action Row 2
  │                                                     │
  │  🛡️ Armor                                           │
  │                                                     │
  │  📦 Shadow Cloak                                    │
  │  [ Qty: Skip ▾ ]                                    │  ← Action Row 3
  │                                                     │
  │  <:dragon_plate:456789> Dragon Plate                │
  │  [ Qty: Skip ▾ ]                                    │  ← Action Row 4
  │                                                     │
  │  [◀ Prev]  [Page 2/3]  [▶ Next]  [✅ Done]          │  ← Action Row 5
  └──────────────────────────────────────────────────────┘
```

**Key behaviors:**
- **4 items per page** (4 select rows + 1 button row = 5 action rows, the Discord max)
- The item names + icons + category headers are rendered in the **embed description** (free text), not in action rows
- Each select menu's `placeholder` shows the current quantity (persisted in bot memory keyed by the interaction)
- **Selections persist across pages** — navigating away and back keeps your picks
- Categories flow naturally across page boundaries (shown as "cont." when split)
- `Skip` is the default for every item — admin only touches the ones they want

```
Admin clicks ✅ Done (after browsing all pages)
  │
  ▼
Bot computes assignments and shows EPHEMERAL preview:
  ┌──────────────────────────────────────────────────┐
  │  📋 Assignment Preview                           │
  │                                                  │
  │  ⚔️ Weapons                                      │
  │  <:fire_sword:345678> Fire Sword (1x):           │
  │    → Dave  (#1 in queue, will rotate to bottom)  │
  │                                                  │
  │  🧪 Materials                                    │
  │  <:dragon_scale:123456> Dragon Scale (1x):       │
  │    → Alice (#1 in queue, will rotate to bottom)  │
  │                                                  │
  │  <:phoenix_feather:789012> Phoenix Feather (2x): │
  │    → Bob   (#1, will rotate to bottom)           │
  │    → Carol (#2, will rotate to bottom)           │
  │                                                  │
  │  [✅ Publish & Rotate]  [❌ Cancel]               │
  └──────────────────────────────────────────────────┘
  │                          │
  ▼                          ▼
[Publish & Rotate]        [Cancel]
 - Posts embed in           - Discards everything
   announcement channel
 - Rotates queues in
   Google Sheet
 - Logs to Auction_Log
```

**Why this approach works well:**
- Admin sees item name + icon and picks quantity in one interaction — no separate selection-then-quantity steps
- Quantities persist across pages (bot tracks state in memory keyed by interaction ID)
- "Skip" (qty 0) is the default, so admin only changes the items they want
- 4 items per page means even 50+ items only need ~13 pages

**Assignment Algorithm:**
1. For each item with quantity `Q > 0`:
   a. Read the `Sub_<ItemName>` tab
   b. Take the top `Q` members from the list
   c. Record them as assigned
   d. Move them to the bottom of the list (rotation)
2. If a member is assigned multiple items, they still appear at the top of each queue independently.
3. Results are logged to `Auction_Log` sheet.

---

### 6.3 `/removemember` (Admin Only) — Purge Member Subscriptions

Two-step flow: select member → review & confirm.

```
Admin types /removemember
  │
  ▼
Bot sends EPHEMERAL message:
  ┌──────────────────────────────────────┐
  │  🗑️ Remove Member Subscriptions     │
  │                                      │
  │  Select member:                      │
  │  [ User Select Menu ▾ ]              │
  │                                      │
  │  [Continue →]                        │
  └──────────────────────────────────────┘
  │
  ▼ (admin selects a user and clicks Continue)

Bot looks up ALL Sub_* tabs for that member,
then shows a summary EPHEMERAL embed:
  ┌──────────────────────────────────────────────────┐
  │  🗑️ Remove @Alice's Subscriptions?              │
  │                                                  │
  │  The following subscriptions will be removed:    │
  │                                                  │
  │  ⚔️ Weapons                                      │
  │    <:fire_sword:345678> Fire Sword — was #2/10   │
  │                                                  │
  │  🧪 Materials                                    │
  │    <:dragon_scale:123456> Dragon Scale — was #3/12│
  │    <:phoenix_feather:789012> Phoenix Feather — #1/8│
  │                                                  │
  │  Total: 3 subscriptions across 2 categories      │
  │                                                  │
  │  [✅ Confirm Removal]  [❌ Cancel]                │
  └──────────────────────────────────────────────────┘
  │                          │
  ▼                          ▼
[Confirm Removal]         [Cancel]
 - Removes member from      - Discards, no changes
   all Sub_* tabs
 - Replies with final
   confirmation message
```

---

### 6.4 `/mysubs` (Member) — Manage Own Subscriptions

```
Member types /mysubs
  │
  ▼
Bot sends EPHEMERAL embed (grouped by category, with icons):
  ┌──────────────────────────────────────────────────┐
  │  📋 Your Subscriptions                           │
  │                                                  │
  │  ⚔️ Weapons                                      │
  │  <:fire_sword:345678> Fire Sword — Position: 2/10│
  │                                                  │
  │  🧪 Materials                                    │
  │  <:dragon_scale:123456> Dragon Scale — Pos: 3/12 │
  │  <:phoenix_feather:789012> Phoenix Feather — 1/8 │
  │                                                  │
  │  [➕ Subscribe]  [➖ Unsubscribe]                 │
  └──────────────────────────────────────────────────┘
  │                          │
  ▼                          ▼
[Subscribe]               [Unsubscribe]
Paginated select          Paginated select
(items NOT yet            (current subs only)
 subscribed to)
```

- Subscribe: uses paginated select (§2.1) showing only items the member is NOT subscribed to, grouped by category
- Unsubscribe: uses paginated select showing only items the member IS subscribed to
- New subscriptions are appended to the **bottom** of the corresponding `Sub_<ItemName>` tab

---

## 7. Project Structure

```
dt-guild-bot/
├── package.json
├── yarn.lock
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example            # Template for env vars
├── .env                    # Actual env vars (gitignored)
├── credentials.json        # Google service account key (gitignored)
├── src/
│   ├── index.js            # Bot client setup, event handlers
│   ├── deploy-commands.js  # One-time slash command registration script
│   ├── config.js           # Env var loading and validation
│   ├── sheets/
│   │   ├── client.js       # GoogleSpreadsheet init + auth
│   │   ├── items.js        # CRUD for Items sheet (with category support)
│   │   ├── subscriptions.js# CRUD for Sub_* tabs, rotation logic
│   │   └── auctionLog.js   # Write to Auction_Log sheet
│   ├── commands/
│   │   ├── items.js        # /items handler
│   │   ├── auction.js      # /auction handler
│   │   ├── removemember.js # /removemember handler
│   │   └── mysubs.js       # /mysubs handler
│   ├── interactions/
│   │   ├── buttons.js      # Button click handlers (Add/Remove/Confirm/Cancel/Pagination)
│   │   └── modals.js       # Modal submit handlers
│   └── utils/
│       ├── permissions.js  # Role check helpers
│       ├── embeds.js       # Shared embed builders (with icon + category rendering)
│       └── pagination.js   # Paginated select menu helper
├── .gitignore
└── README.md
```

---

## 8. Docker Setup

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY src/ ./src/
CMD ["node", "src/index.js"]
```

### docker-compose.yml

```yaml
version: "3.8"
services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./credentials.json:/app/credentials.json:ro
```

### Commands

```bash
# Development
yarn install
yarn dev          # runs with --watch for hot reload

# Production
docker compose up -d --build
docker compose logs -f bot
```

---

## 9. Setup Requirements

### 9.1 Discord Setup

1. **Create a Discord Application** at [discord.com/developers](https://discord.com/developers/applications)
2. **Create a Bot** under the application, copy the **Bot Token**
3. **Enable these Gateway Intents:** `Guilds`, `GuildMembers` (for user select menus)
4. **Invite the bot** to the server with scopes: `bot`, `applications.commands`
   - Bot permissions needed: `Send Messages`, `Embed Links`, `Use Slash Commands`, `Read Message History`
5. **Create two Discord roles** in the server:
   - An **Admin** role (e.g., "Auction Admin")
   - A **Member** role (e.g., "Guild Member")
6. Note down the Role IDs (Developer Mode → right-click role → Copy ID)
7. **Upload custom emojis** for item icons (Server Settings → Emoji → Upload)

### 9.2 Google Cloud Setup

1. **Create a GCP project** (or use existing) at [console.cloud.google.com](https://console.cloud.google.com)
2. **Enable the Google Sheets API** (`APIs & Services → Library → Google Sheets API`)
3. **Create a Service Account** (`IAM & Admin → Service Accounts → Create`)
4. **Generate a JSON key** for the service account → download as `credentials.json`
5. **Create the Google Sheet** manually with two initial tabs:
   - `Items` — with headers: `Item Name`, `Category`, `Icon`, `Added Date`
   - `Auction_Log` — with headers: `Date`, `Item`, `Category`, `Assigned To`, `Quantity`
6. **Share the sheet** with the service account's `client_email` (from `credentials.json`) as **Editor**

### 9.3 Environment Variables

```env
# Discord
BOT_TOKEN=<discord bot token>
CLIENT_ID=<discord application client id>
GUILD_ID=<discord server id>
ADMIN_ROLE_ID=<role id>
MEMBER_ROLE_ID=<role id>
ANNOUNCEMENT_CHANNEL_ID=<channel id for auction results>

# Google Sheets
GOOGLE_SHEET_ID=<spreadsheet id from URL>
# credentials.json file path is resolved relative to project root
```

---

## 10. Auction Schedule Context

Auctions occur on **Monday, Tuesday, Thursday, Saturday**. The bot itself does not need to enforce this schedule (admins invoke `/auction` manually on those days), but it could optionally:
- Display the next auction day in status or help text
- Refuse to run `/auction` on non-auction days (configurable guard)

---

## 11. Edge Cases & Design Decisions

| Scenario | Decision |
|---|---|
| Item has no subscribers when assigned | Skip that item in the assignment, notify admin |
| Member is already subscribed to an item | Prevent duplicate subscription, show message |
| More quantity than subscribers for an item | Assign all subscribers, report unassigned qty to admin |
| >25 items in catalog | Use paginated select menus with Prev/Next buttons (§2.1) |
| >5 items selected for an auction | Use single text input modal with `Item: Qty` format per line |
| Admin removes an item with active subscribers | Warn admin via confirmation prompt, then delete `Sub_*` tab |
| Sheet is manually edited (rows reordered) | Bot trusts sheet order as source of truth — manual admin edits are respected |
| Bot goes offline mid-rotation | Use batch update API for atomicity where possible |
| Item name contains special characters | Sanitize for sheet tab names (replace `/`, `\`, `*`, `?`, `:`, `[`, `]` — all invalid in tab names) |
| No icon set for an item | Fallback to generic `📦` emoji in embeds |
| Category has no items left after removal | Category simply disappears from listings (no orphan cleanup needed) |
| >198 items total | Sheet tab limit approached — warn admin, suggest archiving old items |

---

## 12. Dependencies

```json
{
  "dependencies": {
    "discord.js": "^14.x",
    "google-spreadsheet": "^4.x",
    "google-auth-library": "^9.x",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "nodemon": "^3.x"
  },
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "deploy-commands": "node src/deploy-commands.js"
  }
}
```

**Package manager:** Yarn (v1 classic or v4 Berry — recommend v1 for simplicity with Docker).

---

## 13. Future Enhancements

- **`/seticon` command:** Admin command to set item icons without editing the sheet directly
- **Scheduled reminders:** Bot posts "Auction today!" messages automatically on Mon/Tue/Thu/Sat
- **Priority system:** Weighted subscriptions (e.g., member can bid higher priority)
- **Web dashboard:** A small web UI for admins to manage items/queues outside Discord
- **Localization:** Support Chinese item names with sanitized/transliterated tab names
- **Category emoji:** Allow custom emoji per category (not just per item) for richer grouping visuals
