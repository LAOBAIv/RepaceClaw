/**
 * ClawBotGatewayClient — OpenClaw Gateway WebSocket 客户端
 *
 * 功能：
 *  1. WebSocket 连接到 Gateway（自动握手 + Token 认证）
 *  2. req/res 请求封装（Promise 化）
 *  3. 事件监听（agent、chat、session.message 等）
 *  4. 自动重连 + 心跳
 *  5. 单例模式
 *
 * 用法：
 *   import { clawBotClient } from '../services/ClawBotGatewayClient';
 *   clawBotClient.connect();
 *   const result = await clawBotClient.request('chat.send', { ... });
 *   clawBotClient.on('chat', (data) => { ... });
 */

import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { resolveOpenClawGateway } from '../utils/openclawGateway';

// ─── 类型定义 ────────────────────────────────────────────────────────────

type EventCallback = (data: any) => void;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// ─── 配置 ────────────────────────────────────────────────────────────────

const RECONNECT_BASE_DELAY = 2000;
const RECONNECT_MAX_DELAY = 30000;
const HEARTBEAT_INTERVAL = 30000;
const REQUEST_TIMEOUT = 60000;

// ─── 客户端实现 ──────────────────────────────────────────────────────────

class ClawBotGatewayClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private eventListeners = new Map<string, Set<EventCallback>>();
  private requestCounter = 0;

  // ─── 连接管理 ────────────────────────────────────────────────────────

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      logger.info('[ClawBotGateway] Already connected or connecting');
      return;
    }

    const { url: gatewayUrl, token } = resolveOpenClawGateway();
    const wsUrl = gatewayUrl.replace(/^http/, 'ws');

    this.setState('connecting');
    logger.info('[ClawBotGateway] Connecting to ' + wsUrl + '...');

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err: any) {
      logger.error('[ClawBotGateway] WebSocket creation failed: ' + err.message);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      logger.info('[ClawBotGateway] Connection opened, sending auth...');
      this.sendConnect(token);
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (err: any) {
        logger.warn('[ClawBotGateway] Failed to parse message: ' + err.message);
      }
    });

    this.ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'n/a';
      logger.info('[ClawBotGateway] Connection closed: code=' + code + ' reason=' + reasonStr);
      this.cleanup();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      logger.error('[ClawBotGateway] WebSocket error: ' + err.message);
    });

    this.ws.on('pong', () => {
      // 心跳响应正常
    });
  }

  disconnect(): void {
    this.stopReconnect();
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.setState('disconnected');
  }

  getState(): ConnectionState {
    return this.state;
  }

  // ─── 请求/响应 ────────────────────────────────────────────────────────

  request(method: string, params: Record<string, any> = {}, timeout = REQUEST_TIMEOUT): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Gateway not connected'));
        return;
      }

      const id = 'req_' + (++this.requestCounter) + '_' + Date.now();

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout: ' + method + ' (' + timeout + 'ms)'));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.ws.send(JSON.stringify({
        type: 'req',
        id,
        method,
        params,
      }));

      logger.debug('[ClawBotGateway] -> req id=' + id + ' method=' + method);
    });
  }

  // ─── 事件系统 ─────────────────────────────────────────────────────────

  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    // Specific listeners
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(data);
        } catch (err: any) {
          logger.error('[ClawBotGateway] Event handler error for "' + event + '": ' + err.message);
        }
      }
    }
    // Wildcard listeners
    const wildcards = this.eventListeners.get('*');
    if (wildcards) {
      const enriched = { event, ...data };
      for (const cb of wildcards) {
        try {
          cb(enriched);
        } catch (err: any) {
          logger.error('[ClawBotGateway] Wildcard handler error: ' + err.message);
        }
      }
    }
  }

  // ─── 内部方法 ─────────────────────────────────────────────────────────

  private sendConnect(token: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Gateway 要求第一帧为 { type: "req", method: "connect", params: ConnectParams }
    // ConnectParams 必须包含 minProtocol, maxProtocol, client, auth
    const connectFrame = {
      type: 'req',
      id: 'connect_' + Date.now(),
      method: 'connect',
      params: {
        minProtocol: 1,
        maxProtocol: 3,
        client: {
          id: 'node-host',
          displayName: 'RepaceClaw Backend',
          version: '1.0.0',
          platform: 'server',
          mode: 'backend',
        },
        auth: {
          token,
        },
      },
    };

    this.ws.send(JSON.stringify(connectFrame));
  }

  private handleMessage(msg: any): void {
    // 连接成功响应：Gateway 返回 { type: "res", ok: true, payload: { type: "hello-ok", ... } }
    if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
      logger.info('[ClawBotGateway] Authenticated successfully');
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.emit('connected', msg.payload);
      return;
    }

    if (msg.type === 'res' && msg.ok === false) {
      // 请求失败
      logger.warn('[ClawBotGateway] Request failed: ' + (msg.error?.message || JSON.stringify(msg.error)));
    }

    if (msg.type === 'event') {
      // Gateway 事件推送
      const eventName = msg.event || msg.type;
      logger.debug('[ClawBotGateway] Event: ' + eventName);
      this.emit(eventName, msg.payload || msg);

      if (eventName === 'shutdown') {
        logger.warn('[ClawBotGateway] Gateway shutting down');
        this.disconnect();
      }
      return;
    }

    // 响应处理（非 hello-ok 的普通响应）
    if (msg.type === 'res') {
      const { id, ok, payload, error } = msg;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        this.pendingRequests.delete(id);
        clearTimeout(pending.timer);
        if (ok) {
          pending.resolve(payload);
        } else {
          const errMsg = error?.message || error || 'Gateway request failed';
          pending.reject(new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg)));
        }
      }
      return;
    }
  }

  private setState(state: ConnectionState): void {
    const prev = this.state;
    this.state = state;
    if (prev !== state) {
      this.emit('state_change', { from: prev, to: state });
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();
  }

  private scheduleReconnect(): void {
    this.stopReconnect();
    if (this.state === 'disconnected') return;

    this.setState('reconnecting');
    this.reconnectAttempts++;

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(1.5, this.reconnectAttempts - 1),
      RECONNECT_MAX_DELAY
    );

    const jitter = delay * (0.5 + Math.random() * 0.5);

    logger.info('[ClawBotGateway] Reconnecting in ' + Math.round(jitter) + 'ms (attempt ' + this.reconnectAttempts + ')');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, jitter);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ─── 单例导出 ────────────────────────────────────────────────────────────

export const clawBotClient = new ClawBotGatewayClient();
