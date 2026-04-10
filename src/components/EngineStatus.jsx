import { useState, useEffect } from 'react';
import { pollEngineHealth, pauseEngine, resumeEngine } from '../engineClient';

function StatPill({ label, value, color = 'gray' }) {
  const colors = {
    green:  'bg-green-900/40 border-green-500/30 text-green-300',
    blue:   'bg-blue-900/40 border-blue-500/30 text-blue-300',
    red:    'bg-red-900/40 border-red-500/30 text-red-300',
    yellow: 'bg-yellow-900/40 border-yellow-500/30 text-yellow-300',
    gray:   'bg-gray-800 border-gray-700 text-gray-300',
  };
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded border font-mono ${colors[color]}`}>
      <span className="text-lg font-bold">{value ?? '—'}</span>
      <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
    </div>
  );
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function EngineStatus() {
  const [health, setHealth]     = useState(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    const stop = pollEngineHealth(setHealth, 10000);
    return stop;
  }, []);

  const handleTogglePause = async () => {
    if (!health?.online) return;
    setToggling(true);
    try {
      if (health.paused) await resumeEngine();
      else await pauseEngine();
    } catch (err) {
      console.error('Toggle error:', err);
    } finally {
      setToggling(false);
    }
  };

  const isOnline  = health?.online;
  const isPaused  = health?.paused;
  const isRunning = isOnline && !isPaused;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            {isRunning && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${
              isRunning ? 'bg-green-500' : isPaused ? 'bg-yellow-500' : 'bg-gray-600'
            }`} />
          </span>
          <span className="font-mono font-bold text-white text-sm tracking-wide">
            DROPWATCH ENGINE
          </span>
          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
            isRunning
              ? 'bg-green-900/40 border-green-500/40 text-green-300'
              : isPaused
                ? 'bg-yellow-900/40 border-yellow-500/40 text-yellow-300'
                : 'bg-gray-800 border-gray-700 text-gray-500'
          }`}>
            {isRunning ? 'RUNNING' : isPaused ? 'PAUSED' : isOnline ? 'IDLE' : 'OFFLINE'}
          </span>
        </div>
        {isOnline && (
          <button
            onClick={handleTogglePause}
            disabled={toggling}
            className={`text-xs font-mono px-3 py-1.5 rounded border transition-all ${
              isPaused
                ? 'bg-green-800 border-green-600 text-green-200 hover:bg-green-700'
                : 'bg-yellow-800 border-yellow-600 text-yellow-200 hover:bg-yellow-700'
            } disabled:opacity-50`}
          >
            {toggling ? '…' : isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
        )}
      </div>

      {isOnline ? (
        <div className="grid grid-cols-4 gap-2">
          <StatPill label="Checks"    value={health.checksCompleted}    color="blue"   />
          <StatPill label="Purchases" value={health.purchasesCompleted} color="green"  />
          <StatPill label="Errors"    value={health.errors}             color={health.errors > 0 ? 'red' : 'gray'} />
          <StatPill label="Uptime"    value={formatUptime(health.uptime)} color="gray" />
        </div>
      ) : (
        <div className="text-gray-500 text-xs font-mono text-center py-2">
          {health === null ? 'Connecting to engine…' : '⚠ Engine offline — check Railway deployment'}
        </div>
      )}

      {isOnline && (
        <div className="flex gap-4 text-[10px] font-mono text-gray-500 border-t border-gray-800 pt-2">
          <span>MEM: {health.memoryMB ?? '—'} MB</span>
          <span>SETTINGS: {health.lastSettingsLoad
            ? new Date(health.lastSettingsLoad).toLocaleTimeString()
            : '—'}
          </span>
          {health.error && <span className="text-red-400">ERR: {health.error}</span>}
        </div>
      )}
    </div>
  );
}
