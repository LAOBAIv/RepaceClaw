# 方案 C：4 个 Persist Store 分层改造设计

> 作者：Session B / Qwen3.6-Plus
> 日期：2026-05-05
> 状态：✅ 实施完成

---

## 总原则

**后端为唯一业务真相。前端 localStorage/sessionStorage 只存 UI 状态。**

恢复链路：**auth → UI state（sessionStorage 秒恢复）→ API 拉业务数据 → 增量校正**

---

## 一、conversationStore 分层

### 当前状态
- `storage`: localStorage
- `name`: `repaceclaw-conversations-{userId}`（按用户隔离，无 tabId）
- `partialize` 字段：`sessionTabs`、`activeTabId`、`closedSessionIds`、`currentAgentId`、`openPanels`（含完整 messages 数组）

### 问题
1. `openPanels` 包含完整 messages 数组，单会话可达数 KB~数十 KB，是业务数据
2. messages 是后端 DB 真相，不应本地固化
3. `currentAgentId` 可从活跃 tab 推导，冗余持久化

### 改造方案

#### ✅ 保留为 UI 状态 persist（sessionStorage）
| 字段 | 类型 | 理由 |
|------|------|------|
| `sessionTabs` | SessionTab[] | 用户打开的 Tab 列表，纯 UI 布局 |
| `activeTabId` | string | 当前激活的 Tab，纯 UI 状态 |
| `closedSessionIds` | string[] | 用户主动关闭的会话 ID，UI 偏好 |

#### ❌ 不应长期本地固化的字段
| 字段 | 理由 | 恢复方式 |
|------|------|----------|
| `openPanels`（含 messages） | 业务数据，messages 来自后端 DB | 恢复 tabs 后，对每个 tab 调 `conversationsApi.getMessages()` 回填 |
| `currentAgentId` | 可从 activeTab 对应的 tab.agentId 推导 | 恢复 tabs 后自动计算 |

#### 新版 partialize
```typescript
partialize: (state) => ({
  sessionTabs: state.sessionTabs,
  activeTabId: state.activeTabId,
  closedSessionIds: state.closedSessionIds,
}),
```

### 恢复链路改造
1. **Step 1**：authStore 从 sessionStorage 恢复 userId
2. **Step 2**：conversationStore 从 sessionStorage 恢复 sessionTabs + activeTabId
3. **Step 3**：对每个 sessionTab，异步调 API 拉取 messages，回填到 openPanels
4. **Step 4**：openPanels 仅在内存中存在，刷新后重建

### storage key 变更
- 旧：`repaceclaw-conversations-{userId}`
- 新：`rc:conversation:{userId}`（统一命名前缀，去掉 tabId 因为 sessionStorage 天然按 tab 隔离）

---

## 二、taskStore 分层

### 当前状态
- `storage`: localStorage
- `name`: `wb-task-store-{userId}`
- `partialize`：整个 `tasks` TaskBoard（默认 persist 全部）

### 问题
整个 task board 都是业务数据，后端为唯一真相。

### 改造方案

#### ✅ 保留为 UI 状态 persist：**无**
taskStore 无需任何持久化字段。

#### ❌ 不应长期本地固化
| 字段 | 理由 | 恢复方式 |
|------|------|----------|
| `tasks` (TaskBoard) | 业务数据，后端 DB 为真相 | `restoreFromPersist()` 调 API 加载 |

### 改造操作
- **移除 persist 中间件**，改为纯 zustand store
- `restoreFromPersist()` 保持不变（已从 API 拉取）

### storage key
- 无需持久化，无 key

---

## 三、projectKanbanStore 分层

### 当前状态
- `storage`: localStorage
- `name`: `wb-project-kanban-store-{userId}`
- `partialize`：整个 `projects` ProjectBoard（默认 persist 全部）

### 改造方案

#### ✅ 保留为 UI 状态 persist：**无**
projectKanbanStore 无需任何持久化字段。

#### ❌ 不应长期本地固化
| 字段 | 理由 | 恢复方式 |
|------|------|----------|
| `projects` (ProjectBoard) | 业务数据，后端 DB 为真相 | `restoreFromPersist()` 调 API 加载 |

### 改造操作
- **移除 persist 中间件**，改为纯 zustand store
- `restoreFromPersist()` 保持不变（已从 API 拉取）

---

## 四、sessionKanbanStore 分层

### 当前状态
- `storage`: sessionStorage（已正确）
- `name`: `wb-session-kanban-store-{userId}`
- `partialize`：整个 `sessions` SessionBoard + `loading` + `error`

### 改造方案

#### ✅ 保留为 UI 状态 persist：**无**
sessionKanbanStore 无需任何持久化字段。会话看板数据完全从后端获取。

#### ❌ 不应长期本地固化
| 字段 | 理由 | 恢复方式 |
|------|------|----------|
| `sessions` (SessionBoard) | 业务数据，后端 DB 为真相 | `restoreFromPersist()` 调 API 加载 |
| `loading` / `error` | 运行时状态，无需持久化 | 每次组件挂载重新初始化 |

### 改造操作
- **移除 persist 中间件**，改为纯 zustand store
- `restoreFromPersist()` 保持不变（已从 API 拉取）

---

## 五、恢复链路统一：auth → UI state → backend data

```
页面加载
  │
  ├─ 1. authStore 从 sessionStorage 恢复 userId + token
  │     └─ 未登录 → 跳转登录页，终止
  │
  ├─ 2. conversationStore 从 sessionStorage 恢复 UI 状态
  │     ├─ sessionTabs → 立即展示 Tab 栏（秒级恢复）
  │     ├─ activeTabId → 高亮当前 Tab
  │     └─ closedSessionIds → 过滤已关闭会话
  │
  ├─ 3. 后台异步：对每个 sessionTab 调用 API
  │     ├─ conversationsApi.list() → 获取会话元数据
  │     ├─ conversationsApi.getMessages(id) → 获取消息
  │     └─ 增量更新 openPanels（内存中，不持久化）
  │
  └─ 4. 业务 store 按需初始化
        ├─ taskStore.restoreFromPersist() → API 拉任务
        ├─ projectKanbanStore.restoreFromPersist() → API 拉项目
        └─ sessionKanbanStore.restoreFromPersist() → API 拉会话
```

### 关键设计
1. **UI 先行**：Tab 栏先展示，用户不会看到空白
2. **业务数据后到**：API 数据到达后增量替换，不覆盖 UI 状态
3. **不持久化业务数据**：刷新后不会串号、不会回滚旧数据
4. **sessionStorage 天然 tab 隔离**：不同 tab 不共享数据

---

## 六、文件修改清单

### 必须修改
| 文件 | 改动类型 | 风险 |
|------|----------|------|
| `stores/conversationStore.ts` | 修改 partialize，移除 openPanels 持久化，改 key 格式 | 中 |
| `stores/taskStore.ts` | 移除 persist 中间件 | 低 |
| `stores/projectKanbanStore.ts` | 移除 persist 中间件 | 低 |
| `stores/sessionKanbanStore.ts` | 移除 persist 中间件 | 低 |

### 新增
| 文件 | 说明 |
|------|------|
| `utils/storageScope.ts` | userId 作用域 key 生成工具（供 future sync 模块复用） |

### 不需要修改
| 文件 | 理由 |
|------|------|
| `stores/authStore.ts` | Session A 负责，本 Session 不动 |
| `api/*.ts` | API 层不涉及 |
| 页面组件 | `restoreFromPersist()` 接口不变，调用方无需改动 |

---

## 七、最小改动路径

1. **conversationStore**：
   - 修改 `partialize` → 只保留 sessionTabs + activeTabId + closedSessionIds
   - 修改 `name` → `rc:conversation:{userId}`
   - 修改 `storage` → sessionStorage
   - `migrate` → 无条件清空旧数据

2. **taskStore**：
   - 移除 `persist()` 包裹，改为 `create<TaskState>()((set, get) => ({...}))`
   - 保留 `restoreFromPersist()` 不变

3. **projectKanbanStore**：
   - 移除 `persist()` 包裹
   - 保留 `restoreFromPersist()` 不变

4. **sessionKanbanStore**：
   - 移除 `persist()` 包裹
   - 保留 `restoreFromPersist()` 不变

5. **新增 `utils/storageScope.ts`**：
   - 提供 `getScopedKey(storeName)` 函数
   - 为 future BroadcastChannel / WebSocket 同步提供统一 key 生成
