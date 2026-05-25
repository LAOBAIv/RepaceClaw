import apiClient from './client';

export interface FileAsset {
  id: string;
  userId: string;
  projectId: string;
  conversationId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  storagePath: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadFileInput {
  fileName: string;
  mimeType: string;
  base64: string;
  projectId?: string;
  conversationId?: string;
  scopeType?: 'user' | 'department' | 'enterprise';
  scopeId?: string;
}

// [2026-05-19] 文件列表筛选参数
export interface FileListParams {
  projectId?: string;
  conversationId?: string;
  startDate?: string;
  endDate?: string;
  type?: 'image' | 'document' | '';
}

export const filesApi = {
  async list(projectIdOrParams?: string | FileListParams, conversationId?: string): Promise<FileAsset[]> {
    const params: Record<string, string> = {};
    if (typeof projectIdOrParams === 'object') {
      // 新版参数格式
      const p = projectIdOrParams;
      if (p.projectId) params.projectId = p.projectId;
      if (p.conversationId) params.conversationId = p.conversationId;
      if (p.startDate) params.startDate = p.startDate;
      if (p.endDate) params.endDate = p.endDate;
      if (p.type) params.type = p.type;
    } else {
      // 兼容旧版调用
      if (projectIdOrParams) params.projectId = projectIdOrParams;
      if (conversationId) params.conversationId = conversationId;
    }
    const res = await apiClient.get('/files', { params });
    return res.data?.data || [];
  },

  async upload(input: UploadFileInput): Promise<FileAsset> {
    const res = await apiClient.post('/files/upload', input);
    return res.data?.data;
  },

  async getAutoAnalysisPrompt(conversationId: string): Promise<string> {
    const res = await apiClient.get('/files/auto-analysis', { params: { conversationId } });
    return res.data?.data?.prompt || '';
  },

  // [2026-05-19] 软删除
  async remove(id: string): Promise<void> {
    await apiClient.delete(`/files/${id}`);
  },

  // [2026-05-19] 关联文件到会话
  async associate(id: string, conversationId: string): Promise<void> {
    await apiClient.put(`/files/${id}/associate`, { conversationId });
  },

  // [2026-05-19] 解除文件与会话的关联
  async disassociate(id: string): Promise<void> {
    await apiClient.put(`/files/${id}/disassociate`);
  },
};

export default filesApi;
