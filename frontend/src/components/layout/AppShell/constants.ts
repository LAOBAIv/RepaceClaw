/**
 * @file constants.ts
 * @description AppShell 布局常量：页面标题映射、导航项配置、当前项目信息、角色标签
 */
import {
  Bot, Layers,
  Settings, Network, Sparkles, PlusCircle, Wrench, Puzzle, Library, Brain,
} from 'lucide-react';

/* ─── 页面标题映射 ─────────────────────────────────────────── */
export const PAGE_TITLE_MAP: Record<string, string> = {
  '/login': '登录',
  '/workspace': '工作台',
  '/agents': '智能体管理',
  '/agent-library': '智能体库',
  '/agent-create': '创建智能体',
  '/console': '项目协作',
  '/kanban': '会话列表',
  '/admin': '系统管理',
  '/skill-settings': '技能设置',
  '/plugin-settings': '插件设置',
  '/account': '账号设置',
  '/memory': '记忆管理',
};

/* ─── 导航项配置 ───────────────────────────────────────────── */
export const NAV_ITEMS = [
  { to: '/workspace',      icon: Sparkles,   label: 'RepaceClaw',  exact: false },
  { to: '/Projects',       icon: Layers,     label: '项目列表',     exact: false },
  { to: '/agent-library',  icon: Library,    label: 'Agent 模板库', exact: false },
  { to: '/agent-create',   icon: PlusCircle, label: '智能体创建',   exact: false },
  { to: '/agents',         icon: Bot,        label: '智能体管理',   exact: false },
  { to: '/console',        icon: Network,    label: '项目协作',     exact: false },
  { to: '/skill-settings', icon: Wrench,     label: '技能设置',     exact: false },
  { to: '/plugin-settings',icon: Puzzle,     label: '插件设置',     exact: false },
  { to: '/account',        icon: Settings,   label: '账号设置',     exact: false },
  { to: '/kanban',         icon: Layers,     label: '会话列表',     exact: false },
  { to: '/memory',         icon: Brain,      label: '记忆管理',     exact: false },
];

/* ─── 当前项目信息 ─────────────────────────────────────────── */
export const CURRENT_PROJECT = {
  name: 'RepaceClaw智能体平台',
  phase: '开发阶段',
};

/* ─── 角色标签映射 ─────────────────────────────────────────── */
export const ROLE_LABEL: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  user: '普通用户',
};
