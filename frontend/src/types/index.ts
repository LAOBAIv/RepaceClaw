// Core types for the multi-agent platform
// 架构版本: v2 — taskId/sessionId 1:1 绑定，ID 编码规范化

export interface Agent {
  /** 底层主键 UUID */
  id: string;
  /** 业务智能体编码：8 位，同一用户下唯一 */
  agentCode?: string;
  name: string;
  color: string;
  systemPrompt: string;
  writingStyle: string;
  expertise: string[];
  description?: string;
  status?: "active" | "idle" | "busy";
  modelName?: string;
  modelProvider?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  tokenProvider?: string;
  tokenApiKey?: string;
  tokenBaseUrl?: string;
  outputFormat?: string;
  boundary?: string;
  memoryTurns?: number;
  temperatureOverride?: number | null;
  tokenUsed?: number;
  visibility?: 'private' | 'public' | 'template';
  skillsConfig?: Record<string, boolean>;
  quotaConfig?: {
    maxDailyTokens?: number;
    maxDailyConversations?: number;
    maxTokensPerMessage?: number;
  };
  /** RC 执行分类：用于映射到 OC 固定执行智能体 */
  agentType?: 'dev' | 'data' | 'creative' | 'pm' | 'research' | 'ops' | 'decision' | 'general';
  /** 对应的 OpenClaw 执行智能体 ID */
  openclawAgentId?: string | null;
  createdAt: string;
  isSystem?: boolean;
}

export interface WorkflowNode {
  id: string;
  name: string;
  nodeType: 'serial' | 'parallel';
  agentIds: string[];
  taskDesc: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  tags: string[];
  status: "active" | "archived";
  goal?: string;
  priority?: 'high' | 'mid' | 'low';
  startTime?: string;
  endTime?: string;
  decisionMaker?: string;
  workflowNodes?: WorkflowNode[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 会话（Session）
 * taskId 与 sessionId 严格 1:1，两者同值
 */
export interface Conversation {
  /** 底层主键 UUID（当前过渡期也可能与 taskId 同值） */
  id: string;
  /** 关联任务 UUID */
  taskId: string | null;
  /** 业务会话编码（外显 / 排障 / 日志优先使用） */
  sessionCode?: string;
  projectId: string | null;
  /** 参与此会话的智能体 UUID 列表（≥1） */
  agentIds: string[];
  /** 当前正在对话的智能体 UUID */
  currentAgentId: string;
  /** 业务当前智能体编码：sessionCode + agentCode */
  currentAgentCode?: string;
  /** @deprecated 兼容字段，新代码优先使用 currentAgentId / agentIds */
  agentId: string;
  title: string;
  createdAt: string;
  /** 会话状态：'in_progress' | 'completed' | 'archived' | 'deleted' */
  status?: 'in_progress' | 'completed' | 'archived' | 'deleted';
}

export interface Message {
  /** 底层主键 UUID */
  id: string;
  /** 业务消息编码：sessionCode + 6 位序号 */
  messageCode?: string;
  /** 所属会话 UUID */
  conversationId: string;
  role: "user" | "agent";
  content: string;
  /** 发送者 agentId（用户消息为空） */
  agentId?: string;
  createdAt: string;
  streaming?: boolean;
}

/** 前端会话面板（UI 层） */
export interface ConversationPanel {
  id: string;
  conversationId: string;
  agentId: string;
  agentIds: string[];
  agentName: string;
  agentColor: string;
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId?: string;
  streamingContent?: string;
  systemBanner?: string;
}

export type OpenPanel = ConversationPanel;

export interface DocumentNode {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  content: string;
  nodeOrder: number;
  assignedAgentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  category: string;
  emoji: string;
  color: string;
  vibe: string;
  description: string;
  systemPrompt: string;
  writingStyle: string;
  expertise: string[];
  outputFormat: string;
  githubSource: string;
  createdAt: string;
}

export interface DepartmentNode {
  id: string;
  departmentCode: string;
  name: string;
  parentId: string | null;
  ownerUserId: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  children: DepartmentNode[];
}

export interface OrganizationUser {
  id: string;
  userCode?: string;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'user';
  status: string;
  avatar: string;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
  primaryDepartmentId: string | null;
  primaryDepartmentName: string | null;
  primaryDepartmentCode: string | null;
}
