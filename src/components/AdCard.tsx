import { useState } from 'react';
import {
  ExternalLink,
  ImageOff,
  Maximize2,
  MousePointerClick,
  Trash2,
} from 'lucide-react';
import { SLOT_MAP } from '../types/ads';
import type { SlotAd } from '../types/ads';
import { formatExpiryInfo, isSafeHttpUrl, isSafeTargetUrl } from '../lib/api';

interface AdCardProps {
  ad: SlotAd;
  isToggling: boolean;
  isDeleting: boolean;
  onToggleActive: (ad: SlotAd) => void;
  onDelete: (ad: SlotAd) => void;
  onPreview: (ad: SlotAd) => void;
}

export function AdCard({
  ad,
  isToggling,
  isDeleting,
  onToggleActive,
  onDelete,
  onPreview,
}: AdCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const slotInfo = SLOT_MAP[ad.slot_position] ?? {
    value: ad.slot_position,
    label: ad.slot_position,
    shortLabel: ad.slot_position,
    hint: '',
  };

  const expiry = formatExpiryInfo(ad.end_date);
  const safeMedia = isSafeHttpUrl(ad.media_url);
  const safeTarget = isSafeTargetUrl(ad.target_url);
  const clicks = Number.isFinite(Number(ad.clicks_count)) ? Number(ad.clicks_count) : 0;

  return (
    <article
      className={`bg-[#1E293B] border rounded-xl p-4 transition-colors duration-150 ${
        ad.is_active ? 'border-slate-700/80' : 'border-slate-800/90 opacity-80'
      }`}
    >
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Live Animated GIF Thumbnail Preview */}
        <button
          type="button"
          onClick={() => onPreview(ad)}
          aria-label={`Preview banner for ${ad.agent_name}`}
          className="group relative w-full sm:w-44 h-32 sm:h-28 rounded-lg bg-[#0F172A] border border-slate-700/70 overflow-hidden shrink-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] cursor-pointer"
        >
          {!imgFailed && safeMedia ? (
            <img
              src={ad.media_url}
              alt={`${ad.agent_name} ${slotInfo.label} banner`}
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-contain bg-slate-950/70"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 px-3 text-slate-500 bg-gradient-to-br from-slate-900 to-slate-950">
              <ImageOff className="w-5 h-5 text-slate-500" aria-hidden="true" />
              <span className="text-[11px] font-medium text-slate-400 truncate max-w-full">
                {ad.agent_name}
              </span>
            </div>
          )}
          <span className="absolute right-2 bottom-2 w-7 h-7 rounded-md bg-slate-950/80 text-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
            <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        </button>

        {/* Ad Metadata & Controls */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-50 truncate">
                  {ad.agent_name}
                </h3>
                {/* Clean Unboxed Metadata Line */}
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-mono font-medium text-[#F59E0B]">
                    {ad.slot_position}
                  </span>
                  <span className="text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-slate-300">
                    Order #{ad.display_order}
                  </span>
                  <span className="text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span
                    className={
                      expiry.tone === 'expired'
                        ? 'text-rose-400 font-medium'
                        : expiry.tone === 'warning'
                          ? 'text-amber-300 font-medium'
                          : 'text-slate-400'
                    }
                  >
                    Ends {expiry.formattedDate} ({expiry.statusText})
                  </span>
                </div>
              </div>

              {/* Clicks Counter */}
              <div className="text-right shrink-0">
                <div className="inline-flex items-center gap-1.5 text-slate-100">
                  <MousePointerClick
                    className="w-3.5 h-3.5 text-[#F59E0B]"
                    aria-hidden="true"
                  />
                  <span className="text-lg font-bold font-mono tabular-nums">
                    {clicks.toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-none mt-0.5">clicks</p>
              </div>
            </div>

            {/* Target URL Line */}
            {safeTarget ? (
              <a
                href={ad.target_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300 transition-colors max-w-full"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{ad.target_url}</span>
              </a>
            ) : (
              <p className="mt-2 text-xs text-slate-500 truncate">{ad.target_url}</p>
            )}
          </div>

          {/* Action Row: Active Switch & Delete Confirmation */}
          <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between gap-3">
            {/* Instant Active / Inactive Toggle Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={ad.is_active}
              disabled={isToggling || isDeleting}
              onClick={() => onToggleActive(ad)}
              className="inline-flex items-center gap-3 min-h-[44px] pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] rounded-lg cursor-pointer disabled:opacity-50"
            >
              <span
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 ${
                  ad.is_active ? 'bg-[#F59E0B]' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-slate-950 shadow transition-transform duration-150 ${
                    ad.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </span>
              <span
                className={`text-xs font-semibold ${
                  ad.is_active ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {isToggling ? 'Updating…' : ad.is_active ? 'Active' : 'Inactive'}
              </span>
            </button>

            {/* Delete Button with Inline Confirmation */}
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmingDelete(false)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => onDelete(ad)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white hover:bg-rose-500 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting…' : 'Confirm Delete'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmingDelete(true)}
                aria-label={`Delete ad for ${ad.agent_name}`}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
