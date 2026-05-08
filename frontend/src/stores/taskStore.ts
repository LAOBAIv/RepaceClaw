import { create } from 'zustand';
import { tasksApi } from '../api/tasks';

/* ─── 业务规则（重要）───────────────────────────────────────────
 * 【单任务智能体规则】
 *   每个任务（Task）必须至少包含 1 个智能体参与对话。
 *   - agents 数组长度 >= 1（必填，不可为空数组）
 *   - 创建/编辑任务时前端需校验：agents.length >= 1，否则提示用户选择智能体
 *   - agent（string）字段保留，记录"主负责智能体"名称，便于列表展示
 * ─────────────────────────────────────────────────────────── */

/* ─── 智能体引用类型（轻量）────────────────────────────────── */
export interface TaskAgent {
  /** 智能体名称（唯一标识）*/
  name: string;
  /** 头像颜色，用于 Avatar 着色 */
  color: string;
}

/* ─── 类型 ─────────────────────────────────────────────────── */
export interface Task {
  /** 任务ID (格式: task_{timestamp} 或 proj_{timestamp}) */
  id: string;
  /** 基础数字ID，用于项目/任务升级降级时保持一致 */
  baseId?: string;
  title: string;
  description: string;
  /**
   * 主负责智能体名称（用于列表 Avatar 展示）
   * 必须与 agents[0].name 保持一致
   */
  agent: string;
  agentColor: string;
  /**
   * 参与本任务对话的智能体列表
   * 【规则】长度必须 >= 1，单任务至少包含 1 个智能体
   */
  agents: TaskAgent[];
  /** 参与智能体的ID列表 */
  agentIds?: string[];
  priority: 'high' | 'mid' | 'low';
  tags: string[];
  updatedAt: string;
  dueDate: string;
  commentCount: number;
  fileCount: number;
  /** 来源：'manual'=手动新建，'chat'=对话自动生成 */
  source?: 'manual' | 'chat';
  /** 关联的对话 panel id（对话自动生成时记录）*/
  panelId?: string;
  /** 关联的会话ID（当前活跃会话，即 conversationId）*/
  sessionId?: string;
  /** 关联的会话ID列表（支持多智能体会话）*/
  sessionIds?: string[];
  /** 任务进度 0-100，仅进行中任务展示 */
  progress?: number;
  /** 是否为项目（多智能体协作）*/
  isProject?: boolean;
  /** 项目ID（如果是项目）*/
  projectId?: string;
  /** 创建者用户ID */
  userId?: string;
  /** 参与者数量 */
  participantCount?: number;
}

export type Column = 'progress' | 'done';

export type TaskBoard = Record<Column, Task[]>;

/* ─── 初始数据（空数组，数据从后端 API 加载）────────────────── */
/**
 * 不再使用 MOCK 假数据。
 * Store 初始化时为空，通过 restoreFromPersist() 从后端 API 拉取真实数据。
 */
const EMPTY_TASKS: TaskBoard = {
  progress: [],
  done: [],
};

/* ─── 数据库 Task → 前端 Task 映射 ──────────────────────────── */
/**
 * 将后端返回的 DbTask（数据库格式）转换为前端 Task（Zustand store 格式）
 * 处理字段命名转换、JSON 解析、日期格式化等
 */
function dbTaskToFrontend(dbTask: any): Task {
  // tags 后端存的是 JSON 字符串，需要解析
  let tags: string[] = [];
  try {
    tags = typeof dbTask.tags === 'string' ? JSON.parse(dbTask.tags) : (dbTask.tags || []);
  } catch {
    tags = [];
  }

  // 日期格式化：2026-04-12T12:24:07.796Z → 04/12
  let dueDate = '';
  if (dbTask.due_date) {
    try {
      const d = new Date(dbTask.due_date);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dueDate = `${mm}/${dd}`;
      }
    } catch {
      dueDate = dbTask.due_date;
    }
  }

  // updatedAt 时间转换为相对时间
  let updatedAt = '未知';
  if (dbTask.updated_at) {
    try {
      const now = new Date();
      const updated = new Date(dbTask.updated_at);
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

  const agent = dbTask.agent || '未指定';
  const agentColor = dbTask.agent_color || '#6366F1';

  return {
    id: dbTask.id,
    title: dbTask.title,
    description: dbTask.description || '',
    agent,
    agentColor,
    agents: [{ name: agent, color: agentColor }],
    agentIds: dbTask.agent_id ? [dbTask.agent_id] : undefined,
    priority: (dbTask.priority as Task['priority']) || 'mid',
    tags,
    updatedAt,
    dueDate,
    commentCount: dbTask.comment_count || 0,
    fileCount: dbTask.file_count || 0,
    source: 'manual',
    /** 后端 task 没有 sessionId 字段，用 task.id 作为 sessionId 保证每个任务有唯一会话 */
    sessionId: dbTask.id,
    userId: dbTask.user_id,
  };
}

/**
 * 列映射：后端 column_id → 前端 Column
 * todo → progress, review → progress, progress → progress, done → done
 */
function mapColumn(columnId: string): Column {
  if (columnId === 'done') return 'done';
  return 'progress';
}

/* ─── Store 接口 ─────────────────────────────────────────────── */
interface TaskState {
  tasks: TaskBoard;

  /** 从后端 API 恢复数据（替换 localStorage 缓存） */
  restoreFromPersist: () => Promise<void>;

  /** 新建任务（手动）- 调用方须保证 task.agents.length >= 1 */
  addTask: (task: Task, col?: Column) => void;

  /**
   * 从对话自动生成任务，默认进入"进行中"
   * 对话生成时自动以当前对话智能体作为参与者（agents[0]）
   * 满足单任务最低 1 个智能体的要求
   */
  addTaskFromChat: (opts: {
    title: string;
    agentName: string;
    agentColor: string;
    panelId?: string;
    /** 新增：关联的会话ID */
    sessionId?: string;
    /** 新增：关联的智能体ID */
    agentId?: string;
    /** 新增：关联的用户ID */
    userId?: string;
    /** 新增：关联的任务ID（外部指定） */
    taskId?: string;
  }) => Task;

  /** 移动任务到另一列 */
  moveTask: (taskId: string, fromCol: Column, toCol: Column) => void;

  /** 更新任务字段 */
  updateTask: (taskId: string, patch: Partial<Task>) => void;

  /** 删除任务 */
  removeTask: (taskId: string) => void;

  /** 查找某任务所在列 */
  findTaskCol: (taskId: string) => Column | null;
}

/* ─── Store 实现 ─────────────────────────────────────────────── */
export const useTaskStore = create<TaskState>()(
    (set, get) => ({
      tasks: EMPTY_TASKS,

      /**
       * 从后端 API 拉取任务列表，转换为前端格式后写入 store。
       * 后端返回格式：{ todo: [...], progress: [...], review: [...], done: [...] }
       * 前端只使用 progress 和 done 两列（todo/review 合并到 progress）
       */
      restoreFromPersist: async () => {
        try {
          const dbData = await tasksApi.list();
          const result: TaskBoard = { progress: [], done: [] };

          for (const [colId, dbTasks] of Object.entries(dbData)) {
            if (!Array.isArray(dbTasks)) continue;
            const targetCol = mapColumn(colId);
            for (const dbTask of dbTasks) {
              result[targetCol].push(dbTaskToFrontend(dbTask));
            }
          }

          // 按 sort_order 排序
          for (const col of ['progress', 'done'] as Column[]) {
            result[col].sort((a, b) => {
              // 简单按 updatedAt 排序（后端 sort_order 已映射不到前端）
              return 0;
            });
          }

          set({ tasks: result });
        } catch (err) {
          console.error('[TaskStore] restoreFromPersist 失败，使用空数据:', err);
          set({ tasks: EMPTY_TASKS });
        }
      },

      addTask: (task, col = 'progress') => {
        /* 前端防御：确保 agents 不为空，至少保留主智能体 */
        const safeAgents: TaskAgent[] =
          task.agents && task.agents.length > 0
            ? task.agents
            : [{ name: task.agent, color: task.agentColor }];
        set(state => ({
          tasks: { ...state.tasks, [col]: [{ ...task, agents: safeAgents }, ...state.tasks[col]] },
        }));
        // 方案 C: 广播任务变更事件
        import("../lib/sync").then(({ getBroadcastSync }) => {
          const bc = getBroadcastSync();
          if (bc) bc.send('task.updated', { taskId: task.id, action: 'add' });
        }).catch(() => {});
      },

      addTaskFromChat: ({ title, agentName, agentColor, panelId, sessionId, agentId, userId, taskId: externalTaskId }) => {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        // 优先使用外部指定的 taskId，其次用 panelId，最后生成新的
        const taskId = externalTaskId ?? panelId ?? `chat_${Date.now()}`;
        // 提取基础数字ID（用于升级/降级时保持一致）
        const baseId = taskId.replace(/^(task_|proj_|chat_)/, '');
        const resolvedSessionId = sessionId ?? panelId;
        const newTask: Task = {
          id: taskId,
          baseId,
          title: title.length > 40 ? title.slice(0, 40) + '...' : title,
          description: '',
          agent: agentName,
          agentColor,
          agents: [{ name: agentName, color: agentColor }],
          agentIds: agentId ? [agentId] : undefined,
          priority: 'mid',
          // tag 绑定 taskId + sessionId
          tags: [
            '对话生成',
            ...(resolvedSessionId ? [`sid:${resolvedSessionId.slice(0, 8)}`] : []),
          ],
          updatedAt: '刚刚',
          dueDate: `${mm}/${String(Number(dd) + 7).padStart(2, '0')}`,
          commentCount: 0,
          fileCount: 0,
          source: 'chat',
          panelId,
          sessionId: resolvedSessionId,
          sessionIds: resolvedSessionId ? [resolvedSessionId] : [],
          userId,
        };
        set(state => {
          // 幂等插入：基于 baseId 去重（相同数字仅保留一条）
          const alreadyExists = state.tasks.progress.some(t => (t.baseId ?? t.id) === baseId)
            || state.tasks.done.some(t => (t.baseId ?? t.id) === baseId);
          if (alreadyExists) {
            // 已存在：更新 sessionId 和 tags
            const cols: Column[] = ['progress', 'done'];
            const newTasks = { ...state.tasks };
            for (const col of cols) {
              const idx = newTasks[col].findIndex(t => (t.baseId ?? t.id) === baseId);
              if (idx !== -1) {
                const existing = newTasks[col][idx];
                const updatedSessionIds = resolvedSessionId
                  ? [...new Set([...(existing.sessionIds ?? []), resolvedSessionId])]
                  : existing.sessionIds;
                newTasks[col] = [...newTasks[col]];
                newTasks[col][idx] = {
                  ...existing,
                  sessionId: resolvedSessionId ?? existing.sessionId,
                  sessionIds: updatedSessionIds,
                  panelId: panelId ?? existing.panelId,
                  updatedAt: '刚刚',
                };
                break;
              }
            }
            return { tasks: newTasks };
          }
          return { tasks: { ...state.tasks, progress: [newTask, ...state.tasks.progress] } };
        });
        // 方案 C: 广播任务变更事件
        import("../lib/sync").then(({ getBroadcastSync }) => {
          const bc = getBroadcastSync();
          if (bc) bc.send('task.updated', { taskId: newTask.id, action: 'add' });
        }).catch(() => {});
        return newTask;
      },

      moveTask: (taskId, fromCol, toCol) => {
        set(state => {
          const task = state.tasks[fromCol].find(t => t.id === taskId);
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [fromCol]: state.tasks[fromCol].filter(t => t.id !== taskId),
              [toCol]: [{ ...task, updatedAt: '刚刚' }, ...state.tasks[toCol]],
            },
          };
        });
        // 方案 C: 广播任务变更事件
        import("../lib/sync").then(({ getBroadcastSync }) => {
          const bc = getBroadcastSync();
          if (bc) bc.send('task.updated', { taskId, action: 'move' });
        }).catch(() => {});
      },

      updateTask: (taskId, patch) => {
        set(state => {
          const cols: Column[] = ['progress', 'done'];
          const newTasks = { ...state.tasks };
          for (const col of cols) {
            const idx = newTasks[col].findIndex(t => t.id === taskId);
            if (idx !== -1) {
              newTasks[col] = [...newTasks[col]];
              newTasks[col][idx] = { ...newTasks[col][idx], ...patch, updatedAt: '刚刚' };
              break;
            }
          }
          return { tasks: newTasks };
        });
        // 方案 C: 广播任务变更事件
        import("../lib/sync").then(({ getBroadcastSync }) => {
          const bc = getBroadcastSync();
          if (bc) bc.send('task.updated', { taskId, action: 'update', patch });
        }).catch(() => {});
      },

      /** 删除任务 */
      removeTask: async (taskId: string) => {
        try {
          await tasksApi.delete(taskId);
        } catch (e) {
          console.error('删除任务失败:', e);
          // API 失败也要更新本地状态，避免不一致
        }
        set(state => {
          const cols: Column[] = ['progress', 'done'];
          const newTasks = { ...state.tasks };
          for (const col of cols) {
            const idx = newTasks[col].findIndex(t => t.id === taskId);
            if (idx !== -1) {
              newTasks[col] = newTasks[col].filter(t => t.id !== taskId);
              break;
            }
          }
          return { tasks: newTasks };
        });
        // 方案 C: 广播任务变更事件
        import("../lib/sync").then(({ getBroadcastSync }) => {
          const bc = getBroadcastSync();
          if (bc) bc.send('task.updated', { taskId, action: 'remove' });
        }).catch(() => {});
      },

      findTaskCol: (taskId) => {
        const cols: Column[] = ['progress', 'done'];
        const { tasks } = get();
        for (const col of cols) {
          if (tasks[col].find(t => t.id === taskId)) return col;
        }
        return null;
      },
    }),
);
