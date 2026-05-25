/**
 * useDynamicChannels - 动态渠道加载 Hook
 *
 * 职责：
 * - 从后台 /api/token-channels、/api/models、/api/model-providers 拉取渠道配置
 * - 将后台数据转换为 CodeChannel 格式
 * - 写入本地缓存（仅在没有缓存时）
 * - 自动选中预设渠道（通过 window 临时变量传递给父组件）
 */
import { useState, useEffect } from 'react';
import apiClient from '@/api/client';
import type { CodeChannel, CodeModel, BackendModel, BackendProvider } from '../types';
import { TOKEN_CACHE_PREFIX } from '../utils';

export interface UseDynamicChannelsReturn {
  dynamicChannels: CodeChannel[];
  presetChannel: CodeChannel | null;
}

export function useDynamicChannels(): UseDynamicChannelsReturn {
  const [dynamicChannels, setDynamicChannels] = useState<CodeChannel[]>([]);
  const [presetChannel, setPresetChannel] = useState<CodeChannel | null>(null);

  /* ═══════════════════════════════════════════════════════════
   * 动态渠道加载：从后台 /api/token-channels 拉取已配置渠道
   * ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    Promise.all([
      apiClient.get('/token-channels'),
      apiClient.get('/models'),
      apiClient.get('/model-providers'),
    ]).then(([chRes, mRes, pRes]) => {
        const rawChannels: Array<{ id: string; provider: string; modelName: string; baseUrl: string; apiKey: string; authType: string; enabled: boolean; priority: number; isPreset?: boolean }> = chRes.data.data || [];
        if (!rawChannels.length) return;
        const backendChannels = rawChannels.filter(c => c.enabled);
        if (!backendChannels.length) return;

        const allModels = mRes.data.data || [];
        const allProviders = pRes.data.data || [];

        const channels: CodeChannel[] = backendChannels.map(bc => {
          const chBase = (bc.baseUrl || '').replace(/\/$/, '');
          const matchedProv = allProviders.find((p: BackendProvider) => (p.baseUrl || '').replace(/\/$/, '') === chBase);
          const chModels = matchedProv
            ? allModels.filter((m: BackendModel) => m.providerId === matchedProv.id && m.enabled)
            : [];

          const modelList = chModels.length > 0
            ? chModels.map((m: BackendModel) => ({
                id: m.name, name: m.name, contextWindow: m.contextWindow || '-',
                maxTokens: m.maxTokens || 4096, temperature: 0.7, topP: 0.95,
                frequencyPenalty: 0, presencePenalty: 0, desc: `${m.name}`,
              }))
            : [{
                id: 'auto', name: 'Auto（后台调度）', contextWindow: '-',
                maxTokens: 4096, temperature: 0.7, topP: 0.95,
                frequencyPenalty: 0, presencePenalty: 0, desc: '使用后台配置的默认模型',
              }];

          return {
            id: bc.provider, name: bc.provider, provider: bc.provider,
            badge: bc.isPreset ? '预设' : undefined, isPreset: !!bc.isPreset,
            hasBackendKey: !!bc.apiKey, desc: `${bc.baseUrl || 'OpenAI 兼容格式'}`,
            baseUrl: bc.baseUrl, authType: (bc.authType as 'Bearer' | 'ApiKey' | 'Basic') || 'Bearer',
            keyLabel: 'API Key',
            keyPlaceholder: '使用后台配置的 Key（如需覆盖请重新填写）',
            models: modelList,
          };
        });

        setDynamicChannels(channels);

        // 写入本地缓存（仅在没有缓存时）
        for (const bc of backendChannels) {
          if (bc.apiKey) {
            const cacheKey = TOKEN_CACHE_PREFIX + bc.provider;
            if (!localStorage.getItem(cacheKey)) {
              try { localStorage.setItem(cacheKey, JSON.stringify({ apiKey: bc.apiKey, baseUrl: bc.baseUrl || '' })); } catch { /* ignore */ }
            }
          }
        }

        // 自动选中预设渠道，否则选第一个
        const presetBc = backendChannels.find(c => c.isPreset);
        const defaultBc = presetBc || backendChannels[0];
        const presetCh = channels.find(c => c.isPreset);
        const defaultCh = presetCh || channels[0];
        if (defaultCh) {
          // 注意：这里暂存到 ref，等 hooks 初始化后由 useEffect 处理
          (window as unknown as Record<string, unknown>).__ac_defaultChannel = defaultCh;
          (window as unknown as Record<string, unknown>).__ac_defaultModel = defaultCh.models.find((m: CodeModel) => m.id === defaultBc.modelName) || defaultCh.models[0];
        }
      })
      .catch(() => { setDynamicChannels([]); });
   
  }, []);

  /* ── 获取平台预设（兜底）渠道 ── */
  useEffect(() => {
    import('@/api/tokenChannels').then(({ tokenChannelsApi }) => {
      tokenChannelsApi.getPreset().then(ch => {
        if (ch) setPresetChannel(ch);
      }).catch(() => {});
    });
  }, []);

  return { dynamicChannels, presetChannel };
}
