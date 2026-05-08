// wsHandler.ts — WebSocket 处理器
//
// RepaceClaw 负责：智能体配置管理、会话管理、消息存储
// OpenClaw Gateway 负责：模型路由、LLM API 调用、流式输出

import WebSocket, { WebSocketServer } from "ws";
import { logger } from '../utils/logger';
import { AgentService } from "../services/AgentService";
import { ConversationService } from "../services/ConversationService";
import { ProjectService } from "../services/ProjectService";
import { UserService } from "../services/UserService";
import { FileContextService } from "../services/FileContextService";
import http from "http";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import { REPACECLAW_MESSAGE_CHANNEL, resolveOpenClawGateway } from '../utils/openclawGateway';

const { url: GATEWAY_URL, token: GATEWAY_TOKEN } = resolveOpenClawGateway();

function buildRcOcSessionKey(ocAgentId: string, conversationId: string): string {
  return `agent:${ocAgentId}:rc:${conversationId}`;
}

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
  token?: string;  // JWT token for auth
}

interface WSClient {
  ws: WebSocket;
  userId: string | null;
  userRole: string | null;
}

export function setupWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Map<WebSocket, WSClient>();

  /**
   * 向指定会话的所有已认证连接广播消息
   * 用于异步任务（如概述生成）完成后推送给前端
   */
  (wss as any).broadcastToConversation = (conversationId: string, data: Record<string, any>) => {
    const payload = JSON.stringify(data);
    for (const [ws, client] of clients) {
      if (ws.readyState === WebSocket.OPEN && client.userId) {
        ws.send(payload);
      }
    }
  };

  // 导出供路由调用
  (globalThis as any).__broadcastToConversation = (wss as any).broadcastToConversation;

  wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
    logger.info("[WS] Client connected");

    // 从 URL query 提取 token（支持 ?token=xxx）
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const queryToken = url.searchParams.get("token");

    const client: WSClient = { ws, userId: null, userRole: null };
    clients.set(ws, client);

    // 如果 URL 中有 token，直接认证
    if (queryToken) {
      try {
        const payload = UserService.verifyToken(queryToken);
        client.userId = payload.id;
        client.userRole = payload.role;
        logger.info(`[WS] Authenticated via query: ${payload.id.slice(0, 8)}`);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid authentication token" }));
      }
    }

    ws.on("message", async (data: Buffer) => {
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
        const { conversationId, conversationTitle, previousConversationTitle, agentId, agentIds: msgAgentIds, content } = msg;
        if (!content || !conversationId) {
          ws.send(JSON.stringify({ type: "error", message: "Missing fields: conversationId, content" }));
          return;
        }

        // Dual-code Phase 2：WS 入站也允许传 UUID / session_code。
        const conv = ConversationService.getByIdOrCode(conversationId, client.userId);
        if (!conv) {
          ws.send(JSON.stringify({ type: "error", message: "Conversation not found" }));
          return;
        }

        // 关键修复：tab 标题修改后，用户往往会立即继续发消息。
        // 如果这里只读数据库里的 conv.title，会有一个“标题更新接口尚未完成、但消息已经发出”的时序窗口，
        // 导致模型第一条回复仍引用旧标题。为避免这个问题，chat 消息允许前端携带当前激活 tab 的最新标题，
        // 后端收到后优先采用它，并顺手回写 conversations.title，消除前后端状态漂移。
        if (conversationTitle?.trim() && conv && conversationTitle.trim() !== (conv.title || '').trim()) {
          ConversationService.update(conv.id, { title: conversationTitle.trim() });
          conv.title = conversationTitle.trim();
        }

        // Phase 3: 会话归属校验（非管理员必须是自己创建的会话）
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

        // currentAgentId / agentIds 统一视为 RepaceClaw agent UUID，调用 Gateway 前再映射到 OpenClaw agentId
        const agent = AgentService.getByIdOrCode(targetAgentId, client.userId);
        if (!agent) {
          ws.send(JSON.stringify({ type: "error", message: `Agent config not found for ${targetAgentId}` }));
          return;
        }
        const ocAgentId = agent.openclawAgentId || 'main';

        // 保存用户消息到 DB（消息层保存业务 agentId）
        const userMsg = ConversationService.addMessage({
          conversationId: conv.id,
          role: "user",
          content,
          agentId: targetAgentId,
        });
        ws.send(JSON.stringify({ type: "user_message", message: userMsg }));

        // 构建 system prompt
        let systemPrompt = agent.systemPrompt || '';
        if (agent.writingStyle) systemPrompt += `\n\n写作风格：${agent.writingStyle}`;
        if (agent.expertise?.length) systemPrompt += `\n\n专业领域：${agent.expertise.join('、')}`;
        if (agent.outputFormat && agent.outputFormat !== '纯文本') {
          systemPrompt += `\n\n## 输出格式要求\n${agent.outputFormat}`;
        }
        if (agent.boundary?.trim()) {
          systemPrompt += `\n\n## 能力边界\n${agent.boundary.trim()}`;
        }
        systemPrompt += `\n\n你的名字是 ${agent.name}，请始终以第一人称回复。`;
        // 关键修复：会话标题不是纯前端装饰，它是当前对话的重要业务语义。
        // 如果不把 conversation.title 注入上下文，模型只会看到历史消息，看不到用户给这个会话起的标题，
        // 就会出现“tab 明明有标题，但回复完全不体现标题”的现象。
        const effectiveTitle = conversationTitle?.trim() || conv.title?.trim();
        const previousTitle = previousConversationTitle?.trim();
        if (effectiveTitle) {
          systemPrompt += `\n\n当前会话标题：${effectiveTitle}`;
        }
        // 关键修复：如果标题刚被修改，除了告诉模型“现在叫什么”，
        // 还要告诉它“之前叫什么”，避免它沿着旧标题继续回复或把两次标题变化当成无关信息。
        if (previousTitle && effectiveTitle && previousTitle !== effectiveTitle) {
          systemPrompt += `\n\n本会话标题已从“${previousTitle}”更新为“${effectiveTitle}”，后续请以新标题为准。`;
        }

        // 会话文件上下文：优先按 user_id + conversation_id 注入已上传文件摘要。
        // 当前先做轻量识别，让智能体明确知道“会话里有哪些文件”；
        // 后续再把 Excel/CSV 深度解析结果接进来。
        const fileContext = await FileContextService.buildConversationFileContext(client.userId || '', conv.id);
        if (fileContext) {
          systemPrompt += `\n\n${fileContext}`;
        }

        // 获取历史消息
        const historyMessages = ConversationService.getMessages(conv.id);
        const history = historyMessages.map((m) => ({
          role: m.role === "agent" ? "assistant" : "user",
          content: m.content,
        }));

        // 调用 OpenClaw Gateway 生成回复（消息存业务 agentId，路由用 ocAgentId）
        logger.info(`[WS] chat conversation=${conv.id} agent=${targetAgentId} ocAgent=${ocAgentId} user=${client.userId?.slice(0, 8) || 'unknown'}`);
        // 关键修复：这里必须传真实会话主键 conv.id，不能继续传前端原始 conversationId。
        // 前端允许传 UUID / session_code，前面已经通过 getByIdOrCode() 解析过一次。
        // 如果这里继续把原始值传进 callGateway，会导致流式回复和 agent 消息可能写到错误会话，表现为“用户发出去了，但智能体不响应/看不到响应”。
        await callGateway(ws, conv.id, targetAgentId, ocAgentId, systemPrompt, history, content, client.userId);
        return;
      }

      // ── 多智能体协作对话 ──
      if (msg.type === "multi_chat") {
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

        // Phase 4: 会话归属校验（与 chat 保持一致）
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
            if (agent.writingStyle) systemPrompt += `\n\n写作风格：${agent.writingStyle}`;
            if (agent.expertise?.length) systemPrompt += `\n\n专业领域：${agent.expertise.join('、')}`;
            systemPrompt += `\n\n你的名字是 ${agent.name}，请始终以第一人称回复。`;
            if (conv.title?.trim()) {
              systemPrompt += `\n\n当前会话标题：${conv.title.trim()}`;
            }

            const historyMessages = ConversationService.getMessages(conv.id);
            const history = historyMessages.map((m) => ({
              role: m.role === "agent" ? "assistant" : "user",
              content: m.content,
            }));

            // 关键修复：多智能体协作场景同样必须使用已解析的真实会话主键 conv.id。
            await callGateway(ws, conv.id, agent.id, ocAgentId, systemPrompt, history, content, client.userId);
          }

          ws.send(JSON.stringify({ type: "workflow_node_done", nodeId: node.id }));
        }

        ws.send(JSON.stringify({
          type: "multi_agent_done",
          projectId,
          workflowNodeId: workflowNodeId || null,
        }));
        return;
      }

      ws.send(JSON.stringify({ type: "error", message: `Unknown message type: ${(msg as any).type}` }));
    });

    ws.on("close", (code, reason) => {
      // 关键排障注释：之前这里只打印“Client disconnected”，信息量不足，
      // 很难区分是浏览器路由切换(1001)、未正常完成握手/页面刷新(1005)还是异常断链(1006)。
      // 本次智能体“有响应但前端没显示”的根因，就是前端连接在 Gateway 慢回复期间提前断开。
      logger.info(`[WS] Client disconnected code=${code} reason=${reason?.toString() || 'n/a'}`);
    });
    ws.on("error", (err) => logger.error("[WS] Error: " + err.message));
  });

  return wss;
}

/** 供路由调用的广播函数（setupWebSocket 后初始化） */
export function broadcastToConversation(conversationId: string, data: Record<string, any>): void {
  const fn = (globalThis as any).__broadcastToConversation;
  if (fn) {
    fn(conversationId, data);
  }
}

/**
 * 调用 OpenClaw Gateway 生成智能体回复
 * @param agentId RepaceClaw 业务 agentId
 * @param ocAgentId OpenClaw 路由 agentId（model=openclaw/{ocAgentId}）
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

  return new Promise((resolve) => {
    const msgId = uuidv4();

    if (ws.readyState !== WebSocket.OPEN) { resolve(); return; }

    // 关键修复：必须把 conversationId 带回前端。
    // 仅按 agentId 路由会在“同一 agent 出现在多个会话”时把流式回复挂错 panel，表现为当前会话不刷新就看不到回复。
    ws.send(JSON.stringify({ type: "agent_start", messageId: msgId, agentId, conversationId }));

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userContent },
    ];

    logger.info(`[Gateway] Calling model=openclaw/${ocAgentId}, sessionKey=${ocSessionKey}, messages=${messages.length}`);

    const url = new URL(`${GATEWAY_URL}/v1/chat/completions`);
    // 流式输出：用户 1~2 秒内看到第一个字，无需等待完整响应
    const payload = JSON.stringify({
      model: `openclaw/${ocAgentId}`,
      messages,
      stream: true,
    });

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${GATEWAY_TOKEN}`,
        "x-openclaw-message-channel": REPACECLAW_MESSAGE_CHANNEL,
        // 关键修复：Gateway 不能只收到裸 conversationId。
        // OpenClaw 要靠 agent 形状的 session key 才会把会话落到对应 agent 目录，
        // 否则即使 model=openclaw/rc-ops-agent，也可能把会话建到 main。
        "x-openclaw-session-key": ocSessionKey,
      },
    }, (res) => {
      // 流式输出：累积完整内容用于入库
      let fullContent = "";
      let chunkCount = 0;

      // 错误状态码处理
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

      // SSE 流式处理：每收到一个 chunk 立即推给前端
      res.on("data", (d: Buffer) => {
        const text = d.toString();
        // SSE 格式："data: {...}\n" 或 "data: [DONE]\n"
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
              // 实时推送给前端
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
          } catch {}
        }
      });

      res.on("end", () => {
        // 流式结束：保存完整消息到 DB
        const maxTokensPerMsg = AgentService.getMaxTokensPerMessage(agentId);
        const finalContent = maxTokensPerMsg && fullContent.length > maxTokensPerMsg
          ? fullContent.substring(0, maxTokensPerMsg)
          : fullContent;

        const agentMsg = ConversationService.addMessage({
          conversationId,
          role: "agent",
          content: finalContent,
          agentId,
          tokenCount: 0, // 流式模式下 usage 信息在 SSE 末尾，暂不统计
        });

        logger.info(`[Gateway] Streaming done: ${finalContent.length} chars, ${chunkCount} chunks`);

        // ── 记录用量（流式模式下估算） ────────────────────────────
        if (userId) {
          const estTokens = Math.ceil(finalContent.length / 4); // 粗略估算
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "error", message: err.message, agentId, conversationId }));
      }
      resolve();
    });

    req.setTimeout(120000, () => {
      req.destroy();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "error", message: "Gateway timeout", agentId, conversationId }));
      }
      resolve();
    });

    req.write(payload);
    req.end();
  });
}
