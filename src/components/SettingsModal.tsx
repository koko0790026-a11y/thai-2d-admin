import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, Lock, RotateCcw, Save, Server, X } from 'lucide-react';
import {
  ApiError,
  DEFAULT_SUPABASE_URL,
  getAppSettings,
  isSafeHttpUrl,
  saveAppSettings,
} from '../lib/api';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const [supabaseUrl, setSupabaseUrl] = useState(DEFAULT_SUPABASE_URL);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [adminPin, setAdminPin] = useState('1234');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const current = getAppSettings();
    setSupabaseUrl(current.supabaseUrl);
    setSupabaseAnonKey(current.supabaseAnonKey);
    setAdminPin(current.adminPin);
    setError(null);
    setShowKey(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedUrl = supabaseUrl.trim();
    if (!isSafeHttpUrl(trimmedUrl)) {
      setError('Please enter a valid Supabase URL starting with https://');
      return;
    }

    const trimmedPin = adminPin.trim();
    if (!/^\d{4}$/.test(trimmedPin)) {
      setError('Admin PIN must be exactly 4 numeric digits (0–9).');
      return;
    }

    try {
      saveAppSettings({
        supabaseUrl: trimmedUrl,
        supabaseAnonKey: supabaseAnonKey.trim(),
        adminPin: trimmedPin,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save settings.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-[#1E293B] border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-700/80 flex items-center justify-between gap-3">
          <div>
            <h2
              id="settings-modal-title"
              className="text-base font-semibold text-slate-50"
            >
              Supabase &amp; PIN Settings
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Saved locally in this browser — no environment variables needed
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="w-10 h-10 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-rose-500/10 border border-rose-500/40 px-3.5 py-2.5 text-xs font-medium text-rose-300"
            >
              {error}
            </div>
          )}

          {/* Supabase URL */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="settings_supabase_url"
                className="text-xs font-medium text-slate-300"
              >
                Supabase URL
              </label>
              {supabaseUrl.trim() !== DEFAULT_SUPABASE_URL && (
                <button
                  type="button"
                  onClick={() => setSupabaseUrl(DEFAULT_SUPABASE_URL)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#F59E0B] hover:text-amber-300 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>Reset default</span>
                </button>
              )}
            </div>
            <div className="relative">
              <Server
                className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="settings_supabase_url"
                type="url"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder={DEFAULT_SUPABASE_URL}
                required
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors"
              />
            </div>
          </div>

          {/* Supabase Anon Key */}
          <div>
            <label
              htmlFor="settings_supabase_anon_key"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Supabase Anon Key (<span className="font-mono text-slate-400">SUPABASE_ANON_KEY</span>)
            </label>
            <div className="relative">
              <KeyRound
                className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="settings_supabase_anon_key"
                type={showKey ? 'text' : 'password'}
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                autoComplete="off"
                spellCheck={false}
                className="w-full min-h-[44px] pl-10 pr-12 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors"
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
            <p className="mt-1.5 text-xs text-slate-400">
              Used directly from your browser for <span className="font-mono text-slate-300">/rest/v1/slot_ads</span> and{' '}
              <span className="font-mono text-slate-300">/storage/v1/object/ad-banners</span>.
            </p>
          </div>

          {/* Custom 4-Digit Admin PIN */}
          <div>
            <label
              htmlFor="settings_admin_pin"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              4-Digit Admin PIN (<span className="font-mono text-slate-400">ADMIN_PIN</span>)
            </label>
            <div className="relative">
              <Lock
                className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="settings_admin_pin"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={adminPin}
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setAdminPin(digitsOnly);
                }}
                placeholder="1234"
                required
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm font-mono tracking-[0.35em] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Default is <span className="font-mono text-slate-300">1234</span>. Takes effect next time you lock the dashboard.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 text-sm font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2 rounded-xl bg-[#F59E0B] text-slate-950 text-sm font-semibold hover:bg-amber-400 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
