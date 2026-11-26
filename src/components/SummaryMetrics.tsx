import type { SlotAd } from '../types/ads';

interface SummaryMetricsProps {
  ads: SlotAd[];
  loading: boolean;
}

export function SummaryMetrics({ ads, loading }: SummaryMetricsProps) {
  const totalAds = ads.length;
  const activeAds = ads.filter((ad) => ad.is_active).length;
  const pausedAds = totalAds - activeAds;
  const totalClicks = ads.reduce(
    (sum, ad) => sum + (Number.isFinite(Number(ad.clicks_count)) ? Number(ad.clicks_count) : 0),
    0,
  );

  const now = Date.now();
  const expiringSoon = ads.filter((ad) => {
    if (!ad.is_active) return false;
    const ms = new Date(ad.end_date).getTime() - now;
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 3;
  }).length;

  return (
    <section aria-label="Performance overview" className="grid grid-cols-2 gap-3 sm:gap-4">
      <div className="bg-[#1E293B] border border-slate-700/70 rounded-xl p-4 sm:p-5">
        <p className="text-xs sm:text-sm font-medium text-slate-400">Total Active Ads</p>
        {loading ? (
          <div className="mt-2.5 h-8 w-20 rounded bg-slate-800 animate-pulse" />
        ) : (
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#F59E0B]">
              {activeAds.toLocaleString()}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              / {totalAds} total
            </span>
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
          <span>{pausedAds} paused</span>
          {expiringSoon > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300">{expiringSoon} ending soon</span>
            </>
          )}
        </div>
      </div>

      <div className="bg-[#1E293B] border border-slate-700/70 rounded-xl p-4 sm:p-5">
        <p className="text-xs sm:text-sm font-medium text-slate-400">
          Total Clicks Across All Ads
        </p>
        {loading ? (
          <div className="mt-2.5 h-8 w-24 rounded bg-slate-800 animate-pulse" />
        ) : (
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-50">
              {totalClicks.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">clicks</span>
          </div>
        )}
        <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-400">
          <span className="font-mono tabular-nums">
            {totalAds > 0 ? Math.round(totalClicks / totalAds).toLocaleString() : '0'}
          </span>
          <span>avg per slot</span>
        </div>
      </div>
    </section>
  );
}
