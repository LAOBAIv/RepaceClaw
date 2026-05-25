import fs from 'fs';
import { getDb } from "../../db/client";
import { logger } from '../../utils/logger';

export interface Agent {
  id: string;
  /** 系统保留智能体:平台级公共服务智能体 */
  isSystem?: boolean;
  /** 业务智能体编码:8 位,同一用户下唯一 */
  agentCode?: string;
  /** 所属用户 ID */
  userId?: string;
  name: string;
  color: string;
  systemPrompt: string;
  writingStyle: string;
  expertise: string[];
  description: string;
  status: "active" | "idle" | "busy";
  modelName: string;
  modelProvider: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  // 用户配置的私有 Token 接入
  tokenProvider: string;
  tokenApiKey: string;
  tokenBaseUrl: string;
  // 输出格式 & 能力边界
  outputFormat: string;
  boundary: string;
  // 对话记忆轮数(0 = 不限)
  memoryTurns: number;
  // 简单温度快捷覆盖(null 表示使用 CODE 渠道模型默认值)
  temperatureOverride: number | null;
  // Token 用量统计:累计消耗 token 总数
  tokenUsed: number;
  // Phase 3: 可见性 / Skill 管控 / 配额
  visibility: 'private' | 'public' | 'template' | 'system';
  skillsConfig: Record<string, boolean>;
  quotaConfig: { maxDailyTokens?: number; maxDailyConversations?: number; maxTokensPerMessage?: number };
  // Route C: OpenClaw agentId 映射
  openclawAgentId: string | null;
  /** 业务类型:dev | data | creative | pm | research | ops | decision | general */
  agentType?: string;
  createdAt: string;
}

// [2026-05-24] 类型安全:any → DbRow(DB 行映射,保留属性访问)
// [2026-05-24] 类型安全:any → unknown
export interface DbRow { [key: string]: unknown }

export function rowToAgent(obj: DbRow): Agent {
  // [2026-05-24] 类型安全:unknown 索引签名需要断言后访问属性
  const r = obj as Record<string, unknown>;
  const isPlatformAssistant = r.id === 'platform-assistant'
    || r.id === 'repaceclaw-platform-assistant'
    || r.id === '24cf6cc5-da0d-48df-814e-11582e398007'
    || r.openclaw_agent_id === 'repaceclaw-platform-assistant';

  return {
    id: r.id as string,
    agentCode: r.agent_code as string | undefined,
    userId: r.user_id as string | undefined,
    name: r.name as string,
    color: r.color as string,
    systemPrompt: r.system_prompt as string,
    writingStyle: r.writing_style as string,
    expertise: JSON.parse((r.expertise as string) || "[]"),
    description: (r.description as string) || "",
    status: ((r.status as string) || "idle") as Agent["status"],
    modelName: (r.model_name as string) || "",
    modelProvider: (r.model_provider as string) || "",
    temperature: (r.temperature as number) ?? 0.7,
    maxTokens: (r.max_tokens as number) ?? 4096,
    topP: (r.top_p as number) ?? 1,
    frequencyPenalty: (r.frequency_penalty as number) ?? 0,
    presencePenalty: (r.presence_penalty as number) ?? 0,
    tokenProvider: (r.token_provider as string) || "",
    tokenApiKey: (r.token_api_key as string) || "",
    tokenBaseUrl: (r.token_base_url as string) || "",
    outputFormat: isPlatformAssistant ? 'Markdown' : ((r.output_format as string) || '纯文本'),
    boundary: (r.boundary as string) || "",
    memoryTurns: (r.memory_turns as number) ?? 0,
    temperatureOverride: (r.temperature_override as number | null) ?? null,
    tokenUsed: (r.token_used as number) ?? 0,
    visibility: ((r.visibility as string) || 'private') as Agent['visibility'],
    skillsConfig: JSON.parse((r.skills_config as string) || '{}'),
    quotaConfig: JSON.parse((r.quota_config as string) || '{}'),
    openclawAgentId: (r.openclaw_agent_id as string) || null,
    agentType: (r.agent_type as string) || 'general',
    createdAt: r.created_at as string,
    isSystem: false,
  };
}

function loadPlatformAssistantRuntimeConfig() {
  try {
    const raw = fs.readFileSync('/root/.openclaw/openclaw.json', 'utf-8');
    const obj = JSON.parse(raw);
    // [2026-05-24] 类型安全：any → unknown
    const agent = (obj?.agents?.list || []).find((a: unknown) => ((a as Record<string, unknown>)?.id) === 'repaceclaw-platform-assistant');
    return {
      name: ((agent as Record<string, unknown>)?.name as string) || 'RepaceClaw 平台助手',
      workspace: ((agent as Record<string, unknown>)?.workspace as string) || '/root/.openclaw/workspace',
      model: ((agent as Record<string, unknown>)?.model as string) || 'linkApi/claude-opus-4-6',
      skills: Array.isArray((agent as Record<string, unknown>)?.skills) ? (agent as Record<string, unknown>).skills as unknown[] : [],
      agentDir: ((agent as Record<string, unknown>)?.agentDir as string) || '/root/.openclaw/agents/repaceclaw-platform-assistant/agent',
    };
  } catch {
    return {
      name: 'RepaceClaw 平台助手',
      workspace: '/root/.openclaw/workspace',
      model: 'linkApi/claude-opus-4-6',
      skills: [],
      agentDir: '/root/.openclaw/agents/repaceclaw-platform-assistant/agent',
    };
  }
}

export function buildPlatformAssistantAgent(): Agent {
  const runtime = loadPlatformAssistantRuntimeConfig();
  // 从 DB 读取真实 UUID,保证 list() / getById() / 前端引用使用同一个 id
  let dbId = 'repaceclaw-platform-assistant';
  try {
    const db = getDb();
    const result = db.exec(`SELECT id FROM agents WHERE openclaw_agent_id = 'repaceclaw-platform-assistant' AND name LIKE '%平台助手%' LIMIT 1`);
    if (result.length && result[0].values.length) {
      dbId = result[0].values[0][0] as string;
    }
  } catch (err) { logger.warn(`[AgentService] Platform assistant DB lookup failed: ${err}`); }
  return {
    id: dbId,
    agentCode: 'platform-assistant',
    userId: '',
    name: runtime.name,
    color: '#2563eb',
    systemPrompt: '平台级全域服务智能体,负责平台答疑、使用帮助、功能说明。',
    writingStyle: 'professional',
    expertise: ['platform', 'help', 'guide', ...runtime.skills.map(String)],
    description: `平台公共服务智能体,对所有登录用户开放,用于解答 RepaceClaw 平台使用问题。工作区:${runtime.workspace}`,
    status: 'active',
    modelName: `openclaw/repaceclaw-platform-assistant`,
    modelProvider: 'openclaw',
    temperature: 0.3,
    maxTokens: 4096,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    tokenProvider: '',
    tokenApiKey: '',
    tokenBaseUrl: '',
    outputFormat: 'Markdown',
    boundary: '仅回答平台功能、操作说明、使用帮助,不代替用户业务智能体执行私人任务。',
    memoryTurns: 0,
    temperatureOverride: null,
    tokenUsed: 0,
    visibility: 'public',
    skillsConfig: {},
    quotaConfig: {},
    openclawAgentId: 'repaceclaw-platform-assistant',
    createdAt: new Date(0).toISOString(),
    isSystem: true,
  };
}

export function buildWechatAssistantAgent(): Agent | null {
  // ── 微信助手智能体配置(系统级公共智能体)──
  // 创建日期:2026-05-12
  // 用途:工作台内微信助手会话 Tab,用户点击后直接对话
  // 特征:visibility=public, 所有用户可见
  // 执行端:OpenClaw rc-wechat-agent(独立 workspace)
  // 会话 Key:agent:rc-wechat-agent:rc:{conversationId}
  // [2026-05-23] 修复:用 agent_code 查询(稳定),不依赖 openclaw_agent_id(会被 syncAllAgents 重置)
  const db = getDb();
  const result = db.exec(`SELECT * FROM agents WHERE agent_code = 'rc-wechat-agent' LIMIT 1`);
  if (!result.length || !result[0].values.length) {
    return null;
  }
  const cols = result[0].columns;
  const row = result[0].values[0];
  // [2026-05-24] 类型安全:any → Record<string, unknown>
  const r: Record<string, unknown> = {};
  cols.forEach((c, i) => { r[c] = row[i]; });
  // [2026-05-24] 类型安全：any → DbRow（unknown 索引签名需断言）
  const d = r as Record<string, unknown>;
  return {
    id: d.id as string,
    agentCode: (d.agent_code as string) || 'rc-wechat-agent',
    userId: (d.user_id as string) || '',
    name: (d.name as string) || '微信助手',
    color: (d.color as string) || '#2563eb',
    systemPrompt: (d.system_prompt as string) || '',
    writingStyle: (d.writing_style as string) || 'professional',
    expertise: JSON.parse((d.expertise as string) || '[]'),
    description: (d.description as string) || '',
    status: ((d.status as string) || 'active') as Agent["status"],
    modelName: (d.model_name as string) || 'qwen3.6-plus',
    modelProvider: (d.model_provider as string) || 'linkApi',
    temperature: (d.temperature as number) ?? 0.7,
    maxTokens: (d.max_tokens as number) ?? 4096,
    topP: (d.top_p as number) ?? 1,
    frequencyPenalty: (d.frequency_penalty as number) ?? 0,
    presencePenalty: (d.presence_penalty as number) ?? 0,
    tokenProvider: (d.token_provider as string) || '',
    tokenApiKey: (d.token_api_key as string) || '',
    tokenBaseUrl: (d.token_base_url as string) || '',
    outputFormat: (d.output_format as string) || 'Markdown',
    boundary: (d.boundary as string) || '',
    memoryTurns: (d.memory_turns as number) ?? 0,
    temperatureOverride: (d.temperature_override as number | null) ?? null,
    tokenUsed: (d.token_used as number) ?? 0,
    visibility: ((d.visibility as string) || 'public') as Agent['visibility'],
    skillsConfig: JSON.parse((d.skills_config as string) || '{}'),
    quotaConfig: JSON.parse((d.quota_config as string) || '{}'),
    openclawAgentId: (d.openclaw_agent_id as string) || 'rc-wechat-agent',
    createdAt: d.created_at as string,
    isSystem: true,
  };
}
