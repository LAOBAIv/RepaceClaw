/**
 * useCodeModel - CODE 渠道与模型选择 Hook
 *
 * 职责：
 * - 管理 CODE 渠道弹窗状态（codeModelOpen）
 * - 管理已选渠道/模型（selectedChannel, selectedModel）
 * - 管理弹窗内临时渠道/模型（tempChannel, tempModel）
 * - 管理自定义参数（maxTokens, temperature, topP, penalties）
 * - 提供渠道切换、模型选择、确认等操作函数
 */
import { useState, useCallback } from 'react';
import { showToast } from '@/components/Toast';
import type { CodeChannel, CodeModel } from '../types';
import { CODE_CHANNELS } from '../constants';
import { loadTokenCache } from '../utils';

export interface UseCodeModelReturn {
  // 弹窗状态
  codeModelOpen: boolean;
  // 已选渠道/模型
  selectedChannel: CodeChannel;
  selectedModel: CodeModel | null;
  // 自定义参数
  customMaxTokens: string;
  customTemp: string;
  customTopP: string;
  customFreqPenalty: string;
  customPresPenalty: string;
  // 操作函数
  setSelectedChannel: (ch: CodeChannel) => void;
  setSelectedModel: (m: CodeModel | null) => void;
  setCustomMaxTokens: (v: string) => void;
  setCustomTemp: (v: string) => void;
  setCustomTopP: (v: string) => void;
  setCustomFreqPenalty: (v: string) => void;
  setCustomPresPenalty: (v: string) => void;
  openCodeModal: () => void;
  closeCodeModal: () => void;
  selectTempChannel: (ch: CodeChannel) => void;
  selectPreset: (m: CodeModel) => void;
  confirmCodeModal: () => { channel: CodeChannel; model: CodeModel; maxTokens: string; temp: string; topP: string; freqPenalty: string; presPenalty: string; tokenValue: string; customBaseUrl: string } | null;
  // 弹窗内临时状态（供 CodeModal 组件使用）
  tempChannel: CodeChannel;
  tempModel: CodeModel | null;
  tempCustomUrl: string;
  tempTokenValue: string;
}

export function useCodeModel(
  dynamicChannels: CodeChannel[],
  tokenValue: string,
  customBaseUrl: string,
  setTokenValue: (v: string) => void,
  setCustomBaseUrl: (v: string) => void,
): UseCodeModelReturn {
  const [codeModelOpen, setCodeModelOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<CodeChannel>(CODE_CHANNELS[0]);
  const [selectedModel, setSelectedModel] = useState<CodeModel | null>(CODE_CHANNELS[0].models[0]);

  // 弹窗内临时状态
  const [tempChannel, setTempChannel] = useState<CodeChannel>(CODE_CHANNELS[0]);
  const [tempModel, setTempModel] = useState<CodeModel | null>(null);
  const [customMaxTokens, setCustomMaxTokens] = useState('');
  const [customTemp, setCustomTemp] = useState('');
  const [customTopP, setCustomTopP] = useState('');
  const [customFreqPenalty, setCustomFreqPenalty] = useState('');
  const [customPresPenalty, setCustomPresPenalty] = useState('');
  const [tempCustomUrl, setTempCustomUrl] = useState('');
  const [tempTokenValue, setTempTokenValue] = useState('');

  const openCodeModal = useCallback(() => {
    setTempChannel(selectedChannel);
    const cached = loadTokenCache(selectedChannel.id);
    const initModel = selectedChannel.id === 'custom'
      ? {
          ...(selectedModel ?? selectedChannel.models[0]),
          id: cached?.modelId || selectedModel?.id || selectedChannel.models[0].id,
          name: cached?.modelId || selectedModel?.name || selectedChannel.models[0].name,
        }
      : (selectedModel ?? selectedChannel.models[0]);
    setTempModel(initModel);
    setCustomMaxTokens(String(initModel.maxTokens));
    setCustomTemp(String(initModel.temperature));
    setCustomTopP(String(initModel.topP));
    setCustomFreqPenalty(String(initModel.frequencyPenalty));
    setCustomPresPenalty(String(initModel.presencePenalty));
    if (selectedChannel.id === 'custom') {
      setTempCustomUrl(cached?.baseUrl || customBaseUrl || '');
      setTempTokenValue(cached?.apiKey || tokenValue || '');
    }
    setCodeModelOpen(true);
  }, [selectedChannel, selectedModel, customBaseUrl, tokenValue]);

  const closeCodeModal = useCallback(() => {
    setCodeModelOpen(false);
  }, []);

  const selectTempChannel = useCallback((ch: CodeChannel) => {
    setTempChannel(ch);
    const cached = loadTokenCache(ch.id);
    const first = ch.id === 'custom'
      ? {
          ...ch.models[0],
          id: cached?.modelId || ch.models[0].id,
          name: cached?.modelId || ch.models[0].name,
        }
      : ch.models[0];
    setTempModel(first);
    setCustomMaxTokens(String(first.maxTokens));
    setCustomTemp(String(first.temperature));
    setCustomTopP(String(first.topP));
    setCustomFreqPenalty(String(first.frequencyPenalty));
    setCustomPresPenalty(String(first.presencePenalty));
    if (ch.id === 'custom') {
      setTempCustomUrl(cached?.baseUrl || customBaseUrl || '');
      setTempTokenValue(cached?.apiKey || tokenValue || '');
    }
  }, [customBaseUrl, tokenValue]);

  const selectPreset = useCallback((m: CodeModel) => {
    setTempModel(m);
    setCustomMaxTokens(String(m.maxTokens));
    setCustomTemp(String(m.temperature));
    setCustomTopP(String(m.topP));
    setCustomFreqPenalty(String(m.frequencyPenalty));
    setCustomPresPenalty(String(m.presencePenalty));
  }, []);

  const confirmCodeModal = useCallback(() => {
    if (!tempModel) return null;

    if (tempChannel.id === 'custom') {
      const modelId = tempModel.id?.trim() || '';
      const baseUrl = tempCustomUrl.trim();
      if (!modelId) {
        showToast('请填写自定义模型 ID', 'warning');
        return null;
      }
      if (!baseUrl) {
        showToast('请填写自定义渠道的 API Base URL', 'warning');
        return null;
      }
    }

    const finalModel: CodeModel = {
      ...tempModel,
      id: tempModel.id?.trim() || tempModel.id,
      name: tempModel.name?.trim() || tempModel.id,
      maxTokens: Number(customMaxTokens) || tempModel.maxTokens,
      temperature: Number(customTemp) || tempModel.temperature,
      topP: Number(customTopP) || tempModel.topP,
      frequencyPenalty: Number(customFreqPenalty) || tempModel.frequencyPenalty,
      presencePenalty: Number(customPresPenalty) || tempModel.presencePenalty,
    };

    setSelectedChannel(tempChannel);
    setSelectedModel(finalModel);

    // 切换渠道后，从缓存自动回填对应渠道的 Token
    const cached = loadTokenCache(tempChannel.id);
    if (!tokenValue.trim()) {
      setTokenValue(cached?.apiKey ?? '');
    }
    if (tempChannel.id === 'custom') {
      setCustomBaseUrl(tempCustomUrl.trim());
    } else if (!customBaseUrl.trim()) {
      setCustomBaseUrl(cached?.baseUrl ?? '');
    }

    setCodeModelOpen(false);
    return {
      channel: tempChannel,
      model: finalModel,
      maxTokens: customMaxTokens,
      temp: customTemp,
      topP: customTopP,
      freqPenalty: customFreqPenalty,
      presPenalty: customPresPenalty,
      tokenValue: cached?.apiKey ?? tokenValue,
      customBaseUrl: tempChannel.id === 'custom' ? tempCustomUrl.trim() : (cached?.baseUrl ?? customBaseUrl),
    };
  }, [tempModel, tempChannel, customMaxTokens, customTemp, customTopP, customFreqPenalty, customPresPenalty, tokenValue, customBaseUrl, tempCustomUrl, setTokenValue, setCustomBaseUrl]);

  return {
    codeModelOpen,
    selectedChannel, selectedModel,
    customMaxTokens, customTemp, customTopP, customFreqPenalty, customPresPenalty,
    setSelectedChannel, setSelectedModel,
    setCustomMaxTokens, setCustomTemp, setCustomTopP, setCustomFreqPenalty, setCustomPresPenalty,
    openCodeModal, closeCodeModal,
    selectTempChannel, selectPreset, confirmCodeModal,
    tempChannel, tempModel, tempCustomUrl, tempTokenValue,
  };
}
