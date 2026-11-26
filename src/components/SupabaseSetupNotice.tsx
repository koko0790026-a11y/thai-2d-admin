import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, Database, Eye, EyeOff, KeyRound, Save } from 'lucide-react';
import { ApiError, getAppSettings, saveAppSettings } from '../lib/api';

interface SupabaseSetupNoticeProps {
  onConnected: () => void;
}

const SQL_SNIPPET = `create table if not exists public.slot_ads (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  slot_position text not null check (
    slot_position in ('popup', 'top_slider', 'middle_banner', 'grid_logo', 'bottom_sticky')
  ),
  media_url text not null,
  target_url text not null,
  end_date timestamptz not null,
  display_order integer not null default 1,
  is_active boolean not null default true,
  clicks_count integer not null default 0,
  created_at timestamptz not null default now()
);`;

export function SupabaseSetupNotice({ onConnected }: SupabaseSetupNoticeProps) {
  const initial = getAppSettings();
  const [anonKey, setAnonKey] = useState(initial.supabaseAnonKey);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(false);

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = anonKey.trim();
    if (!trimmed) {
      setError('Please paste your Supabase Anon Key to connect.');
      return;
    }
    try {
      saveAppSettings({ supabaseAnonKey: trimmed });
      onConnected();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save key.');
    }
  };

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SQL_SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  return (
    <div className="bg-[#1E293B] border border-amber-500/40 rounded-xl p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B] shrink-0">
          <Database className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-100">
            Connect to Supabase
          </h2>
          <p className="mt-1 text-sm text-slate-300 leading-relaxed">
            Connected URL:{' '}
            <span className="font-mono text-amber-300 break-all">{initial.supabaseUrl}</span>.
            Paste your <span className="font-mono text-amber-300">SUPABASE_ANON_KEY</span> below
            to save it in this browser and start managing <span className="font-mono text-slate-200">slot_ads</span> and{' '}
            <span className="font-mono text-slate-200">ad-banners</span> directly.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        {error && (
          <p role="alert" className="text-xs font-medium text-rose-400">
            {error}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <KeyRound
              className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type={showKey ? 'text' : 'password'}
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="Paste SUPABASE_ANON_KEY (eyJhbGciOi...)"
              aria-label="Supabase Anon Key"
              autoComplete="off"
              spellCheck={false}
              className="w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              aria-label={showKey ? 'Hide anon key' : 'Show anon key'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-md text-slate-400 hover:text-slate-100 flex items-center justify-center cursor-pointer"
            >
              {showKey ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-lg bg-[#F59E0B] text-slate-950 text-sm font-semibold hover:bg-amber-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            <span>Save &amp; Connect</span>
          </button>
        </div>
      </form>

      <div className="pt-3 border-t border-slate-700/70">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowSql((prev) => !prev)}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            {showSql ? 'Hide reference SQL' : 'View reference SQL for slot_ads table'}
          </button>
          {showSql && (
            <button
              type="button"
              onClick={copySql}
              className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1 rounded-lg bg-slate-900/70 border border-slate-700 text-xs font-medium text-slate-300 hover:text-slate-100 hover:border-slate-500 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy SQL</span>
                </>
              )}
            </button>
          )}
        </div>

        {showSql && (
          <pre className="mt-2.5 p-3.5 rounded-lg bg-[#0F172A] border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
            <code>{SQL_SNIPPET}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
