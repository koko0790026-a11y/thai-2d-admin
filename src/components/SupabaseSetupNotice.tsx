import { useState } from 'react';
import { Check, Copy, Database, RefreshCw } from 'lucide-react';

interface SupabaseSetupNoticeProps {
  onRetry: () => void;
  isRetrying: boolean;
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

export function SupabaseSetupNotice({ onRetry, isRetrying }: SupabaseSetupNoticeProps) {
  const [copied, setCopied] = useState(false);

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
    <div className="bg-[#1E293B] border border-amber-500/40 rounded-xl p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B] shrink-0">
            <Database className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Connect Your Supabase Project
            </h2>
            <p className="mt-1 text-sm text-slate-300 leading-relaxed max-w-2xl">
              Add <span className="font-mono text-amber-300">SUPABASE_URL</span> and{' '}
              <span className="font-mono text-amber-300">SUPABASE_ANON_KEY</span> in your
              environment secrets, ensure the public storage bucket{' '}
              <span className="font-mono text-amber-300">ad-banners</span> exists, and verify the{' '}
              <span className="font-mono text-amber-300">slot_ads</span> table is ready.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-[#F59E0B] text-slate-950 text-sm font-semibold hover:bg-amber-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>Retry Connection</span>
        </button>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-700/70">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-slate-400">
            Reference SQL for <span className="font-mono text-slate-300">slot_ads</span> table
          </span>
          <button
            type="button"
            onClick={copySql}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900/70 border border-slate-700 text-xs font-medium text-slate-300 hover:text-slate-100 hover:border-slate-500 transition-colors cursor-pointer"
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
        </div>
        <pre className="p-3.5 rounded-lg bg-[#0F172A] border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
          <code>{SQL_SNIPPET}</code>
        </pre>
      </div>
    </div>
  );
}
