import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, RefreshCw, QrCode, Wifi, WifiOff, CheckCircle, Clock, AlertTriangle, Activity, Radio } from 'lucide-react';

const API_BASE = '/api/wechat-clawbot';

type WsState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface StatusData {
  wsConnection: WsState;
  channelStatus: any;
  timestamp: string;
}

interface ScanStatus {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired';
  credentials?: {
    bot_token: string;
    ilink_bot_id: string;
    ilink_user_id: string;
  };
  baseurl?: string;
}

interface SseEvent {
  type: string;
  data: any;
  time: string;
}

export function WechatClawBot() {
  const [wsState, setWsState] = useState<WsState>('disconnected');
  const [status, setStatus] = useState<StatusData | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [showEvents, setShowEvents] = useState(false);
  const maxEvents = 50;
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch connection status via REST
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(API_BASE + '/status');
      const json = await res.json();
      if (json.success) {
        setStatus(json.data);
        setWsState(json.data.wsConnection);
      }
    } catch {
      setWsState('disconnected');
    }
  }, []);

  // SSE connection for real-time events
  useEffect(() => {
    const es = new EventSource(API_BASE + '/events');

    es.onopen = () => {
      setSseConnected(true);
      addEvent('system', { message: 'SSE connected' });
    };

    es.onerror = () => {
      setSseConnected(false);
      addEvent('system', { message: 'SSE disconnected, reconnecting...' });
    };

    es.addEventListener('state', (e) => {
      try {
        const data = JSON.parse(e.data);
        setWsState(data.state);
        addEvent('state_change', data);
      } catch {}
    });

    es.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data);
        addEvent('connected', data);
        fetchStatus();
      } catch {}
    });

    es.addEventListener('disconnected', (e) => {
      try {
        addEvent('disconnected', {});
      } catch {}
    });

    es.addEventListener('gateway_event', (e) => {
      try {
        const data = JSON.parse(e.data);
        addEvent('gateway_event', data);
      } catch {}
    });

    eventSourceRef.current = es;

    return () => {
      es.close();
      eventSourceRef.current = null;
      setSseConnected(false);
    };
  }, [fetchStatus]);

  function addEvent(type: string, data: any) {
    const evt: SseEvent = { type, data, time: new Date().toLocaleTimeString() };
    setEvents(prev => [evt, ...prev].slice(0, maxEvents));
  }

  // Fetch status on mount and every 15s
  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 15000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  // Request QR code
  const requestQrCode = async () => {
    setScanLoading(true);
    setScanStatus(null);
    try {
      const res = await fetch(API_BASE + '/qrcode', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.data?.qrcode_url) {
        setQrUrl(json.data.qrcode_url);
        setQrToken(json.data.qrcode);
        pollScanStatus(json.data.qrcode);
      } else {
        addEvent('error', { message: 'Failed to get QR code', detail: json });
      }
    } catch (err) {
      addEvent('error', { message: (err as Error).message });
    } finally {
      setScanLoading(false);
    }
  };

  // Poll scan status
  const pollScanStatus = (token: string) => {
    let attempts = 0;
    const maxAttempts = 120;
    const poll = async () => {
      if (attempts >= maxAttempts) {
        setScanStatus({ status: 'expired' });
        addEvent('qrcode', { status: 'expired', message: 'QR code expired after 2 minutes' });
        return;
      }
      attempts++;
      try {
        const res = await fetch(API_BASE + '/qrcode/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrcode: token }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          const s = json.data.status || json.data;
          setScanStatus(s);
          addEvent('qrcode', { status: s.status });
          if (s.status === 'confirmed') {
            setTimeout(fetchStatus, 1000);
            return;
          }
          if (s.status === 'expired') return;
          setTimeout(poll, 2000);
        }
      } catch {
        setTimeout(poll, 3000);
      }
    };
    poll();
  };

  // Reset channel
  const resetChannel = async () => {
    if (!confirm('Confirm channel reset? This will delete the IM channel record.')) return;
    setStatusLoading(true);
    try {
      const res = await fetch(API_BASE + '/channel/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: 'default' }),
      });
      const json = await res.json();
      addEvent('action', { action: 'channel_reset', result: json });
      alert(json.data?.message || JSON.stringify(json));
      fetchStatus();
    } catch (err) {
      addEvent('error', { message: (err as Error).message });
    } finally {
      setStatusLoading(false);
    }
  };

  const stateIcon = wsState === 'connected'
    ? <Wifi className="w-4 h-4 text-green-500" />
    : <WifiOff className="w-4 h-4 text-red-400" />;

  const stateLabel = wsState === 'connected'
    ? 'Connected'
    : wsState === 'connecting' || wsState === 'reconnecting'
    ? 'Connecting...'
    : 'Disconnected';

  const stateColor = wsState === 'connected'
    ? 'bg-green-50 text-green-700 border-green-200'
    : wsState === 'connecting' || wsState === 'reconnecting'
    ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
    : 'bg-red-50 text-red-700 border-red-200';

  const scanStatusLabel = scanStatus?.status === 'wait'
    ? 'Waiting for scan'
    : scanStatus?.status === 'scaned'
    ? 'Scanned, waiting for confirmation'
    : scanStatus?.status === 'confirmed'
    ? 'Login successful'
    : scanStatus?.status === 'expired'
    ? 'QR code expired'
    : '';

  const scanStatusIcon = scanStatus?.status === 'wait'
    ? <Clock className="w-4 h-4 text-blue-500" />
    : scanStatus?.status === 'scaned'
    ? <QrCode className="w-4 h-4 text-yellow-500" />
    : scanStatus?.status === 'confirmed'
    ? <CheckCircle className="w-4 h-4 text-green-500" />
    : scanStatus?.status === 'expired'
    ? <AlertTriangle className="w-4 h-4 text-red-500" />
    : null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-semibold">WeChat ClawBot</h1>
            <p className="text-sm text-gray-500">
              Manage WeChat ClawBot connection with OpenClaw Gateway.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* SSE status indicator */}
          <div className={'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ' + (
            sseConnected
              ? 'bg-green-50 text-green-600 border-green-200'
              : 'bg-gray-100 text-gray-500 border-gray-200'
          )}>
            <Radio className={'w-3 h-3 ' + (sseConnected ? 'animate-pulse' : '')} />
            SSE
          </div>
          {/* Event log toggle */}
          <button
            onClick={() => setShowEvents(!showEvents)}
            className={'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ' + (
              showEvents
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            )}
          >
            <Activity className="w-3.5 h-3.5" />
            Events ({events.length})
          </button>
        </div>
      </div>

      {/* Event Log Panel */}
      {showEvents && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 max-h-64 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Event Log</h3>
            <button
              onClick={() => setEvents([])}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>
          <div className="space-y-1 overflow-y-auto max-h-48 font-mono text-xs">
            {events.length === 0 && (
              <div className="text-gray-400 py-2">No events yet...</div>
            )}
            {events.map((evt, i) => (
              <div key={i} className="flex gap-2 py-0.5">
                <span className="text-gray-400 shrink-0">{evt.time}</span>
                <span className={
                  evt.type === 'connected' ? 'text-green-600' :
                  evt.type === 'disconnected' || evt.type === 'error' ? 'text-red-500' :
                  evt.type === 'state_change' ? 'text-blue-600' :
                  'text-gray-600'
                }>
                  [{evt.type}]
                </span>
                <span className="text-gray-600 truncate">
                  {typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium">Connection Status</h2>
          <div className={'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ' + stateColor}>
            {stateIcon}
            {stateLabel}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-xs text-gray-500 mb-1">Gateway WebSocket</div>
            <div className="text-sm font-medium">{wsState}</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-xs text-gray-500 mb-1">Channel Status</div>
            <div className="text-sm font-medium">
              {status?.channelStatus ? 'Active' : 'Not configured'}
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-xs text-gray-500 mb-1">Last Updated</div>
            <div className="text-sm font-medium">
              {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : '-'}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={fetchStatus}
            disabled={statusLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (statusLoading ? 'animate-spin' : '')} />
            Refresh
          </button>
          <button
            onClick={resetChannel}
            disabled={statusLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            Reset Channel
          </button>
        </div>
      </div>

      {/* QR Code Login */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-medium mb-4">QR Code Login</h2>

        {!qrUrl ? (
          <div className="text-center py-10">
            <QrCode className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-sm text-gray-500 mb-4">
              Click below to generate a WeChat login QR code
            </p>
            <button
              onClick={requestQrCode}
              disabled={scanLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {scanLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate QR Code'
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {scanStatus && scanStatusLabel && (
              <div className={'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border mb-4 ' + (
                scanStatus.status === 'confirmed'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : scanStatus.status === 'expired'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              )}>
                {scanStatusIcon}
                {scanStatusLabel}
              </div>
            )}

            <div className="rounded-xl border border-gray-200 p-5 mb-4 bg-gray-50 shadow-sm">
              <div className="bg-white rounded-lg p-5 shadow-inner">
                <img
                  src={qrUrl}
                  alt="WeChat Login QR Code"
                  className="w-80 h-80 max-w-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = qrUrl;
                  }}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center max-w-sm leading-5">
              Open WeChat and scan this QR code to login. If the phone still cannot recognize it,
              enlarge the browser page and keep the screen brightness high.
            </p>

            <a
              href={qrUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            >
              Open original QR image
            </a>

            {scanStatus?.status === 'confirmed' && scanStatus.credentials && (
              <div className="mt-4 w-full max-w-sm rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="text-sm font-medium text-green-800 mb-2">Login Successful</div>
                <div className="space-y-1 text-xs text-green-700">
                  <div>Bot ID: {scanStatus.credentials.ilink_bot_id}</div>
                  <div>User ID: {scanStatus.credentials.ilink_user_id}</div>
                  {scanStatus.baseurl && (
                    <div>Base URL: {scanStatus.baseurl}</div>
                  )}
                </div>
              </div>
            )}

            {scanStatus?.status === 'expired' && (
              <button
                onClick={requestQrCode}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Regenerate QR Code
              </button>
            )}
          </div>
        )}
      </div>

      {/* API Info */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-medium mb-3">API Endpoints</h2>
        <div className="text-xs text-gray-600 space-y-2">
          <div className="flex items-start gap-2">
            <code className="bg-gray-100 px-2 py-0.5 rounded">GET /api/wechat-clawbot/events</code>
            <span className="text-blue-600 font-medium">SSE</span>
            <span className="text-gray-500">Real-time event stream</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-gray-100 px-2 py-0.5 rounded">POST /api/wechat-clawbot/qrcode</code>
            <span className="text-gray-500">Get login QR code</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-gray-100 px-2 py-0.5 rounded">POST /api/wechat-clawbot/qrcode/status</code>
            <span className="text-gray-500">Poll scan status</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-gray-100 px-2 py-0.5 rounded">POST /api/wechat-clawbot/channel/reset</code>
            <span className="text-gray-500">Reset IM channel</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-gray-100 px-2 py-0.5 rounded">GET /api/wechat-clawbot/status</code>
            <span className="text-gray-500">Connection status</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-gray-100 px-2 py-0.5 rounded">GET /api/wechat-clawbot/ws-status</code>
            <span className="text-gray-500">WebSocket status</span>
          </div>
          <div className="flex items-start gap-2">
            <code className="bg-gray-100 px-2 py-0.5 rounded">GET /api/wechat-clawbot/models</code>
            <span className="text-gray-500">Available models</span>
          </div>
        </div>
      </div>
    </div>
  );
}
