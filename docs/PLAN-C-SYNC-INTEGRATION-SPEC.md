# PLAN-C-SYNC-INTEGRATION-SPEC

> 作者：Session C / qwen3-max-2026-01-23
> 更新时间：2026-05-05 15:03
> 状态：规格文档已就绪，待主会话审核后实施

---

## 目标

将 sync 模块（eventBus / broadcastSync / wsSync）接入前端应用，
实现同账号多 Tab / 多浏览器的实时状态同步。

---

## 接入点 1：AppShell.tsx — 同步生命周期管理

### 修改位置
`frontend/src/components/layout/AppShell.tsx`

### 改动范围
在登录成功后初始化 sync，退出登录时销毁 sync。

### 新增导入

```typescript
// 在文件顶部导入
import { getBroadcastSync, destroyBroadcastSync, getWsSync, destroyWsSync, syncEventBus } from '@/lib/sync';
import { getWsInstance } from '@/stores/conversationStore';
import { getOrCreateTabId } from '@/lib/storageScope';
```

### 改动 1：登录成功后初始化 sync

**位置**：AppShell 中检测 `isAuthenticated` 变为 true 的 useEffect

```typescript
// 新增：登录成功后初始化同步模块
useEffect(() => {
  if (!isAuthenticated || !user?.id) return;

  // 1. 初始化 BroadcastChannel 同步（同浏览器多 Tab）
  getBroadcastSync(user.id);

  // 2. 初始化 WebSocket 同步（跨浏览器/跨设备）
  //    复用 conversationStore 的 WS 连接
  getWsSync(() => getWsInstance(), user.id);

  // 3. 注册同步事件订阅
  setupSyncSubscriptions();

  // 清理函数：组件卸载或用户退出时销毁
  return () => {
    destroyBroadcastSync();
    destroyWsSync();
    syncEventBus.destroy();
  };
}, [isAuthenticated, user?.id]);
```

### 改动 2：在 auth 消息中携带 tabId（供后端回环防护）

**位置**：如果 AppShell 中有 WS auth 逻辑，在 auth 消息中加 tabId

```typescript
// 在 WS 连接建立后发送 auth 时：
ws.send(JSON.stringify({
  type: 'auth',
  token,
  tabId: getOrCreateTabId(),  // ← 新增
}));
```

> **注意**：当前 auth 是通过 URL query token 传递的，tabId 也应通过 URL query 传递。
> 修改 conversationStore 的 connect() 方法，在 WS URL 中追加 `&tabId=xxx`。

---

## 接入点 2：conversationStore.ts — 接收后端 sync_event

### 修改位置
`frontend/src/stores/conversationStore.ts`

### 改动：onmessage 中新增 sync_event 处理

**位置**：`currentWs.onmessage` 处理函数中，在现有事件处理之后

```typescript
// 在 onmessage 的 try-catch 块内，现有事件处理之后：
// ── 方案 C 同步事件处理 ──
import { WsSync } from '@/lib/sync';
// ...
WsSync.handleIncomingMessage(data);
```

**注意**：由于 `WsSync.handleIncomingMessage` 会检查 `msg.type !== 'sync_event'` 后直接 return，
所以不会影响现有的 chat/agent_start/agent_chunk 等消息处理。

### 改动：WS URL 携带 tabId

**位置**：connect() 方法中构建 wsUrl 的地方

```typescript
// 现有代码：
const wsUrl = `${wsProtocol}//${window.location.host}/ws${tokenParam}`;

// 改为：
import { getOrCreateTabId } from '@/lib/storageScope';
const tabId = getOrCreateTabId();
const wsUrl = `${wsProtocol}//${window.location.host}/ws${tokenParam}${tokenParam ? '&' : '?'}tabId=${encodeURIComponent(tabId)}`;
```

---

## 接入点 3：各 store 变更方法 — 发送 sync 事件

### 改动范围
以下 store 的变更方法完成后调用 `broadcastSync.send()` 广播事件。

### conversationStore.ts

```typescript
import { getBroadcastSync } from '@/lib/sync';

// closeTab 方法中，在 set() 之后：
closeTab: (tabId) => {
  // ... 现有逻辑 ...
  set({ sessionTabs: remaining, activeTabId: newActiveTabId, closedSessionIds: newClosedIds, currentAgentId: '' });

  // 新增：广播 Tab 关闭事件
  const bc = getBroadcastSync();
  if (bc) bc.send('session.closed', { conversationId: convId, tabId });
},

// renameTab 方法中，在 set() 之后：
renameTab: (tabId, newTitle) => {
  // ... 现有逻辑 ...

  // 新增：广播 Tab 重命名事件
  const bc = getBroadcastSync();
  if (bc) bc.send('session.renamed', { conversationId, newTitle });
},

// createSessionTab 方法中，在 set() 之后：
createSessionTab: async (opts) => {
  // ... 现有逻辑 ...
  set(s => ({
    sessionTabs: [...s.sessionTabs, newTab],
    activeTabId: tabId,
  }));

  // 新增：广播会话打开事件
  const bc = getBroadcastSync();
  if (bc) bc.send('session.opened', { conversationId: opts.conversationId || tabId, title: opts.title || opts.agentName });
},
```

---

## 接入点 4：sync 事件消费方 — 收到事件后刷新数据

### 位置：AppShell.tsx 或各组件

```typescript
function setupSyncSubscriptions() {
  // 会话打开：刷新 session list
  syncEventBus.on('session.opened', () => {
    useSessionKanbanStore.getState().restoreFromPersist();
  });

  // 会话关闭：刷新 session list
  syncEventBus.on('session.closed', () => {
    useSessionKanbanStore.getState().restoreFromPersist();
  });

  // 会话重命名：刷新 conversation store
  syncEventBus.on('session.renamed', (event) => {
    const { conversationId, newTitle } = event.payload as { conversationId: string; newTitle: string };
    // 更新 UI 中的 Tab 标题
    useConversationStore.getState().renameTab(conversationId, newTitle);
  });

  // 任务更新：刷新 task store
  syncEventBus.on('task.updated', () => {
    useTaskStore.getState().restoreFromPersist();
  });

  // 项目更新：刷新 project store
  syncEventBus.on('project.updated', () => {
    useProjectKanbanStore.getState().restoreFromPersist();
  });
}
```

---

## 接入顺序

1. **先接入** AppShell 生命周期管理（接入点 1）
2. **再接入** conversationStore sync_event 接收（接入点 2）
3. **后接入** 各 store 发送 sync 事件（接入点 3）
4. **最后接入** sync 事件消费方（接入点 4）

每步完成后都应进行 TypeScript 编译验证 + 浏览器手动测试。

---

## 回滚方案

如果接入后出现问题，只需：
1. 回退 AppShell 中的 sync 初始化代码
2. 回退 conversationStore 中的 WsSync.handleIncomingMessage 调用
3. 回退各 store 中的 broadcastSync.send() 调用

sync 模块本身是独立的，回滚不影响现有功能。

---

## 实施检查清单

- [ ] 接入点 1：AppShell sync 生命周期
- [ ] 接入点 2：conversationStore sync_event 接收 + tabId 传递
- [ ] 接入点 3：各 store 发送 sync 事件
- [ ] 接入点 4：sync 事件消费方
- [ ] TypeScript 编译通过
- [ ] 同浏览器多 Tab 同步测试
- [ ] 跨浏览器同步测试
- [ ] 回环防护测试
- [ ] 退出登录 sync 清理测试
