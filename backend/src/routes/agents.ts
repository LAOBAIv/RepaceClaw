/**
 * 智能体管理路由
 * 
 * 优化点：
 * 1. 使用统一的响应工具函数
 * 2. 使用 asyncHandler 包装异步路由
 * 3. 统一错误处理
 * 4. 类型安全
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { AgentService } from '../services/AgentService';
import { getDb } from '../db/client';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { 
  sendSuccess, 
  sendCreated, 
  sendNotFound, 
  sendValidationError 
} from '../utils/response';
import { Errors } from '../utils/errors';
import { TokenStats } from '../types';
import * as AgentBridge from '../services/AgentBridge';

const router = Router();

// ============ 验证 Schema ============

const AgentSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  color: z.string().default('#6366F1'),
  systemPrompt: z.string().default(''),
  writingStyle: z.string().default('balanced'),
  expertise: z.array(z.string()).default([]),
  description: z.string().default(''),
  status: z.enum(['active', 'idle', 'busy']).default('idle'),
  // 模型参数
  modelName: z.string().default(''),
  modelProvider: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(32768).default(4096),
  topP: z.number().min(0).max(1).default(1),
  frequencyPenalty: z.number().min(-2).max(2).default(0),
  presencePenalty: z.number().min(-2).max(2).default(0),
  // 用户配置的私有 Token 接入
  tokenProvider: z.string().default(''),
  tokenApiKey: z.string().default(''),
  tokenBaseUrl: z.string().default(''),
  // 输出格式 & 能力边界
  outputFormat: z.string().default('纯文本'),
  boundary: z.string().default(''),
  // 对话记忆轮数（0 = 不限）
  memoryTurns: z.number().min(0).default(0),
  // 简单温度快捷覆盖
  temperatureOverride: z.number().min(0).max(2).nullable().default(null),
  // RC -> OC 执行分类
  agentType: z.enum(['dev', 'data', 'creative', 'pm', 'research', 'ops', 'decision', 'general']).default('general'),
  // Phase 3: 可见性 / Skill 管控 / 配额
  visibility: z.enum(['private', 'public', 'template']).default('private'),
  skillsConfig: z.record(z.string(), z.boolean()).optional(),
  quotaConfig: z.object({
    maxDailyTokens: z.number().optional(),
    maxDailyConversations: z.number().optional(),
    maxTokensPerMessage: z.number().optional(),
  }).optional(),
});

const AgentUpdateSchema = AgentSchema.partial();

// ============ 异步处理包装器 ============

// asyncHandler 已从 '../utils' 导入

// ============ 路由定义 ============

/**
 * GET /api/agents
 * 获取所有智能体列表
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const agents = AgentService.list(userId);
    sendSuccess(res, agents);
  })
);

/**
 * GET /api/agents/routing-overview
 * 返回所有智能体的实际 LLM 路由状态（用于管理后台 + 前端展示）
 */
router.get(
  "/routing-overview",
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const db = getDb();
    const agents = AgentService.list();

    const overview = agents.map(agent => {
      const hasPrivateToken = !!(agent.tokenApiKey?.trim());
      let effectiveChannel = "";
      let effectiveModel = "";
      let source: "private" | "global" | "gateway" | "none" = "none";

      if (hasPrivateToken) {
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
              const row: any = {};
              modelRows[0].values[0].forEach((v: any, i: number) => { row[cols[i]] = v; });
              effectiveChannel = row.provider_name || "未知";
              effectiveModel = row.model_name || agentModelName;
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
        hasPrivateToken,
        tokenProvider: agent.tokenProvider || null,
        modelName: agent.modelName || null,
        modelProvider: agent.modelProvider || null,
      };
    });

    sendSuccess(res, overview);
  })
);

/**
 * GET /api/agents/:id
 * 获取单个智能体详情
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    // Dual-code Phase 2：智能体详情接口支持 UUID / agent_code 双读。
    const agent = AgentService.getByIdOrCode(req.params.id, (req as any).user?.id);
    if (!agent) {
      throw Errors.notFound('智能体');
    }
    if (agent.isSystem && (req as any).user?.role !== 'admin' && (req as any).user?.role !== 'super_admin') {
      throw Errors.forbidden('平台助手设置仅管理员可查看');
    }
    sendSuccess(res, agent);
  })
);

/**
 * GET /api/agents/:id/token-stats
 * 获取智能体 Token 用量统计
 */
router.get(
  '/:id/token-stats',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const agent = AgentService.getByIdOrCode(req.params.id, (req as any).user?.id);
    if (!agent) {
      throw Errors.notFound('智能体');
    }

    const db = getDb();

    // Dual-code Phase 2：统计查询必须落到真实 UUID，不能直接拿路由参数。
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

    // 按会话汇总
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
  })
);

/**
 * POST /api/agents
 * 创建新智能体
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = AgentSchema.safeParse(req.body);
    
    if (!parsed.success) {
      throw Errors.validation('参数验证失败', parsed.error.flatten());
    }

    const userId = (req as any).user?.id;
    const agent = AgentService.create({ ...parsed.data, name: parsed.data.name, userId });
    sendCreated(res, agent, '智能体创建成功');
  })
);

/**
 * PUT /api/agents/:id
 * 更新智能体
 */
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = AgentUpdateSchema.safeParse(req.body);
    
    if (!parsed.success) {
      throw Errors.validation('参数验证失败', parsed.error.flatten());
    }

    const current = AgentService.getByIdOrCode(req.params.id, (req as any).user?.id);
    if (!current) {
      throw Errors.notFound('智能体');
    }
    if (current.isSystem && (req as any).user?.role !== 'admin' && (req as any).user?.role !== 'super_admin') {
      throw Errors.forbidden('平台助手参数仅管理员可修改');
    }

    const resolvedAgentId = AgentService.resolveId(req.params.id, (req as any).user?.id);
    if (!resolvedAgentId) {
      throw Errors.notFound('智能体');
    }

    const agent = AgentService.update(resolvedAgentId, parsed.data);
    if (!agent) {
      throw Errors.notFound('智能体');
    }

    sendSuccess(res, agent, '智能体更新成功');
  })
);

/**
 * DELETE /api/agents/:id
 * 删除智能体
 */
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const agent = AgentService.getByIdOrCode(req.params.id, (req as any).user?.id);
    if (!agent) {
      throw Errors.notFound('智能体');
    }
    if (agent.isSystem) {
      throw Errors.forbidden('平台助手不允许删除');
    }

    AgentService.delete(agent.id);
    sendSuccess(res, { id: agent.id }, '智能体删除成功');
  })
);

/**
 * POST /api/agents/sync
 * 全量同步：确保所有 agent 都已注册到 OpenClaw
 * 管理权限，用于服务启动后补偿
 */
router.post(
  '/sync',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userRole = (req as any).user?.role;
    if (userRole !== 'super_admin' && userRole !== 'admin') {
      throw Errors.forbidden('需要管理员权限');
    }

    const report = await AgentBridge.syncAllAgents();
    sendSuccess(res, report, '同步完成');
  })
);

/**
 * GET /api/agents/registry-log
 * 查看 Agent 注册/注销日志（管理员）
 */
router.get(
  '/registry-log',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userRole = (req as any).user?.role;
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
  })
);

/**
 * GET /api/agents/:id/registry-status
 * 查看单个智能体的 OpenClaw 注册状态
 */
router.get(
  '/:id/registry-status',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const agent = AgentService.getByIdOrCode(req.params.id, (req as any).user?.id);
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
  })
);

export default router;
