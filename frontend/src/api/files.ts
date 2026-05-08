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
}

export const filesApi = {
  async list(projectId?: string, conversationId?: string): Promise<FileAsset[]> {
    const res = await apiClient.get('/files', { params: { projectId, conversationId } });
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

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/files/${id}`);
  },
};

export default filesApi;
