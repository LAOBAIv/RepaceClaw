// handlers.ts — 消息处理 handler（按消息类型分组）
import WebSocket from "ws";
import http from "http";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import { logger } from '../utils/logger';
import { AgentService } from "../services/AgentService";
import { ConversationService } from "../services/ConversationService";
import { ProjectService } from "../services/ProjectService";
import { FileContextService } from "../services/FileContextService";
import { REPACECLAW_MESSAGE_CHANNEL, resolveOpenClawGateway } from '../utils/openclawGateway';
import { getErrorMessage } from '../types/ilink';

const { url: GATEWAY_URL, token: GATEWAY_TOKEN } = resolveOpenClawGateway();

// [2026-05-16] 防重复发送:记录当前正在调用 Gateway 的会话ID 及其 request 对象(用于 abort)
const activeGatewayRequests = new Map<string, { req: http.ClientRequest; startTime: number }>();

interface WSMessage {
  type: "chat" | "multi_chat" | "ping" | "auth";
  conversationId?: string;
  conversationTitle?: string;
  previousConversationTitle?: string;
  agentId?: string;
  agentIds?: string[];
  content?: string;
  projectId?: string;
  workflowNodeId?: string;
  token?: string;
}

interface WSClient {
  ws: WebSocket;
  userId: string | null;
  userRole: string | null;
}

function buildRcOcSessionKey(ocAgentId: string, conversationId: string): string {
  return `agent:${ocAgentId}:rc:${conversationId}`;
}

/**
 * 处理单条 WebSocket 消息
 */
export async function handleMessage(
  ws: WebSocket,
  client: WSClient,
  data: Buffer,
  clients: Map<WebSocket, WSClient>
): Promise<void> {
  let msg: WSMessage;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    return;
  }

  // ── Auth ──
  if (msg.type === "auth") {
    if (msg.token) {
      try {
        const { UserService } = require("../services/UserService");
        const payload = UserService.verifyToken(msg.token);
        client.userId = payload.id;
        client.userRole = payload.role;
        ws.send(JSON.stringify({ type: "auth_ok", userId: payload.id, role: payload.role }));
        logger.info(`[WS] Authenticated: ${payload.id.slice(0, 8)} (${payload.role})`);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
      }
    }
    return;
  }

  // ── Ping ──
  if (msg.type === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
    return;
  }

  // ── 未认证拦截 ──
  if (!client.userId) {
    ws.send(JSON.stringify({ type: "error", message: "Not authenticated. Send { type: 'auth', token: '...' } first." }));
    return;
  }

  // ── 单智能体对话 ──
  if (msg.type === "chat") {
    await handleChat(ws, client, msg);
    return;
  }

  // ── 多智能体协作对话 ──
  if (msg.type === "multi_chat") {
    await handleMultiChat(ws, client, msg);
    return;
  }

  ws.send(JSON.stringify({ type: "error", message: `Unknown message type: ${(msg as unknown as Record<string, unknown>).type}` }));
}

/**
 * 处理单智能体对话消息
 */
async function handleChat(ws: WebSocket, client: WSClient, msg: WSMessage): Promise<void> {
  const { conversationId, conversationTitle, previousConversationTitle, agentId, agentIds: msgAgentIds, content } = msg;
  if (!content || !conversationId) {
    ws.send(JSON.stringify({ type: "error", message: "Missing fields: conversationId, content" }));
    return;
  }

  const conv = ConversationService.getByIdOrCode(conversationId, client.userId);
  if (!conv) {
    ws.send(JSON.stringify({ type: "error", message: "Conversation not found" }));
    return;
  }

  // tab 标题修改后同步
  if (conversationTitle?.trim() && conv && conversationTitle.trim() !== (conv.title || '').trim()) {
    ConversationService.update(conv.id, { title: conversationTitle.trim() });
    conv.title = conversationTitle.trim();
  }

  // Phase 3: 会话归属校验
  const db = require("../db/client").getDb();
  const ownerCheck = db.exec("SELECT user_id FROM conversations WHERE id = ?", [conv.id]);
  if (ownerCheck.length && ownerCheck[0].values.length) {
    const ownerId = ownerCheck[0].values[0][0] as string;
    if (ownerId && ownerId !== client.userId && client.userRole !== "super_admin" && client.userRole !== "admin") {
      ws.send(JSON.stringify({ type: "error", message: "无权访问此会话" }));
      return;
    }
  }

  const dbAgentIds = conv.agentIds ?? [];
  const targetAgentId =
    (msgAgentIds && msgAgentIds.length > 0) ? msgAgentIds[0]
    : conv.currentAgentId
    || dbAgentIds[0]
    || '';

  if (!targetAgentId) {
    ws.send(JSON.stringify({ type: "error", message: "No agent associated with this conversation" }));
    return;
  }

  const agent = AgentService.getByIdOrCode(targetAgentId, client.userId);
  if (!agent) {
    ws.send(JSON.stringify({ type: "error", message: `Agent config not found for ${targetAgentId}` }));
    return;
  }
  const ocAgentId = agent.openclawAgentId || 'main';

  // 保存用户消息到 DB
  const userMsg = ConversationService.addMessage({
    conversationId: conv.id,
    role: "user",
    content,
    agentId: targetAgentId,
  });
  ws.send(JSON.stringify({ type: "user_message", message: userMsg }));

  // 构建 system prompt
  let systemPrompt = agent.systemPrompt || '';
  if (agent.writingStyle) systemPrompt += `\n\n写作风格:${agent.writingStyle}`;
  if (agent.expertise?.length) systemPrompt += `\n\n专业领域:${agent.expertise.join('、')}`;
  if (agent.outputFormat && agent.outputFormat !== '纯文本') {
    systemPrompt += `\n\n## 输出格式要求\n${agent.outputFormat}`;
  }
  if (agent.boundary?.trim()) {
    systemPrompt += `\n\n## 能力边界\n${agent.boundary.trim()}`;
  }
  systemPrompt += `\n\n你的名字是 ${agent.name},请始终以第一人称回复。`;

  const effectiveTitle = conversationTitle?.trim() || conv.title?.trim();
  const previousTitle = previousConversationTitle?.trim();
  if (effectiveTitle) {
    systemPrompt += `\n\n当前会话标题:${effectiveTitle}`;
  }
  if (previousTitle && effectiveTitle && previousTitle !== effectiveTitle) {
    systemPrompt += `\n\n本会话标题已从"${previousTitle}"更新为"${effectiveTitle}",后续请以新标题为准。`;
  }

  // 会话文件上下文
  const fileContext = await FileContextService.buildConversationFileContext(client.userId || '', conv.id);
  if (fileContext) {
    systemPrompt += `\n\n${fileContext}`;
  }

  // 同步上传文件到 OC 智能体工作区
  await FileContextService.syncFilesToOcWorkspace(client.userId || '', conv.id, ocAgentId);

  // [2026-05-16] RC 不需要发历史消息,OC Gateway 自己维护 session 上下文
  const history: Array<{ role: string; content: string }> = [];

  logger.info(`[WS] chat conversation=${conv.id} agent=${targetAgentId} ocAgent=${ocAgentId} user=${client.userId?.slice(0, 8) || 'unknown'}`);

  // [2026-05-16] 防重复:同一会话如果已有进行中的请求,abort 旧请求再发新的
  const existing = activeGatewayRequests.get(conv.id);
  if (existing) {
    logger.info(`[Gateway] Aborting previous request for conv=${conv.id} (running ${Date.now() - existing.startTime}ms)`);
    existing.req.destroy();
    activeGatewayRequests.delete(conv.id);
  }

  // [2026-05-16] 带重试的 Gateway 调用
  let retried = false;
  const doCall = async () => {
    try {
      await callGateway(ws, conv.id, targetAgentId, ocAgentId, systemPrompt, history, content, client.userId);
    } catch (err: unknown) {
      if (err instanceof Error && err?.message === 'GATEWAY_TIMEOUT' && !retried) {
        retried = true;
        logger.info(`[Gateway] Timeout for conv=${conv.id}, retrying...`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "agent_done", messageId: `retry-${Date.now()}`, agentId: targetAgentId, conversationId: conv.id, message: null }));
        }
        try {
          await callGateway(ws, conv.id, targetAgentId, ocAgentId, systemPrompt, history, content, client.userId);
        } catch (retryErr: unknown) {
          logger.error(`[Gateway] Retry also failed for conv=${conv.id}: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "agent_done", messageId: `timeout-${Date.now()}`, agentId: targetAgentId, conversationId: conv.id, message: { id: `timeout-${Date.now()}`, conversationId: conv.id, role: 'agent', content: '⚠️ 响应超时，请稍后重试', createdAt: new Date().toISOString() } }));
          }
        }
      }
    } finally {
      activeGatewayRequests.delete(conv.id);
    }
  };
  doCall();
}

/**
 * 处理多智能体协作对话消息
 */
async function handleMultiChat(ws: WebSocket, client: WSClient, msg: WSMessage): Promise<void> {
  const { conversationId, projectId, workflowNodeId, content } = msg;
  if (!content || !conversationId || !projectId) {
    ws.send(JSON.stringify({ type: "error", message: "Missing fields: conversationId, projectId, content" }));
    return;
  }

  const conv = ConversationService.getByIdOrCode(conversationId, client.userId);
  if (!conv) {
    ws.send(JSON.stringify({ type: "error", message: "Conversation not found" }));
    return;
  }

  // Phase 4: 会话归属校验
  const db = require("../db/client").getDb();
  const ownerCheck = db.exec("SELECT user_id FROM conversations WHERE id = ?", [conv.id]);
  if (ownerCheck.length && ownerCheck[0].values.length) {
    const ownerId = ownerCheck[0].values[0][0] as string;
    if (ownerId && ownerId !== client.userId && client.userRole !== "super_admin" && client.userRole !== "admin") {
      ws.send(JSON.stringify({ type: "error", message: "无权访问此会话" }));
      return;
    }
  }

  const project = ProjectService.getById(projectId);
  if (!project) {
    ws.send(JSON.stringify({ type: "error", message: `Project ${projectId} not found` }));
    return;
  }

  const targetNodes = workflowNodeId
    ? project.workflowNodes.filter((n) => n.id === workflowNodeId)
    : project.workflowNodes;

  if (!targetNodes.length) {
    ws.send(JSON.stringify({ type: "error", message: "No workflow nodes found" }));
    return;
  }

  // 保存用户消息
  const userMsg = ConversationService.addMessage({ conversationId: conv.id, role: "user", content });
  ws.send(JSON.stringify({ type: "user_message", message: userMsg }));

  ws.send(JSON.stringify({
    type: "multi_agent_start",
    nodeCount: targetNodes.length,
    projectId,
    workflowNodeId: workflowNodeId || null,
  }));

  for (const node of targetNodes) {
    ws.send(JSON.stringify({
      type: "workflow_node_start",
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.nodeType,
      agentCount: node.agentIds.length,
    }));

    for (const agentId of node.agentIds) {
      const agent = AgentService.getByIdOrCode(agentId, client.userId);
      if (!agent) continue;

      const ocAgentId = agent.openclawAgentId || 'main';

      let systemPrompt = agent.systemPrompt || '';
      if (agent.writingStyle) systemPrompt += `\n\n写作风格:${agent.writingStyle}`;
      if (agent.expertise?.length) systemPrompt += `\n\n专业领域:${agent.expertise.join('、')}`;
      systemPrompt += `\n\n你的名字是 ${agent.name},请始终以第一人称回复。`;
      if (conv.title?.trim()) {
        systemPrompt += `\n\n当前会话标题:${conv.title.trim()}`;
      }

      const history: Array<{ role: string; content: string }> = [];
      await callGateway(ws, conv.id, agent.id, ocAgentId, systemPrompt, history, content, client.userId);
    }

    ws.send(JSON.stringify({ type: "workflow_node_done", nodeId: node.id }));
  }

  ws.send(JSON.stringify({
    type: "multi_agent_done",
    projectId,
    workflowNodeId: workflowNodeId || null,
  }));
}

/**
 * 调用 OpenClaw Gateway 生成智能体回复
 */
async function callGateway(
  ws: WebSocket,
  conversationId: string,
  agentId: string,
  ocAgentId: string,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userContent: string,
  userId?: string
): Promise<void> {
  const ocSessionKey = buildRcOcSessionKey(ocAgentId, conversationId);
  ConversationService.bindOpenClawSession(conversationId, ocSessionKey, agentId);

  if (userId) {
    const quotaResult = AgentService.checkQuota(agentId, userId);
    if (!quotaResult.allowed) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "error", message: quotaResult.reason, agentId }));
      }
      return;
    }
  }

  return new Promise((resolve, reject) => {
    const msgId = uuidv4();

    if (ws.readyState !== WebSocket.OPEN) { resolve(); return; }

    ws.send(JSON.stringify({ type: "agent_start", messageId: msgId, agentId, conversationId }));

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userContent },
    ];

    logger.info(`[Gateway] Calling model=openclaw/${ocAgentId}, sessionKey=${ocSessionKey}, messages=${messages.length}`);

    const url = new URL(`${GATEWAY_URL}/v1/chat/completions`);
    const payload = JSON.stringify({
      model: `openclaw/${ocAgentId}`,
      messages,
      stream: true,
      session_key: ocSessionKey,
    });

    const lib = url.protocol === "https:" ? https : http;

    let gotFirstChunk = false;
    let chunkTimer: ReturnType<typeof setTimeout> | null = null;
    const clearChunkTimer = () => { if (chunkTimer) { clearTimeout(chunkTimer); chunkTimer = null; } };
    const resetChunkTimer = () => {
      clearChunkTimer();
      chunkTimer = setTimeout(() => {
        logger.error(`[Gateway] Chunk timeout (60s no data) for conv=${conversationId}`);
        req.destroy();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: "智能体响应中断，请重试", agentId, conversationId }));
        }
        reject(new Error('GATEWAY_TIMEOUT'));
      }, 60000);
    };

    const req = lib.request(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${GATEWAY_TOKEN}`,
        "x-openclaw-message-channel": REPACECLAW_MESSAGE_CHANNEL,
        "x-openclaw-session-key": ocSessionKey,
      },
    }, (res) => {
      let fullContent = "";
      let chunkCount = 0;

      logger.info(`[Gateway] Response status=${res.statusCode} for conv=${conversationId}`);

      if (res.statusCode && res.statusCode >= 400) {
        let errorBody = "";
        res.on("data", (d: Buffer) => (errorBody += d.toString()));
        res.on("end", () => {
          logger.error(`[Gateway] Error ${res.statusCode}: ` + errorBody.substring(0, 200));
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "error", message: `Gateway error: ${errorBody.substring(0, 200)}`, agentId, conversationId }));
          }
          resolve();
        });
        return;
      }

      res.on("data", (d: Buffer) => {
        const text = d.toString();
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (jsonStr === "[DONE]") continue;
          try {
            const json = JSON.parse(jsonStr);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullContent += delta;
              chunkCount++;
              if (!gotFirstChunk) { gotFirstChunk = true; }
              resetChunkTimer();
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: "agent_chunk",
                  messageId: msgId,
                  chunk: delta,
                  agentId,
                  conversationId,
                }));
              }
            }
          } catch (err) { logger.warn(`[WS] SSE parse error: ${err}`); }
        }
      });

      res.on("end", () => {
        clearChunkTimer();
        const maxTokensPerMsg = AgentService.getMaxTokensPerMessage(agentId);
        const finalContent = maxTokensPerMsg && fullContent.length > maxTokensPerMsg
          ? fullContent.substring(0, maxTokensPerMsg)
          : fullContent;

        const agentMsg = ConversationService.addMessage({
          conversationId,
          role: "agent",
          content: finalContent,
          agentId,
          tokenCount: 0,
        });

        logger.info(`[Gateway] Streaming done: ${finalContent.length} chars, ${chunkCount} chunks`);

        if (userId) {
          const estTokens = Math.ceil(finalContent.length / 4);
          AgentService.recordUsage(userId, agentId, estTokens);
          AgentService.addTokenUsed(agentId, estTokens);
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "agent_done",
            messageId: msgId,
            message: agentMsg,
            agentId,
            conversationId,
          }));
        }
        resolve();
      });
    });

    req.on("error", (err) => {
      logger.error(`[Gateway] Request error: ${err.message}`);
      clearChunkTimer();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "error", message: err.message, agentId, conversationId }));
      }
      resolve();
    });

    req.setTimeout(120000, () => {
      if (!gotFirstChunk) {
        req.destroy();
        clearChunkTimer();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: "响应超时，正在重试...", agentId, conversationId }));
        }
        reject(new Error('GATEWAY_TIMEOUT'));
      }
    });

    activeGatewayRequests.set(conversationId, { req, startTime: Date.now() });

    req.write(payload);
    req.end();
  });
}
