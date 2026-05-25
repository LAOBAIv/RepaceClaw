/**
 * ILinkMonitor API — HTTP 请求、iLink API 调用、图片下载、AES 解密
 */
import * as https from 'https';
import * as http from 'http';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../types/ilink';
import { ILinkConfig, loadConfig, buildBaseInfo } from './config';

// ── HTTP 请求工具 ─────────────────────────────────────────────
function apiPost(baseUrl: string, endpoint: string, body: string, token?: string, timeoutMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/${endpoint}`);
    const lib = url.protocol === 'https:' ? https : http;
    const timeout = timeoutMs || 10000;

    const req = lib.request({
      hostname: url.hostname,
      port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { 'Authorization': `Bearer ${token}`, 'AuthorizationType': 'ilink_bot_token' } : {}),
      },
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        } else {
          resolve(data);
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── iLink API ─────────────────────────────────────────────────
export async function getUpdates(config: ILinkConfig, syncBuf: string): Promise<unknown> {
  const body = JSON.stringify({ get_updates_buf: syncBuf, base_info: buildBaseInfo() });
  const raw = await apiPost(config.baseUrl, 'ilink/bot/getupdates', body, config.token, 40000);
  return JSON.parse(raw);
}

export async function sendMessage(config: ILinkConfig, toUserId: string, text: string, contextToken?: string): Promise<boolean> {
  const msgPayload: Record<string, unknown> = {
    from_user_id: '',
    to_user_id: toUserId,
    client_id: `rc-${Date.now()}`,
    message_type: 2,
    message_state: 2,
    item_list: [{ type: 1, text_item: { text } }],
  };
  if (contextToken) msgPayload.context_token = contextToken;
  const body = JSON.stringify({ msg: msgPayload, base_info: buildBaseInfo() });
  try {
    const resp = await apiPost(config.baseUrl, 'ilink/bot/sendmessage', body, config.token);
    logger.info(`[iLink][RC-ILinkMonitor] sendMessage resp: ${resp.slice(0, 200)}`);
    return true;
  } catch (e: unknown) {
    logger.error(`[iLink] sendMessage failed: ${getErrorMessage(e)}`);
    return false;
  }
}

export async function sendTyping(config: ILinkConfig, ilinkUserId: string, typingTicket?: string): Promise<void> {
  const body = JSON.stringify({
    ilink_user_id: ilinkUserId,
    typing_ticket: typingTicket || '',
    status: 1,
    base_info: buildBaseInfo(),
  });
  try {
    await apiPost(config.baseUrl, 'ilink/bot/sendtyping', body, config.token, 5000);
  } catch (err) { logger.warn(`[iLink] sendTyping failed: ${err}`); }
}

export async function getConfig(config: ILinkConfig, ilinkUserId: string, contextToken?: string): Promise<unknown> {
  const body = JSON.stringify({
    ilink_user_id: ilinkUserId,
    context_token: contextToken || '',
    base_info: buildBaseInfo(),
  });
  const resp = await apiPost(config.baseUrl, 'ilink/bot/getconfig', body, config.token, 5000);
  return JSON.parse(resp);
}

// ── 图片下载 & AES 解密 ──────────────────────────────────────
function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.get({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      timeout: 30000,
      headers: { 'Authorization': `Bearer ${loadConfig()?.token || ''}`, 'AuthorizationType': 'ilink_bot_token' },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
    req.on('error', reject);
  });
}

function decryptAesEcb(encrypted: Buffer, aesKeyBase64: string): Buffer {
  const crypto = require('crypto');
  let keyBuf = Buffer.from(aesKeyBase64, 'base64');
  if (keyBuf.length === 32 && /^[0-9a-fA-F]{32}$/.test(keyBuf.toString('ascii'))) {
    keyBuf = Buffer.from(keyBuf.toString('ascii'), 'hex');
  }
  if (keyBuf.length !== 16) throw new Error(`AES key must be 16 bytes, got ${keyBuf.length}`);
  const decipher = crypto.createDecipheriv('aes-128-ecb', keyBuf, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export async function downloadImageAsBase64(config: ILinkConfig, imageItem: unknown): Promise<string | null> {
  try {
    const item = imageItem as Record<string, unknown>;
    logger.info(`[iLink] image_item structure: ${JSON.stringify(imageItem).slice(0, 500)}`);

    const media = item.media as Record<string, unknown> | undefined;
    if (!media) { logger.warn('[iLink] No media field in image_item'); return null; }

    let downloadUrl = '';
    if (media.full_url) downloadUrl = media.full_url as string;
    else if (media.encrypt_query_param) downloadUrl = `${config.baseUrl}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param as string)}`;
    if (!downloadUrl) { logger.warn('[iLink] No download URL for image'); return null; }

    let aesKeyBase64 = '';
    if (item.aeskey) aesKeyBase64 = Buffer.from(item.aeskey as string, 'hex').toString('base64');
    else if (media.aes_key) aesKeyBase64 = media.aes_key as string;

    logger.info(`[iLink] Downloading image: url=${downloadUrl.slice(0, 80)}... hasAesKey=${!!aesKeyBase64}`);

    const encryptedBuf = await downloadBuffer(downloadUrl);
    logger.info(`[iLink] Downloaded ${encryptedBuf.length} bytes`);

    let imageBuf: Buffer;
    if (aesKeyBase64) {
      imageBuf = decryptAesEcb(encryptedBuf, aesKeyBase64);
      logger.info(`[iLink] Decrypted to ${imageBuf.length} bytes`);
    } else {
      imageBuf = encryptedBuf;
    }

    const base64 = imageBuf.toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (e: unknown) {
    logger.error(`[iLink] Failed to download/decrypt image: ${getErrorMessage(e)}`);
    return null;
  }
}
