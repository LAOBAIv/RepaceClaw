-- ============================================================
-- RepaceClaw PostgreSQL Schema
-- 生产环境建表脚本（v1.0 — 2026-04-26）
-- 用法: psql -d repaceclaw -f scripts/schema-postgres.sql
-- ============================================================

BEGIN;

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'active',
  avatar        TEXT NOT NULL DEFAULT '',
  last_login_at TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- ── Agents ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL DEFAULT '',
  name                 TEXT NOT NULL,
  color                TEXT NOT NULL DEFAULT '#6366F1',
  system_prompt        TEXT NOT NULL DEFAULT '',
  writing_style        TEXT NOT NULL DEFAULT 'balanced',
  expertise            TEXT NOT NULL DEFAULT '[]',
  description          TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'idle',
  model_name           TEXT NOT NULL DEFAULT '',
  model_provider       TEXT NOT NULL DEFAULT '',
  temperature          REAL NOT NULL DEFAULT 0.7,
  max_tokens           INTEGER NOT NULL DEFAULT 4096,
  top_p                REAL NOT NULL DEFAULT 1,
  frequency_penalty    REAL NOT NULL DEFAULT 0,
  presence_penalty     REAL NOT NULL DEFAULT 0,
  token_used           INTEGER NOT NULL DEFAULT 0,
  token_provider       TEXT NOT NULL DEFAULT '',
  token_api_key        TEXT NOT NULL DEFAULT '',
  token_base_url       TEXT NOT NULL DEFAULT '',
  output_format        TEXT NOT NULL DEFAULT '纯文本',
  boundary             TEXT NOT NULL DEFAULT '',
  memory_turns         INTEGER NOT NULL DEFAULT 0,
  temperature_override REAL DEFAULT NULL,
  visibility           TEXT NOT NULL DEFAULT 'private',
  skills_config        TEXT NOT NULL DEFAULT '{}',
  quota_config         TEXT NOT NULL DEFAULT '{}',
  openclaw_agent_id    TEXT,
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_visibility ON agents(visibility);

-- ── Token Channels ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_channels (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT '',
  provider   TEXT NOT NULL,
  model_name TEXT NOT NULL DEFAULT '',
  base_url   TEXT NOT NULL DEFAULT '',
  api_key    TEXT NOT NULL DEFAULT '',
  auth_type  TEXT NOT NULL DEFAULT 'Bearer',
  enabled    INTEGER NOT NULL DEFAULT 1,
  priority   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_channels_user ON token_channels(user_id);

-- ── Projects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT '',
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  tags            TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'active',
  goal            TEXT NOT NULL DEFAULT '',
  priority        TEXT NOT NULL DEFAULT 'mid',
  start_time      TEXT NOT NULL DEFAULT '',
  end_time        TEXT NOT NULL DEFAULT '',
  decision_maker  TEXT NOT NULL DEFAULT '',
  workflow_nodes  TEXT NOT NULL DEFAULT '[]',
  created_by      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- ── Tasks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  column_id    TEXT NOT NULL DEFAULT 'todo',
  priority     TEXT NOT NULL DEFAULT 'mid',
  tags         TEXT NOT NULL DEFAULT '[]',
  agent        TEXT NOT NULL DEFAULT '',
  agent_color  TEXT NOT NULL DEFAULT '#6366F1',
  agent_id     TEXT NOT NULL DEFAULT '',
  due_date     TEXT NOT NULL DEFAULT '',
  comment_count INTEGER NOT NULL DEFAULT 0,
  file_count   INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(column_id);

-- ── Documents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id                      TEXT PRIMARY KEY,
  project_id              TEXT NOT NULL,
  parent_id               TEXT,
  title                   TEXT NOT NULL,
  content                 TEXT NOT NULL DEFAULT '',
  node_order              INTEGER NOT NULL DEFAULT 0,
  assigned_agent_ids      TEXT NOT NULL DEFAULT '[]',
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id);

-- ── Document Versions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_versions (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  content     TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON document_versions(document_id);

-- ── Conversations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT '',
  project_id TEXT,
  task_id    TEXT UNIQUE,
  title      TEXT NOT NULL DEFAULT 'New Conversation',
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);

-- ── Conversation Agents (many-to-many) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_agents (
  conversation_id TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  joined_at       TEXT NOT NULL,
  PRIMARY KEY (conversation_id, agent_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- ── Messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  agent_id        TEXT,
  token_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- ── Audit Logs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id TEXT,
  detail      TEXT NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  user_agent  TEXT,
  request_id  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ── Agent Registry Log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_registry_log (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  result     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registry_agent ON agent_registry_log(agent_id);

-- ── Channel Accounts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_accounts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL DEFAULT '',
  agent_id   TEXT NOT NULL,
  channel    TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  config     TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_channel_agent ON channel_accounts(agent_id);

-- ── Agent Templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'engineering',
  emoji         TEXT NOT NULL DEFAULT '🤖',
  color         TEXT NOT NULL DEFAULT '#6366F1',
  vibe          TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  writing_style TEXT NOT NULL DEFAULT 'balanced',
  expertise     TEXT NOT NULL DEFAULT '[]',
  output_format TEXT NOT NULL DEFAULT '纯文本',
  github_source TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_templates_category ON agent_templates(category);

-- ── Bot Channels ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_channels (
  id           TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL UNIQUE,
  bot_id       TEXT NOT NULL DEFAULT '',
  secret       TEXT NOT NULL DEFAULT '',
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- ── Skills ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'general',
  type        TEXT NOT NULL DEFAULT 'builtin',
  config      TEXT NOT NULL DEFAULT '{}',
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ── Agent Skills (many-to-many) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  bound_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, skill_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- ── Plugins ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plugins (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version     TEXT NOT NULL DEFAULT '1.0.0',
  author      TEXT NOT NULL DEFAULT '',
  homepage    TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'general',
  config      TEXT NOT NULL DEFAULT '{}',
  manifest    TEXT NOT NULL DEFAULT '{}',
  enabled     INTEGER NOT NULL DEFAULT 1,
  installed_at TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ── Agent Plugins (many-to-many) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_plugins (
  agent_id  TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  bound_at  TEXT NOT NULL,
  PRIMARY KEY (agent_id, plugin_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
);

-- ── Session Tabs ────────────────────────────────────────────────────────────
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
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_tabs_user_key ON session_tabs(user_id, browser_tab_key);

-- ── Session Mapping ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_mapping (
  id              TEXT PRIMARY KEY,
  oc_session_key  TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL DEFAULT '',
  session_file    TEXT NOT NULL DEFAULT '',
  agent_id        TEXT NOT NULL DEFAULT '',
  agent_ids       TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_mapping_conv ON session_mapping(conversation_id);

-- ── Usage Stats (配额限制基础) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_stats (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL DEFAULT '',
  agent_id    TEXT NOT NULL DEFAULT '',
  date        TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  conv_count  INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  CONSTRAINT usage_stats_unique UNIQUE (user_id, agent_id, date)
);
CREATE INDEX IF NOT EXISTS idx_usage_stats_date ON usage_stats(date);

-- ── V1 Organization / Permission Foundation ────────────────────────────────
-- 与 SQLite (db/client.ts) 保持一致

CREATE TABLE IF NOT EXISTS departments (
  id              TEXT PRIMARY KEY,
  department_code TEXT NOT NULL DEFAULT '',
  name            TEXT NOT NULL,
  parent_id       TEXT,
  owner_user_id   TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_code ON departments(department_code);
CREATE INDEX        IF NOT EXISTS idx_departments_parent_id ON departments(parent_id);

CREATE TABLE IF NOT EXISTS roles (
  id               TEXT PRIMARY KEY,
  role_code        TEXT NOT NULL DEFAULT '',
  name             TEXT NOT NULL,
  scope_type       TEXT NOT NULL DEFAULT 'department',
  scope_id         TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  permissions_json TEXT NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_code ON roles(role_code);
CREATE INDEX        IF NOT EXISTS idx_roles_scope ON roles(scope_type, scope_id);

CREATE TABLE IF NOT EXISTS permission_templates (
  id            TEXT PRIMARY KEY,
  template_code TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  template_type TEXT NOT NULL DEFAULT 'base',
  config_json   TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_templates_code ON permission_templates(template_code);

CREATE TABLE IF NOT EXISTS user_org_scope (
  id                     TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL,
  department_id          TEXT,
  role_id                TEXT,
  permission_template_id TEXT,
  title                  TEXT NOT NULL DEFAULT '',
  is_primary             INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'active',
  joined_at              TEXT NOT NULL DEFAULT '',
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  FOREIGN KEY (user_id)                REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id)          REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (role_id)                REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (permission_template_id) REFERENCES permission_templates(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_org_scope_unique ON user_org_scope(user_id, department_id, role_id);
CREATE INDEX        IF NOT EXISTS idx_user_org_scope_user ON user_org_scope(user_id);
CREATE INDEX        IF NOT EXISTS idx_user_org_scope_department ON user_org_scope(department_id);
CREATE INDEX        IF NOT EXISTS idx_user_org_scope_role ON user_org_scope(role_id);

CREATE TABLE IF NOT EXISTS user_proxy_grants (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  agent_id   TEXT NOT NULL,
  grant_type TEXT NOT NULL DEFAULT 'use',
  scope_type TEXT NOT NULL DEFAULT 'direct',
  scope_id   TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_proxy_grants_unique ON user_proxy_grants(user_id, agent_id, grant_type, scope_type, scope_id);
CREATE INDEX        IF NOT EXISTS idx_user_proxy_grants_user ON user_proxy_grants(user_id);
CREATE INDEX        IF NOT EXISTS idx_user_proxy_grants_agent ON user_proxy_grants(agent_id);

CREATE TABLE IF NOT EXISTS user_data_grants (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT NOT NULL DEFAULT '',
  grant_type    TEXT NOT NULL DEFAULT 'read',
  scope_type    TEXT NOT NULL DEFAULT 'direct',
  scope_id      TEXT NOT NULL DEFAULT '',
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_data_grants_unique ON user_data_grants(user_id, resource_type, resource_id, grant_type, scope_type, scope_id);
CREATE INDEX        IF NOT EXISTS idx_user_data_grants_user ON user_data_grants(user_id);

COMMIT;
