import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, RefreshCw, QrCode, Wifi, WifiOff, Trash2, Users, Copy, Send, Database, ChevronRight, Radio } from 'lucide-react';

const API_BASE = '/api/wechat-clawbot';

type WsState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
type SubTab = 'overview' | 'conversations' | 'push' | 'sync';

interface StatusData { wsConnection: WsState; channelStatus: Record<string, unknown>; timestamp: string; } // [2026-05-24] 类型安全
interface ScanStatus { status: 'wait' | 'scaned' | 'confirmed' | 'expired'; credentials?: { bot_token: string; ilink_bot_id: string; ilink_user_id: string }; baseurl?: string; }
interface BoundAccount { accountId: string; userId: string; hasToken: boolean; savedAt: string; rcUsername?: string; rcNickname?: string; rcDepartment?: string; }
interface Conversation { id: string; title: string; oc_session_key: string; created_at: string; last_message_at: string; status: string; username?: string; }
interface Message { id: string; role: string; content: string; token_count: number; created_at: string; }
type QrType = 'image_base64' | 'image_url' | 'web_link';

export function WechatClawBot() {
  const [activeTab, setActiveTab] = useState<SubTab>('overview');
  const [wsState, setWsState] = useState<WsState>('disconnected');
  const [status, setStatus] = useState<StatusData | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [qrOriginalUrl, setQrOriginalUrl] = useState('');
  const [qrType, setQrType] = useState<QrType>('web_link');
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [boundAccounts, setBoundAccounts] = useState<BoundAccount[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [pushUserId, setPushUserId] = useState('');
  const [pushText, setPushText] = useState('');
  const [pushLoading, setPushLoading] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [syncStates, setSyncStates] = useState<{ running?: boolean; startedAt?: string; lastPollAt?: string; lastMessageAt?: string; pollCycleCount?: number; pollMessageCount?: number; lastError?: string }>({});
  const [stats, setStats] = useState<{ total?: number; wechatBot?: { received?: number; replied?: number }; rcAssistant?: { sent?: number; replied?: number } } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchStatus = useCallback(async () => {
    try { const r = await fetch(API_BASE + '/status'); const j = await r.json(); if (j.success) { setStatus(j.data); setWsState(j.data.wsConnection); } } catch { setWsState('disconnected'); }
  }, []);
  const fetchAccounts = useCallback(async () => {
    try { const r = await fetch(API_BASE + '/accounts'); const j = await r.json(); if (j.success) setBoundAccounts(j.data.accounts || []); } catch (e) { console.warn("[WechatBot]", e); }
  }, []);
  const fetchConversations = useCallback(async () => {
    try { const r = await fetch(API_BASE + '/conversations'); const j = await r.json(); if (j.success) setConversations(j.data.conversations || []); } catch (e) { console.warn("[WechatBot]", e); }
  }, []);
  const fetchMessages = useCallback(async (id: string) => {
    setLoadingMsgs(true);
    try { const r = await fetch(API_BASE + '/conversations/' + id + '/messages?limit=50'); const j = await r.json(); if (j.success) setMessages(j.data.messages || []); } catch (e) { console.warn("[WechatBot]", e); } finally { setLoadingMsgs(false); }
  }, []);
  const fetchSyncStatus = useCallback(async () => {
    try { const r = await fetch(API_BASE + '/sync-status'); const j = await r.json(); if (j.success) setSyncStates(j.data || {}); } catch (e) { console.warn("[WechatBot]", e); }
    try { const r = await fetch(API_BASE + '/stats'); const j = await r.json(); if (j.success) setStats(j.data); } catch (e) { console.warn("[WechatBot]", e); }
  }, []);

  useEffect(() => {
    const es = new EventSource(API_BASE + '/events');
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.addEventListener('state', (e) => { try { setWsState(JSON.parse(e.data).state); } catch (e) { console.warn("[WechatBot]", e); } });
    es.addEventListener('connected', () => fetchStatus());
    eventSourceRef.current = es;
    return () => { es.close(); setSseConnected(false); };
  }, [fetchStatus]);

  useEffect(() => { fetchStatus(); fetchAccounts(); const t = setInterval(() => { fetchStatus(); fetchAccounts(); }, 15000); return () => clearInterval(t); }, [fetchStatus, fetchAccounts]);
  useEffect(() => { if (activeTab === 'conversations') fetchConversations(); if (activeTab === 'sync') fetchSyncStatus(); }, [activeTab, fetchConversations, fetchSyncStatus]);
  useEffect(() => { if (selectedConv) fetchMessages(selectedConv); }, [selectedConv, fetchMessages]);

  const requestQrCode = async () => {
    setScanLoading(true); setScanStatus(null);
    try {
      const r = await fetch(API_BASE + '/qrcode', { method: 'POST' }); const j = await r.json();
      if (j.success && j.data?.qrcode_url) {
        setQrUrl(j.data.qrcode_url); setQrOriginalUrl(j.data.original_qrcode_url || j.data.qrcode_url);
        setQrType(j.data.qrcode_type || 'web_link');
        pollScanStatus(j.data.qrcode);
        setTimeout(() => setScanStatus({ status: 'expired' }), 240000);
      }
    } catch (e) { console.warn("[WechatBot]", e); } finally { setScanLoading(false); }
  };

  const pollScanStatus = (token: string) => {
    let n = 0;
    const poll = async () => {
      if (n >= 120) { setScanStatus({ status: 'expired' }); return; } n++;
      try {
        const r = await fetch(API_BASE + '/qrcode/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qrcode: token }) });
        const j = await r.json();
        if (j.success && j.data) { setScanStatus(j.data); if (j.data.status === 'confirmed') { setTimeout(() => { fetchStatus(); fetchAccounts(); }, 1000); return; } if (j.data.status === 'expired') return; setTimeout(poll, 2000); }
      } catch { setTimeout(poll, 3000); }
    };
    poll();
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('\u786e\u5b9a\u5220\u9664\u8d26\u53f7 ' + id + '\uff1f')) return;
    try { const r = await fetch(API_BASE + '/accounts/' + encodeURIComponent(id), { method: 'DELETE' }); const j = await r.json(); if (j.success) { fetchAccounts(); fetchStatus(); } else alert(j.error || '\u5931\u8d25'); } catch { alert('\u5220\u9664\u5931\u8d25'); }
  };

  const handlePush = async () => {
    if (!pushUserId.trim() || !pushText.trim()) return;
    setPushLoading(true); setPushResult(null);
    try {
      const r = await fetch(API_BASE + '/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: pushUserId.trim(), text: pushText.trim() }) });
      const j = await r.json();
      if (j.success) { setPushResult('\u2705 \u53d1\u9001\u6210\u529f'); setPushText(''); } else setPushResult('\u274c ' + (j.error || '\u5931\u8d25'));
    } catch (e: unknown) { setPushResult('\u274c ' + (e as Error).message); } finally { setPushLoading(false); } // [2026-05-24] 类型安全
  };

  const copyText = (t: string) => navigator.clipboard.writeText(t);

  // Styles
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? '#16a34a' : '#6b7280', background: 'none', border: 'none',
    borderBottom: active ? '2px solid #16a34a' : '2px solid transparent',
    marginBottom: -2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  });
  const card: React.CSSProperties = { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 16 };
  const cHeader: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const cTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#1a202c' };
  const btnP: React.CSSProperties = { padding: '8px 20px', fontSize: 13, fontWeight: 500, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' };
  const btnS: React.CSSProperties = { padding: '4px 12px', fontSize: 12, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 };
  const bdg = (color: string, bg: string): React.CSSProperties => ({ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: bg, color, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 });

  const wsColor = wsState === 'connected' ? '#16a34a' : wsState === 'connecting' || wsState === 'reconnecting' ? '#d97706' : '#dc2626';
  const wsBg = wsState === 'connected' ? '#dcfce7' : wsState === 'connecting' || wsState === 'reconnecting' ? '#fef3c7' : '#fee2e2';

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 28px', background: 'var(--body-bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #16a34a, #15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={18} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>微信助手管理</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>WeChat Bot · 全功能管理面板</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={bdg(wsColor, wsBg)}>{wsState === 'connected' ? <Wifi size={11} /> : <WifiOff size={11} />} {wsState === 'connected' ? '已连接' : '未连接'}</span>
          <span style={bdg(sseConnected ? '#16a34a' : '#9ca3af', sseConnected ? '#dcfce7' : '#f3f4f6')}><Radio size={11} /> SSE</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        <button onClick={() => setActiveTab('overview')} style={tabStyle(activeTab === 'overview')}><QrCode size={14} /> 概览/登录</button>
        <button onClick={() => setActiveTab('conversations')} style={tabStyle(activeTab === 'conversations')}><MessageCircle size={14} /> 会话消息</button>
        <button onClick={() => setActiveTab('push')} style={tabStyle(activeTab === 'push')}><Send size={14} /> 消息推送</button>
        <button onClick={() => setActiveTab('sync')} style={tabStyle(activeTab === 'sync')}><Database size={14} /> 同步状态</button>
      </div>

      {/* === Overview Tab === */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
          <div>
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={cHeader}>
                <span style={{ ...cTitle, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} color="#16a34a" /> 已绑定账号 {boundAccounts.length > 0 && <span style={bdg('#16a34a', '#dcfce7')}>{boundAccounts.length}</span>}</span>
                <button onClick={fetchAccounts} style={btnS}><RefreshCw size={12} /> 刷新</button>
              </div>
              {boundAccounts.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>
                  <Users size={36} color="#e5e7eb" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 13, margin: '0 0 4px' }}>暂无绑定账号</p>
                  <p style={{ fontSize: 11 }}>在右侧生成二维码扫码绑定</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: '#6b7280', fontSize: 12 }}>用户</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: '#6b7280', fontSize: 12 }}>组织</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500, color: '#6b7280', fontSize: 12 }}>状态</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 500, color: '#6b7280', fontSize: 12, width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {boundAccounts.map((acc) => (
                        <tr key={acc.accountId} style={{ borderBottom: '1px solid #f3f4f6' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fafbfc')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: acc.rcUsername ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: acc.rcUsername ? '#1d4ed8' : '#9ca3af' }}>{(acc.rcNickname || acc.rcUsername || '?')[0].toUpperCase()}</span>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 500, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {acc.rcNickname || acc.rcUsername || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>未绑定</span>}
                                </div>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                                  {acc.rcUsername ? `@${acc.rcUsername}` : acc.userId.split('@')[0].slice(0, 12)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#6b7280', fontSize: 12 }}>
                            {acc.rcDepartment || <span style={{ color: '#d1d5db' }}>-</span>}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: acc.hasToken ? '#dcfce7' : '#fef2f2', color: acc.hasToken ? '#16a34a' : '#dc2626', fontWeight: 500 }}>{acc.hasToken ? '在线' : '离线'}</span>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <button onClick={() => handleDeleteAccount(acc.accountId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 4 }} title="删除"
                              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                              onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div>
            <div style={card}>
              <div style={cHeader}><span style={cTitle}>连接状态</span><button onClick={() => { fetchStatus(); fetchAccounts(); }} style={btnS}><RefreshCw size={12} /> 刷新</button></div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12, color: '#6b7280' }}>Gateway</span><span style={{ fontSize: 13, fontWeight: 600, color: wsColor }}>{wsState === 'connected' ? '已连接' : '未连接'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12, color: '#6b7280' }}>Bot 账号</span><span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{boundAccounts.length} 个</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12, color: '#6b7280' }}>更新时间</span><span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : '-'}</span></div>
              </div>
            </div>
            <div style={card}>
              <div style={cHeader}><span style={cTitle}>扫码登录新账号</span></div>
              <div style={{ padding: 24, textAlign: 'center' }}>
                {!qrUrl ? (
                  <>
                    <QrCode size={48} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>点击生成二维码，用微信扫码绑定新 Bot</p>
                    <button onClick={requestQrCode} disabled={scanLoading} style={{ ...btnP, opacity: scanLoading ? 0.5 : 1 }}>{scanLoading ? '生成中...' : '生成二维码'}</button>
                  </>
                ) : (
                  <>
                    {scanStatus && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={bdg(scanStatus.status === 'confirmed' ? '#16a34a' : scanStatus.status === 'expired' ? '#dc2626' : '#2563eb', scanStatus.status === 'confirmed' ? '#dcfce7' : scanStatus.status === 'expired' ? '#fee2e2' : '#dbeafe')}>
                          {scanStatus.status === 'wait' && '等待扫码'}{scanStatus.status === 'scaned' && '已扫码，等待确认'}{scanStatus.status === 'confirmed' && '✅ 登录成功'}{scanStatus.status === 'expired' && '二维码已过期'}
                        </span>
                      </div>
                    )}
                    <img src={qrUrl} alt="二维码" style={{ width: 220, height: 220, margin: '0 auto', border: '1px solid #f3f4f6', borderRadius: 8 }} />
                    {qrType === 'web_link' && qrOriginalUrl && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <a href={qrOriginalUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#16a34a' }}>原生链接</a>
                        <button onClick={() => copyText(qrOriginalUrl)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><Copy size={12} /></button>
                      </div>
                    )}
                    {scanStatus?.status === 'expired' && <button onClick={requestQrCode} style={{ ...btnP, marginTop: 12 }}>重新生成</button>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Conversations Tab === */}
      {activeTab === 'conversations' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, minHeight: 450 }}>
          <div style={card}>
            <div style={cHeader}><span style={cTitle}>微信会话</span><button onClick={fetchConversations} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><RefreshCw size={12} /></button></div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {conversations.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>暂无会话</div>
              ) : conversations.map((c) => (
                <div key={c.id} onClick={() => setSelectedConv(c.id)}
                  style={{ padding: '10px 16px', cursor: 'pointer', borderLeft: selectedConv === c.id ? '3px solid #16a34a' : '3px solid transparent', background: selectedConv === c.id ? '#f0fdf4' : 'transparent', borderBottom: '1px solid #f9fafb' }}>
                  <div style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.username || c.title || c.id.slice(0, 8)}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : '-'}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={cHeader}><span style={cTitle}>{selectedConv ? '消息记录' : '选择会话查看消息'}</span></div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 450 }}>
              {!selectedConv ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>← 点击左侧会话</div>
              ) : loadingMsgs ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>加载中...</div>
              ) : messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>暂无消息</div>
              ) : messages.map((msg) => (
                <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: 10, fontSize: 13, background: msg.role === 'user' ? '#dcfce7' : '#f3f4f6', color: '#374151' }}>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{new Date(msg.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === Push Tab === */}
      {activeTab === 'push' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
          {/* 左侧：用户列表 */}
          <div style={card}>
            <div style={cHeader}><span style={cTitle}>选择用户</span></div>
            {boundAccounts.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>暂无可推送用户</div>
            ) : (
              <div style={{ maxHeight: 450, overflowY: 'auto' }}>
                {boundAccounts.map((acc) => (
                  <div key={acc.accountId} onClick={() => setPushUserId(acc.userId)}
                    style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10, background: pushUserId === acc.userId ? '#f0fdf4' : 'transparent', borderLeft: pushUserId === acc.userId ? '3px solid #16a34a' : '3px solid transparent' }}
                    onMouseEnter={e => { if (pushUserId !== acc.userId) e.currentTarget.style.background = '#fafbfc'; }}
                    onMouseLeave={e => { if (pushUserId !== acc.userId) e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: acc.rcUsername ? '#dbeafe' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: acc.rcUsername ? '#1d4ed8' : '#9ca3af' }}>{(acc.rcNickname || acc.rcUsername || '?')[0].toUpperCase()}</span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.rcNickname || acc.rcUsername || acc.userId.split('@')[0].slice(0, 12)}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{acc.rcDepartment || ''}</div>
                    </div>
                    <ChevronRight size={12} color="#d1d5db" />
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* 右侧：发送消息 */}
          <div style={card}>
            <div style={cHeader}><span style={cTitle}>发送消息</span></div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>目标用户</label>
                <input value={pushUserId} onChange={(e) => setPushUserId(e.target.value)} placeholder="点击左侧选择或手动输入 userId"
                  style={{ width: '100%', padding: '10px 14px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#f9fafb' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>消息内容</label>
                <textarea value={pushText} onChange={(e) => setPushText(e.target.value)} placeholder="输入要发送的消息..." rows={6}
                  style={{ width: '100%', padding: '10px 14px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={handlePush} disabled={pushLoading || !pushUserId.trim() || !pushText.trim()}
                  style={{ ...btnP, opacity: (pushLoading || !pushUserId.trim() || !pushText.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px' }}>
                  <Send size={13} /> {pushLoading ? '发送中...' : '发送'}
                </button>
                {pushResult && <span style={{ fontSize: 13 }}>{pushResult}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Sync Tab === */}
      {activeTab === 'sync' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* 消息统计 */}
          <div style={card}>
            <div style={cHeader}><span style={cTitle}>消息统计</span></div>
            <div style={{ padding: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, color: '#6b7280', fontSize: 12 }}>来源</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500, color: '#6b7280', fontSize: 12 }}>收到消息</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500, color: '#6b7280', fontSize: 12 }}>回复/推送</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500, color: '#6b7280', fontSize: 12 }}>合计</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 500, color: '#374151' }}>📱 微信Bot</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{stats?.wechatBot?.received ?? '-'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{stats?.wechatBot?.replied ?? '-'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600 }}>{stats ? (stats.wechatBot.received + stats.wechatBot.replied) : '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 500, color: '#374151' }}>💻 RC微信助手</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{stats?.rcAssistant?.sent ?? '-'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{stats?.rcAssistant?.replied ?? '-'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600 }}>{stats ? (stats.rcAssistant.sent + stats.rcAssistant.replied) : '-'}</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1f2937' }}>全部</td>
                    <td colSpan={2} style={{ padding: '12px 14px' }}></td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#1f2937' }}>{stats?.total ?? '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {/* ILinkMonitor 状态 */}
          <div style={card}>
            <div style={cHeader}>
              <span style={cTitle}>ILinkMonitor 轮询状态</span>
              <button onClick={fetchSyncStatus} style={btnS}><RefreshCw size={12} /> 刷新</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>运行状态</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: syncStates?.running ? '#16a34a' : '#dc2626' }}>{syncStates?.running ? '✅ 运行中' : '❌ 已停止'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>启动时间</span>
                <span style={{ fontSize: 13, color: '#374151' }}>{syncStates?.startedAt ? new Date(syncStates.startedAt).toLocaleString() : '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>最后轮询</span>
                <span style={{ fontSize: 13, color: '#374151' }}>{syncStates?.lastPollAt ? new Date(syncStates.lastPollAt).toLocaleString() : '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>最后收到消息</span>
                <span style={{ fontSize: 13, color: '#374151' }}>{syncStates?.lastMessageAt ? new Date(syncStates.lastMessageAt).toLocaleString() : '暂无'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>轮询次数</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{syncStates?.pollCycleCount ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>累计收到消息</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{syncStates?.pollMessageCount ?? 0} 条</span>
              </div>
              {syncStates?.lastError && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>最后错误</span>
                  <span style={{ fontSize: 12, color: '#dc2626', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{syncStates.lastError}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
