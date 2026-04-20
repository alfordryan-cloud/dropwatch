import { useState, useEffect } from 'react';
import { pollEngineHealth, pauseAll, resumeAll } from '../engineClient';

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
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const stop = pollEngineHealth(setHealth, 10000);
    return stop;
  }, []);

  const isOnline = health?.online;
  const isRunning = isOnline && !paused;
  const workers = health?.workers || [];

  const handleToggle = async () => {
    if (!isOnline) return;
    setToggling(true);
    try {
      if (paused) { await resumeAll(); setPaused(false); }
      else { await pauseAll(); setPaused(true); }
    } catch (err) {
      console.error('Toggle error:', err);
    } finally {
      setToggling(false);
    }
  };

  const workerColors = {
    best_buy: '#378ADD',
    target: '#E24B4A',
    walmart: '#EF9F27',
    discovery: '#A17CF6',
    dropScheduler: '#00D26A',
  };

  const s = {
    wrap: { background: '#0f1923', border: '1px solid #1e3a2f', borderRadius: 12, padding: '12px 16px', margin: '12px 24px 0', fontFamily: 'ui-monospace, SFMono-Regular, monospace', minWidth: '320px' },
    row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    left: { display: 'flex', alignItems: 'center', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: '50%', background: isRunning ? '#22c55e' : paused ? '#eab308' : '#4b5563', boxShadow: isRunning ? '0 0 6px #22c55e' : 'none' },
    label: { color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: 1 },
    badge: { fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid', background: isRunning ? 'rgba(34,197,94,.15)' : 'rgba(75,85,99,.2)', color: isRunning ? '#86efac' : '#9ca3af', borderColor: isRunning ? 'rgba(34,197,94,.3)' : '#374151' },
    btn: { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', background: paused ? 'rgba(34,197,94,.15)' : 'rgba(234,179,8,.15)', color: paused ? '#86efac' : '#fde047', borderColor: paused ? 'rgba(34,197,94,.3)' : 'rgba(234,179,8,.3)' },
    workerList: { display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' },
    workerBadge: (w) => ({ fontSize: 9, padding: '3px 8px', borderRadius: 10, background: `${workerColors[w] || '#666'}22`, color: workerColors[w] || '#999', border: `1px solid ${workerColors[w] || '#666'}44`, textTransform: 'uppercase', fontWeight: 600 }),
    footer: { marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e3a2f', display: 'flex', gap: 16, fontSize: 10, color: '#6b7280' },
    offline: { color: '#6b7280', fontSize: 12, textAlign: 'center', padding: '8px 0' },
  };

  return (
    <div style={s.wrap}>
      <div style={s.row}>
        <div style={s.left}>
          <div style={s.dot} />
          <span style={s.label}>DROPWATCH v{health?.version || '?'}</span>
          <span style={s.badge}>{isRunning ? 'RUNNING' : paused ? 'PAUSED' : isOnline ? 'IDLE' : 'OFFLINE'}</span>
        </div>
        {isOnline && (
          <button style={s.btn} onClick={handleToggle} disabled={toggling}>
            {toggling ? '…' : paused ? '▶ Resume' : '⏸ Pause All'}
          </button>
        )}
      </div>
      {isOnline ? (
        <>
          <div style={s.workerList}>
            {workers.map(w => (
              <span key={w} style={s.workerBadge(w)}>
                {w === 'best_buy' ? 'BB' : w === 'target' ? 'TGT' : w === 'walmart' ? 'WMT' : w === 'dropScheduler' ? 'DROPS' : w.toUpperCase()}
              </span>
            ))}
          </div>
          <div style={s.footer}>
            <span>{health.purchasesCompleted ?? 0} purchases</span>
            <span>{formatUptime(health.uptime)} uptime</span>
            <span>{health.memoryMB ?? '—'}MB</span>
          </div>
        </>
      ) : (
        <div style={s.offline}>{health === null ? 'Connecting…' : '⚠ Engine offline'}</div>
      )}
    </div>
  );
}
