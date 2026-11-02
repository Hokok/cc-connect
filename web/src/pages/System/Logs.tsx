import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eraser, Pause, Play, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/auth';

type LevelFilter = 'all' | 'debug' | 'info' | 'warn' | 'error';

interface LogLine {
  ts: string;
  level: string;
  msg: string;
}

const MAX_LINES = 2000;
const TAIL = 500;

// The engine filters by minimum level; "all" maps to the lowest level.
const LEVEL_QUERY: Record<LevelFilter, string> = {
  all: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

const LEVEL_STYLE: Record<string, string> = {
  ERROR: 'text-red-500 dark:text-red-400',
  WARN: 'text-amber-600 dark:text-amber-400',
  INFO: 'text-gray-700 dark:text-gray-300',
  DEBUG: 'text-gray-400 dark:text-gray-500',
};

const LEVEL_CHIP: Record<string, string> = {
  ERROR: 'bg-red-500/10 text-red-600 dark:text-red-400',
  WARN: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  INFO: 'bg-gray-500/10 text-gray-500 dark:text-gray-400',
  DEBUG: 'bg-gray-500/10 text-gray-400 dark:text-gray-500',
};

function fmtTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export default function Logs() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const [level, setLevel] = useState<LevelFilter>('all');
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState(false);
  const [lines, setLines] = useState<LogLine[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    if (paused) return;
    const url = `/api/v1/logs/stream?token=${encodeURIComponent(token)}&level=${LEVEL_QUERY[level]}&tail=${TAIL}`;
    const es = new EventSource(url);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (ev) => {
      try {
        const line = JSON.parse(ev.data) as LogLine;
        setLines((prev) => {
          const next = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev.slice();
          next.push(line);
          return next;
        });
      } catch {
        // ignore malformed frames
      }
    };
    return () => es.close();
  }, [paused, level, token]);

  // Keep the newest line in view unless the user scrolled up.
  useEffect(() => {
    const el = boxRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <ScrollText size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('logs.title')}</h2>
          <span
            className={
              'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ' +
              (live
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-gray-500/10 text-gray-500 dark:text-gray-400')
            }
          >
            <span className={'w-1.5 h-1.5 rounded-full ' + (live ? 'bg-green-500 animate-pulse' : 'bg-gray-400')} />
            {live ? t('logs.live') : t('logs.disconnected')}
          </span>
        </div>

        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as LevelFilter)}
          className="px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="all">{t('logs.levelAll')}</option>
          <option value="debug">DEBUG</option>
          <option value="info">INFO</option>
          <option value="warn">WARN</option>
          <option value="error">ERROR</option>
        </select>

        <span className="text-xs text-gray-400 tabular-nums">{t('logs.lines', { count: lines.length })}</span>

        <Button variant="secondary" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={16} /> : <Pause size={16} />}
          {paused ? t('logs.resume') : t('logs.pause')}
        </Button>
        <Button variant="secondary" onClick={() => setLines([])}>
          <Eraser size={16} /> {t('logs.clear')}
        </Button>
      </div>

      {/* Log viewer */}
      <div
        ref={boxRef}
        onScroll={onScroll}
        className="h-[calc(100vh-13rem)] overflow-auto rounded-xl border border-gray-200/80 dark:border-white/[0.08] bg-gray-50 dark:bg-black/60 p-3 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            {paused ? t('logs.emptyPaused') : t('logs.empty')}
          </div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={'flex gap-2 px-1 ' + (LEVEL_STYLE[l.level] || LEVEL_STYLE.INFO)}>
              <span className="shrink-0 text-gray-400/80 dark:text-gray-600 select-none">{fmtTime(l.ts)}</span>
              <span
                className={
                  'shrink-0 w-12 text-center text-[10px] font-semibold uppercase leading-5 rounded select-none ' +
                  (LEVEL_CHIP[l.level] || LEVEL_CHIP.INFO)
                }
              >
                {l.level}
              </span>
              <span className="whitespace-pre-wrap break-all min-w-0">{l.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
