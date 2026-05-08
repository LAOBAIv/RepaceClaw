# PLAN-C-DECISIONS

> 更新时间：2026-05-05 16:00
> 最后更新人：Session A / GLM-5（接入点 1 AppShell sync 生命周期落地）

---

## D-001：方案 C 作为正式实施目标
- 目标：支持不同账号同浏览器隔离、同账号多端同步、刷新恢复稳定
- 决定时间：2026-05-05

## D-002：主会话固定 Opus 4.6
- 用途：架构、决策、审查、总控
- 不切换模型

## D-003：执行会话固定低成本模型池
- GLM-5：代码检索、基础执行
- Qwen3.6-Plus：中复杂度前端/store 改造
- Qwen3.6-Max-Preview：复杂同步链路、协议与疑难排障

## D-004：共同记忆采用文件共享，不采用会话脑内共享
- 真相源文件：
  - PLAN-C-IMPLEMENTATION.md
  - PLAN-C-WORKBOARD.md
  - PLAN-C-DECISIONS.md
  - PLAN-C-TESTS.md（待建）

## D-005：后端为唯一业务真相
- conversations/tasks/projects/session list 等业务数据以后端为准
- 前端缓存只承担 UI 恢复与短时加速

## D-006：场景约束
- 场景1：不同账号同浏览器不串号
- 场景2：同账号多 tab / 多浏览器需同步
- 场景3：刷新页面状态恢复正常

---

## D-007：Store 持久化分层原则（Session B 制定）
- **UI 状态 persist**：sessionTabs、activeTabId、closedSessionIds、currentAgentId — 这些是用户"界面摆放"，刷新后应恢复
- **业务数据不 persist**：openPanels.messages、tasks.board、projects.board、sessions.board — 这些以后端 API 为准，刷新后重新拉取
- **storage 统一迁移**：localStorage → sessionStorage（配合 Day 1 authStore 迁移）
- **key 规范**：`rc:{storeName}:{userId}`（去掉 tabId，因为 sessionStorage 天然按 tab 隔离）
- **恢复链路**：auth → UI state（sessionStorage 秒恢复）→ API 拉业务数据 → 增量校正

## D-008：不碰 authStore
- authStore 改造由 Session A 负责
- 本 Session 只假设 authStore 已迁移到 sessionStorage，读取 `repaceclaw-auth` key

## D-009：不做同步机制实现
- BroadcastChannel / WebSocket 同步由 Session C 负责
- 本 Session 只确保 store 改造后的数据结构兼容未来同步

## D-010：所有开发会话必须保持永久共享记忆
- 不依赖单个会话的上下文窗口记忆
- 统一以文件作为永久共享记忆真相源
- 每个会话在关键阶段必须写回：
  - `docs/PLAN-C-WORKBOARD.md`
  - `docs/PLAN-C-DECISIONS.md`
  - `docs/PLAN-C-TESTS.md`
  - 需要时新增专项文档
- 主会话负责记忆总校验与收口，防止各会话认知漂移

## D-011：storageScope 统一收口到 `frontend/src/lib/storageScope.ts`
- Session A 与 Session B 曾分别产出 `lib/storageScope.ts` 与 `utils/storageScope.ts`
- 为避免后续双实现漂移，统一以 `lib/storageScope.ts` 为单一真相源
- `utils/storageScope.ts` 仅保留兼容导出，不再承载独立逻辑
- `conversationStore` 的 persist key 统一通过 `getScopedKey('conv')` 生成

## D-012：所有开发会话改代码前必须先查看现有代码注释
- 任何会话在修改代码前，必须先阅读目标文件中的现有注释，尤其是关键修复注释、时序注释、兼容性注释和业务规则注释
- 不允许跳过注释直接改代码，避免把历史问题重新引入
- 如发现注释与现状不一致，修改代码时必须同步修正注释
- 这是强制执行规则，适用于主会话与所有持久开发会话

---

## D-013：Session A 验证结论（2026-05-05 14:25）
- **authStore → sessionStorage**：✅ 已迁移，`createJSONStorage(() => sessionStorage)`
- **tabId 机制**：✅ 完整，`generateTabId()` / `getOrCreateTabId()` / `initTabSession()`
- **storageScope 工具**：✅ 完整，`getScopedKey()` / `scopeKey()` / `userScopeKey()` / `getSyncChannel()`
- **恢复链路验证**：
  - conversationStore：persist key = `getScopedKey('conv')` = `rc:conv:{userId}` → sessionStorage ✅
  - sessionKanbanStore：纯 zustand，无 persist，API 驱动 ✅
  - taskStore：纯 zustand，无 persist，API 驱动 ✅
- **剩余 localStorage 写入**：全部为非 auth 用途（per-conversationId UI 状态 / channel token cache / 清理函数）
  - AgentCreate.tsx token cache：按 channelId 存储，不含 userId 作用域，有轻微跨账号复用风险 → 不在 Session A 范围内
  - AgentKanban/SessionAgentBar/TaskTagPanel localStorage：key 含 conversationId → 已按会话隔离 ✅
- **Session A 四项 TODO 全部完成，无需代码变更**

## D-014：sync 模块架构决策（Session C，2026-05-05 14:33）
- **三层同步**：BroadcastChannel（同浏览器同 Tab） + WebSocket（跨浏览器） + API 轮询（兜底）
- **eventBus 单例**：全局唯一事件总线，所有同步事件必须通过 eventBus 分发
- **回环防护**：通过 `recentEventIds` 集合 + 事件唯一 ID（type:userId:tabId:seq:timestamp）防止自己发出的事件被自己处理
- **去重窗口**：5000ms，最多保留 200 条已处理事件 ID，超出时清理一半
- **broadcastSync 降级**：不支持 BroadcastChannel 的环境（Safari < 15）静默降级为不同步
- **wsSync 复用连接**：不新建 WebSocket 连接，复用 conversationStore 的业务 WS 连接
- **wsSync 协议**：通过 `{ type: "sync_event", ...SyncEvent }` 格式在现有 WS 上承载同步事件
- **后端最小改动**：wsHandler.ts 只需新增 "sync_event" 消息类型处理，按 userId 转发给同用户其他连接
- **不碰核心文件**：Session C 只新增 `lib/sync/` 目录下的文件，不修改 A/B 负责的 store 和 auth 文件

## D-015：sync 模块接入时机
- sync 模块代码已落库，但尚未接入 AppShell / conversationStore
- 接入时机由主会话（Opus 4.6）决定，建议在 Auth/Store 底座联调通过后再接入
- 接入步骤：
  1. AppShell.tsx 登录成功后初始化 `getBroadcastSync(userId)` 和 `getWsSync(getWsInstance, userId)`
  2. 退出登录时调用 `destroyBroadcastSync()` 和 `destroyWsSync()`
  3. conversationStore.onmessage 中新增 `WsSync.handleIncomingMessage(data)` 调用
  4. 各 store 的变更操作（如 closeTab、renameTab 等）完成后调用 `broadcastSync.send()` 广播

## D-016：conversationStore 暴露 `getWsInstance()`（Session B，2026-05-05 14:59）
- `wsInstance` 是 conversationStore 的模块级私有变量
- sync 模块（wsSync.ts）设计为复用已有 WS 连接，不新建连接
- 为避免 sync 模块通过轮询或 hack 方式接入，conversationStore 显式导出 `getWsInstance()` getter
- 这是最小改动：仅新增 6 行 getter 函数，不修改任何现有行为
- 接入仍遵循 D-015，由主会话决定时机

## D-017：conversationStore sync 接入实现（Session B，2026-05-05 15:29）
- **WS URL 携带 tabId**：connect() 中构建 wsUrl 时追加 `&tabId=xxx`，供后端回环防护
- **onmessage 挂载 sync_event**：采用动态 import(`../lib/sync`) 懒加载 WsSync，不阻塞主消息流
- **变更方法广播**：closeTab → session.closed，renameTab → session.renamed，createSessionTab → session.opened
- **安全设计**：所有 sync 调用均为动态 import + getBroadcastSync() 空值检查，sync 模块未初始化时静默跳过
- **AppShell 接入点 1 仍需主会话/Session A 实施**，当前 conversationStore 侧已就绪

## D-019：session.renamed sync 事件链 bug 修复（Session B，2026-05-05 16:00）
- **根因**: conversationStore 广播 `session.renamed` 时只传了 `{conversationId, newTitle}`，缺少 `tabId`
- **现象 1**: AppShell handler 调用 `renameTab(conversationId, newTitle)` 时，参数类型不匹配
  - renameTab 签名是 `(tabId: string, newTitle: string)`，传 conversationId 导致 tab 找不到，set() 后数组 map 不变
  - 表现：其他 Tab 收到重命名事件但 Tab 标题不更新，静默失败
- **现象 2**: renameTab 内部会再次调用 getBroadcastSync().send() 广播 `session.renamed`，
  - 多 Tab 场景下可能产生无限循环广播（A → B → A → B ...）
  - eventBus 的 markLocal/去重机制能部分缓解，但不应该依赖它
- **修复方案**:
  1. conversationStore: 广播载荷增加 `tabId` 字段 → `{ tabId, conversationId, newTitle }`
  2. AppShell: 收到事件后直接 setState 更新 Tab 标题，不调 renameTab
     - 避免重复 API 调用（sessionTabsApi.upsert + conversationsApi.update）
     - 避免重广播导致循环
     - 本地状态更新即可，后端数据由 API 层保证一致性
- **教训**: sync 事件的 handler 应该只更新本地状态，不调用会再次广播的方法
- **接入点 1 已完成**：AppShell.tsx 新增 sync 生命周期管理 useEffect
- **初始化时机**：`isAuthenticated && user?.id` 为 true 时初始化 BroadcastChannel + WebSocket sync
- **销毁时机**：用户退出登录（isAuthenticated 变 false）或组件卸载时，依次销毁所有事件订阅 + destroyBroadcastSync + destroyWsSync + syncEventBus.destroy
- **事件订阅**：5 个同步事件消费方已注册
  - `session.opened` / `session.closed` → useSessionKanbanStore.restoreFromPersist()
  - `session.renamed` → useConversationStore.renameTab(conversationId, newTitle)
  - `task.updated` → useTaskStore.restoreFromPersist()
  - `project.updated` → useProjectKanbanStore.restoreFromPersist()
- **新增导入**：6 个 sync/store 模块（getBroadcastSync, destroyBroadcastSync, getWsSync, destroyWsSync, syncEventBus, getWsInstance, useSessionKanbanStore, useTaskStore, useProjectKanbanStore, useConversationStore）
- **关键设计**：所有 store 引用通过 `getState()` 动态获取，避免跨 store 循环依赖
- **TypeScript 编译**：0 错误，EXIT 0

## D-020：taskStore / projectKanbanStore / sessionKanbanStore 补全 sync 广播（Session B，2026-05-05 16:30）
- **发现者**: Session C 第四轮审计发现 AppShell 已注册 `task.updated` / `project.updated` 订阅，但无对应发射源
- **修复方案**: 在 3 个 store 的变更方法后增加 `getBroadcastSync().send()` 调用
  - taskStore: addTask / addTaskFromChat / moveTask / updateTask / removeTask → 均广播 `task.updated`
  - projectKanbanStore: addProject / moveProject / updateProject / removeProject → 均广播 `project.updated`
  - sessionKanbanStore: removeSession / updateSessionStatus → 广播 `session.closed`
- **安全设计**: 所有广播采用动态 import + getBroadcastSync() 空值检查，sync 模块未初始化时静默跳过
- **闭环**: AppShell 的 5 个 sync 事件订阅现在全部有对应发射源，完整闭环
- **TypeScript 编译**：0 错误
