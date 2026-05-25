// handlers.ts — 所有 route handler 函数
import { Request, Response } from 'express';

import { AgentService } from '../../services/AgentService';
import { getDb } from '../../db/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';
import {
  sendSuccess,
  sendCreated,
  sendValidationError
} from '../../utils/response';
import { Errors } from '../../utils/errors';
import { TokenStats } from '../../types';
import * as AgentBridge from '../../services/AgentBridge';
import { AgentSchema, AgentUpdateSchema, isAdmin } from './helpers';

/**
 * GET /api/agents
 * 获取所有智能体列表
 */
export const listAgents = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const agents = AgentService.list(userId);
  sendSuccess(res, agents);
});

/**
 * GET /api/agents/routing-overview
 * 返回所有智能体的实际 LLM 路由状态（用于管理后台 + 前端展示）
 */
export const routingOverview = asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const agents = AgentService.list(req.user?.id);

  const overview = agents.map(agent => {
    const hasPrivateToken = !!(agent.tokenApiKey?.trim());
    let effectiveChannel = "";
    let effectiveModel = "";
    let source: "private" | "global" | "gateway" | "none" = "none";

    // [2026-05-23] 系统智能体（平台助手、微信助手）统一走全局渠道
    if (agent.isSystem) {
      const providerName = agent.tokenProvider || agent.modelProvider || 'OpenClaw';
      const modelName = (agent.modelName && agent.modelName !== 'auto')
        ? agent.modelName
        : (agent.tokenProvider ? `${providerName} 默认模型` : '平台默认');
      effectiveChannel = providerName;
      effectiveModel = modelName;
      source = 'global';
    } else if (hasPrivateToken) {
      effectiveChannel = agent.tokenProvider || "custom";
      effectiveModel = (agent.modelName && agent.modelName.toLowerCase() !== "auto")
        ? agent.modelName
        : "默认模型";
      source = "private";
    } else {
      const agentModelName = agent.modelName?.trim();
      if (agentModelName && agentModelName.toLowerCase() !== "auto") {
        try {
          const modelRows = db.exec(
            `SELECT m.name as model_name, mp.name as provider_name
             FROM models m
             LEFT JOIN model_providers mp ON m.provider_id = mp.id
             WHERE m.name = ? AND m.enabled = 1 AND mp.enabled = 1
             LIMIT 1`,
            [agentModelName]
          );
          if (modelRows.length && modelRows[0].values.length) {
            const cols = modelRows[0].columns;
            const row: Record<string, unknown> = {};
            modelRows[0].values[0].forEach((v: unknown, i: number) => { row[cols[i]] = v; });
            effectiveChannel = (row.provider_name as string) || "未知";
            effectiveModel = (row.model_name as string) || agentModelName;
            source = "global";
          } else {
            effectiveChannel = "openclaw";
            effectiveModel = agentModelName;
            source = "gateway";
          }
        } catch {
          effectiveChannel = "openclaw";
          effectiveModel = agentModelName;
          source = "gateway";
        }
      } else {
        effectiveChannel = "openclaw";
        effectiveModel = "默认";
        source = "gateway";
      }
    }

    return {
      id: agent.id,
      name: agent.name,
      color: agent.color,
      status: agent.status,
      source,
      effectiveChannel,
      effectiveModel,
      hasPrivateToken: agent.isSystem ? false : hasPrivateToken,
      tokenProvider: agent.isSystem ? ('平台配置') : (agent.tokenProvider || null),
      modelName: agent.modelName || null,
      modelProvider: agent.modelProvider || null,
      isSystem: agent.isSystem || false,
    };
  });

  // [2026-05-23] 系统智能体置顶 + 去重
  const systemAgentIds = ['repaceclaw-platform-assistant', 'rc-wechat-agent'];
  const existingIds = new Set(overview.map(a => a.id));
  const systemOverview: typeof overview = [];
  for (const sysId of systemAgentIds) {
    const sysAgent = AgentService.getByIdOrCode(sysId);
    if (sysAgent && !existingIds.has(sysAgent.id)) {
      systemOverview.push({
        id: sysAgent.id,
        name: sysAgent.name,
        color: sysAgent.color,
        status: sysAgent.status,
        source: 'global' as const,
        effectiveChannel: sysAgent.tokenProvider || sysAgent.modelProvider || 'OpenClaw',
        effectiveModel: sysAgent.modelName || '平台默认',
        hasPrivateToken: false,
        tokenProvider: '平台配置',
        modelName: sysAgent.modelName || null,
        modelProvider: sysAgent.modelProvider || null,
        isSystem: true,
      });
    } else if (sysAgent) {
      const idx = overview.findIndex(a => a.id === sysAgent.id);
      if (idx >= 0) {
        systemOverview.push(overview.splice(idx, 1)[0]);
      }
    }
  }

  sendSuccess(res, [...systemOverview, ...overview]);
});

/**
 * GET /api/agents/channel-overview
 * [2026-05-23] 智能体通道管理：展示 OC agent 通道列表 + 关联的 RC 智能体
 */
export const channelOverview = asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb();
  const fs = require('fs');

  let ocAgents: Array<Record<string, unknown>> = [];
  try {
    const raw = fs.readFileSync('/root/.openclaw/openclaw.json', 'utf-8');
    const data = JSON.parse(raw);
    ocAgents = (data?.agents?.list || []).filter((a: Record<string, unknown>) =>
      (a['id'] as string)?.startsWith('rc-') || a['id'] === 'repaceclaw-platform-assistant'
    );
  } catch (err) { logger.warn(`[Agents] Failed to load OpenClaw agents config: ${err}`); }

  const allAgents = AgentService.list();
  const { getAllAgentTypes, toOpenClawAgentId, fromOpenClawAgentId } = require('../../services/AgentBridge/AgentMapper');

  const TYPE_LABELS: Record<string, string> = {
    dev: '工程开发类', data: '数据分析类', creative: '内容生成类',
    pm: '项目管理类', research: '知识推理类', ops: '平台策略类',
    decision: '决策支持类', general: '通用助手类', wechat: '微信助手',
    platform: '平台助手',
  };

  const channels = ocAgents.map((oc: Record<string, unknown>) => {
    const agentType = fromOpenClawAgentId(oc['id'] as string) || 'unknown';
    const rcAgents = allAgents.filter(a => a.openclawAgentId === oc['id']).map(a => ({
      id: a.id, name: a.name, color: a.color,
      userId: a.userId, visibility: a.visibility,
    }));
    const isSystem = oc['id'] === 'rc-wechat-agent' || oc['id'] === 'repaceclaw-platform-assistant';
    return {
      ocAgentId: oc['id'] as string,
      type: agentType,
      label: TYPE_LABELS[agentType] || agentType,
      model: (oc['model'] as string) || '',
      workspace: (oc['workspace'] as string) || '',
      rcAgents,
      rcAgentCount: rcAgents.length,
      isSystem,
      editable: isSystem && oc['id'] !== 'repaceclaw-platform-assistant',
    };
  });

  sendSuccess(res, channels);
});

/**
 * PUT /api/agents/channel/:ocAgentId/model
 * [2026-05-23] 修改 OC agent 的模型配置（写入 openclaw.json）
 */
export const updateChannelModel = asyncHandler(async (req: Request, res: Response) => {
  const role = req.user?.role;
  if (!isAdmin(role)) {
    throw Errors.forbidden('仅管理员可修改通道模型');
  }
  const { ocAgentId } = req.params;
  const { model } = req.body;
  if (!model || typeof model !== 'string') {
    throw Errors.validation('缺少 model 参数');
  }

  const fs = require('fs');
  const configPath = '/root/.openclaw/openclaw.json';
  const raw = fs.readFileSync(configPath, 'utf-8');
  const data = JSON.parse(raw);
  const agents = data?.agents?.list || [];
  const idx = agents.findIndex((a: { id: string }) => a.id === ocAgentId);
  if (idx < 0) {
    throw Errors.notFound('OC 通道');
  }
  agents[idx].model = model;
  data.agents.list = agents;
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');

  sendSuccess(res, { ocAgentId, model }, '通道模型已更新');
});

/**
 * GET /api/agents/:id
 * 获取单个智能体详情
 */
export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  const agent = AgentService.getByIdOrCode(req.params.id, req.user?.id);
  if (!agent) {
    throw Errors.notFound('智能体');
  }
  if (agent.isSystem && req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw Errors.forbidden('平台助手设置仅管理员可查看');
  }
  sendSuccess(res, agent);
});

/**
 * GET /api/agents/:id/token-stats
 * 获取智能体 Token 用量统计
 */
export const getTokenStats = asyncHandler(async (req: Request, res: Response) => {
  const agent = AgentService.getByIdOrCode(req.params.id, req.user?.id);
  if (!agent) {
    throw Errors.notFound('智能体');
  }

  const db = getDb();

  const msgResult = db.exec(
    `SELECT COUNT(*) as msg_count, SUM(token_count) as total_tokens
     FROM messages WHERE agent_id = ? AND role = 'agent'`,
    [agent.id]
  );

  const msgRow = msgResult.length && msgResult[0].values.length
    ? msgResult[0].values[0]
    : [0, 0];

  const messageCount = Number(msgRow[0]) || 0;
  const totalFromMessages = Number(msgRow[1]) || 0;

  const convResult = db.exec(
    `SELECT conversation_id,
            COUNT(*) as msg_count,
            SUM(token_count) as total_tokens
     FROM messages
     WHERE agent_id = ? AND role = 'agent'
     GROUP BY conversation_id
     ORDER BY total_tokens DESC`,
    [agent.id]
  );

  const perConversation: Array<{
    conversationId: string;
    messageCount: number;
    totalTokens: number;
  }> = [];

  if (convResult.length && convResult[0].values.length) {
    const cols = convResult[0].columns;
    for (const row of convResult[0].values) {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, i) => (obj[c] = row[i]));
      perConversation.push({
        conversationId: String(obj.conversation_id),
        messageCount: Number(obj.msg_count),
        totalTokens: Number(obj.total_tokens),
      });
    }
  }

  const stats: TokenStats = {
    agentId: agent.id,
    agentName: agent.name,
    tokenUsed: agent.tokenUsed,
    tokenFromMessages: totalFromMessages,
    messageCount,
    avgTokenPerMsg: messageCount > 0 ? Math.round(totalFromMessages / messageCount) : 0,
    perConversation,
  };

  sendSuccess(res, stats);
});

/**
 * POST /api/agents
 * 创建新智能体
 */
export const createAgent = asyncHandler(async (req: Request, res: Response) => {
  const parsed = AgentSchema.safeParse(req.body);

  if (!parsed.success) {
    throw Errors.validation('参数验证失败', parsed.error.flatten());
  }

  const userId = req.user?.id;
  const agent = AgentService.create({ ...parsed.data, name: parsed.data.name, userId });
  sendCreated(res, agent, '智能体创建成功');
});

/**
 * PUT /api/agents/:id
 * 更新智能体
 */
export const updateAgent = asyncHandler(async (req: Request, res: Response) => {
  const parsed = AgentUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    throw Errors.validation('参数验证失败', parsed.error.flatten());
  }

  const current = AgentService.getByIdOrCode(req.params.id, req.user?.id);
  if (!current) {
    throw Errors.notFound('智能体');
  }
  const isWechat = current.agentCode === 'rc-wechat-agent' || current.id === 'rc-wechat-agent' || AgentService.isWechatAssistantId(current.id);
  const onlyModelUpdate = Object.keys(parsed.data).length === 1 && 'modelName' in parsed.data;
  if (current.isSystem && !onlyModelUpdate && req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw Errors.forbidden('平台助手参数仅管理员可修改');
  }
  if (current.isSystem && onlyModelUpdate && !isWechat && req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    throw Errors.forbidden('平台助手模型仅管理员可修改');
  }

  const resolvedAgentId = AgentService.resolveId(req.params.id, req.user?.id);
  if (!resolvedAgentId) {
    throw Errors.notFound('智能体');
  }

  const agent = AgentService.update(resolvedAgentId, parsed.data);
  if (!agent) {
    throw Errors.notFound('智能体');
  }

  sendSuccess(res, agent, '智能体更新成功');
});

/**
 * DELETE /api/agents/:id
 * 删除智能体
 */
export const deleteAgent = asyncHandler(async (req: Request, res: Response) => {
  const agent = AgentService.getByIdOrCode(req.params.id, req.user?.id);
  if (!agent) {
    throw Errors.notFound('智能体');
  }
  if (agent.isSystem) {
    throw Errors.forbidden('平台助手不允许删除');
  }

  AgentService.delete(agent.id);
  sendSuccess(res, { id: agent.id }, '智能体删除成功');
});

/**
 * POST /api/agents/sync
 * 全量同步：确保所有 agent 都已注册到 OpenClaw
 */
export const syncAgents = asyncHandler(async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'super_admin' && userRole !== 'admin') {
    throw Errors.forbidden('需要管理员权限');
  }

  const report = await AgentBridge.syncAllAgents();
  sendSuccess(res, report, '同步完成');
});

/**
 * GET /api/agents/registry-log
 * 查看 Agent 注册/注销日志（管理员）
 */
export const registryLog = asyncHandler(async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'super_admin' && userRole !== 'admin') {
    throw Errors.forbidden('需要管理员权限');
  }

  const db = getDb();
  const result = db.exec(
    'SELECT * FROM agent_registry_log ORDER BY created_at DESC LIMIT 100'
  );

  const logs: Array<Record<string, unknown>> = [];
  if (result.length && result[0].values.length) {
    const cols = result[0].columns;
    for (const row of result[0].values) {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      logs.push(obj);
    }
  }

  sendSuccess(res, logs);
});

/**
 * GET /api/agents/:id/registry-status
 * 查看单个智能体的 OpenClaw 注册状态
 */
export const registryStatus = asyncHandler(async (req: Request, res: Response) => {
  const agent = AgentService.getByIdOrCode(req.params.id, req.user?.id);
  if (!agent) {
    throw Errors.notFound('智能体');
  }

  const registered = AgentBridge.listRegisteredAgents();
  const isRegistered = registered.some(a => a.id === agent.openclawAgentId);

  sendSuccess(res, {
    agentId: agent.id,
    agentName: agent.name,
    openclawAgentId: agent.openclawAgentId,
    isRegistered,
    workspace: isRegistered ? registered.find(a => a.id === agent.openclawAgentId)?.workspace : null,
  });
});
