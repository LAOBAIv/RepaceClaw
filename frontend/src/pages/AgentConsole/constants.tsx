/* eslint-disable react-refresh/only-export-components */
/**
 * @file AgentConsole 常量与类型定义
 * 包含 FlowNode 类型、优先级/标签常量、标签颜色工具、日期工具等
 */

import { Agent } from '@/types';

/* ─── 节点类型 ───────────────────────────────────────────────────── */
/** 节点类型：serial=下行串行  parallel=并行（与上一节点同层） */
export type NodeType = 'serial' | 'parallel';

export interface FlowNode {
  id: string;
  name: string;
  nodeType: NodeType;
  agentIds: string[];
  desc: string;
}

/** 决策人：user 表示「用户」，否则为智能体 id */
export type DecisionMaker = 'user' | string;

/* ─── 优先级 ───────────────────────────────────────────────────── */
export const PRIORITY = ['普通', '高优先级', '紧急'];

/** 优先级正向映射：标签 → 后端值 */
export const PRIORITY_MAP: Record<string, 'high' | 'mid' | 'low'> = {
  '紧急': 'high',
  '高优先级': 'mid',
  '普通': 'low',
};

/** 优先级反向映射：后端值 → 标签 */
export const PRIORITY_REV_MAP: Record<string, string> = {
  high: '紧急',
  mid: '高优先级',
  low: '普通',
};

/* ─── 标签 ──────────────────────────────────────────────────────── */
export const PRESET_TAGS = ['优先级高', '待跟进', '阻塞中', 'Bug', 'Feature', '文档', '重构', '需评审'];

const TAG_COLOR_POOL: { bg: string; border: string; text: string }[] = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  { bg: '#fdf4ff', border: '#e9d5ff', text: '#7c3aed' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' },
  { bg: '#fafaf9', border: '#e7e5e4', text: '#44403c' },
];

/** 根据标签名哈希获取颜色方案 */
export function getTagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLOR_POOL[h % TAG_COLOR_POOL.length];
}

/* ─── 日期工具 ─────────────────────────────────────────────────── */
/** 获取当前本地时间字符串（datetime-local 格式，精确到分钟） */
export function nowLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ─── 默认节点 ─────────────────────────────────────────────────── */
/** 创建一个空的默认流程节点 */
export function makeDefaultNode(): FlowNode {
  return { id: Date.now().toString(), name: '', nodeType: 'serial', agentIds: [], desc: '' };
}

/* ─── 智能体头像 ───────────────────────────────────────────────── */
/** 智能体头像组件：显示首字母 + 配色圆环 */
export function AgentAvatar({ agent, size = 28 }: { agent: Agent; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: agent.color + '22',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: agent.color, fontWeight: 700,
      fontSize: size <= 18 ? 9 : size < 30 ? 11 : 13,
      border: `1.5px solid ${agent.color}44`,
    }}>
      {agent.name.charAt(0)}
    </div>
  );
}
