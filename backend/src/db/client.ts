// Database client using sql.js (pure JS SQLite, no native build needed)
import initSqlJs, { Database } from "sql.js";
import path from "path";
import fs from "fs";
import { dbConfig } from "./config";
import { IdGenerator } from "../utils/IdGenerator";

let db: any;
const DB_PATH = path.join(__dirname, "../../data/platform.db");

/** 统一初始化入口：根据 DB_TYPE 选择驱动 */
export async function initDb(): Promise<any> {
  // PostgreSQL 模式
  if (dbConfig.type === "postgres") {
    const { initPostgresSync } = await import("./postgres");
    const pgDb = await initPostgresSync();
    // 将 pgDb 挂载到全局 _pgDb，供 getDb() 返回
    (globalThis as any).__pgDb = pgDb;
    return pgDb;
  }

  // SQLite 模式（默认）
  if (db) return db;

  const SQL = await initSqlJs();

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL mode (journaling for sql.js not needed, skip)
  db.run("PRAGMA journal_mode = MEMORY;");
  db.run("PRAGMA foreign_keys = ON;");

  createTables(db);
  // Seed default skills & plugins on first run (idempotent — skips if already present)
  seedDefaultData(db);
  // Dual-code Phase 1: 回填 *_code 字段，但不动现有 UUID 主键关系。
  // 目标是让“新数据开始双写、老数据尽快可读”，同时避免一次性大迁移把现网跑挂。
  backfillBusinessCodes(db);
  saveDb();
  return db;
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

function createTables(db: any) {
  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366F1',
      system_prompt TEXT NOT NULL DEFAULT '',
      writing_style TEXT NOT NULL DEFAULT 'balanced',
      expertise TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'idle',
      model_name TEXT NOT NULL DEFAULT '',
      model_provider TEXT NOT NULL DEFAULT '',
      temperature REAL NOT NULL DEFAULT 0.7,
      max_tokens INTEGER NOT NULL DEFAULT 4096,
      top_p REAL NOT NULL DEFAULT 1,
      frequency_penalty REAL NOT NULL DEFAULT 0,
      presence_penalty REAL NOT NULL DEFAULT 0,
      token_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  // Migrate: add columns if they don't exist (idempotent)
  try { db.run("ALTER TABLE agents ADD COLUMN description TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN status TEXT NOT NULL DEFAULT 'idle'"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN model_name TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN model_provider TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN temperature REAL NOT NULL DEFAULT 0.7"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN max_tokens INTEGER NOT NULL DEFAULT 4096"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN top_p REAL NOT NULL DEFAULT 1"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN frequency_penalty REAL NOT NULL DEFAULT 0"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN presence_penalty REAL NOT NULL DEFAULT 0"); } catch {}
  // Migrate: add user_id to agents (Phase 1: 多租户隔离)
  try { db.run("ALTER TABLE agents ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"); } catch {}
  // Dual-code Phase 1: agent_code 作为业务智能体编码，底层主键仍保留 id(UUID)
  try { db.run("ALTER TABLE agents ADD COLUMN agent_code TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_user_agent_code ON agents(user_id, agent_code)"); } catch {}
  // Token 接入字段：用户为该智能体配置的私有 API Key
  try { db.run("ALTER TABLE agents ADD COLUMN token_provider TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN token_api_key TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN token_base_url TEXT NOT NULL DEFAULT ''"); } catch {}
  // 输出格式 & 能力边界（2026-03 新增）
  try { db.run("ALTER TABLE agents ADD COLUMN output_format TEXT NOT NULL DEFAULT '纯文本'"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN boundary TEXT NOT NULL DEFAULT ''"); } catch {}
  // 对话记忆轮数（0 = 不限）；temperature_override 为简单温度快捷覆盖（空字符串表示使用模型默认）
  try { db.run("ALTER TABLE agents ADD COLUMN memory_turns INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN temperature_override REAL DEFAULT NULL"); } catch {}
  // Token 用量统计：累计该智能体消耗的 token 总数（每次 agent 回复后累加）
  try { db.run("ALTER TABLE agents ADD COLUMN token_used INTEGER NOT NULL DEFAULT 0"); } catch {}

  // Phase 3: Agent 可见性 / Skill 管控 / 配额
  try { db.run("ALTER TABLE agents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN skills_config TEXT NOT NULL DEFAULT '{}'"); } catch {}
  try { db.run("ALTER TABLE agents ADD COLUMN quota_config TEXT NOT NULL DEFAULT '{}'"); } catch {}
  // Route C Phase 1: Agent 桥接层 — OpenClaw agentId 映射
  try { db.run("ALTER TABLE agents ADD COLUMN openclaw_agent_id TEXT"); } catch {}
  // RC 分类 -> OC 执行桶。历史库若缺失此列，会导致 /api/agents/routing-overview 与编辑更新链直接报错。
  try { db.run("ALTER TABLE agents ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'general'"); } catch {}

  // Route C Phase 1: Agent 注册日志表

  // Migrate: add user_id to token_channels (Phase 2: 多租户隔离)
  try { db.run("ALTER TABLE token_channels ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"); } catch {}
  // Migrate: add is_preset (标记平台预设渠道)
  try { db.run("ALTER TABLE token_channels ADD COLUMN is_preset INTEGER NOT NULL DEFAULT 0"); } catch {}

  // Token channels: stores API keys for each LLM provider
  db.run(`
    CREATE TABLE IF NOT EXISTS token_channels (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model_name TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      auth_type TEXT NOT NULL DEFAULT 'Bearer',
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      goal TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'mid',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      decision_maker TEXT NOT NULL DEFAULT '',
      workflow_nodes TEXT NOT NULL DEFAULT '[]',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Migrate: add user_id to projects (Phase 2: 多租户隔离)
  try { db.run("ALTER TABLE projects ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"); } catch {}
  // Migrate: add workflow columns to existing projects table (idempotent)
  try { db.run("ALTER TABLE projects ADD COLUMN goal TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE projects ADD COLUMN priority TEXT NOT NULL DEFAULT 'mid'"); } catch {}
  try { db.run("ALTER TABLE projects ADD COLUMN start_time TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE projects ADD COLUMN end_time TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE projects ADD COLUMN decision_maker TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE projects ADD COLUMN workflow_nodes TEXT NOT NULL DEFAULT '[]'"); } catch {}
  try { db.run("ALTER TABLE projects ADD COLUMN created_by TEXT"); } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      column_id TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'mid',
      tags TEXT NOT NULL DEFAULT '[]',
      agent TEXT NOT NULL DEFAULT '',
      agent_color TEXT NOT NULL DEFAULT '#6366F1',
      agent_id TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      comment_count INTEGER NOT NULL DEFAULT 0,
      file_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  // Migrate: add user_id to tasks (Phase 2: 多租户隔离)
  try { db.run("ALTER TABLE tasks ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"); } catch {}
  // Dual-code Phase 1: task_code 作为业务任务编码（session_code 将与之对齐）
  try { db.run("ALTER TABLE tasks ADD COLUMN task_code TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_code ON tasks(task_code)"); } catch {}
  // Migrate: add agent_id and created_by to existing tasks table (idempotent)
  try { db.run("ALTER TABLE tasks ADD COLUMN agent_id TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE tasks ADD COLUMN created_by TEXT"); } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      node_order INTEGER NOT NULL DEFAULT 0,
      assigned_agent_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      content TEXT NOT NULL,
      snapshot_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);

  // 文件资产表：按 user_id 做强隔离，承载上传文档元数据；原始文件落盘到 uploads/user_id/... 目录。
  db.run(`
    CREATE TABLE IF NOT EXISTS file_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT '',
      conversation_id TEXT NOT NULL DEFAULT '',
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      extension TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploaded',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  try { db.run("CREATE INDEX IF NOT EXISTS idx_file_assets_user_created ON file_assets(user_id, created_at)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_file_assets_project ON file_assets(project_id)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_file_assets_conversation ON file_assets(conversation_id)"); } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      task_id TEXT UNIQUE,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    )
  `);
  // Migrate: add user_id to conversations (Phase 1: 多租户隔离)
  try { db.run("ALTER TABLE conversations ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"); } catch {}
  // Migrate: add task_id and created_by columns (idempotent)
  try { db.run("ALTER TABLE conversations ADD COLUMN task_id TEXT UNIQUE"); } catch {}
  try { db.run("ALTER TABLE conversations ADD COLUMN created_by TEXT"); } catch {}
  // 兼容旧服务层：当前仍有创建/更新逻辑会写 conversations.agent_id / agent_ids 快照列。
  // 历史某些库是先建了精简版 conversations 表，再逐步演进；如果这里只补 current_agent_id 而没补旧快照列，
  // 会在创建平台助手等新会话时直接报 “table conversations has no column named agent_id / agent_ids”，表现为前端发送按钮可点、但会话永远发不出去。
  try { db.run("ALTER TABLE conversations ADD COLUMN agent_id TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE conversations ADD COLUMN agent_ids TEXT NOT NULL DEFAULT '[]'"); } catch {}
  try { db.run("ALTER TABLE conversations ADD COLUMN current_agent_id TEXT NOT NULL DEFAULT ''"); } catch {}
  // Dual-code Phase 1: session_code / current_agent_code 作为业务会话编码与业务当前智能体编码
  try { db.run("ALTER TABLE conversations ADD COLUMN session_code TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE conversations ADD COLUMN current_agent_code TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_conversations_session_code ON conversations(session_code)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_conversations_current_agent_code ON conversations(current_agent_code)"); } catch {}
  // Status: 会话状态（in_progress | completed | archived）
  try { db.run("ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress'"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)"); } catch {}
  // V1 Session 基础字段：为后续共享/独享、组织作用域、摘要聚合预留，但当前先只在会话层落结构。
  try { db.run("ALTER TABLE conversations ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'user'"); } catch {}
  try { db.run("ALTER TABLE conversations ADD COLUMN scope_id TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE conversations ADD COLUMN memory_policy TEXT NOT NULL DEFAULT 'private'"); } catch {}
  try { db.run("ALTER TABLE conversations ADD COLUMN summary TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("ALTER TABLE conversations ADD COLUMN last_message_at TEXT NOT NULL DEFAULT ''"); } catch {}
  // RC -> OC 会话绑定真相源。历史部分库缺这列，会导致 bindOpenClawSession() 在用户消息入库后直接抛错，
  // 表现为“自己的消息能看到，但智能体永远没回复”。
  try { db.run("ALTER TABLE conversations ADD COLUMN oc_session_key TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_conversations_oc_session_key ON conversations(oc_session_key)"); } catch {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_conversations_scope ON conversations(scope_type, scope_id)"); } catch {}

  // Migrate: drop old agent_id column (SQLite does not support DROP COLUMN before 3.35;
  // we simply ignore it — the column stays but is no longer used)
  // New designs read agent list from conversation_agents table instead.

  // conversation_agents: 一个会话可包含多个智能体（多对多关联）
  db.run(`
    CREATE TABLE IF NOT EXISTS conversation_agents (
      conversation_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (conversation_id, agent_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);

  // Migrate: populate conversation_agents from existing conversations.agent_id (idempotent)
  try {
    const existing = db.exec(`
      SELECT c.id as conv_id, c.agent_id, c.created_at
      FROM conversations c
      WHERE c.agent_id IS NOT NULL AND c.agent_id != ''
        AND NOT EXISTS (
          SELECT 1 FROM conversation_agents ca WHERE ca.conversation_id = c.id
        )
    `);
    if (existing.length && existing[0].values.length) {
      for (const row of existing[0].values) {
        const [convId, agentId, createdAt] = row as string[];
        db.run(
          `INSERT OR IGNORE INTO conversation_agents (conversation_id, agent_id, joined_at) VALUES (?,?,?)`,
          [convId, agentId, createdAt]
        );
      }
    }
  } catch { /* 旧库无 agent_id 列时静默跳过 */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agent_id TEXT,
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);
  // Migrate: add user_id to messages (Phase 1: 多租户隔离)
  try { db.run("ALTER TABLE messages ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"); } catch {}
  // Dual-code Phase 1: message_code 作为业务消息编码，底层主键仍为 id(UUID)
  try { db.run("ALTER TABLE messages ADD COLUMN message_code TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_code ON messages(message_code)"); } catch {}
  // Migrate: add token_count to existing messages table (idempotent)
  try { db.run("ALTER TABLE messages ADD COLUMN token_count INTEGER NOT NULL DEFAULT 0"); } catch {}

  // ── Audit Logs（操作审计日志）────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      action     TEXT NOT NULL,
      resource   TEXT NOT NULL,
      resource_id TEXT,
      detail     TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT,
      user_agent TEXT,
      request_id TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // ── Agent Registry Log（OpenClaw 注册日志）───────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_registry_log (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      action      TEXT NOT NULL,          -- register / unregister / update
      result      TEXT,
      created_at  TEXT NOT NULL
    )
  `);

  // ── Channel Accounts（渠道账号路由）─────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_accounts (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL DEFAULT '',
      agent_id    TEXT NOT NULL,
      channel     TEXT NOT NULL,          -- feishu / telegram / discord / whatsapp
      account_id  TEXT NOT NULL,          -- 渠道侧账号标识
      status      TEXT NOT NULL DEFAULT 'active',
      config      TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);

  // ── Agent Templates（agency-agents 导入的专业角色模板库）───────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'engineering',
      emoji TEXT NOT NULL DEFAULT '🤖',
      color TEXT NOT NULL DEFAULT '#6366F1',
      vibe TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      writing_style TEXT NOT NULL DEFAULT 'balanced',
      expertise TEXT NOT NULL DEFAULT '[]',
      output_format TEXT NOT NULL DEFAULT '纯文本',
      github_source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);

  // ── Bot Channels（飞书 / 企业微信 / 钉钉 Bot 接入）───────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS bot_channels (
      id TEXT PRIMARY KEY,
      channel_type TEXT NOT NULL,
      bot_id TEXT NOT NULL DEFAULT '',
      secret TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  // unique index: one row per channel_type
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS bot_channels_type ON bot_channels(channel_type)`);

  // ── Skills ──────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      type TEXT NOT NULL DEFAULT 'builtin',
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // agent_skills: 技能与智能体的关联表（多对多）
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_skills (
      agent_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      bound_at TEXT NOT NULL,
      PRIMARY KEY (agent_id, skill_id),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    )
  `);

  // ── Users ────────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      avatar TEXT NOT NULL DEFAULT '',
      last_login_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  // Dual-code Phase 1: user_code 作为 10 位业务用户编码，底层主键仍为 id(UUID)
  try { db.run("ALTER TABLE users ADD COLUMN user_code TEXT NOT NULL DEFAULT ''"); } catch {}
  try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_code ON users(user_code)"); } catch {}

  // ── V1 Organization / Permission Foundation ────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      department_code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      parent_id TEXT,
      owner_user_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_code ON departments(department_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_departments_parent_id ON departments(parent_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      role_code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      scope_type TEXT NOT NULL DEFAULT 'department',
      scope_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_code ON roles(role_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_roles_scope ON roles(scope_type, scope_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS permission_templates (
      id TEXT PRIMARY KEY,
      template_code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      template_type TEXT NOT NULL DEFAULT 'base',
      config_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_templates_code ON permission_templates(template_code)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_org_scope (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      department_id TEXT,
      role_id TEXT,
      permission_template_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      is_primary INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      joined_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL,
      FOREIGN KEY (permission_template_id) REFERENCES permission_templates(id) ON DELETE SET NULL
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_org_scope_unique ON user_org_scope(user_id, department_id, role_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_org_scope_user ON user_org_scope(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_org_scope_department ON user_org_scope(department_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_org_scope_role ON user_org_scope(role_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_proxy_grants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      grant_type TEXT NOT NULL DEFAULT 'use',
      scope_type TEXT NOT NULL DEFAULT 'direct',
      scope_id TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_proxy_grants_unique ON user_proxy_grants(user_id, agent_id, grant_type, scope_type, scope_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_proxy_grants_user ON user_proxy_grants(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_proxy_grants_agent ON user_proxy_grants(agent_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_data_grants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL DEFAULT '',
      grant_type TEXT NOT NULL DEFAULT 'read',
      scope_type TEXT NOT NULL DEFAULT 'direct',
      scope_id TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_grants_unique ON user_data_grants(user_id, resource_type, resource_id, grant_type, scope_type, scope_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_data_grants_user ON user_data_grants(user_id)`);

  // ── Plugins ─────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      author TEXT NOT NULL DEFAULT '',
      homepage TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      config TEXT NOT NULL DEFAULT '{}',
      manifest TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // agent_plugins: 插件与智能体的关联表（多对多）
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_plugins (
      agent_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      bound_at TEXT NOT NULL,
      PRIMARY KEY (agent_id, plugin_id),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
    )
  `);

  // ── Session Tabs（BrowserTab ↔ SessionTab 绑定关系）───────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS session_tabs (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL DEFAULT '',
      browser_tab_key TEXT NOT NULL,
      title           TEXT NOT NULL DEFAULT '',
      conversation_id TEXT NOT NULL DEFAULT '',
      agent_id        TEXT NOT NULL DEFAULT '',
      agent_name      TEXT NOT NULL DEFAULT '',
      color           TEXT NOT NULL DEFAULT '#9ca3af',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    )
  `);
  // 同一用户下 browser_tab_key 唯一
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS session_tabs_user_key ON session_tabs(user_id, browser_tab_key)`);

  // ── Session Mapping（OpenClaw session ↔ RepaceClaw conversation 映射）───
  db.run(`
    CREATE TABLE IF NOT EXISTS session_mapping (
      id              TEXT PRIMARY KEY,
      oc_session_key  TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL DEFAULT '',
      session_file    TEXT NOT NULL DEFAULT '',
      agent_id        TEXT NOT NULL DEFAULT '',
      agent_ids       TEXT NOT NULL DEFAULT '[]',
      channel         TEXT NOT NULL DEFAULT 'repaceclaw',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    )
  `);
  try { db.run("ALTER TABLE session_mapping ADD COLUMN channel TEXT NOT NULL DEFAULT 'repaceclaw'"); } catch {}
  db.run(`CREATE INDEX IF NOT EXISTS session_mapping_conv_id ON session_mapping(conversation_id)`);

  // ── 用量统计（配额限制基础）─────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS usage_stats (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL DEFAULT '',
      agent_id    TEXT NOT NULL DEFAULT '',
      date        TEXT NOT NULL,          -- YYYY-MM-DD
      tokens_used INTEGER NOT NULL DEFAULT 0,
      conv_count  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      UNIQUE(user_id, agent_id, date)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS usage_stats_date ON usage_stats(date)`);
}

// ── Dual-code backfill（idempotent）──────────────────────────────────────────
function backfillBusinessCodes(db: any) {
  // 设计原则：
  // 1) 只补业务码，不改 UUID 主键，不重写外键
  // 2) 幂等执行：重复启动不会重复生成已存在的业务码
  // 3) 旧数据优先复用已有 taskId 语义，减少会话链路抖动

  // users.user_code
  for (const row of execToRows(db, "SELECT id, user_code FROM users")) {
    if (!row.user_code) {
      let userCode = '';
      do {
        userCode = IdGenerator.userCode();
      } while (execToRows(db, "SELECT id FROM users WHERE user_code=? AND id<>?", [userCode, row.id]).length);
      db.run("UPDATE users SET user_code=? WHERE id=?", [userCode, row.id]);
    }
  }

  // agents.agent_code（同用户唯一）
  for (const row of execToRows(db, "SELECT id, user_id, agent_code FROM agents")) {
    if (!row.agent_code) {
      let agentCode = '';
      do {
        agentCode = IdGenerator.agentCode();
      } while (execToRows(db, "SELECT id FROM agents WHERE user_id=? AND agent_code=? AND id<>?", [row.user_id || '', agentCode, row.id]).length);
      db.run("UPDATE agents SET agent_code=? WHERE id=?", [agentCode, row.id]);
    }
  }

  // tasks.task_code
  // task_code 是后续 session_code 的来源，因此先补 task，再补 conversation。
  for (const row of execToRows(db, "SELECT id, user_id, task_code FROM tasks")) {
    if (!row.task_code) {
      const user = execToRows(db, "SELECT user_code FROM users WHERE id=?", [row.user_id || ''])[0];
      const userCode = user?.user_code || IdGenerator.userCode();
      let taskCode = '';
      do {
        taskCode = IdGenerator.taskCode(userCode);
      } while (execToRows(db, "SELECT id FROM tasks WHERE task_code=? AND id<>?", [taskCode, row.id]).length);
      db.run("UPDATE tasks SET task_code=? WHERE id=?", [taskCode, row.id]);
    }
  }

  // conversations.session_code / current_agent_code
  // 优先级：tasks.task_code > 历史业务 taskId > 重新生成。
  for (const row of execToRows(db, "SELECT id, user_id, task_id, session_code, current_agent_id, current_agent_code FROM conversations")) {
    let sessionCode = row.session_code || '';
    if (!sessionCode) {
      const task = row.task_id ? execToRows(db, "SELECT task_code FROM tasks WHERE id=?", [row.task_id])[0] : null;
      if (task?.task_code) {
        sessionCode = task.task_code;
      } else if (row.task_id && IdGenerator.validate.taskId(String(row.task_id))) {
        // 兼容历史过渡期：若 task_id 里存的就是旧业务 taskId，则直接复用为 session_code
        sessionCode = row.task_id;
      } else {
        const user = execToRows(db, "SELECT user_code FROM users WHERE id=?", [row.user_id || ''])[0];
        const userCode = user?.user_code || IdGenerator.userCode();
        sessionCode = IdGenerator.taskCode(userCode);
      }
      db.run("UPDATE conversations SET session_code=? WHERE id=?", [sessionCode, row.id]);
    }

    if (!row.current_agent_code && row.current_agent_id && sessionCode) {
      const agent = execToRows(db, "SELECT agent_code FROM agents WHERE id=?", [row.current_agent_id])[0];
      if (agent?.agent_code) {
        db.run("UPDATE conversations SET current_agent_code=? WHERE id=?", [IdGenerator.currentAgentCode(sessionCode, agent.agent_code), row.id]);
      }
    }
  }

  // messages.message_code（按 conversation_id + created_at 排序回填）
  // 只给仍然能找到所属 conversation 的消息回填；孤儿消息保持原状，避免误绑到错误会话。
  for (const conv of execToRows(db, "SELECT id, session_code FROM conversations WHERE session_code <> ''")) {
    const msgs = execToRows(db, "SELECT id, message_code FROM messages WHERE conversation_id=? ORDER BY created_at ASC, id ASC", [conv.id]);
    let seq = 1;
    for (const msg of msgs) {
      if (!msg.message_code) {
        db.run("UPDATE messages SET message_code=? WHERE id=?", [IdGenerator.messageCode(conv.session_code, seq), msg.id]);
      }
      seq += 1;
    }
  }
}

// ── Seed default data (idempotent: skip if already present) ─────────────────
function seedDefaultData(db: any) {
  const now = new Date().toISOString();

  // ── Default Skills ──────────────────────────────────────────────────────────
  const defaultSkills: Array<{
    id: string; name: string; description: string;
    category: string; type: string; config: string;
  }> = [
    {
      id: "skill-web-search",
      name: "网络搜索",
      description: "实时联网搜索，获取最新资讯、文档和数据。支持 Google / Bing / DuckDuckGo 等搜索引擎。",
      category: "search",
      type: "builtin",
      config: JSON.stringify({ engine: "google", maxResults: 10, safeSearch: true }),
    },
    {
      id: "skill-code-executor",
      name: "代码执行",
      description: "在沙箱环境中执行 Python / JavaScript 代码，返回运行结果。适合数据分析、脚本验证场景。",
      category: "code",
      type: "builtin",
      config: JSON.stringify({ timeout: 30, languages: ["python", "javascript"], sandbox: true }),
    },
    {
      id: "skill-image-understanding",
      name: "图像理解",
      description: "解析图片内容，支持 OCR 文字识别、图表分析、截图问答等视觉任务。",
      category: "vision",
      type: "builtin",
      config: JSON.stringify({ ocrEnabled: true, maxImageSizeMB: 10 }),
    },
    {
      id: "skill-file-reader",
      name: "文件读取",
      description: "读取并解析 PDF、Word、Excel、Markdown 等常见格式文档，提取结构化内容供 Agent 处理。",
      category: "data",
      type: "builtin",
      config: JSON.stringify({ supportedFormats: ["pdf","docx","xlsx","md","txt","csv"], maxFileSizeMB: 50 }),
    },
    {
      id: "skill-memory",
      name: "长期记忆",
      description: "将重要信息持久化存储，跨会话召回，让 Agent 记住用户偏好、项目上下文等关键知识。",
      category: "memory",
      type: "builtin",
      config: JSON.stringify({ maxMemories: 1000, similarityThreshold: 0.75 }),
    },
    {
      id: "skill-summarizer",
      name: "内容摘要",
      description: "对长文、会议记录、文档自动生成摘要，支持多种输出格式（要点列表、段落、思维导图）。",
      category: "text",
      type: "builtin",
      config: JSON.stringify({ maxInputTokens: 100000, outputFormats: ["bullets","paragraph","mindmap"] }),
    },
    {
      id: "skill-translator",
      name: "多语言翻译",
      description: "专业级多语言互译，支持 100+ 语言，保留原文格式与术语风格，适合文档本地化场景。",
      category: "text",
      type: "builtin",
      config: JSON.stringify({ supportedLangs: 100, preserveFormatting: true }),
    },
    {
      id: "skill-data-analysis",
      name: "数据分析",
      description: "对结构化数据（CSV/Excel/JSON）进行统计分析、趋势预测，并自动生成可视化图表。",
      category: "data",
      type: "builtin",
      config: JSON.stringify({ chartTypes: ["bar","line","pie","scatter","heatmap"], autoDetectSchema: true }),
    },
    {
      id: "skill-task-planner",
      name: "任务规划",
      description: "将复杂目标拆分为可执行子任务，自动分配优先级和依赖关系，输出结构化执行计划。",
      category: "planning",
      type: "builtin",
      config: JSON.stringify({ maxDepth: 5, planFormats: ["list","gantt","kanban"] }),
    },
    {
      id: "skill-browser-control",
      name: "浏览器操控",
      description: "自动化控制浏览器完成网页填写、点击、截图、抓取等操作，适合 RPA 和信息采集场景。",
      category: "automation",
      type: "builtin",
      config: JSON.stringify({ headless: true, timeout: 60, screenshotEnabled: true }),
    },
  ];

  for (const s of defaultSkills) {
    const exists = db.exec("SELECT id FROM skills WHERE id=?", [s.id]);
    if (exists.length && exists[0].values.length) continue; // already seeded
    db.run(
      `INSERT INTO skills (id, name, description, category, type, config, enabled, created_at, updated_at)
       VALUES (?,?,?,?,?,?,1,?,?)`,
      [s.id, s.name, s.description, s.category, s.type, s.config, now, now]
    );
  }

  // ── Default Plugins ─────────────────────────────────────────────────────────
  const defaultPlugins: Array<{
    id: string; name: string; description: string; version: string;
    author: string; homepage: string; icon: string;
    category: string; config: string; manifest: string;
  }> = [
    {
      id: "plugin-github",
      name: "GitHub",
      description: "连接 GitHub 仓库，支持代码检索、PR 审查、Issue 管理、Commit 查询等操作。",
      version: "1.2.0",
      author: "WorkBuddy",
      homepage: "https://github.com",
      icon: "github",
      category: "code",
      config: JSON.stringify({ accessToken: "", defaultOrg: "" }),
      manifest: JSON.stringify({
        actions: ["list_repos","get_file","create_issue","list_prs","comment_pr","search_code"]
      }),
    },
    {
      id: "plugin-notion",
      name: "Notion",
      description: "读写 Notion 数据库与页面，实现知识库同步、任务看板联动和内容自动整理。",
      version: "1.1.0",
      author: "WorkBuddy",
      homepage: "https://notion.so",
      icon: "notion",
      category: "productivity",
      config: JSON.stringify({ apiKey: "", defaultWorkspaceId: "" }),
      manifest: JSON.stringify({
        actions: ["query_database","create_page","update_page","append_block","search"]
      }),
    },
    {
      id: "plugin-slack",
      name: "Slack",
      description: "发送消息、创建频道、监听事件，让 Agent 直接在团队工作区中协作与通知。",
      version: "1.0.0",
      author: "WorkBuddy",
      homepage: "https://slack.com",
      icon: "slack",
      category: "communication",
      config: JSON.stringify({ botToken: "", signingSecret: "", defaultChannel: "" }),
      manifest: JSON.stringify({
        actions: ["send_message","list_channels","upload_file","get_thread"]
      }),
    },
    {
      id: "plugin-jira",
      name: "Jira",
      description: "与 Jira 项目看板对接，自动创建 Issue、更新状态、查询 Sprint 进度。",
      version: "1.0.0",
      author: "WorkBuddy",
      homepage: "https://atlassian.com/jira",
      icon: "jira",
      category: "project",
      config: JSON.stringify({ baseUrl: "", email: "", apiToken: "", projectKey: "" }),
      manifest: JSON.stringify({
        actions: ["create_issue","update_issue","list_issues","get_sprint","add_comment"]
      }),
    },
    {
      id: "plugin-google-calendar",
      name: "Google Calendar",
      description: "读取和创建日历事件，Agent 可自动安排会议、提醒和时间规划。",
      version: "1.0.0",
      author: "WorkBuddy",
      homepage: "https://calendar.google.com",
      icon: "calendar",
      category: "productivity",
      config: JSON.stringify({ clientId: "", clientSecret: "", calendarId: "primary" }),
      manifest: JSON.stringify({
        actions: ["list_events","create_event","update_event","delete_event","check_availability"]
      }),
    },
    {
      id: "plugin-email",
      name: "Email",
      description: "通过 SMTP/IMAP 发送和读取邮件，支持 HTML 模板、附件和自动回复。",
      version: "1.1.0",
      author: "WorkBuddy",
      homepage: "",
      icon: "mail",
      category: "communication",
      config: JSON.stringify({ smtpHost: "", smtpPort: 465, username: "", password: "", from: "" }),
      manifest: JSON.stringify({
        actions: ["send_email","read_inbox","search_emails","reply_email","mark_read"]
      }),
    },
    {
      id: "plugin-database-query",
      name: "数据库查询",
      description: "连接 MySQL / PostgreSQL / MongoDB，直接执行 SQL/查询语句，返回结构化数据。",
      version: "1.0.0",
      author: "WorkBuddy",
      homepage: "",
      icon: "database",
      category: "data",
      config: JSON.stringify({ dbType: "mysql", host: "", port: 3306, database: "", username: "", password: "" }),
      manifest: JSON.stringify({
        actions: ["execute_query","list_tables","describe_table","export_csv"]
      }),
    },
    {
      id: "plugin-http-request",
      name: "HTTP 请求",
      description: "向任意 REST / GraphQL API 发起请求，支持自定义 Header、Body 和认证方式，是打通外部系统的万能胶水。",
      version: "1.2.0",
      author: "WorkBuddy",
      homepage: "",
      icon: "globe",
      category: "tool",
      config: JSON.stringify({ defaultTimeout: 30, maxRetries: 3, followRedirects: true }),
      manifest: JSON.stringify({
        actions: ["get","post","put","patch","delete","graphql"]
      }),
    },
    {
      id: "plugin-weather",
      name: "天气查询",
      description: "获取全球实时天气和未来 15 天预报，支持按城市/坐标/IP 定位。",
      version: "1.0.0",
      author: "WorkBuddy",
      homepage: "https://openweathermap.org",
      icon: "cloud",
      category: "tool",
      config: JSON.stringify({ apiKey: "", units: "metric", defaultCity: "" }),
      manifest: JSON.stringify({
        actions: ["current_weather","forecast","hourly","air_quality"]
      }),
    },
    {
      id: "plugin-cron-trigger",
      name: "定时触发器",
      description: "使用 Cron 表达式定时触发 Agent 执行任务，支持复杂周期配置，适合报告生成、数据同步等场景。",
      version: "1.0.0",
      author: "WorkBuddy",
      homepage: "",
      icon: "clock",
      category: "automation",
      config: JSON.stringify({ timezone: "Asia/Shanghai", maxConcurrentJobs: 5 }),
      manifest: JSON.stringify({
        actions: ["create_job","update_job","delete_job","list_jobs","pause_job","resume_job"]
      }),
    },
    {
      id: "plugin-vector-store",
      name: "向量知识库",
      description: "将文档切片、向量化并存入知识库，支持语义检索，为 RAG 场景提供精准上下文。",
      version: "1.0.0",
      author: "WorkBuddy",
      homepage: "",
      icon: "layers",
      category: "data",
      config: JSON.stringify({ provider: "local", embeddingModel: "text-embedding-3-small", chunkSize: 512, overlap: 64 }),
      manifest: JSON.stringify({
        actions: ["add_document","search","delete_document","list_documents","clear"]
      }),
    },
    {
      id: "plugin-feishu",
      name: "飞书",
      description: "与飞书 IM / 多维表格 / 文档对接，实现消息推送、表格读写、云文档管理等协作能力。",
      version: "1.0.0",
      author: "WorkBuddy",
      homepage: "https://open.feishu.cn",
      icon: "feishu",
      category: "communication",
      config: JSON.stringify({ appId: "", appSecret: "", defaultChatId: "" }),
      manifest: JSON.stringify({
        actions: ["send_message","create_bitable_record","update_record","query_bitable","upload_file"]
      }),
    },
  ];

  for (const p of defaultPlugins) {
    const exists = db.exec("SELECT id FROM plugins WHERE id=?", [p.id]);
    if (exists.length && exists[0].values.length) continue; // already seeded
    db.run(
      `INSERT INTO plugins
         (id, name, description, version, author, homepage, icon, category, config, manifest, enabled, installed_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      [p.id, p.name, p.description, p.version, p.author, p.homepage, p.icon,
       p.category, p.config, p.manifest, now, now]
    );
  }
}

// ── Session Tabs CRUD ─────────────────────────────────────────────────────
export interface SessionTabRecord {
  id: string;
  user_id: string;
  browser_tab_key: string;
  title: string;
  conversation_id: string;
  agent_id: string;
  agent_name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export const SessionTabService = {
  /** 获取用户的所有 session tabs */
  list(userId: string): SessionTabRecord[] {
    const stmt = db.prepare(
      "SELECT * FROM session_tabs WHERE user_id = ? ORDER BY updated_at DESC"
    );
    stmt.run([userId]);
    const rows: SessionTabRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as SessionTabRecord);
    }
    stmt.free();
    return rows;
  },

  /** 创建或更新（upsert） */
  upsert(tab: Omit<SessionTabRecord, "created_at" | "updated_at">): SessionTabRecord {
    const now = new Date().toISOString();
    const existing = db
      .prepare(
        "SELECT id FROM session_tabs WHERE user_id = ? AND browser_tab_key = ?"
      )
      .get([tab.user_id, tab.browser_tab_key]);

    if (existing) {
      db.run(
        `UPDATE session_tabs SET title=?, conversation_id=?, agent_id=?, agent_name=?, color=?, updated_at=? WHERE user_id=? AND browser_tab_key=?`,
        [
          tab.title, tab.conversation_id, tab.agent_id, tab.agent_name,
          tab.color, now, tab.user_id, tab.browser_tab_key,
        ]
      );
    } else {
      db.run(
        `INSERT INTO session_tabs (id, user_id, browser_tab_key, title, conversation_id, agent_id, agent_name, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          tab.id, tab.user_id, tab.browser_tab_key, tab.title,
          tab.conversation_id, tab.agent_id, tab.agent_name, tab.color,
          now, now,
        ]
      );
    }

    const row = db
      .prepare(
        "SELECT * FROM session_tabs WHERE user_id = ? AND browser_tab_key = ?"
      )
      .get([tab.user_id, tab.browser_tab_key]) as unknown as SessionTabRecord;
    return row;
  },

  /** 删除 */
  delete(userId: string, browserTabKey: string): void {
    db.run(
      "DELETE FROM session_tabs WHERE user_id = ? AND browser_tab_key = ?",
      [userId, browserTabKey]
    );
  },

  /** 批量 upsert */
  batchUpsert(userId: string, tabs: Array<{ browser_tab_key: string; title: string; conversation_id: string; agent_id: string; agent_name: string; color: string }>): SessionTabRecord[] {
    const now = new Date().toISOString();
    const results: SessionTabRecord[] = [];
    for (const t of tabs) {
      const existing = db
        .prepare(
          "SELECT id FROM session_tabs WHERE user_id = ? AND browser_tab_key = ?"
        )
        .get([userId, t.browser_tab_key]);

      if (existing) {
        db.run(
          `UPDATE session_tabs SET title=?, conversation_id=?, agent_id=?, agent_name=?, color=?, updated_at=? WHERE user_id=? AND browser_tab_key=?`,
          [
            t.title, t.conversation_id, t.agent_id, t.agent_name,
            t.color, now, userId, t.browser_tab_key,
          ]
        );
      } else {
        const id = `stab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        db.run(
          `INSERT INTO session_tabs (id, user_id, browser_tab_key, title, conversation_id, agent_id, agent_name, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            id, userId, t.browser_tab_key, t.title,
            t.conversation_id, t.agent_id, t.agent_name, t.color,
            now, now,
          ]
        );
      }

      const row = db
        .prepare(
          "SELECT * FROM session_tabs WHERE user_id = ? AND browser_tab_key = ?"
        )
        .get([userId, t.browser_tab_key]) as unknown as SessionTabRecord;
      results.push(row);
    }
    return results;
  },
};

export function saveDb() {
  if (dbConfig.type === "postgres") return; // PostgreSQL 不需要手动 save
  if (!db) return;
  const data = db.export();
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/**
 * 统一获取数据库实例
 * SQLite 模式：返回 sql.js Database
 * PostgreSQL 模式：返回 PGDatabase（兼容 sql.js 接口）
 */
export function getDb(): any {
  if (dbConfig.type === "postgres") {
    return (globalThis as any).__pgDb;
  }
  return db;
}
