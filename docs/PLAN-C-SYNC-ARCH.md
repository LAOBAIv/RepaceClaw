# PLAN-C-SYNC-ARCH

> 作者：Session C / qwen3-max-2026-01-23
> 主会话整理落库：2026-05-05 12:33
> 状态：架构草案 + 代码实现完成，后端补丁 + 前端接入规格就绪，待主会话审核后实施

---

## 目标

方案 C 的同步目标分三层：

1. 不同账号同浏览器严格隔离
2. 同账号同浏览器多 Tab 实时同步
3. 同账号多浏览器 / 多设备最终一致

---

## 一、同步分层

### 1. Tab 级隔离
- `authStore` 使用 `sessionStorage`
- 每个 Tab 独立持有登录态
- `tabId` 在当前 Tab 生命周期内稳定

### 2. 同浏览器多 Tab 同步
- 使用 `BroadcastChannel`
- 频道名：`rc-sync-{userId}`
- 不依赖后端改动
- 解决同账号多个 Tab 的本地状态广播

### 3. 多浏览器 / 多设备同步
- 使用 WebSocket 用户级 channel
- 后端按 `user_id` 维护连接池
- 同一用户在不同浏览器、不同设备之间同步状态变更

---

## 二、事件模型

统一事件结构：

```ts
interface SyncEvent<T = any> {
  type: string;
  userId: string;
  tabId: string;
  origin: 'broadcast' | 'ws';
  seq: number;
  timestamp: number;
  payload: T;
}
```

### 核心事件类型
- `session.opened`
- `session.closed`
- `session.renamed`
- `session.activated`
- `message.appended`
- `message.stream.started`
- `message.stream.delta`
- `message.stream.completed`
- `task.updated`
- `project.updated`

---

## 三、冲突控制

### 基本策略
- 每个发送端维护递增 `seq`
- 采用 Last-Write-Wins 作为基础合并规则
- 加入 `tabId` + `origin` 防回环

### 防回环规则
- 本地发出的事件写入 `recentEventIds`
- 收到事件时先判断是否为自己发送
- 如果是本地回流，则忽略

---

## 四、前端接入点

### 当前已完成前置底座
- `authStore.ts` → `sessionStorage`
- `AppShell.tsx` → `tabId` 显示
- `conversationStore.ts` → 仅保留 UI persist
- `taskStore.ts` / `projectKanbanStore.ts` / `sessionKanbanStore.ts` → 业务数据不再 persist

### 待接入文件
- `frontend/src/stores/conversationStore.ts`
- `frontend/src/stores/taskStore.ts`
- `frontend/src/stores/projectKanbanStore.ts`
- `frontend/src/stores/sessionKanbanStore.ts`
- `frontend/src/lib/storageScope.ts`
- 新增同步控制器文件（建议）
  - `frontend/src/lib/sync/broadcastSync.ts`
  - `frontend/src/lib/sync/wsSync.ts`
  - `frontend/src/lib/sync/eventBus.ts`

---

## 五、后端接入点

建议新增用户级同步通道：

- WebSocket 连接建立后绑定 `user_id`
- Gateway / RepaceClaw 后端维护 `Map<userId, Set<socket>>`
- 当前端发生关键状态更新时向该用户其他连接广播

建议事件仅同步“变更通知”，业务详情仍以后端 API 为准。

---

## 七、代码实现状态（2026-05-05 14:33）

### 已完成文件
| 文件 | 状态 | 说明 |
|------|------|------|
| `frontend/src/lib/sync/eventBus.ts` | ✅ | 全局同步事件总线，发布/订阅 + 回环防护 + 去重窗口 |
| `frontend/src/lib/sync/broadcastSync.ts` | ✅ | BroadcastChannel 同浏览器多 Tab 同步控制器 |
| `frontend/src/lib/sync/wsSync.ts` | ✅ | WebSocket 跨浏览器/跨设备同步控制器 |
| `frontend/src/lib/sync/index.ts` | ✅ | 统一导出入口 |

### 补丁文档（2026-05-05 15:03）
| 文件 | 状态 | 说明 |
|------|------|------|
| `docs/PLAN-C-WSHANDLER-SYNC-PATCH.md` | ✅ 就绪 | 后端 wsHandler.ts 精确补丁（4 处改动，~20 行新增，0 删除） |
| `docs/PLAN-C-SYNC-INTEGRATION-SPEC.md` | ✅ 就绪 | 前端接入规格（4 个接入点 + 顺序 + 回滚方案） |

### 前端接入状态（Session C 第三轮验证 2026-05-06 04:27）
| 接入点 | 状态 | 说明 |
|--------|------|------|
| 接入点 1：AppShell sync 生命周期 | ✅ 已落地 | 登录 init / 退出 destroy / 5 事件订阅 |
| 接入点 2：conversationStore sync_event 接收 | ✅ 已落地 | WS URL 携带 tabId + WsSync.handleIncomingMessage 懒加载 |
| 接入点 3：各 store 发送 sync 事件 | ✅ 已落地 | closeTab/renameTab/createSessionTab 均广播 |
| 接入点 4：sync 事件消费方 | ✅ 已落地 | session.opened/closed/renamed + task.updated + project.updated |

### 待后端适配
| 文件 | 改动 | 说明 |
|------|------|------|
| `backend/src/ws/wsHandler.ts` | 新增 | 处理 `type: "sync_event"` 消息，按 userId 转发给同用户其他连接（补丁已就绪） |

## 八、实施顺序（更新版）

### Day 2（已完成 ✅ 2026-05-06 04:27）
- [x] 接入 BroadcastChannel
- [x] 实现同浏览器多 Tab 同步（代码落库）
- [x] 接入 AppShell / conversationStore（4 个接入点全部落地）
- [x] 5 种 sync 事件类型全部闭环（发射源 + 消费方匹配）
- [x] 后端 wsHandler.ts 补丁规格就绪

### Day 3（待实施）
- [ ] 后端 wsHandler.ts 新增 sync_event 处理（补丁已就绪，~20 行新增）
- [ ] 做多浏览器 / 多设备联调
- [ ] WS 断开重连策略验证

### Day 4
- [ ] 增量同步优化
- [ ] 版本控制 / 幂等 / 回环防护
- [ ] 场景 1/2/3 回归测试

---

## 七、结论

方案 C 的核心不是“所有状态都实时同步”，而是：

- 登录态按 Tab 隔离
- UI 状态允许轻量恢复
- 业务真相统一以后端为准
- 本地同步只同步必要事件，不同步整份业务快照

这样才能同时满足：
- 不串号
- 可恢复
- 可扩展
- 可落地
