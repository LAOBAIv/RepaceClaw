/**
 * AgentMapper — RepaceClaw agent ↔ OpenClaw agentId 双向映射
 *
 * 策略：按业务类型（agent_type）映射到对应的 OpenClaw agent。
 *
 * 2026-05-05 之后的标准口径：
 *   dev      → rc-dev-agent        工程开发类
 *   data     → rc-data-agent       数据分析类
 *   creative → rc-creative-agent   内容生成类
 *   pm       → rc-pm-agent         项目管理类
 *   research → rc-research-agent   知识推理类
 *   ops      → rc-ops-agent        平台策略类
 *   decision → rc-decision-agent   决策支持类
 *   general  → rc-general-agent    通用助手类
 *
 * 平台助手（repaceclaw-platform-assistant）独立存在，不走此映射。
 */

/**
 * 业务类型 → OpenClaw agentId 映射表
 *
 * 注意：这里的 key 仍沿用历史技术字段值（dev/data/creative/pm/research/ops/decision/general），
 * 但业务含义已经统一收敛为：工程开发 / 数据分析 / 内容生成 / 项目管理 / 知识推理 / 平台策略 / 决策支持 / 通用助手。
 */
const AGENT_TYPE_MAP: Record<string, string> = {
  dev: 'rc-dev-agent',
  data: 'rc-data-agent',
  creative: 'rc-creative-agent',
  pm: 'rc-pm-agent',
  research: 'rc-research-agent',
  ops: 'rc-ops-agent',
  decision: 'rc-decision-agent',
  general: 'rc-general-agent',
};

/**
 * 默认类型（未指定 agent_type 时使用）
 *
 * 历史遗留或无法判定归属的 RC 智能体，默认进入通用助手类。
 */
const DEFAULT_AGENT_TYPE = 'general';

/**
 * 将 RepaceClaw 业务智能体映射到 OpenClaw agentId
 *
 * @param agentType 技术字段值（dev/data/creative/pm/research/ops/decision/general）
 * @returns OpenClaw agentId
 */
export function toOpenClawAgentId(agentType?: string): string {
  const type = agentType || DEFAULT_AGENT_TYPE;
  return AGENT_TYPE_MAP[type] || AGENT_TYPE_MAP[DEFAULT_AGENT_TYPE];
}

/**
 * 从 OpenClaw agentId 反推业务类型
 */
export function fromOpenClawAgentId(ocAgentId: string): string | null {
  for (const [type, id] of Object.entries(AGENT_TYPE_MAP)) {
    if (id === ocAgentId) return type;
  }
  return null;
}

/**
 * 获取对应类型智能体的工作区路径
 */
export function getWorkspacePath(ocAgentId: string): string {
  return `/root/.openclaw/agents/${ocAgentId}/agent`;
}

/**
 * 获取对应类型智能体的 agent 目录
 */
export function getAgentDir(ocAgentId: string): string {
  return `/root/.openclaw/agents/${ocAgentId}/agent`;
}

/**
 * 获取所有 OpenClaw agentId 列表
 */
export function getAllOpenClawAgentIds(): string[] {
  return Object.values(AGENT_TYPE_MAP);
}

/**
 * 获取所有业务类型列表
 */
export function getAllAgentTypes(): string[] {
  return Object.keys(AGENT_TYPE_MAP);
}
