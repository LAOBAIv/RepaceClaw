# PLAN-C-STORE 分层改造设计与实施清单

> 作者：Session B / Qwen3.6-Plus
> 日期：2026-05-05
> 状态：✅ 已实施

---

## 核心原则

**后端为唯一业务真相。前端 storage 只存 UI 状态，不存业务数据。**

恢复链路：**auth → UI state（sessionStorage 秒恢复）→ API 拉业务数据 → 增量校正**

---

## 一、conversationStore 改造

### 当前持久化字段
| 字段 | 当前状态 | 改造后 | 理由 |
|------|---------|--------|------|
| sessionTabs | ✅ persist | ✅ 保留 | 纯 UI 状态：用户打开了哪些 tab |
| activeTabId | ✅ persist | ✅ 保留 | 纯 UI 状态：当前激活哪个 tab |
| closedSessionIds | ✅ persist | ✅ 保留 | UI 偏好：用户关闭了哪些会话 |
| currentAgentId | ✅ persist | ❌ 移除 | 可从 activeTab 对应 tab 推导，冗余 |
| openPanels（含 messages）| ✅ persist | ❌ 移除 | **业务数据**：messages 是后端 DB 真相 |

### 改造动作
1. `partialize` 只保留 sessionTabs + activeTabId + closedSessionIds
2. storage 改为 sessionStorage（配合 Day 1 auth tab 隔离）
3. key 改为 `rc:conv:{userId}` 格式
4. `migrate` 中增加 `openPanels: []` 兜底

### 恢复链路
```
auth 恢复 → sessionStorage 读 sessionTabs/activeTabId → 秒级展示 tab 栏
→ 后台对每个 tab 调 conversationsApi.getMessages() → 回填 openPanels（仅内存）
```

---

## 二、taskStore 改造

### 当前问题
整个 `tasks` TaskBoard 全部 persist 到 localStorage，但 task 数据是后端业务真相。

### 改造动作
1. **移除 persist 中间件**，改为纯 zustand store
2. `restoreFromPersist()` 保持不变（已从 API 拉取）
3. 不保留任何字段到 storage

### 理由
- task 列表完全由后端 API 驱动
- 刷新后调用 `restoreFromPersist()` 从后端重建
- 没有任何 UI 状态需要跨刷新保留

---

## 三、projectKanbanStore 改造

### 当前问题
整个 `projects` ProjectBoard 全部 persist 到 localStorage，但 project 数据是后端业务真相。

### 改造动作
1. **移除 persist 中间件**，改为纯 zustand store
2. `restoreFromPersist()` 保持不变（已从 API 拉取）
3. 不保留任何字段到 storage

---

## 四、sessionKanbanStore 改造

### 当前问题
整个 `sessions` SessionBoard + loading + error 全部 persist，但会话数据是后端业务真相。

### 改造动作
1. **移除 persist 中间件**，改为纯 zustand store
2. `restoreFromPersist()` 保持不变（已从 API 拉取）
3. 不保留任何字段到 storage

### 注意
sessionKanbanStore 已经是 sessionStorage，但 persist 本身就不应该存在。

---

## 五、文件修改清单

### 修改文件
| 文件 | 改动内容 | 风险等级 |
|------|---------|---------|
| `stores/conversationStore.ts` | 精简 partialize、改 storage、改 key | 中（核心 store）|
| `stores/taskStore.ts` | 移除 persist 包裹 | 低 |
| `stores/projectKanbanStore.ts` | 移除 persist 包裹 | 低 |
| `stores/sessionKanbanStore.ts` | 移除 persist 包裹 | 低 |

### 新增文件
| 文件 | 内容 |
|------|------|
| `utils/storageScope.ts` | getScopedKey(storeName) 工具函数 |

### 不需修改
| 文件 | 理由 |
|------|------|
| `stores/authStore.ts` | Session A 负责，本 Session 不碰 |
| 页面组件 | `restoreFromPersist()` 接口不变，调用方无需改动 |
| API 层 | 不受影响 |

---

## 六、最小改动路径

1. **conversationStore**：改 partialize → 改 storage → 改 key → 加 migrate 兜底
2. **taskStore/projectKanbanStore/sessionKanbanStore**：各移除 persist 包裹（3 个文件类似改动）
3. 新增 storageScope.ts 工具（为 future sync 复用）
4. 写回 PLAN-C-WORKBOARD.md 进度

---

## 七、不做的边界

- ❌ 不碰 authStore（Session A 负责）
- ❌ 不做同步机制实现（Session C 负责）
- ❌ 不改页面组件调用方式
- ❌ 不实现 BroadcastChannel / WebSocket 同步
- ❌ 不改 API 层
