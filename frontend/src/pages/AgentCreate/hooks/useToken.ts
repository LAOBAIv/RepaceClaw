/**
 * useToken - Token 接入配置 Hook
 *
 * 职责：
 * - 管理 Token 弹窗状态（tokenModalOpen）
 * - 管理 Token 值、Base URL、显示/隐藏、复制状态
 * - 管理弹窗内临时值（tempTokenValue, tempCustomUrl, tempTokenModel）
 * - 提供打开/关闭/确认 Token 弹窗的操作函数
 * - 提供 hasBackendKey 计算属性
 * - 提供 handleCopyToken 复制功能
 */
import { useState, useCallback } from 'react';
import { showToast } from '@/components/Toast';
import type { CodeChannel, CodeModel } from '../types';
import { saveTokenCache } from '../utils';
import type { TokenChannel } from '@/api/tokenChannels';

export interface UseTokenReturn {
  // 弹窗状态
  tokenModalOpen: boolean;
  // Token 值
  tokenValue: string;
  customBaseUrl: string;
  showToken: boolean;
  copied: boolean;
  // 弹窗内临时状态
  tempTokenValue: string;
  tempCustomUrl: string;
  tempTokenModel: CodeModel | null;
  // 计算属性
  hasBackendKey: boolean;
  // 操作函数
  setTokenValue: (v: string) => void;
  setCustomBaseUrl: (v: string) => void;
  openTokenModal: (selectedChannel: CodeChannel, selectedModel: CodeModel | null) => void;
  closeTokenModal: () => void;
  confirmTokenModal: (
    selectedChannel: CodeChannel,
    hasBackendKey: boolean,
    // [2026-05-24] 类型安全
    presetChannel: TokenChannel | null,
    customMaxTokens: string,
    customTemp: string,
    customTopP: string,
    customFreqPenalty: string,
    customPresPenalty: string,
    setSelectedModel: (m: CodeModel) => void,
  ) => void;
  handleCopyToken: () => void;
}

export function useToken(
  dynamicChannels: CodeChannel[],
  selectedChannel: CodeChannel,
): UseTokenReturn {
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenValue, setTokenValue] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  // 弹窗内临时状态
  const [tempTokenValue, setTempTokenValue] = useState('');
  const [tempCustomUrl, setTempCustomUrl] = useState('');
  const [tempTokenModel, setTempTokenModel] = useState<CodeModel | null>(null);

  // 计算当前渠道是否已在后台配置了 API Key
  const hasBackendKey = useCallback(() => {
    if (!selectedChannel) return false;
    const bc = dynamicChannels.find(ch => ch.id === selectedChannel.id);
    return !!bc?.hasBackendKey;
  }, [selectedChannel, dynamicChannels]);

  const openTokenModal = useCallback((selChannel: CodeChannel, selModel: CodeModel | null) => {
    setTempTokenModel(selModel);
    setTempTokenValue(tokenValue);
    setTempCustomUrl(customBaseUrl);
    setShowToken(false);
    setTokenModalOpen(true);
  }, [tokenValue, customBaseUrl]);

  const closeTokenModal = useCallback(() => {
    setTokenModalOpen(false);
  }, []);

  const confirmTokenModal = useCallback((
    selChannel: CodeChannel,
    hbk: boolean,
    // [2026-05-24] 类型安全
    presetChannel: TokenChannel | null,
    cMaxTokens: string,
    cTemp: string,
    cTopP: string,
    cFreqPenalty: string,
    cPresPenalty: string,
    setSelModel: (m: CodeModel) => void,
  ) => {
    if (!selChannel) return;
    // 平台预设 + 后台已配置Key：直接确认
    if (hbk) {
      setTokenValue('__backend_key__');
      setCustomBaseUrl('');
      setTokenModalOpen(false);
      return;
    }

    const isCustomChannel = selChannel.id === 'custom';
    const resolvedUrl = isCustomChannel ? tempCustomUrl.trim() : selChannel.baseUrl;
    const resolvedModelId = tempTokenModel?.id?.trim() || '';

    if (isCustomChannel) {
      if (!resolvedUrl) {
        showToast('请填写自定义渠道的 API Base URL', 'warning');
        return;
      }
      if (!/^https?:\/\//i.test(resolvedUrl)) {
        showToast('自定义 Base URL 必须以 http:// 或 https:// 开头', 'warning');
        return;
      }
      if (!resolvedModelId) {
        showToast('请填写自定义模型 ID', 'warning');
        return;
      }
    }

    if (!tempTokenValue.trim()) {
      showToast('请填写 API Key', 'warning');
      return;
    }

    setTokenValue(tempTokenValue.trim());
    setCustomBaseUrl(resolvedUrl);

    // 写入本地缓存
    saveTokenCache(selChannel.id, {
      apiKey: tempTokenValue.trim(),
      baseUrl: resolvedUrl,
      modelId: resolvedModelId,
    });

    // 同步 Token 弹窗中选择的模型回 CODE 渠道选中模型
    if (tempTokenModel) {
      setSelModel({
        ...tempTokenModel,
        id: resolvedModelId || tempTokenModel.id,
        name: tempTokenModel.name?.trim() || resolvedModelId || tempTokenModel.id,
        maxTokens: Number(cMaxTokens) || tempTokenModel.maxTokens,
        temperature: Number(cTemp) || tempTokenModel.temperature,
        topP: Number(cTopP) || tempTokenModel.topP,
        frequencyPenalty: Number(cFreqPenalty) || tempTokenModel.frequencyPenalty,
        presencePenalty: Number(cPresPenalty) || tempTokenModel.presencePenalty,
      });
    }

    setTokenModalOpen(false);
  }, [tempTokenValue, tempCustomUrl, tempTokenModel]);

  const handleCopyToken = useCallback(() => {
    if (!tokenValue) return;
    navigator.clipboard.writeText(tokenValue).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [tokenValue]);

  return {
    tokenModalOpen, tokenValue, customBaseUrl, showToken, copied,
    tempTokenValue, tempCustomUrl, tempTokenModel,
    hasBackendKey: hasBackendKey(),
    setTokenValue, setCustomBaseUrl,
    openTokenModal, closeTokenModal, confirmTokenModal, handleCopyToken,
  };
}
