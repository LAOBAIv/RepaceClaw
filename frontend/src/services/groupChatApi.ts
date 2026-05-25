// API service for group chat projects

export interface GroupChatProject {
  id: string;
  name: string;
  type: 'group_chat';
  members: Array<{
    id: string;
    type: 'human' | 'agent';
    name: string;
    avatar?: string;
  }>;
  mode: 'all_respond' | 'round_robin' | 'mention_only';
  createdAt: string;
  updatedAt: string;
}

export interface GroupChatMessage {
  id: string;
  projectId: string;
  senderType: 'human' | 'agent';
  senderId: string;
  senderName: string;
  content: string;
  replyTo?: string;
  createdAt: string;
}

// Mock API service - will be replaced with real API calls
class GroupChatApiService {
  private baseUrl = 'http://localhost:3001/api';

  async getProjects(): Promise<GroupChatProject[]> {
    // TODO: Replace with real API call to /api/rooms
    return [
      {
        id: 'gc-001',
        name: '工作群聊',
        type: 'group_chat',
        members: [
          { id: 'user-current', type: 'human', name: '你', avatar: '😎' },
          { id: 'agent-dev', type: 'agent', name: '开发助手', avatar: '🧑‍💻' },
          { id: 'agent-design', type: 'agent', name: '设计助手', avatar: '👩‍🎨' }
        ],
        mode: 'all_respond',
        createdAt: '2026-05-20T04:00:00Z',
        updatedAt: '2026-05-20T04:30:00Z'
      },
      {
        id: 'gc-002',
        name: '产品讨论',
        type: 'group_chat', 
        members: [
          { id: 'user-current', type: 'human', name: '你', avatar: '😎' },
          { id: 'agent-pm', type: 'agent', name: '产品助手', avatar: '👨‍💼' },
          { id: 'agent-design', type: 'agent', name: '设计助手', avatar: '👩‍🎨' }
        ],
        mode: 'round_robin',
        createdAt: '2026-05-19T10:00:00Z',
        updatedAt: '2026-05-20T03:15:00Z'
      }
    ];
  }

  async getProject(projectId: string): Promise<GroupChatProject> {
    const projects = await this.getProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }

  async createProject(name: string, agentIds: string[], mode: string): Promise<GroupChatProject> {
    // TODO: Replace with real API call to POST /api/rooms
    return {
      id: `gc-${Date.now()}`,
      name,
      type: 'group_chat',
      members: [
        { id: 'user-current', type: 'human', name: '你', avatar: '😎' },
        ...agentIds.map(id => ({ 
          id, 
          type: 'agent' as const, 
          name: `Agent ${id}`, 
          avatar: '🤖' 
        }))
      ],
      mode: mode as GroupChatProject['mode'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async getMessages(projectId: string): Promise<GroupChatMessage[]> {
    // TODO: This will be handled by WebSocket in real implementation
    return [
      {
        id: 'msg-1',
        projectId,
        senderType: 'agent',
        senderId: 'agent-dev',
        senderName: '小明',
        content: '大家好！我是小明，负责技术相关的问题。',
        createdAt: '2026-05-20T04:05:00Z'
      },
      {
        id: 'msg-2',
        projectId,
        senderType: 'human',
        senderId: 'user-current',
        senderName: '你',
        content: '很高兴认识大家！',
        createdAt: '2026-05-20T04:10:00Z'
      }
    ];
  }
}

export const groupChatApi = new GroupChatApiService();