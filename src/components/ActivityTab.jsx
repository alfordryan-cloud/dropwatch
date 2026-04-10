import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const TYPE_STYLES = {
  check:    { bg: 'bg-blue-900/40',   border: 'border-blue-500/30',   dot: 'bg-blue-400',   label: 'CHECK'    },
  purchase: { bg: 'bg-green-900/40',  border: 'border-green-500/30',  dot: 'bg-green-400',  label: 'BUY'      },
  error:    { bg: 'bg-red-900/40',    border: 'border-red-500/30',    dot: 'bg-red-400',    label: 'ERROR'    },
  engine:   { bg: 'bg-purple-900/40', border: 'border-purple-500/30', dot: 'bg-purple-400', label: 'ENGINE'   },
  proxy:    { bg: 'bg-yellow-900/40', border: 'border-yellow-500/30', dot: 'bg-yellow-400', label: 'PROXY'    },
  default:  { bg: 'bg-gray-900/40',   border: 'border-gray-600/30',   dot: 'bg-gray-400',   label: 'INFO'     },
};

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ActivityTab() {
  const [logs,       setLogs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);

  const fetchLogs = async () => {
    const query = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (filter !== 'all') query.eq('type', filter);
    const { data, error } = await query;
    if (!error && data) setLogs(data.reverse());
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [filter]);

  useEffect(() => {
    const channel = supabase
      .channel('activity_log_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
        const entry = payload.new;
        if (filter === 'all' || entry.type === filter) {
          setLogs(prev => [...prev, entry].slice(-200));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [filter]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const FILTERS = ['all', 'check', 'purchase', 'error', 'engine', 'proxy'];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => {
            const style = TYPE_STYLES[f] || TYPE_STYLES.default;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider border transition-all ${
                  filter === f
                    ? `${style.bg} ${style.border} text-white border`
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="accent-blue-500" />
            Auto-scroll
          </label>
          <button onClick={fetchLogs} className="text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 px-3 py-1 rounded">
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 font-mono text-xs pr-1">
        {loading && <div className="text-gray-500 text-center py-8">Loading activity log…</div>}
        {!loading && logs.length === 0 && (
          <div className="text-gray-500 text-center py-8">No activity yet — engine is warming up</div>
        )}
        {logs.map((log, i) => {
          const style = TYPE_STYLES[log.type] || TYPE_STYLES.default;
          return (
            <div key={log.id || i} className={`flex items-start gap-2 p-2 rounded border ${style.bg} ${style.border}`}>
              <div className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${style.dot}`} />
              <div className="text-gray-500 flex-shrink-0 w-[68px]">{formatTime(log.created_at)}</div>
              <div className={`flex-shrink-0 w-[62px] text-center py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.border} border`}>
                {style.label}
              </div>
              <div className="flex-1 text-gray-200 leading-relaxed break-words">{log.message}</div>
              <div className="text-gray-600 flex-shrink-0 text-[10px]">{formatDate(log.created_at)}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
