import { useCallback, useEffect, useState } from 'react';
import { Delete, Lock, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured, verifyPin } from '../lib/api';

interface PinLockScreenProps {
  onUnlocked: (supabaseConfigured: boolean) => void;
}

const PIN_LENGTH = 4;
const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinLockScreen({ onUnlocked }: PinLockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const submitPin = useCallback(
    (candidate: string) => {
      if (verifyPin(candidate)) {
        setError(null);
        onUnlocked(isSupabaseConfigured());
        return;
      }
      setError('Incorrect PIN. Please try again.');
      setShakeKey((prev) => prev + 1);
      setPin('');
    },
    [onUnlocked],
  );

  const appendDigit = useCallback(
    (digit: string) => {
      setError(null);
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === PIN_LENGTH) {
          window.setTimeout(() => submitPin(next), 60);
        }
        return next;
      });
    },
    [submitPin],
  );

  const handleBackspace = useCallback(() => {
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError(null);
    setPin('');
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        appendDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appendDigit, handleBackspace, handleClear]);

  return (
    <div className="min-h-[100dvh] bg-[#0F172A] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-[#1E293B] border border-slate-700/70 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/30">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B] mb-4">
            <Lock className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-50 text-balance">
            2D/3D Live Ads Manager
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Enter your 4-digit admin PIN to manage live slots
          </p>
        </div>

        {/* 4-Digit Indicator */}
        <div
          key={shakeKey}
          className={`mt-7 flex items-center justify-center gap-4 ${
            shakeKey > 0 ? 'animate-pin-shake' : ''
          }`}
          role="status"
          aria-label={`${pin.length} of ${PIN_LENGTH} PIN digits entered`}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, index) => {
            const isFilled = index < pin.length;
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full border transition-all duration-150 ${
                  isFilled
                    ? 'bg-[#F59E0B] border-[#F59E0B] scale-110'
                    : error
                      ? 'bg-transparent border-rose-500/80'
                      : 'bg-slate-900/70 border-slate-600'
                }`}
              />
            );
          })}
        </div>

        {/* Error / Status Line */}
        <div className="mt-4 min-h-[22px] text-center">
          {error ? (
            <p className="text-xs font-medium text-rose-400" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-xs text-slate-500">Enter 4 digits to unlock</p>
          )}
        </div>

        {/* Touch-First Numeric Keypad */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {KEYPAD_DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => appendDigit(digit)}
              className="h-14 rounded-xl bg-slate-900/75 border border-slate-700/70 text-xl font-mono font-semibold text-slate-100 hover:bg-slate-800 hover:border-slate-600 active:scale-95 active:bg-[#F59E0B]/15 active:border-[#F59E0B]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] transition-all duration-150 select-none cursor-pointer"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            disabled={pin.length === 0}
            onClick={handleClear}
            className="h-14 rounded-xl bg-slate-900/40 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] transition-all duration-150 disabled:opacity-40 select-none cursor-pointer"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => appendDigit('0')}
            className="h-14 rounded-xl bg-slate-900/75 border border-slate-700/70 text-xl font-mono font-semibold text-slate-100 hover:bg-slate-800 hover:border-slate-600 active:scale-95 active:bg-[#F59E0B]/15 active:border-[#F59E0B]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] transition-all duration-150 select-none cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            disabled={pin.length === 0}
            onClick={handleBackspace}
            aria-label="Delete last digit"
            className="h-14 rounded-xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] transition-all duration-150 disabled:opacity-40 select-none cursor-pointer"
          >
            <Delete className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Customize PIN &amp; Supabase key in Settings after unlock</span>
        </div>
      </div>
    </div>
  );
}
