/**
 * wechatClawBot — 微信 ClawBot API 代理路由
 *
 * 代理 OpenClaw Gateway 的微信 ClawBot 官方 API：
 *   - POST /api/wechat-clawbot/qrcode        — 获取扫码登录二维码
 *   - POST /api/wechat-clawbot/qrcode/status — 轮询扫码状态
 *   - POST /api/wechat-clawbot/channel/reset — 重置 IM 通道
 *   - GET  /api/wechat-clawbot/status         — 获取微信连接状态
 *   - GET  /api/wechat-clawbot/ws-status      — 获取 Gateway WebSocket 连接状态
 *   - GET  /api/wechat-clawbot/models         — 获取可用模型列表
 *   - GET  /api/wechat-clawbot/events         — SSE 实时事件流
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { resolveOpenClawGateway } from '../utils/openclawGateway';
import { clawBotClient } from '../services/ClawBotGatewayClient';
import http from 'http';
import https from 'https';

const router = Router();

// 临时缓存二维码原图地址，供放大代理图使用
const qrcodeImageCache = new Map<string, { src: string; createdAt: number }>();
const QRCODE_CACHE_TTL_MS = 10 * 60 * 1000;

function cleanupQrcodeCache() {
  const now = Date.now();
  for (const [key, value] of qrcodeImageCache.entries()) {
    if (now - value.createdAt > QRCODE_CACHE_TTL_MS) {
      qrcodeImageCache.delete(key);
    }
  }
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Gateway HTTP 代理工具 ──────────────────────────────────────────────

const { url: GATEWAY_URL, token: GATEWAY_TOKEN } = resolveOpenClawGateway();

/**
 * 向 Gateway 发起 HTTP 请求
 */
function proxyToGateway(
  method: string,
  path: string,
  body?: any,
  timeout = 30000
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(GATEWAY_URL + path);
    const payload = body ? JSON.stringify(body) : '';

    const lib = url.protocol === 'https:' ? https : http;

    const reqOptions: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GATEWAY_TOKEN,
      },
      timeout,
    };

    if (payload) {
      reqOptions.headers!['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gateway request timeout'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ─── SSE 事件管理 ───────────────────────────────────────────────────────

type SseCallback = (event: string, payload: string) => void;
const sseClients = new Set<SseCallback>();

function broadcastSse(event: string, data: any): void {
  const payload = JSON.stringify(data);
  for (const client of sseClients) {
    try {
      client(event, payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// 注册 Gateway 事件监听
clawBotClient.on('state_change', (data) => {
  broadcastSse('state_change', data);
});

clawBotClient.on('connected', (data) => {
  broadcastSse('connected', data);
});

clawBotClient.on('disconnect', () => {
  broadcastSse('disconnected', {});
});

// 透传 Gateway 事件（通过通配符监听）
clawBotClient.on('*', (data: any) => {
  if (data?.event) {
    broadcastSse('gateway_event', data);
  }
});

// ─── 路由 ────────────────────────────────────────────────────────────────

/**
 * POST /api/wechat-clawbot/qrcode
 */
router.post('/qrcode', async (req: Request, res: Response) => {
  try {
    logger.info('[WechatClawBot] Fetching QR code...');
    const result = await proxyToGateway('POST', '/api/v1/wechat/qrcode');
    if (result.status >= 400) {
      logger.error('[WechatClawBot] Gateway error: ' + result.status);
      return res.status(result.status).json({
        success: false,
        error: 'Gateway returned status ' + result.status,
        detail: result.data,
      });
    }

    cleanupQrcodeCache();
    const payload = result.data && typeof result.data === 'object'
      ? JSON.parse(JSON.stringify(result.data))
      : result.data;

    const originalQrUrl = payload?.data?.qrcode_url;
    const qrToken = payload?.data?.qrcode;
    if (payload?.success && typeof originalQrUrl === 'string' && originalQrUrl) {
      const imageId = String(qrToken || ('qr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)));
      qrcodeImageCache.set(imageId, { src: originalQrUrl, createdAt: Date.now() });
      payload.data.original_qrcode_url = originalQrUrl;
      payload.data.qrcode_url = `/api/wechat-clawbot/qrcode/image?id=${encodeURIComponent(imageId)}`;
    }

    res.json(payload);
  } catch (err: any) {
    logger.error('[WechatClawBot] QR code fetch failed: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/wechat-clawbot/qrcode/image?id=xxx
 * 返回放大后的二维码 SVG，增加白底静区，提升扫码成功率
 */
router.get('/qrcode/image', (req: Request, res: Response) => {
  cleanupQrcodeCache();
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const cached = id ? qrcodeImageCache.get(id) : null;
  if (!cached?.src) {
    return res.status(404).send('QR code image not found or expired');
  }

  const href = escapeXmlAttr(cached.src);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="32" fill="#f3f4f6"/>
  <rect x="92" y="92" width="840" height="840" rx="20" fill="#ffffff"/>
  <image href="${href}" x="132" y="132" width="760" height="760" preserveAspectRatio="none"/>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.send(svg);
});

/**
 * POST /api/wechat-clawbot/qrcode/status
 */
router.post('/qrcode/status', async (req: Request, res: Response) => {
  const { qrcode } = req.body || {};
  if (!qrcode || typeof qrcode !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing required field: qrcode' });
  }
  try {
    const result = await proxyToGateway('POST', '/api/v1/wechat/qrcode/status', { qrcode });
    res.json(result.data);
  } catch (err: any) {
    logger.error('[WechatClawBot] QR status poll failed: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/wechat-clawbot/channel/reset
 */
router.post('/channel/reset', async (req: Request, res: Response) => {
  const { channel_id } = req.body || {};
  if (!channel_id || typeof channel_id !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing required field: channel_id' });
  }
  try {
    logger.info('[WechatClawBot] Resetting channel: ' + channel_id);
    const result = await proxyToGateway('POST', '/api/v1/wechat/channel_reset', { channel_id });
    res.json(result.data);
  } catch (err: any) {
    logger.error('[WechatClawBot] Channel reset failed: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/wechat-clawbot/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const wsState = clawBotClient.getState();
    let channelStatus: any = null;
    try {
      const result = await proxyToGateway('GET', '/api/v1/channels', undefined, 5000);
      if (result.status === 200) {
        channelStatus = result.data;
      }
    } catch {
      // 渠道接口不可用时忽略
    }
    res.json({
      success: true,
      data: { wsConnection: wsState, channelStatus, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/wechat-clawbot/ws-status
 */
router.get('/ws-status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { state: clawBotClient.getState(), timestamp: new Date().toISOString() },
  });
});

/**
 * GET /api/wechat-clawbot/models
 */
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const result = await proxyToGateway('GET', '/v1/models', undefined, 10000);
    res.json(result.data);
  } catch (err: any) {
    logger.error('[WechatClawBot] Models fetch failed: ' + err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/wechat-clawbot/events
 * SSE 实时事件流
 */
router.get('/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const initState = JSON.stringify({ state: clawBotClient.getState() });
  res.write('event: state\ndata: ' + initState + '\n\n');

  const client: SseCallback = (event, payload) => {
    res.write('event: ' + event + '\ndata: ' + payload + '\n\n');
  };

  sseClients.add(client);

  const keepalive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      cleanup();
    }
  }, 15000);

  function cleanup() {
    clearInterval(keepalive);
    sseClients.delete(client);
  }

  req.on('close', cleanup);
  req.on('error', cleanup);
});

export default router;
