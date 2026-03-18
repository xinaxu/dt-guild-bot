# Comprehensive Codebase Audit — DT Guild Bot (Post-Fix)

Audit Date: 2026-03-18 (Second Pass — after audit fixes applied)

---

## 1. `/auction help` — Accuracy & Role Differentiation

| Aspect | Status | Notes |
|--------|--------|-------|
| Admin vs Member help | ✅ Pass | Two distinct views in [handleAuctionHelp](file:///Users/xinanxu/repo/dt-guild-bot/src/commands/auction.ts#L127-L186). |
| All commands listed | ✅ Pass | All 11 subcommands documented including `/auction help` itself. |
| Ephemeral | ✅ Pass | Only visible to the requester. |

---

## 2. `/auction store` — Scalability

| Aspect | Status | Notes |
|--------|--------|-------|
| Embed per category | ✅ Pass | One embed per category. |
| Discord 10-embed limit | ⚠️ Documented | Currently 7 categories → safe. Documented in [README.md](file:///Users/xinanxu/repo/dt-guild-bot/README.md) that >10 categories will fail. |
| Description overflow | ⚠️ Documented | Documented in [README.md](file:///Users/xinanxu/repo/dt-guild-bot/README.md) that categories must have ≤25 items. No single-category overflow risk at current sizes. |
| Empty store | ✅ Pass | Returns "store is empty". |

---

## 3. `/auction reset` — Correctness

| Aspect | Status | Notes |
|--------|--------|-------|
| Items preserved | ✅ Pass | Items loaded from [items.json](file:///Users/xinanxu/repo/dt-guild-bot/src/items.json), unaffected by reset. |
| Confirmation dialog | ✅ Pass | Two-step danger confirmation. |
| In-memory cache cleared | ✅ Fixed | `queueCache.delete(guildId)` now called inside [clearAllGuildData](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#427-472). |
| Write lock protected | ✅ Fixed | [clearAllGuildData](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#427-472) now wrapped in [withWriteLock(guildId, ...)](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#113-130). |
| Admin re-check on confirm | ✅ Fixed | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) check added to `reset_confirm` button handler. |

---

## 4. `/auction print-*` — Discord Limits

| Aspect | Status | Notes |
|--------|--------|-------|
| Embed splitting | ✅ Pass | Split at 3800 chars per embed. |
| 10-embed limit | ✅ Pass | [chunkEmbeds()](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/embeds.ts#455-489) enforces ≤10 embeds, ≤6000 chars per message. |
| 200-log cap | ✅ Pass | Hardcoded cap. |
| Preview truncation | ✅ Pass | Ephemeral preview shows first chunk only. |
| Admin re-check on confirm | ✅ Fixed | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) check on `print_logs_confirm_*` and `print_logs_send_here_*`. |

---

## 5. `/auction publish` — Edge Cases & Atomicity

| Aspect | Status | Notes |
|--------|--------|-------|
| Zero items | ✅ Pass | Error messages for empty store and no selection. |
| Zero subscribers | ✅ Pass | `unassignedQty` tracked and shown in preview. |
| Subs > items | ✅ Pass | Round-robin via `i % subs.length`. |
| Race condition | ✅ Fixed | Queues re-read at confirm time. Assignments recalculated from live state. Warning shown if assignments changed since preview. |
| UI component count | ✅ Pass | Max 5 action rows. |
| 25-option cap | ✅ Pass | `.slice(0, 25)` on all selects. |
| Admin re-check on confirm | ✅ Fixed | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) check on `auction_confirm_*`. |

---

## 6. `/auction queue` — Logic & Edge Cases

| Aspect | Status | Notes |
|--------|--------|-------|
| Empty queue | ✅ Pass | Shows `*(Empty)*`. |
| No items configured | ✅ Pass | Error message. |
| 10-embed limit | ✅ Pass | `.slice(0, 10)` applied. |
| Pagination | ✅ Pass | Category-based with Prev/Next buttons. |
| Member permission | ✅ Fixed | Now requires Member role via [requireMember](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#69-96). |
| State loss on restart | ⚠️ Acceptable | Buttons show "Session expired." — acceptable behavior. |

---

## 7. `/auction remove-member` — Logic

| Aspect | Status | Notes |
|--------|--------|-------|
| Member selection | ✅ Pass | User select → confirmation → execution. |
| Admin required (initial) | ✅ Pass | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) on slash command. |
| Admin re-check (buttons) | ✅ Fixed | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) added to `removemember_continue` and `removemember_confirm_*`. |
| Zero subs | ✅ Pass | Shows "no active subscriptions". |
| Removal correctness | ✅ Pass | [removeUserFromAll](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#373-393) iterates all items within write lock. |

---

## 8. `/auction cut-line` — UX & Logic

| Aspect | Status | Notes |
|--------|--------|-------|
| Move Top | ✅ Pass | Single atomic [moveToTop](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#288-309) call. |
| Move Up | ✅ Fixed | Now uses single atomic [moveToPosition(guildId, itemName, userId, targetIdx)](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#332-359). |
| Move Down | ✅ Fixed | Same atomic [moveToPosition](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#332-359). |
| Race condition | ✅ Fixed | [moveToPosition](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#332-359) operates within [withWriteLock(guildId, ...)](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#113-130). Single DB write per move. |
| 25-user cap in select | ✅ Pass | `.slice(0, 25)`. |
| 0 or 1 subs | ✅ Pass | Buttons disabled; boundary no-ops. |
| Discord limits | ✅ Pass | Max 4 action rows. |

---

## 9. `/auction setup` — Logic

| Aspect | Status | Notes |
|--------|--------|-------|
| Permission check | ✅ Pass | Native `Administrator`/`ManageGuild`, custom admin role, or literal "Auction Admin" role. |
| Re-setup | ✅ Pass | Overwrites existing config. |
| State collision | ⚠️ Acceptable | Two concurrent setups in same guild could conflict — extremely rare scenario. |

---

## 10. Security — Permissions & Guardrails

| Command / Flow | Auth Check | Status |
|----------------|-----------|--------|
| `/auction help` | None (public, ephemeral) | ✅ |
| `/auction store` | None (public, ephemeral) | ✅ |
| `/auction queue` | [requireMember](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#69-96) | ✅ Fixed |
| `/auction setup` | Custom native admin check | ✅ |
| `/auction publish` (slash) | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) | ✅ |
| `/auction publish` (confirm btn) | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) re-check | ✅ Fixed |
| `/auction print-*` (slash) | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) | ✅ |
| `/auction print-*` (confirm btn) | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) re-check | ✅ Fixed |
| `/auction cut-line` | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) | ✅ |
| `/auction remove-member` (slash) | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) | ✅ |
| `/auction remove-member` (buttons) | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) re-check | ✅ Fixed |
| `/auction reset` (slash) | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) | ✅ |
| `/auction reset` (confirm btn) | [requireAdmin](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#33-68) re-check | ✅ Fixed |
| `/auction sub` | [requireMember](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/permissions.ts#69-96) | ✅ |

> [!NOTE]
> All admin-only button flows now re-verify admin permissions before executing destructive or privileged actions.

---

## 11. Race Conditions

| Scenario | Status | Details |
|----------|--------|---------|
| Concurrent subscribes | ✅ Safe | [withWriteLock(guildId, ...)](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#113-130) serializes. |
| Subscribe during publish | ✅ Fixed | Queues re-read at confirm time from live state. |
| Subscribe during cut-line | ✅ Fixed | [moveToPosition](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#332-359) is a single atomic write-locked operation. |
| Subscribe during remove-member | ✅ Safe | [removeUserFromAll](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#373-393) wrapped in write lock. |
| Subscribe during reset | ✅ Fixed | [clearAllGuildData](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#427-472) wrapped in [withWriteLock(guildId, ...)](file:///Users/xinanxu/repo/dt-guild-bot/src/db/subscriptions.ts#113-130). |
| Multi-guild isolation | ✅ Fixed | Write lock is per-guild — guilds don't block each other. |

---

## 12. Discord Bot Common Practices

| Practice | Status | Notes |
|----------|--------|-------|
| Ephemeral admin commands | ✅ Pass | All admin commands ephemeral. |
| Deferred replies | ✅ Pass | Correctly deferred for all long operations. |
| Error handling | ✅ Pass | Global try/catch in `InteractionCreate`. |
| Graceful shutdown | ⚠️ Missing | No `SIGINT`/`SIGTERM` handler. Low priority. |
| Bot status/activity | ⚠️ Missing | No `setActivity()`. Cosmetic only. |
| Interaction timeout | ✅ Pass | 14-minute expiry on all state Maps. |

---

## 13. Documented Limits

All limits are now documented in [README.md](file:///Users/xinanxu/repo/dt-guild-bot/README.md):

| Limit | Value | Enforced |
|-------|-------|----------|
| Items per category | ≤ 25 | ✅ Startup validation + `.slice(0, 25)` in UIs |
| Embeds per message | 10 | ✅ [chunkEmbeds()](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/embeds.ts#455-489) and `.slice(0, 10)` |
| Embed description | 4096 chars | ✅ Split at 3800 chars |
| Total chars per message | 6000 | ✅ [chunkEmbeds()](file:///Users/xinanxu/repo/dt-guild-bot/src/utils/embeds.ts#455-489) |
| Action rows per message | 5 | ✅ Verified ≤ 5 in all UIs |
| Max quantity per item | 10 | ✅ `MAX_QTY = 10` |
| State expiry | 14 min | ✅ `setTimeout` on all Maps |
| Log entries displayed | 200 | ✅ Hardcoded cap |
| Log query window | 7 days | ✅ Hardcoded |
| items.json structure | Validated | ✅ Startup validation with clear error messages |

---

## 14. UI/UX Experience

| Command | Loading State | Feedback | Navigation | Verdict |
|---------|--------------|----------|------------|---------|
| `/auction sub` | ✅ "⏳ Loading..." | ✅ Results | ✅ Category pagination | ✅ |
| `/auction publish` | ✅ "⏳ Publishing..." | ✅ Preview + warning | ✅ Cat→Item→Qty flow | ✅ |
| `/auction queue` | ✅ Deferred | ✅ Category pages | ✅ Prev/Next | ✅ |
| `/auction cut-line` | ✅ Deferred | ✅ 👉 marker + instant | ✅ Cat→Item→User | ✅ |
| `/auction reset` | ✅ "⏳ Resetting..." | ✅ Danger confirm | ✅ | ✅ |
| `/auction remove-member` | ✅ "⏳ Removing..." | ✅ Summary + confirm | ✅ | ✅ |
| Subscribe/Unsubscribe | ✅ "⏳ Subscribing..." | ✅ ✅/⚠️ results | ✅ Returns to dashboard | ✅ |

---

## 15. Multi-Tenancy

| Aspect | Status | Notes |
|--------|--------|-------|
| DynamoDB partition | ✅ Pass | All data keyed by `GUILD#<guildId>`. |
| In-memory caches | ✅ Pass | Keyed by `guildId`. |
| Write lock | ✅ Fixed | Per-guild via `Map<guildId, Promise<void>>`. |
| Bot commands | ✅ Pass | Global or per-guild deployment. |
| Items catalog | ⚠️ Shared | All guilds share [items.json](file:///Users/xinanxu/repo/dt-guild-bot/src/items.json). Acceptable for now. |
| Config | ✅ Pass | Per-guild admin/member roles. |
| State Maps | ✅ Pass | Keyed by globally-unique interaction/message IDs. |

---

## 16. Additional Findings

### Legacy Code: [sanitizeTabName](file:///Users/xinanxu/repo/dt-guild-bot/src/db/items.ts#79-86)
[items.ts L83](file:///Users/xinanxu/repo/dt-guild-bot/src/db/items.ts#L83) — [sanitizeTabName](file:///Users/xinanxu/repo/dt-guild-bot/src/db/items.ts#79-86) is a leftover from the Google Sheets integration. It's exported but appears unused. Consider removing.

### Config: AWS Credentials
[config.ts](file:///Users/xinanxu/repo/dt-guild-bot/src/config.ts) requires `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. In container deployments (ECS/Fargate), the SDK can use IAM roles automatically. Consider making these optional.

### [handleCutLineCategorySelect](file:///Users/xinanxu/repo/dt-guild-bot/src/commands/auction.ts#1135-1141) is a No-Op
[auction.ts L1135](file:///Users/xinanxu/repo/dt-guild-bot/src/commands/auction.ts#L1135) — This handler just `deferUpdate()`s. The routing in [index.ts](file:///Users/xinanxu/repo/dt-guild-bot/src/index.ts) still dispatches to it, but it does nothing. Consider removing.

---

## Summary

| Severity | Previous | Current | Notes |
|----------|----------|---------|-------|
| 🔴 Critical | 3 | **0** | All fixed: publish race, cut-line race, global write lock |
| 🟡 Medium | 4 | **0** | All fixed: reset cache, reset lock, store limit (documented) |
| ⚠️ Low | 7 | **5** | Remaining: graceful shutdown, bot activity, shared catalog, legacy code, AWS creds |
| ✅ Pass | 16+ | **30+** | Expanded coverage with new checks |

> [!TIP]
> All critical and medium issues from the first audit have been resolved. The remaining items are cosmetic or low-priority enhancements that don't affect correctness or security.
