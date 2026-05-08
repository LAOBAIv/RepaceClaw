/**
 * 路由统一管理模块
 * 集中注册所有 API 路由，支持统一前缀和中间件
 */

import { Router, Express } from 'express';
import { logger } from '../utils/logger';

// 导入所有路由
import authRoutes from './auth';
import agentRoutes from './agents';
import projectRoutes from './projects';
import conversationRoutes from './conversations';
import taskRoutes from './tasks';
import tokenChannelRoutes from './tokenChannels';
import botChannelRoutes from './botChannels';
import searchRoutes from './search';
import exportImportRoutes from './exportImport';
import skillRoutes from './skills';
import pluginRoutes from './plugins';
import fileRoutes from './files';
import doubaoRoutes from './doubao';
import openaiCompatRoutes from './openaiCompat';
import modelProviderRoutes from './modelProviders';
import modelRoutes from './models';
import agentTemplateRoutes from './agentTemplates';
import adminTemplateRoutes from './adminTemplates';
import adminUserAgentsRoutes from './adminUserAgents';
import adminOrganizationsRoutes from './adminOrganizations';
import auditLogRoutes from './auditLogs';
import systemStatsRoutes from './systemStats';
import sessionTabsRoutes from './sessionTabs';
import sessionsRoutes from './sessions';
import wechatClawBotRoutes from './wechatClawBot';

// 路由配置项
interface RouteConfig {
  path: string;
  router: Router;
  prefix?: string;  // 可选：自定义前缀，默认使用 '/api'
}

// API 路由列表（统一使用 /api 前缀）
const apiRoutes: RouteConfig[] = [
  { path: '/auth', router: authRoutes },
  { path: '/agents', router: agentRoutes },
  { path: '/projects', router: projectRoutes },
  { path: '/conversations', router: conversationRoutes },
  { path: '/tasks', router: taskRoutes },
  { path: '/token-channels', router: tokenChannelRoutes },
  { path: '/bot-channels', router: botChannelRoutes },
  { path: '/search', router: searchRoutes },
  { path: '/export', router: exportImportRoutes },
  { path: '/import', router: exportImportRoutes },
  { path: '/skills', router: skillRoutes },
  { path: '/plugins', router: pluginRoutes },
  { path: '/files', router: fileRoutes },
  { path: '/doubao', router: doubaoRoutes },
  { path: '/model-providers', router: modelProviderRoutes },
  { path: '/models', router: modelRoutes },
  { path: '/agent-templates', router: agentTemplateRoutes },
  { path: '/admin/templates', router: adminTemplateRoutes },
  { path: '/admin/user-agents', router: adminUserAgentsRoutes },
  { path: '/admin/organizations', router: adminOrganizationsRoutes },
  { path: '/audit-logs', router: auditLogRoutes },
  { path: '/system/stats', router: systemStatsRoutes, prefix: '/api' },
  { path: '/session-tabs', router: sessionTabsRoutes, prefix: '/api' },
  { path: '/sessions', router: sessionsRoutes, prefix: '/api' },
{ path: '/wechat-clawbot', router: wechatClawBotRoutes },
];

// 外部兼容路由列表（不使用 /api 前缀）
const compatRoutes: RouteConfig[] = [
  { path: '/v1', router: openaiCompatRoutes, prefix: '' },  // OpenAI 兼容接口
];

/**
 * 注册所有路由到 Express 应用
 * @param app Express 应用实例
 */
export function registerRoutes(app: Express): void {
  // 注册 API 路由（统一前缀 /api）
  const apiPrefix = '/api';
  apiRoutes.forEach(({ path, router }) => {
    const fullPath = `${apiPrefix}${path}`;
    app.use(fullPath, router);
    logger.info(`[Router] Registered: ${fullPath}`);
  });

  // 注册兼容路由（无额外前缀或自定义前缀）
  compatRoutes.forEach(({ path, router, prefix = '' }) => {
    const fullPath = `${prefix}${path}`;
    app.use(fullPath, router);
    logger.info(`[Router] Registered: ${fullPath} (compat)`);
  });
}

/**
 * 获取路由注册信息（用于调试和文档生成）
 */
export function getRouteInfo(): { api: string[]; compat: string[] } {
  return {
    api: apiRoutes.map(r => `/api${r.path}`),
    compat: compatRoutes.map(r => `${r.prefix || ''}${r.path}`),
  };
}

export { apiRoutes, compatRoutes };
export default registerRoutes;
