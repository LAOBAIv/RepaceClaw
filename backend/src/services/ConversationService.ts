import { v4 as uuidv4 } from "uuid";
import { getDb, saveDb } from "../db/client";
import { AgentService } from "./AgentService";
import { TaskService } from "./TaskService";

export interface Conversation {
  id: string;
  projectId: string | null;
  taskId: string | null;
  /** 业务会话编码，双编码方案中与 taskCode 对齐 */
  sessionCode?: string;
  /** 当前正在对话的智能体 UUID */
  currentAgentId: string;
  /** 业务当前智能体编码：sessionCode + agentCode */
  currentAgentCode?: string;
  /** 参与本会话的所有智能体 id 列表（按加入时间排序） */
  agentIds: string[];
  /**
   * @deprecated 兼容字段：取 agentIds[0]，若为空则返回空字符串
   * 旧代码仍可通过此字段读取“主智能体”，新代码应使用 agentIds
   */
  agentId: string;
  title: string;
  /** 会话状态：'in_progress' | 'completed' | 'archived' | 'deleted' */
  status: 'in_progress' | 'completed' | 'archived' | 'deleted';
  /** V1: 会话作用域（user / department / role / enterprise） */
  scopeType: 'user' | 'department' | 'role' | 'enterprise';
  /** V1: 作用域 ID；enterprise 级可为空 */
  scopeId: string;
  /** V1: 记忆策略（private / summary_shared） */
  memoryPolicy: 'private' | 'summary_shared';
  /** V1: 会话摘要，供后续共享/聚合使用 */
  summary: string;
  /** V1: 最后一条消息时间 */
  lastMessageAt?: string;
  /** 归属用户 UUID；非 user 作用域会话当前仍保留创建用户 */
  userId: string;
  createdBy: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  /** 业务消息编码:sessionCode + 6位序号 */
  messageCode?: string;
  conversationId: string;
  role: "user" | "agent";
  content: string;
  agentId?: string;
  /** 本条消息实际消耗的 token 数(0 表示用户消息或无统计) */
  tokenCount: number;
  createdAt: string;
}

function execToRows(db: any, sql: string, params?: any[]): any[] {
  const result = params ? db.exec(sql, params) : db.exec(sql);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map((row: any[]) => {
    const obj: any = {};
    cols.forEach((c: string, i: number) => (obj[c] = row[i]));
    return obj;
  });
}

/** 批量查询多个会话的 agentIds,返回 Map<conversationId, agentId[]> */
function fetchAgentIdsMap(db: any, convIds: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!convIds.length) return map;
  // SQLite IN 查询(最多 999 个参数,实际不会超限)
  const placeholders = convIds.map(() => "?").join(",");
  const rows = execToRows(
    db,
    `SELECT conversation_id, agent_id FROM conversation_agents WHERE conversation_id IN (${placeholders}) ORDER BY joined_at ASC`,
    convIds
  );
  for (const r of rows) {
    if (!map.has(r.conversation_id)) map.set(r.conversation_id, []);
    map.get(r.conversation_id)!.push(r.agent_id);
  }
  return map;
}

/**
 * 保持 conversations.agent_ids(旧快照列)与 conversation_agents 关联表一致。
 * 说明:当前真实来源是 conversation_agents,但仍有旧代码/排障脚本会直接看 agent_ids 文本列,
 * 所以在双编码过渡期要持续同步,避免"当前会话已切 agent,但旧快照列还是旧值"的脏状态。
 */
function syncConversationAgentSnapshot(db: any, conversationId: string): string[] {
  const rows = execToRows(
    db,
    `SELECT agent_id FROM conversation_agents WHERE conversation_id=? ORDER BY joined_at ASC`,
    [conversationId]
  );
  const agentIds = rows.map((r) => String(r.agent_id)).filter(Boolean);
  db.run(`UPDATE conversations SET agent_ids=? WHERE id=?`, [JSON.stringify(agentIds), conversationId]);
  return agentIds;
}

/** 将 DB 行 + agentIds 组装成 Conversation 对象 */
function rowToConversation(r: any, agentIds: string[]): Conversation {
  return {
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id || null,
    sessionCode: r.session_code || undefined,
    currentAgentId: r.current_agent_id || r.agent_id || agentIds[0] || '',
    currentAgentCode: r.current_agent_code || undefined,
    agentIds,
    agentId: agentIds[0] ?? "",   // 兼容旧字段
    title: r.title,
    status: (r.status as 'in_progress' | 'completed' | 'archived' | 'deleted') || 'in_progress',
    scopeType: (r.scope_type as Conversation['scopeType']) || 'user',
    scopeId: r.scope_id || '',
    memoryPolicy: (r.memory_policy as Conversation['memoryPolicy']) || 'private',
    summary: r.summary || '',
    lastMessageAt: r.last_message_at || undefined,
    userId: r.user_id || '',
    createdBy: r.created_by || null,
    createdAt: r.created_at,
  };
}

import { IdGenerator } from '../utils/IdGenerator';

/**
 * 兼容旧数据:若传入的是 OpenClaw agentId,则尝试反查回 RepaceClaw agent UUID。
 * 新逻辑统一在 conversations.current_agent_id 中存 RepaceClaw agent UUID。
 */
function resolveBusinessAgentId(agentId: string): string {
  // Phase 2:优先兼容 UUID / agent_code,再兼容历史 OpenClaw agentId。
  const byId = AgentService.getByIdOrCode(agentId);
  if (byId) return byId.id;

  const byOcAgentId = AgentService.getByOpenClawAgentId(agentId);
  if (byOcAgentId) return byOcAgentId.id;

  return agentId;
}

export const ConversationService = {
  list(userId?: string, projectId?: string): Conversation[] {
    const db = getDb();
    let sql = "SELECT * FROM conversations";
    const params: any[] = [];
    const conditions: string[] = [];
    if (userId) {
      conditions.push("user_id = ?");
      params.push(userId);
    }
    if (projectId) {
      conditions.push("project_id = ?");
      params.push(projectId);
    }
    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY created_at DESC";
    const rows = execToRows(db, sql, params.length ? params : undefined);
    if (!rows.length) return [];
    const agentMap = fetchAgentIdsMap(db, rows.map((r) => r.id));
    return rows.map((r) => rowToConversation(r, agentMap.get(r.id) ?? []));
  },

  getById(id: string, userId?: string): Conversation | null {
    const db = getDb();
    let sql = "SELECT * FROM conversations WHERE id=?";
    const params: any[] = [id];
    if (userId) {
      sql = "SELECT * FROM conversations WHERE id=? AND user_id=?";
      params.push(userId);
    }
    const rows = execToRows(db, sql, params);
    if (!rows.length) return null;
    const r = rows[0];
    const agentMap = fetchAgentIdsMap(db, [r.id]);
    return rowToConversation(r, agentMap.get(r.id) ?? []);
  },

  /**
   * Dual-code Phase 2:接口层允许同时传 conversation.id 或 session_code。
   * session_code 当前按设计全局唯一,因此可直接解析。
   */
  getByIdOrCode(idOrCode: string, userId?: string): Conversation | null {
    const byId = this.getById(idOrCode, userId);
    if (byId) return byId;

    const db = getDb();
    let sql = "SELECT * FROM conversations WHERE session_code=?";
    const params: any[] = [idOrCode];
    if (userId) {
      sql = "SELECT * FROM conversations WHERE session_code=? AND user_id=?";
      params.push(userId);
    }
    const rows = execToRows(db, sql, params);
    if (!rows.length) return null;
    const r = rows[0];
    const agentMap = fetchAgentIdsMap(db, [r.id]);
    return rowToConversation(r, agentMap.get(r.id) ?? []);
  },

  /** 将 conversation UUID/session_code 统一解析成真实底层主键。 */
  resolveId(idOrCode: string, userId?: string): string | null {
    return this.getByIdOrCode(idOrCode, userId)?.id || null;
  },

  /**
   * 创建会话,支持多智能体
   * @param agentIds 参与此会话的智能体 id 列表,至少 1 个
   * @param taskId 关联的任务 id(可选)
   * @param createdBy 创建人 id(可选)
   */
  create(data: { agentIds: string[]; projectId?: string; taskId?: string; title?: string; createdBy?: string; userId?: string; currentAgentId?: string; scopeType?: Conversation['scopeType']; scopeId?: string; memoryPolicy?: Conversation['memoryPolicy'] }): Conversation {
    const db = getDb();
    // Dual-code Phase 1:先在现有结构上开始双写业务编码,不一次性推翻会话主键。
    // 注意:当前 conversation.id 仍沿用既有行为(很多前端/恢复逻辑依赖它),
    // sessionCode 才是后续要对齐 taskCode 的业务会话编码。
    const userUuid = data.userId || '';
    const userCodeRow = userUuid ? execToRows(db, "SELECT user_code FROM users WHERE id=?", [userUuid])[0] : null;
    // Phase 2:taskId 入参既可能是 UUID,也可能已经是 task_code。
    // 统一先解析出真实 task UUID,再决定 sessionCode 应复用哪个业务码。
    const resolvedTask = data.taskId ? TaskService.getByIdOrCode(data.taskId) : null;
    const sessionCode = resolvedTask?.taskCode || data.taskId || IdGenerator.taskCode(userCodeRow?.user_code || IdGenerator.userCode());
    const taskId = resolvedTask?.id || null;
    // 关键修复：无 taskId 的普通会话也必须有真实 conversation.id。
    // 之前这里直接把 taskId 赋给 conversationId，导致未绑定任务的前台新会话 id 变成 null，
    // 后续所有 /conversations/:id/... 接口都会落成 /conversations/null/...，表现为“创建了但不生效”。
    const conversationId = taskId || uuidv4();
    const now = new Date().toISOString();
    const title = data.title || "新对话";
    // currentAgentId 统一存 RepaceClaw agent UUID(兼容传入旧的 OpenClaw agentId)
    const currentAgentId = data.currentAgentId
      ? resolveBusinessAgentId(data.currentAgentId)
      : resolveBusinessAgentId(data.agentIds[0] || '');
    const currentAgent = AgentService.getById(currentAgentId);
    // 业务当前智能体编码 = sessionCode + agentCode
    // 这样日志里不用再到处拼 UUID,就能直接看出"哪个会话里的哪个智能体"。
    const currentAgentCode = currentAgent?.agentCode ? IdGenerator.currentAgentCode(sessionCode, currentAgent.agentCode) : '';
    const agentIdStr = JSON.stringify(data.agentIds);
    const scopeType = data.scopeType || 'user';
    const scopeId = data.scopeId ?? userUuid;
    const memoryPolicy = data.memoryPolicy || 'private';
    db.run(
      `INSERT INTO conversations (id, project_id, task_id, session_code, current_agent_id, current_agent_code, title, status, created_by, user_id, agent_id, agent_ids, scope_type, scope_id, memory_policy, summary, last_message_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [conversationId, data.projectId || null, taskId, sessionCode, currentAgentId, currentAgentCode, title, 'in_progress', data.createdBy || null, userUuid, currentAgentId, agentIdStr, scopeType, scopeId, memoryPolicy, '', '', now]
    );
    // 写入关联表(统一存 RepaceClaw agent UUID)
    for (const agentId of data.agentIds.map(resolveBusinessAgentId)) {
      db.run(
        `INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id, joined_at) VALUES (?,?,?)`,
        [conversationId, agentId, now]
      );
    }
    saveDb();
    return rowToConversation(
      { id: conversationId, project_id: data.projectId || null, task_id: taskId, session_code: sessionCode, current_agent_id: currentAgentId, current_agent_code: currentAgentCode, title, status: 'in_progress', scope_type: scopeType, scope_id: scopeId, memory_policy: memoryPolicy, summary: '', last_message_at: '', user_id: userUuid, created_by: data.createdBy || null, created_at: now },
      data.agentIds.map(resolveBusinessAgentId)
    );
  },

  /**
   * 切换当前会话的 Agent
   */
  /**
   * 切换当前会话的 Agent
   *
   * ⚠️ 关键业务规则：会话内切换 agent 是“替换”而非“追加”。
   * 只更新 current_agent_id/current_agent_code，不新建 Session，不新增参与者。
   *
   * conversation_agents 关联表用于记录“曾经参与过的 agent 历史”，
   * 但切换 agent 时要把旧的删掉、只保留新 agent，
   * 否则 rowToConversation 读 agentIds 时会返回多个 agent，
   * 前端 SessionAgentBar 就会同时显示两个智能体——这是之前反复出现的回归 BUG。
   */
  switchAgent(conversationId: string, agentId: string): boolean {
    const db = getDb();
    const businessAgentId = resolveBusinessAgentId(agentId);
    const conv = this.getById(conversationId);
    const agent = AgentService.getById(businessAgentId);
    const currentAgentCode = conv?.sessionCode && agent?.agentCode
      ? IdGenerator.currentAgentCode(conv.sessionCode, agent.agentCode)
      : '';

    // 1) 更新 current_agent_id/current_agent_code/agent_id
    db.run(
      `UPDATE conversations SET current_agent_id = ?, current_agent_code = ?, agent_id = ? WHERE id = ?`,
      [businessAgentId, currentAgentCode, businessAgentId, conversationId]
    );
    const mainChanges = db.getRowsModified(); // ✅ 立即捕获主更新的行数

    // 2) 清理旧 agent，只保留新 agent（防止 conversation_agents 积累多个 agent 导致前端显示两个智能体）
    db.run(`DELETE FROM conversation_agents WHERE conversation_id = ?`, [conversationId]);
    db.run(
      `INSERT INTO conversation_agents (conversation_id, agent_id, joined_at) VALUES (?,?,?)`,
      [conversationId, businessAgentId, new Date().toISOString()]
    );

    // 3) 同步 agent_ids 快照列
    syncConversationAgentSnapshot(db, conversationId);

    saveDb();
    // ✅ 使用主更新的行数判断成功，或简单地返回 true（因为前置校验已确保 conv/agent 存在）
    return mainChanges > 0;
  },

  /**
   * 更新会话信息(标题、项目关联等)
   */
  update(id: string, data: { title?: string; projectId?: string | null; taskId?: string | null; scopeType?: Conversation['scopeType']; scopeId?: string; memoryPolicy?: Conversation['memoryPolicy']; summary?: string }): Conversation | null {
    const db = getDb();
    const existing = this.getById(id);
    if (!existing) return null;
    const title = data.title ?? existing.title;
    const projectId = data.projectId !== undefined ? data.projectId : existing.projectId;
    const taskId = data.taskId !== undefined ? data.taskId : existing.taskId;
    const scopeType = data.scopeType ?? existing.scopeType;
    const scopeId = data.scopeId !== undefined ? data.scopeId : existing.scopeId;
    const memoryPolicy = data.memoryPolicy ?? existing.memoryPolicy;
    const summary = data.summary !== undefined ? data.summary : existing.summary;
    db.run("UPDATE conversations SET title=?, project_id=?, task_id=?, scope_type=?, scope_id=?, memory_policy=?, summary=? WHERE id=?", [title, projectId, taskId, scopeType, scopeId, memoryPolicy, summary, id]);
    saveDb();
    return this.getById(id);
  },

  /**
   * 向已有会话追加新的参与智能体(幂等,已存在则忽略)
   */
  addAgent(conversationId: string, agentId: string): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.run(
      `INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id, joined_at) VALUES (?,?,?)`,
      [conversationId, agentId, now]
    );
    syncConversationAgentSnapshot(db, conversationId);
    saveDb();
  },

  /**
   * 从会话中移除某个智能体
   */
  removeAgent(conversationId: string, agentId: string): void {
    const db = getDb();
    db.run(
      `DELETE FROM conversation_agents WHERE conversation_id=? AND agent_id=?`,
      [conversationId, agentId]
    );
    const agentIds = syncConversationAgentSnapshot(db, conversationId);

    // 兼容字段兜底:若移除的是当前 agent,需要把 current_agent_id / agent_id 切到剩余列表的第一个,避免悬空。
    const conv = this.getById(conversationId);
    if (conv && conv.currentAgentId === agentId) {
      const fallbackAgentId = agentIds[0] || '';
      const fallbackAgent = fallbackAgentId ? AgentService.getById(fallbackAgentId) : null;
      const fallbackAgentCode = conv.sessionCode && fallbackAgent?.agentCode
        ? IdGenerator.currentAgentCode(conv.sessionCode, fallbackAgent.agentCode)
        : '';
      db.run(
        `UPDATE conversations SET current_agent_id=?, current_agent_code=?, agent_id=? WHERE id=?`,
        [fallbackAgentId, fallbackAgentCode, fallbackAgentId, conversationId]
      );
    }
    saveDb();
  },

  delete(id: string): boolean {
    const db = getDb();
    // 先检查是否存在
    const existing = db.exec("SELECT id FROM conversations WHERE id=?", [id]);
    if (!existing.length || !existing[0].values.length) return false;

    // sql.js 的 db.run() 不返回 changes,用 getRowsModified() 确认
    db.run("DELETE FROM conversations WHERE id=?", [id]);
    const changes = db.getRowsModified();
    saveDb();
    return changes > 0;
  },

  getMessages(conversationId: string): Message[] {
    const db = getDb();
    const rows = execToRows(
      db,
      "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC",
      [conversationId]
    );
    return rows.map((r) => ({
      id: r.id,
      messageCode: r.message_code || undefined,
      conversationId: r.conversation_id,
      role: r.role as "user" | "agent",
      content: r.content,
      agentId: r.agent_id || undefined,
      tokenCount: r.token_count ?? 0,
      createdAt: r.created_at,
    }));
  },

  addMessage(data: {
    conversationId: string;
    role: "user" | "agent";
    content: string;
    agentId?: string;
    /** 本次调用实际消耗 token 数,agent 消息时由 AutoLLMAdapter 传入 */
    tokenCount?: number;
  }): Message {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const tokenCount = data.tokenCount ?? 0;
    // Dual-code Phase 1:消息开始双写 message_code。
    // 不改变底层消息主键 id(UUID),只新增业务消息编码,便于后续会话级排障与展示。
    const conv = this.getById(data.conversationId);
    const existingCount = execToRows(db, "SELECT COUNT(1) as c FROM messages WHERE conversation_id=?", [data.conversationId])[0]?.c ?? 0;
    const messageCode = conv?.sessionCode ? IdGenerator.messageCode(conv.sessionCode, Number(existingCount) + 1) : '';
    db.run(
      `INSERT INTO messages (id, message_code, conversation_id, role, content, agent_id, token_count, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, messageCode, data.conversationId, data.role, data.content, data.agentId || null, tokenCount, now]
    );
    db.run(
      `UPDATE conversations SET last_message_at=? WHERE id=?`,
      [now, data.conversationId]
    );
    saveDb();
    return {
      id,
      messageCode: messageCode || undefined,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      agentId: data.agentId,
      tokenCount,
      createdAt: now,
    };
  },

  /**
   * 更新会话状态：in_progress | completed | archived
   */
  updateStatus(id: string, status: 'in_progress' | 'completed' | 'archived' | 'deleted'): Conversation | null {
    const db = getDb();
    const existing = this.getById(id);
    if (!existing) return null;
    db.run("UPDATE conversations SET status=? WHERE id=?", [status, id]);
    saveDb();
    return this.getById(id);
  },

  getSessionIndex(userId?: string) {
    const db = getDb();
    const rows = execToRows(
      db,
      `SELECT
         c.*, 
         (SELECT COUNT(1) FROM messages m WHERE m.conversation_id = c.id) as message_count,
         (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message
       FROM conversations c
       ${userId ? 'WHERE c.user_id = ?' : ''}
       ORDER BY COALESCE(NULLIF(c.last_message_at, ''), c.created_at) DESC`,
      userId ? [userId] : undefined
    );
    if (!rows.length) return [];
    const agentMap = fetchAgentIdsMap(db, rows.map((r) => r.id));
    return rows.map((r) => {
      const conv = rowToConversation(r, agentMap.get(r.id) ?? []);
      return {
        id: conv.id,
        title: conv.title,
        agentId: conv.agentId,
        currentAgentId: conv.currentAgentId,
        agentIds: conv.agentIds,
        sessionCode: conv.sessionCode,
        currentAgentCode: conv.currentAgentCode,
        ocSessionKey: r.oc_session_key || undefined,
        createdAt: conv.createdAt,
        updatedAt: conv.lastMessageAt || conv.createdAt,
        userId: r.user_id || '',
        messageCount: Number(r.message_count || 0),
        lastMessage: String(r.last_message || '').substring(0, 200),
        status: conv.status,
        scopeType: conv.scopeType,
        scopeId: conv.scopeId,
        memoryPolicy: conv.memoryPolicy,
        summary: conv.summary,
      };
    });
  },

  /**
   * 绑定 RC 会话与 OpenClaw session key。
   *
   * 关键原因：RC 只在 conversations 里存 UUID 不够，
   * OpenClaw 还需要一个带 agent 前缀的 session key 才能落到正确 agent 目录。
   * 这里同时更新：
   * 1) conversations.oc_session_key（当前主映射，便于排障）
   * 2) session_mapping（允许一个 RC conversation 对应多个 OC agent session）
   */
  bindOpenClawSession(conversationId: string, ocSessionKey: string, agentId: string, agentIds?: string[]): void {
    const db = getDb();
    const now = new Date().toISOString();
    const normalizedAgentIds = Array.from(new Set((agentIds && agentIds.length ? agentIds : [agentId]).filter(Boolean)));

    db.run(
      `UPDATE conversations SET oc_session_key=? WHERE id=?`,
      [ocSessionKey, conversationId]
    );

    const existing = execToRows(
      db,
      `SELECT id FROM session_mapping WHERE oc_session_key=?`,
      [ocSessionKey]
    )[0];

    if (existing?.id) {
      db.run(
        `UPDATE session_mapping
         SET conversation_id=?, agent_id=?, agent_ids=?, channel='repaceclaw', updated_at=?
         WHERE oc_session_key=?`,
        [conversationId, agentId, JSON.stringify(normalizedAgentIds), now, ocSessionKey]
      );
    } else {
      db.run(
        `INSERT INTO session_mapping
         (id, oc_session_key, conversation_id, session_file, agent_id, agent_ids, channel, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), ocSessionKey, conversationId, '', agentId, JSON.stringify(normalizedAgentIds), 'repaceclaw', now, now]
      );
    }

    saveDb();
  },
};
