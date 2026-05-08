import { v4 as uuidv4 } from "uuid";
import fs from 'fs';
import { logger } from '../utils/logger';
import { getDb, saveDb } from "../db/client";
import { IdGenerator } from '../utils/IdGenerator';
import { OpenClawAdapter } from "./llm/OpenClawAdapter";
import { ILLMAdapter } from "./llm/LLMAdapter";
import * as AgentBridge from "./AgentBridge";
import { toOpenClawAgentId } from './AgentBridge/AgentMapper';


export interface Agent {
  id: string;
  /** 系统保留智能体：平台级公共服务智能体 */
  isSystem?: boolean;
  /** 业务智能体编码：8 位，同一用户下唯一 */
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
  // 对话记忆轮数（0 = 不限）
  memoryTurns: number;
  // 简单温度快捷覆盖（null 表示使用 CODE 渠道模型默认值）
  temperatureOverride: number | null;
  // Token 用量统计：累计消耗 token 总数
  tokenUsed: number;
  // Phase 3: 可见性 / Skill 管控 / 配额
  visibility: 'private' | 'public' | 'template';
  skillsConfig: Record<string, boolean>;
  quotaConfig: { maxDailyTokens?: number; maxDailyConversations?: number; maxTokensPerMessage?: number };
  // Route C: OpenClaw agentId 映射
  openclawAgentId: string | null;
  /** 业务类型：dev | data | creative | pm | research | ops | decision | general */
  agentType?: string;
  createdAt: string;
}

function rowToAgent(obj: any): Agent {
  const isPlatformAssistant = obj.id === 'platform-assistant'
    || obj.id === 'repaceclaw-platform-assistant'
    || obj.id === '24cf6cc5-da0d-48df-814e-11582e398007'
    || obj.openclaw_agent_id === 'repaceclaw-platform-assistant';

  return {
    id: obj.id,
    agentCode: obj.agent_code || undefined,
    userId: obj.user_id || undefined,
    name: obj.name,
    color: obj.color,
    systemPrompt: obj.system_prompt,
    writingStyle: obj.writing_style,
    expertise: JSON.parse(obj.expertise || "[]"),
    description: obj.description || "",
    status: (obj.status || "idle") as Agent["status"],
    modelName: obj.model_name || "",
    modelProvider: obj.model_provider || "",
    temperature: obj.temperature ?? 0.7,
    maxTokens: obj.max_tokens ?? 4096,
    topP: obj.top_p ?? 1,
    frequencyPenalty: obj.frequency_penalty ?? 0,
    presencePenalty: obj.presence_penalty ?? 0,
    tokenProvider: obj.token_provider || "",
    tokenApiKey: obj.token_api_key || "",
    tokenBaseUrl: obj.token_base_url || "",
    // 平台助手不再强制“纯文本”，改为统一走 Markdown 友好输出。
    // 但必须继续禁止回落到“预览+完整代码”，否则会再次出现：
    // - 预览
    // - 完整答复
    // 因此这里仍做服务层兜底：平台助手统一按 Markdown 读取。
    outputFormat: isPlatformAssistant ? 'Markdown' : (obj.output_format || '纯文本'),
    boundary: obj.boundary || "",
    memoryTurns: obj.memory_turns ?? 0,
    temperatureOverride: obj.temperature_override ?? null,
    tokenUsed: obj.token_used ?? 0,
    visibility: (obj.visibility || 'private') as Agent['visibility'],
    skillsConfig: JSON.parse(obj.skills_config || '{}'),
    quotaConfig: JSON.parse(obj.quota_config || '{}'),
    openclawAgentId: obj.openclaw_agent_id || null,
    agentType: obj.agent_type || 'general',
    createdAt: obj.created_at,
    isSystem: false,
  };
}

function loadPlatformAssistantRuntimeConfig() {
  try {
    const raw = fs.readFileSync('/root/.openclaw/openclaw.json', 'utf-8');
    const obj = JSON.parse(raw);
    const agent = (obj?.agents?.list || []).find((a: any) => a?.id === 'repaceclaw-platform-assistant');
    return {
      name: agent?.name || 'RepaceClaw 平台助手',
      workspace: agent?.workspace || '/root/.openclaw/workspace',
      model: agent?.model || 'linkApi/claude-opus-4-6',
      skills: Array.isArray(agent?.skills) ? agent.skills : [],
      agentDir: agent?.agentDir || '/root/.openclaw/agents/repaceclaw-platform-assistant/agent',
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

function buildPlatformAssistantAgent(): Agent {
  const runtime = loadPlatformAssistantRuntimeConfig();
  // 从 DB 读取真实 UUID，保证 list() / getById() / 前端引用使用同一个 id
  let dbId = 'repaceclaw-platform-assistant';
  try {
    const db = getDb();
    const result = db.exec(`SELECT id FROM agents WHERE openclaw_agent_id = 'repaceclaw-platform-assistant' AND name LIKE '%平台助手%' LIMIT 1`);
    if (result.length && result[0].values.length) {
      dbId = result[0].values[0][0] as string;
    }
  } catch {}
  return {
    id: dbId,
    agentCode: 'platform-assistant',
    userId: '',
    name: runtime.name,
    color: '#2563eb',
    systemPrompt: '平台级全域服务智能体，负责平台答疑、使用帮助、功能说明。',
    writingStyle: 'professional',
    expertise: ['platform', 'help', 'guide', ...runtime.skills.map(String)],
    description: `平台公共服务智能体，对所有登录用户开放，用于解答 RepaceClaw 平台使用问题。工作区：${runtime.workspace}`,
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
    boundary: '仅回答平台功能、操作说明、使用帮助，不代替用户业务智能体执行私人任务。',
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

export const AgentService = {
  isPlatformAssistantId(id?: string | null) {
    // 同时识别 alias / 旧硬编码 UUID / 运行时真实 DB id，兼容迁移前后。
    if (!id) return false;
    if (id === 'platform-assistant' || id === 'repaceclaw-platform-assistant' || id === '24cf6cc5-da0d-48df-814e-11582e398007') {
      return true;
    }
    try {
      const runtime = buildPlatformAssistantAgent();
      return id === runtime.id || id === runtime.agentCode || id === runtime.openclawAgentId;
    } catch {
      return false;
    }
  },
  list(userId?: string): Agent[] {
    const db = getDb();
    let sql = "SELECT * FROM agents";
    const params: any[] = [];
    if (userId) {
      sql += " WHERE user_id = ? OR visibility = 'public'";
      params.push(userId);
    }
    sql += " ORDER BY created_at DESC";
    const result = db.exec(sql, params.length ? params : undefined);
    let agents = !result.length ? [] : result[0].values.map((row) => {
      const obj: any = {};
      result[0].columns.forEach((c, i) => (obj[c] = row[i]));
      return rowToAgent(obj);
    });

    if (!userId) {
      // 未认证时也要返回平台助手（公共服务，全局可见）
      const platformAssistant = buildPlatformAssistantAgent();
      const exists = agents.some((a) => a.id === platformAssistant.id || a.openclawAgentId === platformAssistant.openclawAgentId);
      if (!exists) agents.unshift(platformAssistant);
      return agents.map((a) => this.isPlatformAssistantId(a.id) ? { ...a, isSystem: true } : a);
    }

    // 已认证：平台助手在列表中可见（标记 isSystem=true），但不可编辑/删除/选中
    // 用户只能通过专属入口打开会话沟通，不能作为协作者添加到其他会话
    const platformAssistant = buildPlatformAssistantAgent();
    const exists = agents.some((a) => a.id === platformAssistant.id || a.openclawAgentId === platformAssistant.openclawAgentId);
    if (!exists) {
      agents.unshift(platformAssistant);
    }
    // 标记为系统级
    agents = agents.map((a) =>
      this.isPlatformAssistantId(a.id)
        ? { ...a, isSystem: true }
        : a
    );

    return agents;
  },

  getById(id: string): Agent | null {
    if (id === 'platform-assistant' || id === 'repaceclaw-platform-assistant') {
      return buildPlatformAssistantAgent();
    }
    const db = getDb();
    const result = db.exec(`SELECT * FROM agents WHERE id = ?`, [id]);
    if (!result.length || !result[0].values.length) return null;
    const cols = result[0].columns;
    const row = result[0].values[0];
    const obj: any = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    return rowToAgent(obj);
  },

  /**
   * Dual-code Phase 2：接口层允许同时传 UUID 或 agent_code。
   * 注意 agent_code 只保证“同一用户下唯一”，所以优先要求调用方传 userId。
   */
  getByIdOrCode(idOrCode: string, userId?: string): Agent | null {
    if (idOrCode === 'platform-assistant' || idOrCode === 'repaceclaw-platform-assistant') {
      return buildPlatformAssistantAgent();
    }
    const byId = this.getById(idOrCode);
    if (byId) return byId;

    const db = getDb();
    const sql = userId
      ? `SELECT * FROM agents WHERE user_id = ? AND agent_code = ? LIMIT 1`
      : `SELECT * FROM agents WHERE agent_code = ? LIMIT 1`;
    const params = userId ? [userId, idOrCode] : [idOrCode];
    const result = db.exec(sql, params);
    if (!result.length || !result[0].values.length) return null;
    const cols = result[0].columns;
    const row = result[0].values[0];
    const obj: any = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    return rowToAgent(obj);
  },

  /** 将 UUID/agent_code 统一解析成真实 UUID，便于后续更新/删除/外键写入。 */
  resolveId(idOrCode: string, userId?: string): string | null {
    return this.getByIdOrCode(idOrCode, userId)?.id || null;
  },

  /** 通过 OpenClaw Agent ID 查找 RepaceClaw agent */
  getByOpenClawAgentId(ocAgentId: string): Agent | null {
    const db = getDb();
    const result = db.exec(`SELECT * FROM agents WHERE openclaw_agent_id = ?`, [ocAgentId]);
    if (!result.length || !result[0].values.length) return null;
    const cols = result[0].columns;
    const row = result[0].values[0];
    const obj: any = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    return rowToAgent(obj);
  },

  create(data: Partial<Agent> & { name: string; userId?: string }): Agent {
    const db = getDb();
    // Dual-code Phase 1：底层主键切回 UUID；agent_code 负责业务标识。
    const id = uuidv4();
    const agentCode = IdGenerator.agentCode();
    const now = new Date().toISOString();

    // Phase 3: 高危 Skill 默认禁用
    const defaultSkillsConfig: Record<string, boolean> = {
      exec: false,
      shell: false,
      file_write: false,
      browser: false,
      web_search: true,
      file_read: true,
      image_generation: false,
    };
    const skillsConfig = data.skillsConfig || defaultSkillsConfig;

    // Phase 3: 默认配额
    const quotaConfig = data.quotaConfig || {};
    const agentType = data.agentType || 'general';
    const openclawAgentId = data.openclawAgentId || toOpenClawAgentId(agentType);

    db.run(
      `INSERT INTO agents (id, agent_code, name, color, system_prompt, writing_style, expertise, description, status,
        model_name, model_provider, temperature, max_tokens, top_p, frequency_penalty, presence_penalty,
        token_provider, token_api_key, token_base_url,
        output_format, boundary, memory_turns, temperature_override, user_id,
        visibility, skills_config, quota_config, openclaw_agent_id, agent_type,
        created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, agentCode, data.name, data.color, data.systemPrompt, data.writingStyle,
        JSON.stringify(data.expertise), data.description || "", data.status || "idle",
        data.modelName || "", data.modelProvider || "",
        data.temperature ?? 0.7, data.maxTokens ?? 4096,
        data.topP ?? 1, data.frequencyPenalty ?? 0, data.presencePenalty ?? 0,
        data.tokenProvider || "", data.tokenApiKey || "", data.tokenBaseUrl || "",
        data.outputFormat || "纯文本", data.boundary || "",
        data.memoryTurns ?? 0, data.temperatureOverride ?? null,
        data.userId || "",
        data.visibility || "private",
        JSON.stringify(skillsConfig),
        JSON.stringify(quotaConfig),
        openclawAgentId,
        agentType,
        now,
      ]
    );
    saveDb();
    // 从数据库重新读取，确保返回的对象字段与 rowToAgent 完全一致（含默认值）
    const agent = this.getById(id)!;

    // Route C Phase 1: 注册到 OpenClaw
    if (data.userId && agent) {
      AgentBridge.registerAgent(data.userId, agent).catch((err) => {
        logger.error(`[AgentService] Failed to register agent ${id} to OpenClaw:`, err.message);
      });
    }

    return agent;
  },

  update(id: string, data: Record<string, any>): Agent | null {
    const db = getDb();
    const existing = this.getById(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };

    // 平台助手改为统一 Markdown 输出，但仍然禁止回落到“预览+完整代码”。
    // 历史上这个字段多次被其它编辑链路/脏数据回写，直接导致助手回复重新出现：
    // - 预览
    // - 完整答复
    // 所以写入层继续做硬保护：平台助手固定为 Markdown，而不是任由 DB 脏写。
    if (this.isPlatformAssistantId(existing.id) || this.isPlatformAssistantId(existing.openclawAgentId)) {
      updated.outputFormat = 'Markdown';
    }

    const resolvedAgentType = updated.agentType || 'general';
    const resolvedOpenClawAgentId = updated.isSystem
      ? updated.openclawAgentId
      : toOpenClawAgentId(resolvedAgentType);
    db.run(
      `UPDATE agents SET name=?, color=?, system_prompt=?, writing_style=?, expertise=?, description=?, status=?,
        model_name=?, model_provider=?, temperature=?, max_tokens=?, top_p=?, frequency_penalty=?, presence_penalty=?,
        token_provider=?, token_api_key=?, token_base_url=?,
        output_format=?, boundary=?, memory_turns=?, temperature_override=?,
        visibility=?, skills_config=?, quota_config=?, openclaw_agent_id=?, agent_type=?
       WHERE id=?`,
      [
        updated.name, updated.color, updated.systemPrompt, updated.writingStyle,
        JSON.stringify(updated.expertise), updated.description, updated.status,
        updated.modelName || "", updated.modelProvider || "",
        updated.temperature ?? 0.7, updated.maxTokens ?? 4096,
        updated.topP ?? 1, updated.frequencyPenalty ?? 0, updated.presencePenalty ?? 0,
        updated.tokenProvider || "", updated.tokenApiKey || "", updated.tokenBaseUrl || "",
        updated.outputFormat || "纯文本", updated.boundary || "",
        updated.memoryTurns ?? 0, updated.temperatureOverride ?? null,
        updated.visibility || "private",
        JSON.stringify(updated.skillsConfig || {}),
        JSON.stringify(updated.quotaConfig || {}),
        resolvedOpenClawAgentId,
        resolvedAgentType,
        id,
      ]
    );
    saveDb();

    // Route C Phase 1: 如果 systemPrompt、writingStyle、expertise、outputFormat、boundary、modelName 有变更，更新 OpenClaw workspace
    const relevantFields = ['systemPrompt', 'writingStyle', 'expertise', 'outputFormat', 'boundary', 'modelName', 'modelProvider'];
    const hasRelevantChange = relevantFields.some(f => data[f] !== undefined);
    if (hasRelevantChange && existing.userId) {
      AgentBridge.updateAgent(existing.userId, id, updated).catch((err) => {
        logger.error(`[AgentService] Failed to update agent ${id} mapping:`, err.message);
      });
    }

    return updated;
  },

  delete(id: string): boolean {
    const db = getDb();
    const existing = this.getById(id);

    // Route C Phase 1: 先从 OpenClaw 注销
    if (existing && existing.userId) {
      AgentBridge.unregisterAgent(existing.userId, id).catch((err) => {
        logger.error(`[AgentService] Failed to unregister agent ${id} from OpenClaw:`, err.message);
      });
    }

    db.run(`DELETE FROM agents WHERE id=?`, [id]);
    saveDb();
    return true;
  },

  /**
   * 将本次调用消耗的 token 累加到 agents.token_used
   * 幂等安全：delta <= 0 时直接跳过
   */
  addTokenUsed(agentId: string, delta: number): void {
    if (delta <= 0) return;
    const db = getDb();
    db.run(`UPDATE agents SET token_used = token_used + ? WHERE id = ?`, [delta, agentId]);
    saveDb();
  },

  // ── 配额检查与用量统计 ────────────────────────────────────────────────

  /** 检查配额是否超限，返回 { allowed, reason } */
  checkQuota(
    agentId: string,
    userId: string,
  ): { allowed: boolean; reason?: string } {
    const agent = this.getById(agentId);
    if (!agent) return { allowed: false, reason: 'Agent 不存在' };
    const qc = agent.quotaConfig || {};
    if (!qc.maxDailyTokens && !qc.maxDailyConversations) return { allowed: true };

    const db = getDb();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const row = db.get(
      `SELECT tokens_used, conv_count FROM usage_stats
       WHERE user_id = ? AND agent_id = ? AND date = ?`,
      [userId, agentId, today],
    ) as { tokens_used: number; conv_count: number } | undefined;

    const tokensUsed = row?.tokens_used ?? 0;
    const convCount = row?.conv_count ?? 0;

    if (qc.maxDailyTokens && tokensUsed >= qc.maxDailyTokens) {
      return { allowed: false, reason: `今日 Token 用量已达上限 (${qc.maxDailyTokens})` };
    }
    if (qc.maxDailyConversations && convCount >= qc.maxDailyConversations) {
      return { allowed: false, reason: `今日对话次数已达上限 (${qc.maxDailyConversations})` };
    }
    return { allowed: true };
  },

  /** 获取单日 maxTokensPerMessage 限制 */
  getMaxTokensPerMessage(agentId: string): number | null {
    const agent = this.getById(agentId);
    if (!agent) return null;
    return agent.quotaConfig?.maxTokensPerMessage ?? null;
  },

  /** 记录一次对话的 token 消耗和对话次数 */
  recordUsage(userId: string, agentId: string, tokenCount: number): void {
    if (tokenCount <= 0) return;
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    try {
      db.run(
        `INSERT INTO usage_stats (id, user_id, agent_id, date, tokens_used, conv_count, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(user_id, agent_id, date)
         DO UPDATE SET tokens_used = tokens_used + ?, conv_count = conv_count + 1, updated_at = ?`,
        [`usage_${userId}_${agentId}_${today}`, userId, agentId, today, tokenCount, now, tokenCount, now],
      );
      saveDb();
    } catch (err) {
      logger.error('[AgentService] recordUsage error:', err);
    }
  },

  async generateStream(
    agentId: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (chunk: string) => void,
    onComplete: (tokenCount: number) => void,
    onError: (err: Error) => void
  ) {
    const agent = this.getById(agentId);
    if (!agent) {
      onError(new Error(`Agent ${agentId} not found`));
      return;
    }

    const agentConfig = {
      id: agent.id,
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      writingStyle: agent.writingStyle,
      expertise: agent.expertise,
      modelName: agent.modelName,
      modelProvider: agent.modelProvider,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      topP: agent.topP,
      frequencyPenalty: agent.frequencyPenalty,
      presencePenalty: agent.presencePenalty,
      tokenProvider: agent.tokenProvider,
      tokenApiKey: agent.tokenApiKey,
      tokenBaseUrl: agent.tokenBaseUrl,
      outputFormat: agent.outputFormat,
      boundary: agent.boundary,
      memoryTurns: agent.memoryTurns,
      temperatureOverride: agent.temperatureOverride,
    };

    // V1 强制统一：所有 RepaceClaw 智能体执行一律经 OpenClaw Gateway。
    // - 不再允许 tokenApiKey / token_channels 直连外部模型绕过 Gateway
    // - 所有请求统一带 x-openclaw-message-channel: repaceclaw
    logger.info(`[AgentService] Agent "${agent.name}" → OpenClawAdapter (gateway-forced)`);
    const adapter: ILLMAdapter = new OpenClawAdapter();
    await adapter.generateStream(agentConfig, messages, onChunk, onComplete, onError);
  },
};
