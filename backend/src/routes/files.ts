import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getDb, saveDb } from '../db/client';
import { sendCreated, sendNoContent, sendNotFound, sendSuccess, sendValidationError } from '../utils/response';
import FileContextService from '../services/FileContextService';

const router = Router();

const UploadSchema = z.object({
  fileName: z.string().min(1, '文件名不能为空'),
  mimeType: z.string().default('application/octet-stream'),
  base64: z.string().min(1, '文件内容不能为空'),
  projectId: z.string().optional(),
  conversationId: z.string().optional(),
});

const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.md', '.txt', '.json']);
const UPLOAD_ROOT = path.join(__dirname, '../../uploads');

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim();
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || '';
    const projectId = String(req.query.projectId || '').trim();
    const conversationId = String(req.query.conversationId || '').trim();
    const db = getDb();

    let sql = `SELECT id, user_id, project_id, conversation_id, original_name, stored_name, mime_type, extension, size_bytes, storage_path, status, created_at, updated_at
               FROM file_assets WHERE user_id=?`;
    const params: any[] = [userId];
    if (projectId) {
      sql += ' AND project_id=?';
      params.push(projectId);
    }
    if (conversationId) {
      sql += ' AND conversation_id=?';
      params.push(conversationId);
    }
    sql += ' ORDER BY created_at DESC';

    const result = db.exec(sql, params);
    const rows = !result.length
      ? []
      : result[0].values.map((row: any[]) => ({
          id: row[0],
          userId: row[1],
          projectId: row[2],
          conversationId: row[3],
          originalName: row[4],
          storedName: row[5],
          mimeType: row[6],
          extension: row[7],
          sizeBytes: Number(row[8] || 0),
          storagePath: row[9],
          status: row[10],
          createdAt: row[11],
          updatedAt: row[12],
        }));

    sendSuccess(res, rows);
  })
);

router.post(
  '/upload',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = UploadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendValidationError(res, '上传参数错误', parsed.error.flatten());
    }

    const userId = req.user?.id || '';
    const { fileName, mimeType, base64, projectId = '', conversationId = '' } = parsed.data;
    const safeName = sanitizeFileName(fileName);
    const ext = path.extname(safeName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return sendValidationError(res, `暂不支持该文件格式：${ext || 'unknown'}`);
    }

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      return sendValidationError(res, '文件内容为空');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      return sendValidationError(res, '文件过大，单文件最大 50MB');
    }

    const fileId = randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    const dateDir = nowIso.slice(0, 10);
    const userDir = path.join(UPLOAD_ROOT, userId, dateDir);
    ensureDir(userDir);

    const storedName = `${fileId}${ext}`;
    const absPath = path.join(userDir, storedName);
    fs.writeFileSync(absPath, buffer);

    const relPath = path.relative(path.join(__dirname, '../../'), absPath).replace(/\\/g, '/');
    const db = getDb();
    db.run(
      `INSERT INTO file_assets (
        id, user_id, project_id, conversation_id, original_name, stored_name, mime_type, extension, size_bytes, storage_path, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fileId,
        userId,
        projectId,
        conversationId,
        safeName,
        storedName,
        mimeType,
        ext,
        buffer.length,
        relPath,
        'uploaded',
        nowIso,
        nowIso,
      ]
    );
    saveDb();

    sendCreated(res, {
      id: fileId,
      userId,
      projectId,
      conversationId,
      originalName: safeName,
      storedName,
      mimeType,
      extension: ext,
      sizeBytes: buffer.length,
      storagePath: relPath,
      status: 'uploaded',
      createdAt: nowIso,
      updatedAt: nowIso,
    }, '文件上传成功');
  })
);

router.get(
  '/auto-analysis',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || '';
    const conversationId = String(req.query.conversationId || '').trim();
    if (!conversationId) {
      return sendValidationError(res, '缺少 conversationId');
    }

    const prompt = await FileContextService.buildLatestFileAutoAnalysisPrompt(userId, conversationId);
    sendSuccess(res, { prompt });
  })
);

router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || '';
    const fileId = req.params.id;
    const db = getDb();
    const result = db.exec(
      `SELECT id, storage_path FROM file_assets WHERE id=? AND user_id=? LIMIT 1`,
      [fileId, userId]
    );
    if (!result.length || !result[0].values.length) {
      return sendNotFound(res, '文件');
    }

    const row = result[0].values[0];
    const relPath = String(row[1] || '');
    const absPath = path.join(__dirname, '../../', relPath);
    try {
      if (relPath && fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch {}

    db.run(`DELETE FROM file_assets WHERE id=? AND user_id=?`, [fileId, userId]);
    saveDb();
    sendNoContent(res);
  })
);

export default router;
