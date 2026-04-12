import { useState, useEffect } from 'react';
import { pollEngineHealth, pauseEngine, resumeEngine } from '../engineClient';

function formatUptime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

export default function EngineStatus() {
  const [health, setHealth] = useState(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    const stop = pollEngineHealth(setHealth, 10000);
    return stop;
  }, []);

  const isOnline = health?.online;
  const isPaused = health?.paused;
  const isRunning = isOnline && !isPaused;

  const handleToggle = async () => {
    if (!isOnline) return;
    setToggling(true);
    try {
      if (isPaused) await resumeEngine();
      else await pauseEngine();
    } catch (err) {
      console.error('Toggle error:', err);
    } finally {
      setToggling(false);
    }
  };

  const s = {
    wrap: { background: '#0f1923', border: '1px solid #1e3a2f', borderRadius: 12, padding: '12px 16px', margin: '12px 24px 0', fontFamily: 'monospace' },
    row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    left: { display: 'flex', alignItems: 'center', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: '50%', background: isRunning ? '#22c55e' : isPaused ? '#eab308' : '#4b5563', boxShadow: isRunning ? '0 0 6px #22c55e' : 'none' },
    label: { color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: 1 },
    badge: { fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid', background: isRunning ? 'rgba(34,197,94,.15)' : 'rgba(75,85,99,.2)', color: isRunning ? '#86efac' : '#9ca3af', borderColor: isRunning ? 'rgba(34,197,94,.3)' : '#374151' },
    btn: { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', background: isPaused ? 'rgba(34,197,94,.15)' : 'rgba(234,179,8,.15)', color: isPaused ? '#86efac' : '#fde047', borderColor: isPaused ? 'rgba(34,197,94,.3)' : 'rgba(234,179,8,.3)' },
    stats: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 10 },
    pill: { background: '#1a2535', border: '1px solid #1e3a2f', borderRadius: 8, padding: '6px 8px', textAlign: 'center' },
    pillVal: { color: '#93c5fd', fontWeight: 700, fontSize: 16, display: 'block' },
    pillLbl: { color: '#6b7280', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
    footer: { marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e3a2f', display: 'flex', gap: 16, fontSize: 10, color: '#6b7280' },
    offline: { color: '#6b7280', fontSize: 12, textAlign: 'center', padding: '8px 0' },
  };

  return (
    <div style={s.wrap}>
      <div style={s.row}>
        <div style={s.left}>
          <div style={s.dot} />
          <span style={s.label}>DROPWATCH ENGINE</span>
          <span style={s.badge}>{isRunning ? 'RUNNING' : isPaused ? 'PAUSED' : isOnline ? 'IDLE' : 'OFFLINE'}</span>
        </div>
        {isOnline && (
          <button style={s.btn} onClick={handleToggle} disabled={toggling}>
            {toggling ? '…' : isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
        )}
      </div>
      {isOnline ? (
        <>
          <div style={s.stats}>
            <div style={s.pill}><span style={s.pillVal}>{health.checksCompleted ?? '—'}</span><span style={s.pillLbl}>Checks</span></div>
            <div style={s.pill}><span style={{...s.pillVal, color: '#86efac'}}>{health.purchasesCompleted ?? '—'}</span><span style={s.pillLbl}>Purchases</span></div>
            <div style={s.pill}><span style={{...s.pillVal, color: health.errors > 0 ? '#f87171' : '#93c5fd'}}>{health.errors ?? '—'}</span><span style={s.pillLbl}>Errors</span></div>
            <div style={s.pill}><span style={s.pillVal}>{formatUptime(health.uptime)}</span><span style={s.pillLbl}>Uptime</span></div>
          </div>
          <div style={s.footer}>
            <span>MEM: {health.memoryMB ?? '—'} MB</span>
            <span>SETTINGS: {health.lastSettingsLoad ? new Date(health.lastSettingsLoad).toLocaleTimeString() : '—'}</span>
          </div>
        </>
      ) : (
        <div style={s.offline}>{health === null ? 'Connecting to engine…' : '⚠ Engine offline — check Railway'}</div>
      )}
    </div>
  );
}
