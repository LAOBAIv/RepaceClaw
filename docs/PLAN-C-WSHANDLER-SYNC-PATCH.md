# PLAN-C-WSHANDLER-SYNC-PATCH

> 作者：Session C / qwen3-max-2026-01-23
> 更新时间：2026-05-05 15:03
> 状态：补丁已准备好，待主会话审核后应用到 wsHandler.ts

---

## 目标

在 `backend/src/ws/wsHandler.ts` 中新增 `sync_event` 消息类型处理，
实现跨浏览器 / 跨设备的用户级同步事件转发。

---

## 需要修改的文件

**仅修改 1 个文件：`backend/src/ws/wsHandler.ts`**

修改量：约 20 行新增代码，0 行删除，0 行现有逻辑变更。

---

## 补丁 1：WSClient 接口新增 `tabId` 字段

**位置**：WSClient 接口定义（约第 22 行）

```typescript
interface WSClient {
  ws: WebSocket;
  userId: string | null;
  userRole: string | null;
  tabId?: string;  // ← 新增：用于 sync_event 回环防护
}
```

---

## 补丁 2：连接建立时记录 tabId

**位置**：ws.on("message") 的 auth 处理分支内（约第 84 行），
在认证成功之后、return 之前。

```typescript
// 在 auth_ok 发送之后，记录 tabId（如果前端传了）
if (msg.tabId) {
  client.tabId = msg.tabId;
}
```

**完整上下文（修改后的 auth 分支）**：

```typescript
// ── Auth ──
if (msg.type === "auth") {
  if (msg.token) {
    try {
      const payload = UserService.verifyToken(msg.token);
      client.userId = payload.id;
      client.userRole = payload.role;
      client.tabId = msg.tabId || undefined;  // ← 新增：记录 tabId
      ws.send(JSON.stringify({ type: "auth_ok", userId: payload.id, role: payload.role }));
      logger.info(`[WS] Authenticated: ${payload.id.slice(0, 8)} (${payload.role})`);
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
    }
  }
  return;
}
```

---

## 补丁 3：新增 sync_event 消息处理

**位置**：在 `multi_chat` 处理之后、未知消息类型报错之前
（约第 195 行，`ws.send(JSON.stringify({ type: "error", message: \`Unknown message type...` }))` 之前）

```typescript
// ── 同步事件转发（方案 C）─────────────────────────────────
// 收到 sync_event 后，转发给同 userId 的其他 WebSocket 连接
// 用于跨浏览器 / 跨设备之间的状态同步
// 回环防护：通过 tabId 判断是否发回来源连接
if (msg.type === "sync_event") {
  if (!client.userId) {
    // 未认证连接不处理同步事件（理论上前置拦截已处理，此处为防御）
    return;
  }

  const sourceTabId = (msg as any).tabId;
  let forwardedCount = 0;

  for (const [otherWs, otherClient] of clients) {
    // 只转发给同用户、已认证、连接正常的其他连接
    if (otherWs === ws) continue;  // 不发回自己
    if (otherClient.userId !== client.userId) continue;  // 只转发给同用户
    if (otherClient.tabId && otherClient.tabId === sourceTabId) continue;  // 回环防护
    if (otherWs.readyState !== WebSocket.OPEN) continue;

    try {
      otherWs.send(JSON.stringify(msg));
      forwardedCount++;
    } catch (err) {
      logger.warn(`[WS] sync_event forward failed: ${(err as Error).message}`);
    }
  }

  if (forwardedCount > 0) {
    logger.debug(`[WS] sync_event forwarded to ${forwardedCount} connections (userId: ${client.userId.slice(0, 8)})`);
  }
  return;
}
```

---

## 补丁 4（可选）：query token 认证时也记录 tabId

**位置**：连接建立时的 query token 认证分支（约第 74 行）

```typescript
// 如果 URL 中有 token，直接认证
if (queryToken) {
  try {
    const payload = UserService.verifyToken(queryToken);
    client.userId = payload.id;
    client.userRole = payload.role;
    // ← 新增：从 URL query 中记录 tabId（如果前端传了 ?tabId=xxx）
    client.tabId = url.searchParams.get("tabId") || undefined;
    logger.info(`[WS] Authenticated via query: ${payload.id.slice(0, 8)}`);
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Invalid authentication token" }));
  }
}
```

---

## 前端配套改动

前端需要在建立 WS 连接时携带 tabId：

### 方式 1：通过 URL query 传递（推荐，最简）

`conversationStore.ts` 的 `connect()` 方法中，WS URL 改为：

```typescript
const tabId = getOrCreateTabId();  // 从 storageScope 导入
const wsUrl = `${wsProtocol}//${window.location.host}/ws${tokenParam}&tabId=${encodeURIComponent(tabId)}`;
```

### 方式 2：通过 auth 消息传递

在 WS 连接建立后发送 auth 消息时附带 tabId：

```typescript
ws.send(JSON.stringify({
  type: "auth",
  token,
  tabId: getOrCreateTabId(),
}));
```

---

## 安全性分析

| 风险 | 评估 | 缓解 |
|------|------|------|
| 未认证用户发送 sync_event | 前置拦截已处理 `if (!client.userId)` | 防御性检查 |
| sync_event 泄露到其他用户 | 严格按 `userId` 匹配转发 | 多一层校验 |
| 回环导致无限转发 | tabId 对比跳过来源连接 | 双重防护（前端 eventBus + 后端 tabId） |
| 大量连接导致性能问题 | sync_event 频率低（仅在操作后触发） | 轻量转发，不存库 |

---

## 实施检查清单

- [ ] 主会话审核补丁内容
- [ ] 补丁 1：WSClient 新增 tabId 字段
- [ ] 补丁 2：auth 分支记录 tabId
- [ ] 补丁 3：sync_event 消息处理
- [ ] 补丁 4：query token 认证记录 tabId（可选）
- [ ] 前端 WS URL 携带 tabId
- [ ] 后端 TypeScript 编译通过
- [ ] 后端重启后 WS 连接正常
- [ ] 跨浏览器同步联调通过
