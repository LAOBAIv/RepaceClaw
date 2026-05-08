# Session B 实施总结 — 4 个 Persist Store 分层改造

> 执行者：Session B / Qwen3.6-Plus
> 完成时间：2026-05-05 12:25

---

## 一、改造结果

### conversationStore.ts — 精简持久化 ✅
| 改动 | 详情 |
|------|------|
| **partialize** | 移除 `openPanels`（含 messages），只保留 sessionTabs / activeTabId / closedSessionIds / currentAgentId |
| **storage** | localStorage → sessionStorage |
| **key** | `repaceclaw-conversations-{userId}` → `rc:conv:{userId}` |
| **version** | 4 → 5（migrate 无条件重置旧数据） |
| **restoreFromPersist** | 移除所有 `persistedPanels` 引用，面板完全由 API 数据重建 |

### taskStore.ts — 移除 persist ✅
- 移除 `persist()` 中间件包裹，改为纯 zustand store
- 移除 `persist`、`createJSONStorage` import
- `restoreFromPersist()` 保持不变（API 驱动）

### projectKanbanStore.ts — 移除 persist ✅
- 移除 `persist()` 中间件包裹，改为纯 zustand store
- 移除 `persist`、`createJSONStorage` import
- `restoreFromPersist()` 保持不变（API 驱动）

### sessionKanbanStore.ts — 移除 persist ✅
- 移除 `persist()` 中间件包裹，改为纯 zustand store
- 移除 `persist`、`createJSONStorage` import
- `restoreFromPersist()` 保持不变（API 驱动）

### utils/storageScope.ts — 新增 ✅
- `getScopedKey(storeName)` — 统一 persist key 生成
- `getSyncChannel(userId)` — BroadcastChannel 频道名
- `clearAllRcStorage()` — 调试/退出时清理

---

## 二、分层原则总结

| Store | 保留 UI 持久化 | 移除业务持久化 | 恢复方式 |
|-------|--------------|--------------|---------|
| conversationStore | sessionTabs, activeTabId, closedSessionIds | openPanels + messages | API 重建面板 |
| taskStore | 无 | 全部 tasks | API 拉取 |
| projectKanbanStore | 无 | 全部 projects | API 拉取 |
| sessionKanbanStore | 无 | 全部 sessions | API 拉取 |

---

## 三、恢复链路

```
页面加载
  → 1. auth 恢复（Session A 负责）
  → 2. conversationStore 从 sessionStorage 恢复 sessionTabs/activeTabId（秒级 UI）
  → 3. 后台对每个 tab 调 API 重建 openPanels
  → 4. taskStore / projectKanbanStore / sessionKanbanStore 组件挂载时调 restoreFromPersist()
```

---

## 四、文件清单

### 修改
- `frontend/src/stores/conversationStore.ts`
- `frontend/src/stores/taskStore.ts`
- `frontend/src/stores/projectKanbanStore.ts`
- `frontend/src/stores/sessionKanbanStore.ts`

### 新增
- `frontend/src/utils/storageScope.ts`
- `docs/PLAN-C-STORE-DESIGN.md`

### 更新
- `docs/PLAN-C-WORKBOARD.md`（Session B 标记完成）
- `docs/PLAN-C-DECISIONS.md`（新增 D-007/D-008/D-009）

### 未触碰
- `stores/authStore.ts`（Session A 负责）
- 所有页面组件（restoreFromPersist 接口不变）
- 所有 API 层

---

## 五、TypeScript 编译

`npx tsc --noEmit` 通过，无新增错误。
