import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getDb } from '../db/client';

function execToRows(db: any, sql: string, params?: any[]): any[] {
  const result = params ? db.exec(sql, params) : db.exec(sql);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map((row: any[]) => {
    const obj: any = {};
    cols.forEach((c: string, i: number) => (obj[c] = row[i]));
    return obj;
  });
}

function formatSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function absStoragePath(relPath: string): string {
  return path.join(__dirname, '../../', relPath);
}

function tryReadTextSnippet(filePath: string, maxChars = 800): string | null {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
  } catch {
    return null;
  }
}

const summaryCache = new Map<string, string>();

function runPythonXlsxSummary(filePath: string): string | null {
  try {
    const script = String.raw`
import json, sys
from openpyxl import load_workbook

file_path = sys.argv[1]
wb = load_workbook(file_path, read_only=True, data_only=True)
sheet_names = list(wb.sheetnames or [])
if not sheet_names:
    print(json.dumps({"ok": True, "summary": "Excel 文件为空"}, ensure_ascii=False))
    raise SystemExit(0)

ws = wb[sheet_names[0]]
max_row = ws.max_row or 0
max_col = ws.max_column or 0
rows = []
for row in ws.iter_rows(min_row=1, max_row=min(max_row, 4), values_only=True):
    vals = []
    for v in list(row)[:12]:
        if v is None:
            vals.append("")
        else:
            vals.append(str(v).strip()[:60])
    rows.append(vals)
header = [v for v in (rows[0] if rows else []) if v]
samples = []
for r in rows[1:3]:
    clean = [v for v in r if v]
    if clean:
        samples.append(clean[:8])
summary = {
    "ok": True,
    "sheetCount": len(sheet_names),
    "sheetNames": sheet_names[:5],
    "firstSheet": sheet_names[0],
    "rowCount": max_row,
    "columnCount": max_col,
    "header": header[:12],
    "samples": samples[:2],
}
print(json.dumps(summary, ensure_ascii=False))
`;
    const raw = execFileSync('python3', ['-c', script, filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    }).trim();
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.ok !== true) return null;
    if (data.summary) return String(data.summary);
    return `Excel，共 ${Number(data.sheetCount || 0)} 个 sheet；sheet：${Array.isArray(data.sheetNames) ? data.sheetNames.join('、') : '未识别'}；首个 sheet：${data.firstSheet || '未识别'}；约 ${Number(data.rowCount || 0)} 行 × ${Number(data.columnCount || 0)} 列；表头：${Array.isArray(data.header) && data.header.length ? data.header.join('、') : '未识别'}；样本：${Array.isArray(data.samples) && data.samples.length ? data.samples.map((row: string[]) => row.join('、')).join(' | ') : '无'}`;
  } catch {
    return null;
  }
}

async function buildSingleFileSummary(file: any): Promise<string> {
  const relPath = String(file.storage_path || '');
  const filePath = absStoragePath(relPath);
  const ext = String(file.extension || '').toLowerCase();
  const base = `- ${file.original_name}（${formatSize(Number(file.size_bytes || 0))}）`;
  const cacheKey = `${file.id || relPath}:${file.updated_at || file.created_at || ''}:${file.size_bytes || 0}`;
  if (summaryCache.has(cacheKey)) return summaryCache.get(cacheKey)!;

  if (!relPath || !fs.existsSync(filePath)) {
    const result = `${base}；文件已登记，但磁盘路径不可读`;
    summaryCache.set(cacheKey, result);
    return result;
  }

  if (ext === '.txt' || ext === '.md' || ext === '.json') {
    const snippet = tryReadTextSnippet(filePath);
    const result = snippet ? `${base}；内容摘要：${snippet}` : `${base}；文本文件，暂未提取内容`;
    summaryCache.set(cacheKey, result);
    return result;
  }

  if (ext === '.csv') {
    const snippet = tryReadTextSnippet(filePath, 500);
    const result = snippet ? `${base}；CSV 摘要：${snippet}` : `${base}；CSV 文件，暂未提取内容`;
    summaryCache.set(cacheKey, result);
    return result;
  }

  if (ext === '.xlsx') {
    const excelSummary = runPythonXlsxSummary(filePath);
    const result = excelSummary ? `${base}；${excelSummary}` : `${base}；Excel 文件已上传，但结构摘要暂未生成`;
    summaryCache.set(cacheKey, result);
    return result;
  }

  if (ext === '.xls') {
    const result = `${base}；Excel 97-2003 文件已上传，当前环境暂未启用 .xls 结构解析，可先根据文件名执行初步分析`;
    summaryCache.set(cacheKey, result);
    return result;
  }

  const result = `${base}；文件类型：${ext || 'unknown'}，已上传并可在后续分析链中读取`;
  summaryCache.set(cacheKey, result);
  return result;
}

export const FileContextService = {
  async buildConversationFileContext(userId: string, conversationId: string): Promise<string> {
    if (!userId || !conversationId) return '';
    const db = getDb();
    const rows = execToRows(
      db,
      `SELECT id, original_name, mime_type, extension, size_bytes, storage_path, created_at, updated_at
       FROM file_assets
       WHERE user_id=? AND conversation_id=?
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId, conversationId]
    );

    if (!rows.length) return '';

    const summaries = [] as string[];
    for (const row of rows) {
      summaries.push(await buildSingleFileSummary(row));
    }

    return [
      '## 当前会话已上传文件',
      '以下文件已与当前会话绑定。回答时请优先结合这些文件的名称、结构摘要与内容摘要理解用户问题；若用户明确要求分析某个文件，请以该文件为主。',
      ...summaries,
    ].join('\n');
  },

  async buildLatestFileAutoAnalysisPrompt(userId: string, conversationId: string): Promise<string> {
    if (!userId || !conversationId) return '';
    const db = getDb();
    const rows = execToRows(
      db,
      `SELECT id, original_name, mime_type, extension, size_bytes, storage_path, created_at, updated_at
       FROM file_assets
       WHERE user_id=? AND conversation_id=?
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, conversationId]
    );
    if (!rows.length) return '';
    const latest = rows[0];
    const summary = await buildSingleFileSummary(latest);
    return [
      `请基于刚上传的文件《${latest.original_name}》做初步分析。`,
      '要求：',
      '1. 先确认你已识别到该文件；',
      '2. 基于文件名、类型、结构摘要或内容摘要，给出初步判断；',
      '3. 输出该文件可能的用途、你已经识别出的关键信息、以及下一步建议；',
      '4. 如果当前只能拿到结构摘要，也要明确说明，不要假装已完整读取全部内容。',
      '',
      '文件摘要如下：',
      summary,
    ].join('\n');
  },
};

export default FileContextService;
