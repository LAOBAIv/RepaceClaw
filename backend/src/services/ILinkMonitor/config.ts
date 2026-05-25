/**
 * ILinkMonitor Config — 配置加载、同步缓冲
 */
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

const ILINK_ACCOUNT_PATH = '/root/.openclaw/openclaw-weixin/accounts/868c6e16ab10-im-bot.json';
const SYNC_BUF_PATH = '/root/repaceclaw/backend/data/ilink-sync-buf.txt';

export interface ILinkConfig {
  token: string;
  baseUrl: string;
  userId: string;
}

// iLink App ID
let cachedAppId = '';
export function getAppId(): string {
  if (cachedAppId) return cachedAppId;
  try {
    const pkg = JSON.parse(fs.readFileSync('/root/.openclaw/extensions/openclaw-weixin/package.json', 'utf-8'));
    cachedAppId = pkg.ilink_appid || '';
  } catch (err) { logger.warn(`[iLink] Failed to read ilink_appid from package.json: ${err}`); }
  return cachedAppId;
}

export function buildBaseInfo() {
  return { local_id: Date.now().toString(), ...(getAppId() ? { ilink_appid: getAppId() } : {}) };
}

export function loadConfig(): ILinkConfig | null {
  try {
    if (!fs.existsSync(ILINK_ACCOUNT_PATH)) return null;
    return JSON.parse(fs.readFileSync(ILINK_ACCOUNT_PATH, 'utf-8'));
  } catch { return null; }
}

export function loadSyncBuf(): string {
  try { return fs.existsSync(SYNC_BUF_PATH) ? fs.readFileSync(SYNC_BUF_PATH, 'utf-8') : ''; }
  catch { return ''; }
}

export function saveSyncBuf(buf: string): void {
  try {
    const dir = path.dirname(SYNC_BUF_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SYNC_BUF_PATH, buf);
  } catch (err) { logger.warn(`[iLink] Failed to save sync buffer: ${err}`); }
}
