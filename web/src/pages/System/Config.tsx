import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FileCode, RefreshCw, RotateCcw, Settings2, ChevronDown, ChevronRight, Save } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { restartSystem, reloadConfig } from '@/api/status';
import api, { isStaleConfigError } from '@/api/client';
import GlobalSettings from './GlobalSettings';

export default function SystemConfig() {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [format, setFormat] = useState<'toml' | 'json'>('toml');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const text = await api.raw('/config');
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const obj = JSON.parse(trimmed);
          setContent(JSON.stringify(obj, null, 2));
          setSavedContent(JSON.stringify(obj, null, 2));
          setFormat('json');
        } catch {
          setContent(text);
          setSavedContent(text);
          setFormat('toml');
        }
      } else {
        setContent(text);
        setSavedContent(text);
        setFormat('toml');
      }
      setActionError('');
    } catch {
      setContent('');
      setSavedContent('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    const handler = () => fetchConfig();
    window.addEventListener('cc:refresh', handler);
    return () => window.removeEventListener('cc:refresh', handler);
  }, [fetchConfig]);

  const handleRestart = async () => {
    if (!confirm(t('system.restartConfirm'))) return;
    try {
      await restartSystem();
      setActionMsg(t('common.success'));
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleReload = async (silent = false) => {
    if (!silent && !confirm(t('system.reloadConfirm'))) return;
    try {
      await reloadConfig();
      setActionMsg(t('common.success'));
      setActionError('');
      fetchConfig();
    } catch (e: any) {
      if (!silent) setActionError(e.message);
    }
  };

  const dirty = content !== savedContent;

  const handleSaveConfig = async () => {
    if (!dirty) return;
    if (!confirm(t('system.saveConfigConfirm', 'Save config.toml? The engine will hot-reload it.'))) return;
    setSaving(true);
    setActionMsg('');
    setActionError('');
    try {
      await api.putRaw('/config', content);
      setSavedContent(content);
      setActionMsg(t('system.configSaved', 'config.toml saved, reloading…'));
      await handleReload(true);
    } catch (e: any) {
      if (isStaleConfigError(e)) {
        setActionError(t('system.configConflict', 'config.toml was modified elsewhere. Click "Refresh" to load the latest version.'));
      } else {
        setActionError(e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in ">
      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => handleReload(false)}><RefreshCw size={16} /> {t('system.reload')}</Button>
        <Button variant="danger" onClick={handleRestart}><RotateCcw size={16} /> {t('system.restart')}</Button>
      </div>

      {actionMsg && (
        <div className="text-sm text-accent bg-accent/10 border border-accent/20 rounded-lg px-4 py-2">{actionMsg}</div>
      )}
      {actionError && (
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2">{actionError}</div>
      )}

      {/* Global Settings */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('settings.title', 'Global Settings')}</h2>
        </div>
        <GlobalSettings />
      </div>

      {/* Raw Config editor (collapsible) */}
      <Card>
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-2 w-full text-left"
        >
          {showRaw ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <FileCode size={16} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('system.rawConfig', 'Raw Config')}</h3>
          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded uppercase">
            {format}
          </span>
          {dirty && (
            <span className="text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
              {t('system.unsavedChanges', 'unsaved')}
            </span>
          )}
        </button>
        {showRaw && (
          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="text-gray-400 animate-pulse text-sm">Loading...</div>
            ) : (
              <>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                  className="w-full h-[60vh] text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 overflow-auto font-mono leading-relaxed whitespace-pre border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-y"
                  placeholder={t('system.rawConfig', 'Raw Config')}
                />
                <div className="flex items-center gap-2">
                  <Button onClick={handleSaveConfig} disabled={!dirty || saving}>
                    <Save size={16} /> {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
                  </Button>
                  {dirty && (
                    <Button variant="secondary" onClick={fetchConfig} disabled={saving}>
                      {t('system.discardChanges', 'Discard')}
                    </Button>
                  )}
                  <span className="text-[11px] text-gray-400">{t('system.rawConfigHint', 'Edit config.toml directly. TOML syntax is validated before saving; most changes apply after an automatic reload.')}</span>
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
