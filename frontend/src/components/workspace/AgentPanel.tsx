/* eslint-disable react-refresh/only-export-components */
// [2026-05-23] AgentPanel 已拆分到 pages/ProjectWorkspace/AgentPanel/，此处 re-export 保持兼容
// 原 967 行旧版本已迁移，外部通过 @/components/workspace 引用的 AgentPanel 将指向新版本
export { AgentPanel } from '../../pages/ProjectWorkspace/AgentPanel';
// makeFlowNode / FlowNode / FlowNodeType 实际定义在 pages/ProjectWorkspace/types.ts
export { makeFlowNode, type FlowNode, type FlowNodeType } from '../../pages/ProjectWorkspace/types';
