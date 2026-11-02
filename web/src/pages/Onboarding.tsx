import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Bot, CheckCircle2, Circle, FolderKanban, Loader2, MessageSquare,
  RotateCcw, Sparkles,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { probeAgents, type AgentProbe } from '@/api/doctor';
import { restartSystem } from '@/api/status';
import { platformMeta } from '@/lib/platformMeta';
import PlatformSetupQR from './Projects/PlatformSetupQR';
import PlatformManualForm from './Projects/PlatformManualForm';
import { cn } from '@/lib/utils';

type Step = 'agent' | 'platform' | 'connect' | 'done';
type PlatformKind = 'feishu' | 'lark' | 'weixin';

const PLATFORMS: { key: string; label: string; color: string }[] = [
  { key: 'feishu', label: 'Feishu / Lark', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
  { key: 'weixin', label: 'WeChat', color: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
  { key: 'telegram', label: 'Telegram', color: 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400' },
  { key: 'discord', label: 'Discord', color: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' },
  { key: 'slack', label: 'Slack', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
  { key: 'dingtalk', label: 'DingTalk', color: 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' },
  { key: 'wecom', label: 'WeChat Work', color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  { key: 'qq', label: 'QQ (OneBot)', color: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400' },
  { key: 'qqbot', label: 'QQ Bot (Official)', color: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400' },
  { key: 'line', label: 'LINE', color: 'bg-lime-50 dark:bg-lime-900/30 text-lime-600 dark:text-lime-400' },
  { key: 'weibo', label: 'Weibo (微博)', color: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  { key: 'tuitui', label: 'TuiTui (推推)', color: 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300' },
];

const STEPS: Step[] = ['agent', 'platform', 'connect', 'done'];

/** Remember within this session that the user went through (or skipped) onboarding. */
function markOnboarded() {
  try { sessionStorage.setItem('cc_onboarded', '1'); } catch { /* private mode */ }
}

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('agent');
  const [probes, setProbes] = useState<AgentProbe[] | null>(null);
  const [agent, setAgent] = useState('');
  const [platform, setPlatform] = useState('');
  const [projName, setProjName] = useState('my-project');
  const [workDir, setWorkDir] = useState('');
  const [detailsReady, setDetailsReady] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    probeAgents()
      .then((r) => setProbes(r.agents || []))
      .catch(() => setProbes([]));
  }, []);

  const sortedProbes = useMemo(() => {
    if (!probes) return [];
    return [...probes].sort((a, b) => Number(b.installed) - Number(a.installed) || a.agent.localeCompare(b.agent));
  }, [probes]);

  const isQR = (key: string) => key === 'feishu' || key === 'lark' || key === 'weixin';
  const supported = (key: string) => isQR(key) || !!platformMeta[key];

  const finish = () => {
    markOnboarded();
    navigate('/');
  };

  const handleRestart = async () => {
    setRestarting(true);
    setError('');
    try {
      await restartSystem();
      markOnboarded();
      navigate('/');
    } catch (e: any) {
      setError(t('onboarding.restartFailed', { error: e?.message || String(e) }));
    } finally {
      setRestarting(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a0a0c] p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Sparkles size={18} className="text-accent" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('onboarding.title')}</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('onboarding.subtitle')}</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full font-medium',
                  i < stepIndex && 'bg-green-500/10 text-green-600 dark:text-green-400',
                  i === stepIndex && 'bg-accent/12 text-accent ring-1 ring-accent/25',
                  i > stepIndex && 'text-gray-400',
                )}
              >
                {t(`onboarding.step_${s}`)}
              </span>
              {i < STEPS.length - 1 && <span className="w-4 h-px bg-gray-300 dark:bg-gray-700" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] shadow-sm p-6">
          {/* Step 1: agent */}
          {step === 'agent' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('onboarding.agentLabel')}</h2>
              {probes === null ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                  <Loader2 size={16} className="animate-spin" /> {t('onboarding.detecting')}
                </div>
              ) : (
                <>
                  {sortedProbes.length > 0 && !sortedProbes.some((p) => p.installed) && (
                    <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                      {t('onboarding.noneDetected')}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-auto">
                    {sortedProbes.map((p) => (
                      <button
                        key={p.agent}
                        type="button"
                        onClick={() => setAgent(p.agent)}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                          agent === p.agent
                            ? 'border-accent/50 bg-accent/5 ring-1 ring-accent/30'
                            : 'border-gray-200 dark:border-white/[0.08] hover:border-accent/30',
                        )}
                      >
                        <Bot size={16} className="mt-0.5 text-gray-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {p.display_name || p.agent}
                            </span>
                            {p.installed ? (
                              <span className="text-[10px] font-semibold bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded shrink-0">
                                {t('onboarding.installed')}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold bg-gray-500/10 text-gray-400 px-1.5 py-0.5 rounded shrink-0">
                                {t('onboarding.notInstalled')}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">
                            {p.installed
                              ? [p.binary, p.version].filter(Boolean).join(' · ')
                              : t('onboarding.notInstalledHint')}
                          </p>
                        </div>
                        {agent === p.agent
                          ? <CheckCircle2 size={16} className="text-accent shrink-0 mt-0.5" />
                          : <Circle size={16} className="text-gray-300 dark:text-gray-600 shrink-0 mt-0.5" />}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between pt-2">
                    <Button variant="secondary" size="sm" onClick={finish}>{t('onboarding.skipSetup')}</Button>
                    <Button size="sm" disabled={!agent} onClick={() => setStep('platform')}>
                      {t('setup.next', 'Next')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: platform */}
          {step === 'platform' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                <MessageSquare size={14} className="inline mr-1.5 -mt-0.5 text-gray-400" />
                {t('onboarding.platformLabel')}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PLATFORMS.map((p) => {
                  const ok = supported(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      disabled={!ok}
                      onClick={() => { setPlatform(p.key); setDetailsReady(false); setStep('connect'); }}
                      className={cn(
                        'flex items-center gap-2 p-3 rounded-xl border text-left transition-all',
                        platform === p.key && 'border-accent/50 bg-accent/5 ring-1 ring-accent/30',
                        platform !== p.key && 'border-gray-200 dark:border-white/[0.08]',
                        ok && 'hover:border-accent/30',
                        !ok && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0', p.color)}>
                        {p.label.charAt(0)}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400">{t('onboarding.platformHint')}</p>
              <div className="flex justify-between pt-2">
                <Button variant="secondary" size="sm" onClick={() => setStep('agent')}>{t('common.back')}</Button>
                <span />
              </div>
            </div>
          )}

          {/* Step 3: connect */}
          {step === 'connect' && (
            <div className="space-y-4">
              {!detailsReady ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                    <FolderKanban size={14} className="inline mr-1.5 -mt-0.5 text-gray-400" />
                    {t('onboarding.projectLabel')}
                  </h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t('onboarding.projectName')} <span className="text-red-400">*</span>
                    </label>
                    <Input value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="my-project" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {t('onboarding.workDir')} <span className="text-red-400">*</span>
                    </label>
                    <Input value={workDir} onChange={(e) => setWorkDir(e.target.value)} placeholder="/Users/you/projects/demo" />
                    <p className="text-[11px] text-gray-400 mt-1">{t('onboarding.workDirHint')}</p>
                  </div>
                  <div className="flex justify-between pt-2">
                    <Button variant="secondary" size="sm" onClick={() => setStep('platform')}>{t('common.back')}</Button>
                    <Button size="sm" disabled={!projName.trim() || !workDir.trim()} onClick={() => setDetailsReady(true)}>
                      {t('setup.next', 'Next')}
                    </Button>
                  </div>
                </>
              ) : isQR(platform) ? (
                <PlatformSetupQR
                  platformType={platform as PlatformKind}
                  projectName={projName.trim()}
                  workDir={workDir.trim()}
                  agentType={agent}
                  onComplete={() => setStep('done')}
                  onCancel={() => setDetailsReady(false)}
                />
              ) : (
                <PlatformManualForm
                  platformType={platform}
                  projectName={projName.trim()}
                  workDir={workDir.trim()}
                  agentType={agent}
                  onComplete={() => setStep('done')}
                  onCancel={() => setDetailsReady(false)}
                />
              )}
            </div>
          )}

          {/* Step 4: done */}
          {step === 'done' && (
            <div className="text-center space-y-5 py-4">
              <CheckCircle2 size={40} className="mx-auto text-green-500" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('onboarding.doneTitle')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">{t('onboarding.restartPrompt')}</p>
              {error && <div className="text-sm text-red-500">{error}</div>}
              <div className="flex justify-center gap-3">
                <Button variant="secondary" size="sm" onClick={finish}>{t('setup.later', 'Later')}</Button>
                <Button size="sm" onClick={handleRestart} loading={restarting}>
                  <RotateCcw size={14} /> {t('setup.restartNow', 'Restart now')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
