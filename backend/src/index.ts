/**
 * RepaceClaw 后端服务入口
 * 
 * 优化后的架构：
 * 1. 路由统一管理 - 所有路由在 routes/index.ts 中集中注册
 * 2. 中间件统一配置 - 错误处理、鉴权等中间件统一配置
 * 3. 统一响应格式 - 使用 response.ts 中的工具函数
 * 4. 类型安全 - 使用 types/index.ts 中的类型定义
 */

import express from 'express';
import { logger } from './utils/logger';
import cors from 'cors';
import http from 'http';
import path from 'path';

import { initDb, getDb } from './db/client';
import { dbConfig } from './db/config';
import { registerRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import { setupWebSocket } from './ws/wsHandler';
import * as AgentBridge from './services/AgentBridge';
import { clawBotClient } from './services/ClawBotGatewayClient';

// 环境变量配置
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

/**
 * 启动应用主函数
 */
async function main(): Promise<void> {
  // 1. 初始化数据库（根据 DB_TYPE 自动选择 SQLite / PostgreSQL）
  await initDb();
  logger.info(`[DB] Database initialized: ${dbConfig.type === 'postgres' ? `PG@${dbConfig.postgresHost}/${dbConfig.postgresDB}` : 'SQLite'}`);


  // 1.5 Route C Phase 1: 全量同步 Agent 到 OpenClaw
  try {
    logger.info('[AgentBridge] Syncing agents to OpenClaw...');
    const report = await AgentBridge.syncAllAgents();
    logger.info(`[AgentBridge] Sync result: ${report.registered}/${report.total} registered, ${report.errors.length} errors`);
  } catch (err: any) {
    logger.error('[AgentBridge] Startup sync failed:', err.message);
  }

  // 1.6 初始化 OpenClaw Gateway WebSocket 客户端
  try {
    clawBotClient.connect();
    logger.info("[ClawBotGateway] WebSocket client initialized");
  } catch (err: any) {
    logger.warn("[ClawBotGateway] Failed to initialize WS client: " + err.message);
  }

  // 2. 创建 Express 应用
  const app = express();

  // 3. 全局中间件配置
  setupGlobalMiddleware(app);

  // 3.5 Phase 1：全链路 Request ID
  app.use(requestIdMiddleware);

  // 3.5.1 HTTP 请求日志
  app.use(requestLogger);

  // 3.6 Phase 1：API 全局限流（非认证接口）
  app.use('/api/v1', authLimiter);  // OpenAI 兼容接口更严格

  // 3.7 Phase 1：认证路由（登录/注册不鉴权但限流）
  app.use('/api/auth', authLimiter);

  // 3.8 Phase 1：全局 JWT 鉴权（排除登录注册和 OpenAI 兼容接口）
  const publicPaths = ['/auth', '/v1', '/health', '/wechat-clawbot'];
  app.use('/api', (req, res, next) => {
    if (publicPaths.some(p => req.path.startsWith(p))) return next();
    authenticate(req, res, next);
  });

  // 4. 注册健康检查路由（在 API 路由之前）
  setupHealthCheck(app);

  // 5. 注册 API 路由
  registerRoutes(app);
  logger.info('[Router] All routes registered');

  // 6. 静态文件服务（生产环境）
  setupStaticFiles(app);

  // 7. 404 处理（API 路由未匹配时）
  app.use(notFoundHandler);

  // 8. 全局错误处理（必须放在最后）
  app.use(errorHandler);

  // 9. 创建 HTTP 服务器并附加 WebSocket
  const server = http.createServer(app);
  setupWebSocket(server);

  // 10. 监听端口错误（EADDRINUSE 等）
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`[Server] Port ${PORT} is already in use.`);
      const { execSync } = require('child_process');
      try {
        const output = execSync(`lsof -t -i :${PORT} 2>/dev/null || ss -tlnp "sport = :${PORT}" | grep -oP 'pid=\K\d+' | head -1`, { encoding: 'utf-8' }).trim();
        if (output) {
          const pid = output.split('\n')[0];
          logger.warn(`[Server] Found stale process PID=${pid} on port ${PORT}, killing...`);
          process.kill(parseInt(pid), 'SIGTERM');
          setTimeout(() => {
            logger.info(`[Server] Retrying to listen on port ${PORT}...`);
            server.listen(PORT);
          }, 2000);
          return;
        }
      } catch (e) {
        logger.error('[Server] Failed to identify stale process');
      }
      logger.error(`[Server] Cannot bind to port ${PORT}. Manual intervention required.`);
      process.exit(1);
      return;
    }
    logger.error('[Server] Server error', { code: err.code, message: err.message });
    process.exit(1);
  });

  // 11. 启动服务器
  server.listen(PORT, () => {
    logger.info('='.repeat(60));
    logger.info(`[Server] RepaceClaw Backend Server`);
    logger.info(`[Server] Environment: ${NODE_ENV}`);
    logger.info(`[Server] HTTP: http://localhost:${PORT}`);
    logger.info(`[Server] WebSocket: ws://localhost:${PORT}/ws`);
    logger.info('='.repeat(60));
  });

  // 12. 优雅关闭
  let isShuttingDown = false;
  async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`[Server] Received ${signal}, shutting down gracefully...`);

    try {
      // 先断开 Gateway WebSocket，避免 close 事件再次触发重连
      clawBotClient.disconnect();
    } catch (err: any) {
      logger.warn('[Server] Failed to disconnect ClawBot client during shutdown: ' + err.message);
    }

    // 不等待 server.close 回调，避免长连接/SSE 卡住退出
    server.close(() => {
      logger.info('[Server] HTTP server closed');
    });

    setTimeout(() => {
      logger.info('[Server] Shutdown complete');
      process.exit(0);
    }, 500).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

/**
 * 配置全局中间件
 */
function setupGlobalMiddleware(app: express.Application): void {
  app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '10mb', strict: true }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  if (NODE_ENV === 'development') {
    app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      logger.info(`[${timestamp}] ${req.method} ${req.path}`);
      next();
    });
  }
}

/**
 * 配置健康检查端点
 */
function setupHealthCheck(app: express.Application): void {
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'repaceclaw-backend',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get('/health/detail', async (req, res) => {
    const checks = { database: 'unknown', timestamp: new Date().toISOString() };
    try {
      const db = getDb();
      db.exec('SELECT 1');
      checks.database = 'ok';
    } catch (error) {
      checks.database = 'error';
    }
    const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'unknown' || typeof v === 'string');
    res.status(allOk ? 200 : 503).json({ status: allOk ? 'ok' : 'degraded', checks });
  });
}

/**
 * 配置静态文件服务
 */
function setupStaticFiles(app: express.Application): void {
  const staticPath = path.join(__dirname, '../../frontend/dist');
  if (require('fs').existsSync(staticPath)) {
    const indexFile = path.join(staticPath, 'index.html');
    const sendIndexNoCache = (res: express.Response) => {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.sendFile(indexFile);
    };
    app.get('/', (req, res) => sendIndexNoCache(res));
    app.get('/index.html', (req, res) => sendIndexNoCache(res));
    app.use(express.static(staticPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          return;
        }
        if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
        }
      },
    }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/v1') || req.path.startsWith('/ws') || req.path.startsWith('/health')) {
        return next();
      }
      sendIndexNoCache(res);
    });
    logger.info('[Static] Serving frontend from: ' + staticPath);
  } else {
    logger.info('[Static] Frontend dist not found at: ' + staticPath);
  }
}

// 启动应用
main().catch((err) => {
  logger.error('[Fatal] Server startup failed:', err);
  if (err instanceof Error && err.stack) {
    logger.error('[Fatal] Stack trace:', { stack: err.stack });
  }
  process.exit(1);
});

// 全局未捕获异常处理
const FATAL_EXIT_ERRORS = new Set(['MODULE_NOT_FOUND', 'ERR_REQUIRE_ESM']);

process.on('uncaughtException', (err) => {
  const errnoErr = err as NodeJS.ErrnoException;
  if (errnoErr.code === 'EADDRINUSE') return;
  logger.error('[Process] Uncaught exception', { message: err.message, stack: err.stack });
  const shouldExit = errnoErr.code && FATAL_EXIT_ERRORS.has(errnoErr.code as string);
  if (shouldExit) { process.exit(1); }
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Process] Unhandled rejection', { reason: String(reason) });
});
