import { useState, useEffect } from 'react';
import { agentsApi, type AgentRoutingInfo } from '@/api/agents';

const SOURCE_LABEL: Record<string, string> = {
  private: '🔑 私有 Key',
  global: '🌐 全局渠道',
  gateway: '🔄 OpenClaw Gateway',
  none: '⚠️ 未配置',
};

const SOURCE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  private: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  global:  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  gateway: { bg: '#faf5ff', text: '#7c3aed', border: '#e9d5ff' },
  none:    { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
};

export function AgentChannelOverview() {
  const [routings, setRoutings] = useState<AgentRoutingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const data = await agentsApi.routingOverview();
      setRoutings(data);
    } catch (err) {
      console.error('[AgentChannelOverview] Load failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const stats = {
    total: routings.length,
    private: routings.filter(r => r.source === 'private').length,
    global: routings.filter(r => r.source === 'global').length,
    gateway: routings.filter(r => r.source === 'gateway').length,
    none: routings.filter(r => r.source === 'none').length,
  };

  return (
    <div>
      {/* 说明 */}
      <div style={{
        padding: '12px 16px', borderRadius: 10, background: '#f8fafc',
        border: '1px solid #e2e8f0', marginBottom: 20,
        fontSize: 12, color: '#64748b', lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 600, color: '#334155', marginBottom: 4 }}>智能体 LLM 路由概览</div>
        展示每个智能体实际使用的 LLM 调用通道。优先级：私有 Key &gt; 全局渠道 &gt; OpenClaw Gateway。
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: '总计', count: stats.total, color: '#475569', bg: '#f1f5f9' },
          { label: '私有 Key', count: stats.private, color: '#15803d', bg: '#f0fdf4' },
          { label: '全局渠道', count: stats.global, color: '#1d4ed8', bg: '#eff6ff' },
          { label: 'Gateway', count: stats.gateway, color: '#7c3aed', bg: '#faf5ff' },
          { label: '未配置', count: stats.none, color: '#b91c1c', bg: '#fef2f2' },
        ].map(s => (
          <div key={s.label} style={{
            flex: '1 1 100px', padding: '10px 14px', borderRadius: 10,
            background: s.bg, border: `1px solid ${s.color}22`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 11, color: s.color + 'aa', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 刷新按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => { setRefreshing(true); load(); }}
          disabled={refreshing}
          style={{
            padding: '5px 14px', borderRadius: 7, border: '1px solid #e2e8f0',
            background: '#fff', color: '#64748b', fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
            opacity: refreshing ? 0.6 : 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={refreshing ? { animation: 'spin 1s linear infinite' } : {}}>
            <path d="M21.5 2v6h-6M2.5 22v-6h6"/>
            <path d="M2.5 11.5a10 10 0 0 1 18.8-4.3M21.5 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          刷新
        </button>
      </div>

      {/* 列说明 */}
      <div style={{
        padding: '12px 16px', borderRadius: 10, background: '#fff',
        border: '1px solid #e2e8f0', marginBottom: 12,
        fontSize: 12, color: '#64748b', lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 600, color: '#334155', marginBottom: 6 }}>列说明</div>
        <div>1. <b>路由来源</b>：最终走的是私有 Key、全局渠道，还是 OpenClaw Gateway。</div>
        <div>2. <b>实际调用通道</b>：当前真正发请求的渠道名或入口名。</div>
        <div>3. <b>实际模型</b>：最终实际使用的模型，不一定等于智能体表单里填写的值。</div>
        <div>4. <b>智能体配置</b>：智能体自身保存的模型配置，便于对比有没有被路由覆盖。</div>
      </div>

      {/* 表格 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>加载中...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>智能体</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>运行状态</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>路由来源</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>实际调用通道</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>实际模型</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>智能体配置</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e5e7eb' }}>私有 Key 配置</th>
                </tr>
              </thead>
              <tbody>
                {routings.map(r => {
                  const sc = SOURCE_COLOR[r.source] || SOURCE_COLOR.none;
                  const statusInfo = {
                    active: { label: '在线', color: '#22c55e', bg: '#f0fdf4' },
                    idle:   { label: '空闲', color: '#3b82f6', bg: '#eff6ff' },
                    busy:   { label: '忙碌', color: '#f59e0b', bg: '#fffbeb' },
                  }[r.status] || { label: r.status, color: '#94a3b8', bg: '#f8fafc' };

                  const configuredModel = [r.modelProvider, r.modelName].filter(Boolean).join(' / ');
                  const privateTokenLabel = r.hasPrivateToken
                    ? (r.tokenProvider ? `已配置 (${r.tokenProvider})` : '已配置')
                    : '未配置';

                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                            background: r.color + '22', border: `1.5px solid ${r.color}44`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: r.color, fontWeight: 700, fontSize: 13,
                          }}>
                            {r.name.charAt(0)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>ID: {r.id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'top' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 56, padding: '4px 10px', borderRadius: 999,
                          fontSize: 11, fontWeight: 600,
                          background: statusInfo.bg, color: statusInfo.color,
                        }}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'top' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '4px 10px', borderRadius: 999,
                          fontSize: 11, fontWeight: 600,
                          background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
                          whiteSpace: 'nowrap',
                        }}>
                          {SOURCE_LABEL[r.source] || r.source}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{r.effectiveChannel || '-'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          当前真实发请求的渠道入口
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{r.effectiveModel || '-'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          当前真实使用的模型
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontSize: 13, color: '#475569' }}>{configuredModel || '-'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          智能体表单里保存的模型/provider
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontSize: 13, color: r.hasPrivateToken ? '#15803d' : '#94a3b8', fontWeight: r.hasPrivateToken ? 600 : 400 }}>
                          {privateTokenLabel}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          用于判断是否优先走私有通道
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {routings.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
              暂无智能体
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
