# PLAN-C-TESTS

> 更新时间：2026-05-06 05:28

---

## Session C 第五轮：快速检查（2026-05-06 05:28）
- [x] TypeScript 编译：0 错误 ✅
- [x] sync 模块文件无变更 ✅
- [x] 后端 wsHandler.ts 仍未应用 sync_event 补丁（等待主会话）✅
- [x] **结论：无变更需要，前端同步模块保持 100% 完成状态**

---

## Session C 第四轮：快速检查（2026-05-06 04:57）
- [x] TypeScript 编译：0 错误 ✅
- [x] sync 模块文件（eventBus/broadcastSync/wsSync/index）自第三轮以来无变更 ✅
- [x] 后端 wsHandler.ts 未打 sync_event 补丁（仍在等待主会话审核）✅
- [x] WORKBOARD 无 Session C 新任务分配 ✅
- [x] **结论：无变更需要，前端同步模块代码保持 100% 完成状态，持续等待主会话联调指令**

---

---

## Session C 第三轮：前端同步模块完整性验证（2026-05-06 04:27）
- [x] eventBus.ts：事件总线结构完整，去重窗口/回环防护/内存清理均正确 ✅
- [x] broadcastSync.ts：BroadcastChannel 初始化/发送/销毁/降级均正确，频道名含 userId ✅
- [x] wsSync.ts：WsSync.handleIncomingMessage 字段校验正确，sync_event 分发正确 ✅
- [x] index.ts：统一导出完整 ✅
- [x] 接入点 1（AppShell sync 生命周期）：已验证落地，5 事件订阅 + 退出销毁完整 ✅
- [x] 接入点 2（conversationStore sync_event）：已验证落地，WS URL 携带 tabId + WsSync.handleIncomingMessage 懒加载调用 ✅
- [x] 接入点 3（store 广播事件）：已验证落地，closeTab→session.closed / renameTab→session.renamed / createSessionTab→session.opened ✅
- [x] 接入点 4（sync 事件消费方）：已验证落地，session.opened/closed/renamed + task.updated + project.updated 均有 handler ✅
- [x] sync 事件 5 种类型全部有发射源 + 消费方，完整闭环 ✅
- [x] session.renamed 防循环修复：AppShell handler 直接 setState，不调 renameTab ✅
- [x] 后端补丁文档 PLAN-C-WSHANDLER-SYNC-PATCH.md 就绪 ✅
- [x] 前端接入规格文档 PLAN-C-SYNC-INTEGRATION-SPEC.md 就绪 ✅
- [x] **结论：前端同步模块代码 100% 完成。剩余事项：(1) 后端 wsHandler.ts 补丁应用 (2) 浏览器联调测试**

---

## Session B 第七轮：代码审计与构建验证（2026-05-06 04:01）
- [x] TypeScript 编译：0 错误 ✅
- [x] Vite 构建：EXIT 0 ✅
- [x] conversationStore.ts：persist 分层 / sync 接入 / restoreFromPersist / getWsInstance — 代码与决策一致 ✅
- [x] taskStore.ts：纯 zustand / sync 广播 / restoreFromPersist 调用链完整 ✅
- [x] projectKanbanStore.ts：纯 zustand / sync 广播 / restoreFromPersist 调用链完整 ✅
- [x] sessionKanbanStore.ts：纯 zustand / sync 广播 / restoreFromPersist 调用链完整 ✅
- [x] AppShell.tsx：5 个 sync 事件订阅 + 退出销毁 cleanup 完整 ✅
- [x] sync 事件 5 种类型发射源与消费方完全匹配 ✅
- [x] restoreFromPersist 消费者覆盖：ProjectWorkspace、AgentConsole、AgentKanban、AppShell ✅
- [x] **结论：代码稳定，无需变更**

---

---

## Session A 第九轮：快速检查（2026-05-06 04:56）
- [x] TypeScript 编译：0 错误 ✅
- [x] git diff 验证：与第八轮完全一致，无新增改动 ✅
- [x] WORKBOARD 无 Session A 新任务分配 ✅
- [x] **结论：无变更需要，持续等待主会话联调指令**

---

## Session A 第八轮：Auth/Tab 隔离代码审计（2026-05-06 04:26）
- [x] TypeScript 编译：0 错误 ✅
- [x] Vite 构建：EXIT 0 ✅
- [x] authStore.ts：sessionStorage 迁移 ✅ / `repaceclaw-auth` persist key ✅ / `createJSONStorage(() => sessionStorage)` ✅
- [x] AuthPage.tsx：登录链路完整 ✅
  - `login(result.user, result.token)` → `initTabSession()` → `clearUserData()` → `clearAllRcStorage()` → `window.location.replace('/workspace')` ✅
  - 跨用户缓存清理路径正确 ✅
- [x] AppShell.tsx：sync 生命周期管理完整 ✅
  - `isAuthenticated && user?.id` 为 true 时初始化 BroadcastChannel + WebSocket sync ✅
  - 退出时 `destroyBroadcastSync()` + `destroyWsSync()` + `syncEventBus.destroy()` ✅
  - 5 个事件订阅完整（session.opened/closed/renamed, task.updated, project.updated）✅
  - `session.renamed` 防循环修复（直接 setState，不调 renameTab）✅
  - 所有 store 引用通过 `getState()` 动态获取 ✅
- [x] storageScope.ts：作用域工具完整 ✅
  - `generateTabId()` / `getOrCreateTabId()` / `getTabId()` ✅
  - `getCurrentUserId()`（sessionStorage 优先，localStorage 兜底）✅
  - `getScopedKey('conv')` → `rc:conv:{userId}` ✅
  - `getSyncChannel(userId)` → `rc-sync-{userId}` ✅
  - `clearUserData()` / `clearAllRcStorage()` / `clearAllSessionData()` ✅
- [x] 与 DECISIONS 文档交叉验证：D-013 / D-015 / D-019 全部一致 ✅
- [x] **结论：Session A 核心代码全部完成，0 个变更需要**

---

## 恢复链路补全（Session B 第二轮，2026-05-05 14:29）
- [x] taskStore.restoreFromPersist() 此前从未被调用 → ProjectWorkspace + AgentConsole 已补全 ✅
- [x] projectKanbanStore.restoreFromPersist() 此前从未被调用 → ProjectWorkspace + AgentConsole 已补全 ✅
- [x] TypeScript 编译通过 ✅

---

## Auth 隔离代码审计（Session A 完成）
- [x] authStore 使用 sessionStorage ✅
- [x] tabId 生成与持久化机制 ✅
- [x] storageScope 工具函数完整 ✅
- [x] conversationStore persist key 作用域正确（`rc:conv:{userId}`）✅
- [x] sessionKanbanStore / taskStore 无 persist，纯 API 驱动 ✅
- [x] 退出登录清理路径正确（`clearAllRcStorage` + `clearAllSessionData`）✅
- [x] WebSocket 连接 auth 读取路径正确（sessionStorage 优先，localStorage 兜底）✅
- [x] 无跨账号写入 localStorage 的风险点 ✅
- [ ] ⚠️ AgentCreate.tsx token cache 不含 userId 作用域（轻微风险，不在 Session A 范围）

---

## 场景 1：不同账号同浏览器
- [ ] Tab A 登录账号 A
- [ ] Tab B 登录账号 B
- [ ] 两边 userId / tabId 不同
- [ ] workspace 数据不串
- [ ] kanban 数据不串
- [ ] session list 不串

## 场景 2：同账号多 tab
- [ ] Tab A 创建/删除会话，Tab B 自动同步
- [ ] Tab A 更新任务，Tab B 自动同步
- [ ] UI 状态不互相污染

## 场景 2 扩展：同账号多浏览器
- [ ] 浏览器 A 创建会话，浏览器 B 自动可见
- [ ] 浏览器 A 更新任务，浏览器 B 自动同步
- [ ] 连接断开后的重连恢复正常

## 场景 3：刷新页面
- [ ] auth 正常恢复
- [ ] tabId 正常恢复
- [ ] 当前打开 tab 正常恢复
- [ ] 业务数据以后端校正
- [ ] 不出现旧缓存回流

## 专项回归
- [ ] 平台助手会话恢复
- [ ] 删除会话后刷新不复现
- [ ] workspace / kanban / session list 一致性

---

## Sync 模块代码验证（Session C，2026-05-05 14:33）
- [x] `eventBus.ts`：TypeScript 编译通过，0 错误
- [x] `broadcastSync.ts`：TypeScript 编译通过，0 错误
- [x] `wsSync.ts`：TypeScript 编译通过，0 错误
- [x] `index.ts`：统一导出，TypeScript 编译通过
- [x] 未修改 A/B 负责的核心文件（authStore / conversationStore / taskStore / projectKanbanStore / sessionKanbanStore）

---

## Sync 后端补丁 + 前端接入规格（Session C，2026-05-05 15:03）
- [x] `PLAN-C-WSHANDLER-SYNC-PATCH.md`：后端 wsHandler.ts 精确补丁（4 处改动，~20 行新增）
  - [x] WSClient 接口新增 tabId 字段
  - [x] auth 分支记录 tabId
  - [x] sync_event 消息处理（按 userId 转发 + tabId 回环防护）
  - [x] query token 认证记录 tabId（可选）
- [x] `PLAN-C-SYNC-INTEGRATION-SPEC.md`：前端接入规格（4 个接入点 + 顺序 + 回滚方案）
  - [x] 接入点 1：AppShell sync 生命周期管理
  - [x] 接入点 2：conversationStore sync_event 接收 + tabId 传递
  - [x] 接入点 3：各 store 发送 sync 事件
  - [x] 接入点 4：sync 事件消费方（事件订阅 + store 刷新）
- [x] TypeScript 编译通过，0 错误

---

## Store 分层与恢复链路（Session B）
- [x] conversationStore：partialize 仅 UI 状态，业务数据从 API 恢复 ✅
- [x] taskStore：纯 zustand，restoreFromPersist 接入 ProjectWorkspace + AgentConsole ✅
- [x] projectKanbanStore：纯 zustand，restoreFromPersist 接入 ProjectWorkspace + AgentConsole ✅
- [x] sessionKanbanStore：纯 zustand，restoreFromPersist 接入 AgentKanban ✅
- [x] conversationStore 新增 `getWsInstance()` 导出，供 sync 模块复用 WS 连接 ✅
- [x] TypeScript 编译通过 ✅

---

## conversationStore sync 接入验证（Session B 第四轮，2026-05-05 15:29）
- [x] WS URL 携带 tabId 参数 ✅
- [x] onmessage 中 WsSync.handleIncomingMessage 懒加载调用 ✅
- [x] closeTab 广播 session.closed ✅
- [x] renameTab 广播 session.renamed ✅
- [x] createSessionTab 广播 session.opened ✅
- [x] 所有 sync 调用采用动态 import，不影响主加载路径 ✅
- [x] TypeScript 编译通过 ✅
- [x] ~~待联调~~：AppShell 接入点 1 已由 Session A 完成 ✅（2026-05-05 15:59）

---

## AppShell sync 生命周期接入（Session A，2026-05-05 15:59）
- [x] 接入点 1：AppShell.tsx 新增 sync 生命周期管理 useEffect ✅
  - [x] 登录初始化：isAuthenticated + user.id 为 true 时 init BroadcastChannel + WebSocket sync ✅
  - [x] 退出销毁：isAuthenticated 变 false 时 destroyBroadcastSync + destroyWsSync + syncEventBus.destroy ✅
  - [x] 5 个事件订阅：session.opened/closed → kanban 刷新，session.renamed → tab 重命名，task.updated → task 刷新，project.updated → project 刷新 ✅
- [x] TypeScript 编译通过，0 错误 ✅
- [x] 4 个 sync 接入点全部落地（接入点 1/2/3 + 接入点 4 内嵌到 AppShell）✅
- [ ] 待联调：浏览器实际测试同账号多 Tab 同步 + 跨浏览器同步 + 退出清理

---

## Store 同步广播补全（Session B 第六轮，2026-05-05 16:30）
- [x] taskStore: addTask / addTaskFromChat / moveTask / updateTask / removeTask → task.updated ✅
- [x] projectKanbanStore: addProject / moveProject / updateProject / removeProject → project.updated ✅
- [x] sessionKanbanStore: removeSession / updateSessionStatus → session.closed ✅
- [x] AppShell task.updated / project.updated 订阅现完整闭环 ✅
- [x] TypeScript 编译通过 ✅

---

## sync 事件链 bug 修复验证（Session B 第五轮，2026-05-05 16:00）
- [x] `session.renamed` 广播载荷已包含 `tabId` ✅
- [x] AppShell handler 收到事件后直接 setState，不调 renameTab（防循环广播） ✅
- [x] TypeScript 编译通过 ✅

---

## Sync 模块待联调测试（待主会话决定接入时机）

### BroadcastChannel 同浏览器多 Tab 同步
- [ ] Tab A 登录账号 A，Tab B 登录账号 A（同账号）
- [ ] Tab A 创建会话 → Tab B 自动收到 `session.opened` 事件
- [ ] Tab A 关闭 Tab → Tab B 自动收到 `session.closed` 事件
- [ ] Tab A 重命名 Tab → Tab B 自动收到 `session.renamed` 事件
- [ ] Tab A 切换 Agent → Tab B 自动收到 `session.activated` 事件
- [ ] 回环防护验证：Tab A 发出的事件不会被 Tab A 自己处理

### BroadcastChannel 跨账号隔离
- [ ] Tab A 登录账号 A，Tab B 登录账号 B（不同账号）
- [ ] Tab A 创建会话 → Tab B **不会**收到任何事件
- [ ] 验证频道名不同：`rc-sync-{userIdA}` vs `rc-sync-{userIdB}`

### WebSocket 跨浏览器/跨设备同步
- [ ] 浏览器 A 登录账号 A，浏览器 B 登录账号 A
- [ ] 浏览器 A 创建会话 → 浏览器 B 通过 WS 收到 `session.opened` 事件
- [ ] 浏览器 A 关闭会话 → 浏览器 B 通过 WS 收到 `session.closed` 事件
- [ ] WS 断开重连后状态恢复正常
- [ ] 回环防护验证：浏览器 A 发出的事件不会被浏览器 A 自己处理

### 事件去重与幂等
- [ ] 同时收到 BroadcastChannel 和 WebSocket 的同一事件 → 只处理一次
- [ ] 去重窗口 5000ms 内重复事件自动忽略
- [ ] 超过 200 条已处理事件 ID 时自动清理一半，不内存泄漏
