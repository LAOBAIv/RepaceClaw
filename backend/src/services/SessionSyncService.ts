/**
 * SessionSyncService - OpenClaw 会话同步到 RepaceClaw 数据库
 * 
 * 功能：
 * 1. 扫描 ~/.openclaw/agents/main/sessions/*.jsonl
 * 2. 解析每个 session 的元数据和消息
 * 3. 同步到 conversations 表（如果不存在）
 * 4. 创建 session_mapping 映射记录
 * 5. 返回同步后的会话列表
 */
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const OPENCLAW_SESSIONS_DIR = path.join(
  process.env.HOME || '/root',
  '.openclaw/agents/main/sessions'
);
const SESSIONS_INDEX_FILE = path.join(OPENCLAW_SESSIONS_DIR, 'sessions.json');
const DB_PATH = path.join(__dirname, '../../data/platform.db');

export interface OpenClawSessionMeta {
  sessionKey: string;
  sessionId: string;
  sessionFile: string;
  updatedAt: number;
  agentName?: string;
  title?: string;
  messageCount: number;
  firstMessage?: string;
  lastMessage?: string;
}

/** 从 JSONL 消息内容中提取纯文本 */
function extractMessageContent(content: unknown): string { // [2026-05-24] 类型安全
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c: unknown) => (typeof c === 'object' && c !== null && 'text' in c ? String((c as Record<string, unknown>).text) : '')) // [2026-05-24] 类型安全
      .join('')
      .replace(/\[.*?\]/g, '')
      .trim();
  }
  return '';
}

/** 从 JSONL 文件提取会话元数据 */
function parseSessionFile(filePath: string): { title?: string; agentName?: string; firstMessage?: string; lastMessage?: string; messageCount: number } {
  if (!fs.existsSync(filePath)) {
    return { messageCount: 0 };
  }

  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean);
  let firstUserMessage = '';
  let lastAssistantMessage = '';
  let messageCount = 0;

  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      
      if (msg.type === 'message' && msg.message) {
        messageCount++;
        const content = extractMessageContent(msg.message.content);
        
        if (msg.message.role === 'user' && !firstUserMessage && content.length > 10) {
          firstUserMessage = content.substring(0, 100);
        }
        
        if (msg.message.role === 'assistant' && content) {
          lastAssistantMessage = content.substring(0, 200);
        }
      }
    } catch (err) { logger.warn(`[SessionSync] Failed to extract first user message: ${err}`); }
  }

  // 用第一条用户消息作为标题
  const title = firstUserMessage ? firstUserMessage.substring(0, 50) : '新会话';

  return {
    title,
    agentName: '',
    firstMessage: firstUserMessage,
    lastMessage: lastAssistantMessage,
    messageCount,
  };
}

/** 扫描 OpenClaw sessions 目录，解析元数据 */
export function scanOpenClawSessions(): OpenClawSessionMeta[] {
  if (!fs.existsSync(SESSIONS_INDEX_FILE)) return [];
  
  let index: Record<string, { sessionFile: string; sessionId: string; updatedAt?: number }>;
  try {
    index = JSON.parse(fs.readFileSync(SESSIONS_INDEX_FILE, 'utf-8'));
  } catch {
    return [];
  }

  const sessions: OpenClawSessionMeta[] = [];

  for (const [sessionKey, e] of Object.entries(index)) {
    const filePath = e.sessionFile;
    const meta = parseSessionFile(filePath);

    sessions.push({
      sessionKey,
      sessionId: e.sessionId,
      sessionFile: filePath,
      updatedAt: e.updatedAt || 0,
      messageCount: meta.messageCount,
      agentName: meta.agentName,
      title: meta.title,
      firstMessage: meta.firstMessage,
      lastMessage: meta.lastMessage,
    });
  }

  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  return sessions;
}

// [2026-05-24] 类型安全：better-sqlite3 Database 最小接口
interface BetterSqlite3Db {
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  run(sql: string, params?: unknown[]): void;
  prepare(sql: string): { get(params?: unknown[]): unknown | undefined; all(params?: unknown[]): unknown[] };
  getRowsModified(): number;
}

/** 同步 OpenClaw sessions 到 RepaceClaw DB（接收 db 实例作为参数） */
export function syncToDatabase(db: BetterSqlite3Db, userId: string = ''): { synced: number; total: number; errors: string[] } { // [2026-05-24] 类型安全
  const openClawSessions = scanOpenClawSessions();
  let synced = 0;
  const errors: string[] = [];

  for (const session of openClawSessions) {
    try {
      const existingMapping = db.prepare(
        "SELECT conversation_id FROM session_mapping WHERE oc_session_key = ?"
      ).get([session.sessionKey]) as { conversation_id: string } | undefined;

      let conversationId: string;
      const title = session.title || '新会话';
      const now = new Date().toISOString();
      const updatedAt = new Date(session.updatedAt).toISOString();

      if (existingMapping) {
        conversationId = existingMapping.conversation_id;
        db.run(
          `UPDATE conversations SET title = ?, oc_session_key = ? WHERE id = ?`,
          [title, session.sessionKey, conversationId]
        );
        db.run(
          `UPDATE session_mapping SET conversation_id = ?, session_file = ?, updated_at = ? WHERE oc_session_key = ?`,
          [conversationId, session.sessionFile, now, session.sessionKey]
        );
      } else {
        conversationId = session.sessionId;
        db.run(
          `INSERT OR IGNORE INTO conversations 
           (id, title, oc_session_key, created_at, user_id)
           VALUES (?, ?, ?, ?, ?)`,
          [conversationId, title, session.sessionKey, now, userId]
        );
        const mappingId = `map_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        db.run(
          `INSERT OR IGNORE INTO session_mapping 
           (id, oc_session_key, conversation_id, session_file, agent_id, agent_ids, created_at, updated_at)
           VALUES (?, ?, ?, ?, '', '[]', ?, ?)`,
          [mappingId, session.sessionKey, conversationId, session.sessionFile, now, now]
        );
      }

      synced++;
    } catch (err: unknown) {
      // [2026-05-24] 类型安全：any → unknown
      errors.push(`${session.sessionKey.slice(-8)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { synced, total: openClawSessions.length, errors };
}

/** 获取合并后的会话列表 — 通过 conversation_agents 关联表获取 agentIds */
export function getAllSessions(db: BetterSqlite3Db, userId: string = '') { // [2026-05-24] 类型安全
  const rows = db.exec(`
    SELECT 
      c.id, c.title, c.oc_session_key as ocSessionKey,
      c.created_at as createdAt, c.user_id as userId,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as messageCount,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as lastMessage
    FROM conversations c
    WHERE c.user_id = ? OR c.user_id = ''
    ORDER BY c.created_at DESC
  `, [userId]);

  if (!rows[0]?.values?.length) return [];

  const sessions = (rows[0]?.values || []).map(row => {
    const obj: Record<string, unknown> = {}; // [2026-05-24] 类型安全
    const cols = rows[0].columns;
    cols.forEach((c, i) => { obj[c] = row[i]; });
    obj.lastMessage = obj.lastMessage ? String(obj.lastMessage).substring(0, 200) : '';
    return obj;
  });

  // 批量查询 agentIds
  const convIds = sessions.map((s: Record<string, unknown>) => s.id as string); // [2026-05-24] 类型安全
  const placeholders = convIds.map(() => "?").join(",");
  try {
    const agentRows = db.prepare(
      `SELECT conversation_id, agent_id FROM conversation_agents WHERE conversation_id IN (${placeholders}) ORDER BY joined_at ASC`
    ).all(convIds) as Array<{ conversation_id: string; agent_id: string }>;
    const agentMap = new Map<string, string[]>();
    for (const ar of agentRows) {
      if (!agentMap.has(ar.conversation_id)) agentMap.set(ar.conversation_id, []);
      agentMap.get(ar.conversation_id)!.push(ar.agent_id);
    }
    for (const s of sessions) {
      (s as Record<string, unknown>).agentIds = agentMap.get(s.id as string) || []; // [2026-05-24] 类型安全
      (s as Record<string, unknown>).agentId = ((s as Record<string, unknown>).agentIds as string[])[0] || '';
    }
  } catch {
    // conversation_agents 表不存在时，返回空数组
    for (const s of sessions) {
      (s as Record<string, unknown>).agentIds = []; // [2026-05-24] 类型安全
      (s as Record<string, unknown>).agentId = '';
    }
  }

  return sessions;
}
