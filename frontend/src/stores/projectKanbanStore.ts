import { create } from 'zustand';
import { projectsApi } from '../api/projects';

/* ─── 业务规则（重要）───────────────────────────────────────────
 * 【单项目智能体规则】
 *   项目（KanbanProject）的 agents 数组如实记录用户选择的参与智能体。
 *   - agents 数组长度 >= 1（至少包含 1 个主负责智能体）
 *   - agent（string）字段保留，记录"主负责智能体"名称，便于列表展示
 *   - 与任务的区别：任务只需 1 个，项目鼓励多智能体协同
 * ─────────────────────────────────────────────────────────── */

/* ─── 类型 ─────────────────────────────────────────────────── */
export type ProjectPriority = 'high' | 'mid' | 'low';

/** 项目参与智能体（轻量引用，与 taskStore.TaskAgent 结构一致）*/
export interface ProjectAgent {
  /** 智能体名称（唯一标识）*/
  name: string;
  /** 头像颜色，用于 Avatar 着色 */
  color: string;
}

export interface KanbanProject {
  id: string;
  title: string;
  description: string;
  tags: string[];
  /** 优先级 */
  priority: ProjectPriority;
  /**
   * 主负责智能体名称（列表 Avatar 展示）
   * 必须与 agents[0].name 保持一致
   */
  agent: string;
  agentColor: string;
  /**
   * 参与本项目协作的智能体列表
   * 【规则】如实记录用户选择的智能体，长度 >= 1
   */
  agents: ProjectAgent[];
  /** 进度 0-100 */
  progress: number;
  dueDate: string;
  updatedAt: string;
  taskCount: number;
  memberCount: number;
  /** 关联的会话 ID */
  sessionId?: string;
}

export type ProjectColumn = 'progress' | 'done';
export type ProjectBoard = Record<ProjectColumn, KanbanProject[]>;

/* ─── 初始数据（空数组，数据从后端 API 加载）────────────────── */
/**
 * 不再使用 MOCK 假数据。
 * Store 初始化时为空，通过 restoreFromPersist() 从后端 API 拉取真实数据。
 */
const EMPTY_PROJECTS: ProjectBoard = {
  progress: [],
  done: [],
};

/* ─── 数据库 Project → 前端 KanbanProject 映射 ──────────────── */
/**
 * 将后端返回的 Project（数据库格式）转换为前端 KanbanProject（Zustand store 格式）
 * 后端 Project 没有明确的 column/状态字段，按 status 映射：
 *   active → progress, archived → done
 */
function dbProjectToFrontend(dbProject: any): KanbanProject {
  // tags 后端存的是 JSON 字符串，需要解析
  let tags: string[] = [];
  try {
    tags = typeof dbProject.tags === 'string' ? JSON.parse(dbProject.tags) : (dbProject.tags || []);
  } catch {
    tags = [];
  }

  // workflow_nodes 解析为 taskCount
  let taskCount = 0;
  try {
    const nodes = typeof dbProject.workflow_nodes === 'string'
      ? JSON.parse(dbProject.workflow_nodes)
      : (dbProject.workflow_nodes || []);
    taskCount = Array.isArray(nodes) ? nodes.length : 0;
  } catch {
    taskCount = 0;
  }

  // 日期格式化
  let dueDate = '';
  if (dbProject.end_time) {
    try {
      const d = new Date(dbProject.end_time);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dueDate = `${mm}/${dd}`;
      }
    } catch {
      dueDate = dbProject.end_time;
    }
  }

  // updatedAt 时间转换为相对时间
  let updatedAt = '未知';
  const ts = dbProject.updated_at || dbProject.created_at;
  if (ts) {
    try {
      const now = new Date();
      const updated = new Date(ts);
      const diffMs = now.getTime() - updated.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);
      if (diffMin < 1) updatedAt = '刚刚';
      else if (diffMin < 60) updatedAt = `${diffMin}分钟前`;
      else if (diffHr < 24) updatedAt = `${diffHr}小时前`;
      else updatedAt = `${diffDay}天前`;
    } catch {
      updatedAt = '未知';
    }
  }

  // 从 title 首字母生成默认 agent（后端没有 agent 字段）
  const agent = '项目';
  const agentColor = '#6366f1';

  // 状态映射：active → progress, archived → done
  const status = (dbProject.status || 'active').toLowerCase();
  const priority = (dbProject.priority as ProjectPriority) || 'mid';

  return {
    id: dbProject.id,
    title: dbProject.title,
    description: dbProject.description || '',
    tags,
    priority,
    agent,
    agentColor,
    agents: [{ name: agent, color: agentColor }],
    progress: status === 'archived' ? 100 : 0,
    dueDate,
    updatedAt,
    taskCount,
    memberCount: 0,
  };
}

/* ─── Store 接口 ─────────────────────────────────────────────── */
interface ProjectKanbanState {
  projects: ProjectBoard;

  /** 从后端 API 恢复数据（替换 localStorage 缓存） */
  restoreFromPersist: () => Promise<void>;

  /** 新建项目 */
  addProject: (project: KanbanProject, col?: ProjectColumn) => void;
  moveProject: (projectId: string, fromCol: ProjectColumn, toCol: ProjectColumn) => void;
  updateProject: (projectId: string, patch: Partial<KanbanProject>) => void;
  removeProject: (projectId: string) => void;
}

/* ─── Store 实现 ─────────────────────────────────────────────── */
export const useProjectKanbanStore = create<ProjectKanbanState>()(
    (set) => ({
      projects: EMPTY_PROJECTS,

      /**
       * 从后端 API 拉取项目列表，转换为前端格式后写入 store。
       * 后端返回格式：Project[]（平铺列表）
       * 按 status 映射到 progress/done 列：active → progress, archived → done
       */
      restoreFromPersist: async () => {
        try {
          const dbProjects = await projectsApi.list();
          const result: ProjectBoard = { progress: [], done: [] };

          for (const dbProject of dbProjects) {
            const frontend = dbProjectToFrontend(dbProject);
            // status === 'archived' → done, 其余 → progress
            if (dbProject.status === 'archived') {
              result.done.push(frontend);
            } else {
              result.progress.push(frontend);
            }
          }

          set({ projects: result });
        } catch (err) {
          console.error('[ProjectKanbanStore] restoreFromPersist 失败，使用空数据:', err);
          set({ projects: EMPTY_PROJECTS });
        }
      },

      addProject: (project, col = 'progress') => {
        /*
         * 确保 agents 数组存在且不为空（至少包含主智能体）
         * 不再强制要求 >= 2，以如实反映用户实际选择的智能体数量
         */
        const safeAgents: ProjectAgent[] =
          project.agents && project.agents.length > 0
            ? project.agents
            : [{ name: project.agent, color: project.agentColor }];
        set(state => ({
          projects: { ...state.projects, [col]: [{ ...project, agents: safeAgents }, ...state.projects[col]] },
        }));
        // 方案 C: 广播项目变更事件
        import("../lib/sync").then(({ getBroadcastSync }) => {
          const bc = getBroadcastSync();
          if (bc) bc.send('project.updated', { projectId: project.id, action: 'add' });
        }).catch(() => {});
      },

      moveProject: (projectId, fromCol, toCol) => {
        set(state => {
          const project = state.projects[fromCol].find(p => p.id === projectId);
          if (!project) return state;
          return {
            projects: {
              ...state.projects,
              [fromCol]: state.projects[fromCol].filter(p => p.id !== projectId),
              [toCol]: [{ ...project, updatedAt: '刚刚' }, ...state.projects[toCol]],
            },
          };
        });
        // 方案 C: 广播项目变更事件
        import("../lib/sync").then(({ getBroadcastSync }) => {
          const bc = getBroadcastSync();
          if (bc) bc.send('project.updated', { projectId, action: 'move' });
        }).catch(() => {});
      },

      updateProject: (projectId, patch) => {
        set(state => {
          const cols: ProjectColumn[] = ['progress', 'done'];
          const newProjects = { ...state.projects };
          for (const col of cols) {
            const idx = newProjects[col].findIndex(p => p.id === projectId);
            if (idx !== -1) {
              newProjects[col] = [...newProjects[col]];
              newProjects[col][idx] = { ...newProjects[col][idx], ...patch, updatedAt: '刚刚' };
              break;
            }
          }
          return { projects: newProjects };
        });
        // 方案 C: 广播项目变更事件
        import("../lib/sync").then(({ getBroadcastSync }) => {
          const bc = getBroadcastSync();
          if (bc) bc.send('project.updated', { projectId, action: 'update', patch });
        }).catch(() => {});
      },

      removeProject: async (projectId) => {
        try {
          await projectsApi.delete(projectId);
        } catch (e) {
          console.error('删除项目失败:', e);
        }
        set(state => {
          const cols: ProjectColumn[] = ['progress', 'done'];
          const newProjects = { ...state.projects };
          for (const col of cols) {
            const idx = newProjects[col].findIndex(p => p.id === projectId);
            if (idx !== -1) {
              newProjects[col] = newProjects[col].filter(p => p.id !== projectId);
              break;
            }
          }
          return { projects: newProjects };
        });
        // 方案 C: 广播项目变更事件
        import("../lib/sync").then(({ getBroadcastSync }) => {
          const bc = getBroadcastSync();
          if (bc) bc.send('project.updated', { projectId, action: 'remove' });
        }).catch(() => {});
      },
    }),
);
