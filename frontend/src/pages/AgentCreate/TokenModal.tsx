/**
 * TokenModal - Token 接入配置弹窗组件
 *
 * 职责：
 * - 展示当前选中的渠道信息（只读）
 * - 非预设/非后台已配置渠道：展示模型选择 + API Key 填写
 * - 预设/后台已配置渠道：展示"无需配置"提示
 * - 支持确认/取消操作
 */
import { X, Check, KeyRound, Copy } from 'lucide-react';
import type { CodeChannel, CodeModel } from './types';
import type { TokenChannel } from '@/api/tokenChannels';
import { BADGE_COLOR } from './constants';
import { AUTH_TYPE_LABEL } from './utils';

interface TokenModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedChannel: CodeChannel;
  hasBackendKey: boolean;
  // [2026-05-24] 类型安全
  presetChannel: TokenChannel | null;
  // 弹窗内临时状态
  tempTokenValue: string;
  onTempTokenValueChange: (v: string) => void;
  tempCustomUrl: string;
  onTempCustomUrlChange: (v: string) => void;
  tempTokenModel: CodeModel | null;
  onTempTokenModelChange: (m: CodeModel) => void;
  showToken: boolean;
  onShowTokenToggle: () => void;
}

export function TokenModal({
  open, onClose, onConfirm,
  selectedChannel, hasBackendKey, presetChannel,
  tempTokenValue, onTempTokenValueChange,
  tempCustomUrl, onTempCustomUrlChange,
  tempTokenModel, onTempTokenModelChange,
  showToken, // onShowTokenToggle reserved for future use
}: TokenModalProps) {
  if (!open) return null;

  return (
    <div className="ac-modal-mask" onClick={onClose}>
      <div className="ac-modal tk-modal" onClick={e => e.stopPropagation()}>

        <div className="ac-modal-head">
          <span className="ac-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <KeyRound size={16} color="#2a3b4d" />
            Token 接入配置
          </span>
          <button className="ac-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ac-modal-body" style={{ padding: 0 }}>

          {/* 渠道只读展示 */}
          <div className="tk-section-title">接入渠道</div>
          <div style={{ padding: '0 14px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#f0f4ff', border: '1px solid #c7d7fd', borderRadius: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#2a3b4d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Check size={12} color="#fff" strokeWidth={3} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{selectedChannel.name}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                  {selectedChannel.provider} · 已在 CODE 渠道中选定
                </div>
              </div>
            </div>
          </div>

          {/* 填写 Key（平台预设 + 后台已配置 Key 的渠道无需填） */}
          {!hasBackendKey && !presetChannel && (
            <>
              <div className="tk-divider" />

              {/* 模型选择 */}
              <div className="tk-section-title">选择模型</div>
              <div style={{ padding: '0 14px 10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selectedChannel.models.map(m => {
                    const sel = tempTokenModel?.id === m.id;
                    const bc = m.badge ? BADGE_COLOR[m.badge] : null;
                    return (
                      <div
                        key={m.id}
                        onClick={() => onTempTokenModelChange(m)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                          border: `1px solid ${sel ? '#2a3b4d' : '#e5e7eb'}`,
                          borderRadius: 7, cursor: 'pointer',
                          background: sel ? '#f0f4ff' : '#fff',
                          transition: 'all 0.1s',
                        }}
                      >
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${sel ? '#2a3b4d' : '#d1d5db'}`, background: sel ? '#2a3b4d' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400, color: '#1e293b' }}>{m.name}</span>
                            {m.badge && bc && <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 3, background: bc.bg, color: bc.color }}>{m.badge}</span>}
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>{m.contextWindow}</span>
                          </div>
                          {m.desc && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{m.desc}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="tk-divider" />
              <div className="tk-section-title">填写认证信息</div>
              <div className="tk-input-area">

                {/* Base URL（自定义渠道时才填） */}
                {selectedChannel.id === 'custom' && (
                  <div className="tk-input-row">
                    <label className="tk-input-label">Base URL</label>
                    <input
                      type="text"
                      style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: '"Courier New", monospace' }}
                      value={tempCustomUrl}
                      onChange={e => onTempCustomUrlChange(e.target.value)}
                      placeholder="https://your-api-host.com/v1"
                      onFocus={e => e.currentTarget.style.borderColor = '#2a3b4d'}
                      onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                    />
                  </div>
                )}

                {/* API Key */}
                <div className="tk-input-row">
                  <label className="tk-input-label">
                    {selectedChannel.keyLabel || AUTH_TYPE_LABEL[selectedChannel.authType]}
                  </label>
                  <div className="tk-token-wrap">
                    <input
                      className="tk-token-input"
                      type={showToken ? 'text' : 'password'}
                      value={tempTokenValue}
                      onChange={e => onTempTokenValueChange(e.target.value)}
                      placeholder={
                        selectedChannel.keyPlaceholder ||
                        (selectedChannel.authType === 'Bearer' ? 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'
                        : selectedChannel.authType === 'ApiKey' ? '输入 API Key'
                        : 'username:password')
                      }
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <div className="tk-token-actions">
                      <button type="button" className="tk-icon-btn" onClick={() => { navigator.clipboard.writeText(tempTokenValue).catch(() => {}); }} title="复制">
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 平台预设 + 后台已配置Key：无需配置提示 */}
          {hasBackendKey && (
            <div style={{ padding: '20px 14px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
              ✅ 管理员已配置此渠道，无需填写 API Key
            </div>
          )}
        </div>

        <div className="ac-modal-foot">
          <span className="ac-modal-selected-tip">
            {tempTokenModel ? `${selectedChannel.name} · ${tempTokenModel.name}` : selectedChannel.name}
          </span>
          <div className="ac-modal-foot-btns">
            <button className="ac-modal-btn-cancel" onClick={onClose}>取消</button>
            <button
              className="ac-modal-btn-confirm"
              disabled={!hasBackendKey && (!tempTokenValue.trim() || !tempTokenModel)}
              onClick={onConfirm}
            >确认</button>
          </div>
        </div>

      </div>
    </div>
  );
}
