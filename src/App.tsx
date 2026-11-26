import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  LayoutList,
  Lock,
  PlusCircle,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { SLOT_OPTIONS } from './types/ads';
import type { SlotAd, SlotPosition } from './types/ads';
import {
  ApiError,
  deleteAd,
  fetchAds,
  isSafeHttpUrl,
  isSafeTargetUrl,
  isSupabaseConfigured,
  updateAd,
} from './lib/api';
import { PinLockScreen } from './components/PinLockScreen';
import { SummaryMetrics } from './components/SummaryMetrics';
import { AdForm } from './components/AdForm';
import { AdCard } from './components/AdCard';
import { SupabaseSetupNotice } from './components/SupabaseSetupNotice';
import { SettingsModal } from './components/SettingsModal';

type StatusFilter = 'all' | 'active' | 'inactive';
type SlotFilter = 'all' | SlotPosition;
type MobileTab = 'ads' | 'create';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState(() => isSupabaseConfigured());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [ads, setAds] = useState<SlotAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('ads');

  const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({});
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const [previewAd, setPreviewAd] = useState<SlotAd | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToast({ id, text, tone });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3200);
  }, []);

  const loadAds = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setSupabaseConfigured(false);
      setAds([]);
      setLoadError(null);
      return;
    }

    setSupabaseConfigured(true);
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchAds();
      setAds(rows);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'SUPABASE_NOT_CONFIGURED') {
          setSupabaseConfigured(false);
          setAds([]);
          return;
        }
        setLoadError(err.message);
      } else {
        setLoadError('Unable to load ads from Supabase.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked) {
      void loadAds();
    }
  }, [unlocked, loadAds]);

  useEffect(() => {
    if (!previewAd) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewAd(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewAd]);

  const handleUnlocked = useCallback((configured: boolean) => {
    setSupabaseConfigured(configured);
    setUnlocked(true);
  }, []);

  const handleLock = () => {
    setAds([]);
    setUnlocked(false);
    setPreviewAd(null);
    setSettingsOpen(false);
  };

  const handleSettingsSaved = () => {
    const configured = isSupabaseConfigured();
    setSupabaseConfigured(configured);
    showToast('Settings saved to this browser');
    if (configured) {
      void loadAds();
    } else {
      setAds([]);
    }
  };

  const handleAdCreated = (created: SlotAd) => {
    setAds((prev) =>
      [created, ...prev].sort((a, b) => a.display_order - b.display_order),
    );
    setMobileTab('ads');
    showToast(`Published ad for ${created.agent_name}`);
  };

  const handleToggleActive = async (ad: SlotAd) => {
    const key = String(ad.id);
    const nextState = !ad.is_active;

    setTogglingIds((prev) => ({ ...prev, [key]: true }));
    setAds((prev) =>
      prev.map((item) => (String(item.id) === key ? { ...item, is_active: nextState } : item)),
    );

    try {
      const updated = await updateAd(ad.id, { is_active: nextState });
      setAds((prev) =>
        prev.map((item) => (String(item.id) === key ? updated : item)),
      );
      showToast(
        `${ad.agent_name} is now ${updated.is_active ? 'Active' : 'Inactive'}`,
      );
    } catch (err) {
      // Revert optimistic toggle
      setAds((prev) =>
        prev.map((item) =>
          String(item.id) === key ? { ...item, is_active: ad.is_active } : item,
        ),
      );
      showToast(
        err instanceof ApiError ? err.message : 'Failed to update ad status.',
        'error',
      );
    } finally {
      setTogglingIds((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleDeleteAd = async (ad: SlotAd) => {
    const key = String(ad.id);
    setDeletingIds((prev) => ({ ...prev, [key]: true }));
    try {
      await deleteAd(ad.id);
      setAds((prev) => prev.filter((item) => String(item.id) !== key));
      showToast(`Deleted ad for ${ad.agent_name}`);
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : 'Failed to delete ad.',
        'error',
      );
    } finally {
      setDeletingIds((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const filteredAds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return ads.filter((ad) => {
      if (statusFilter === 'active' && !ad.is_active) return false;
      if (statusFilter === 'inactive' && ad.is_active) return false;
      if (slotFilter !== 'all' && ad.slot_position !== slotFilter) return false;
      if (query) {
        const matchesAgent = String(ad.agent_name ?? '').toLowerCase().includes(query);
        const matchesSlot = String(ad.slot_position ?? '').toLowerCase().includes(query);
        const matchesTarget = String(ad.target_url ?? '').toLowerCase().includes(query);
        if (!matchesAgent && !matchesSlot && !matchesTarget) return false;
      }
      return true;
    });
  }, [ads, statusFilter, slotFilter, searchQuery]);

  const nextDisplayOrder = useMemo(() => {
    if (ads.length === 0) return 1;
    const maxOrder = ads.reduce(
      (max, ad) => (Number(ad.display_order) > max ? Number(ad.display_order) : max),
      0,
    );
    return Math.min(maxOrder + 1, 9999);
  }, [ads]);

  if (!unlocked) {
    return <PinLockScreen onUnlocked={handleUnlocked} />;
  }

  return (
    <div className="min-h-[100dvh] bg-[#0F172A] text-slate-100 pb-20 lg:pb-10">
      {/* Compact Sticky Top Bar (3-zone contract) */}
      <header className="sticky top-0 z-30 h-14 bg-[#0F172A]/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
            2D/3D Live Ads Manager
          </span>

          <nav
            aria-label="Dashboard navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {(
              [
                { key: 'all', label: 'All Ads' },
                { key: 'active', label: 'Active' },
                { key: 'inactive', label: 'Inactive' },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatusFilter(item.key)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === item.key
                    ? 'border-[#F59E0B] text-[#F59E0B]'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="py-1 border-b-2 border-transparent text-slate-400 hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Settings
            </button>
          </nav>

          <button
            type="button"
            onClick={handleLock}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-lg bg-[#1E293B] border border-slate-700 text-xs font-semibold text-slate-200 hover:border-[#F59E0B]/60 hover:text-[#F59E0B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Lock</span>
          </button>
        </div>
      </header>

      {/* Main Responsive Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-7 space-y-6">
        {!supabaseConfigured && (
          <SupabaseSetupNotice onConnected={handleSettingsSaved} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Summary Metrics & Live Ad List */}
          <div
            className={`lg:col-span-7 xl:col-span-8 space-y-5 ${
              mobileTab === 'create' ? 'hidden lg:block' : 'block'
            }`}
          >
            <SummaryMetrics ads={ads} loading={loading} />

            {/* Toolbar: Search, Refresh & Slot Filter */}
            <section
              aria-label="Filter and search ads"
              className="bg-[#1E293B] border border-slate-700/70 rounded-xl p-4 space-y-3.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="relative flex-1">
                  <Search
                    className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search agent, slot, or target URL…"
                    aria-label="Search ads"
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-lg bg-[#0F172A] border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void loadAds()}
                  disabled={loading}
                  aria-label="Refresh ads list"
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3.5 rounded-lg bg-[#0F172A] border border-slate-700 text-xs font-medium text-slate-300 hover:text-slate-50 hover:border-slate-500 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${loading ? 'animate-spin text-[#F59E0B]' : ''}`}
                    aria-hidden="true"
                  />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>

              {/* Mobile Status Segmented Control */}
              <div className="flex md:hidden items-center gap-1 p-1 rounded-lg bg-[#0F172A] border border-slate-800">
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'active', label: 'Active' },
                    { key: 'inactive', label: 'Inactive' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatusFilter(item.key)}
                    className={`flex-1 min-h-[36px] text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      statusFilter === item.key
                        ? 'bg-[#1E293B] text-[#F59E0B]'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Slot Position Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setSlotFilter('all')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    slotFilter === 'all'
                      ? 'bg-[#F59E0B] text-slate-950 font-semibold'
                      : 'bg-[#0F172A] text-slate-400 hover:text-slate-100 border border-slate-800'
                  }`}
                >
                  All Slots
                </button>
                {SLOT_OPTIONS.map((slot) => (
                  <button
                    key={slot.value}
                    type="button"
                    onClick={() => setSlotFilter(slot.value)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      slotFilter === slot.value
                        ? 'bg-[#F59E0B] text-slate-950 font-semibold'
                        : 'bg-[#0F172A] text-slate-400 hover:text-slate-100 border border-slate-800'
                    }`}
                  >
                    {slot.shortLabel}
                  </button>
                ))}
              </div>
            </section>

            {/* Live Ads List */}
            <section aria-label="Slot ads inventory" className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-slate-200">
                  Live Slot Inventory
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {filteredAds.length} {filteredAds.length === 1 ? 'ad' : 'ads'}
                </span>
              </div>

              {loadError && (
                <div
                  role="alert"
                  className="bg-rose-500/10 border border-rose-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <p className="text-sm text-rose-300">{loadError}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadAds()}
                      className="min-h-[40px] px-3.5 py-2 rounded-lg bg-rose-500/20 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 transition-colors cursor-pointer"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              {loading && ads.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="bg-[#1E293B] border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4 animate-pulse"
                    >
                      <div className="w-full sm:w-44 h-28 rounded-lg bg-slate-800 shrink-0" />
                      <div className="flex-1 space-y-3 py-1">
                        <div className="h-4 w-40 rounded bg-slate-800" />
                        <div className="h-3 w-64 rounded bg-slate-800" />
                        <div className="h-3 w-48 rounded bg-slate-800" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredAds.length === 0 ? (
                <div className="bg-[#1E293B] border border-slate-700/70 rounded-xl px-6 py-12 text-center">
                  <p className="text-base font-semibold text-slate-200">
                    {ads.length === 0
                      ? 'No slot ads published yet'
                      : 'No ads match the current filter'}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-400 max-w-md mx-auto">
                    {ads.length === 0
                      ? 'Upload a GIF banner or paste an image URL to launch your first 2D/3D Live App ad slot.'
                      : 'Clear your search query or switch the active slot filter to view other campaigns.'}
                  </p>
                  {ads.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setMobileTab('create')}
                      className="lg:hidden mt-5 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F59E0B] text-slate-950 text-sm font-semibold hover:bg-amber-400 transition-colors cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" aria-hidden="true" />
                      <span>Add First Ad</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSlotFilter('all');
                        setStatusFilter('all');
                        setSearchQuery('');
                      }}
                      className="mt-4 inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAds.map((ad) => (
                    <AdCard
                      key={String(ad.id)}
                      ad={ad}
                      isToggling={Boolean(togglingIds[String(ad.id)])}
                      isDeleting={Boolean(deletingIds[String(ad.id)])}
                      onToggleActive={handleToggleActive}
                      onDelete={handleDeleteAd}
                      onPreview={setPreviewAd}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Sticky Add New Ad Form */}
          <aside
            className={`lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20 ${
              mobileTab === 'create' ? 'block' : 'hidden lg:block'
            }`}
          >
            <AdForm
              onCreated={handleAdCreated}
              disabled={!supabaseConfigured}
              nextDisplayOrder={nextDisplayOrder}
            />
          </aside>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (compact 56px height, thumb zone) */}
      <nav
        aria-label="Mobile dashboard navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0F172A]/95 backdrop-blur-md border-t border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-3 h-14 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setMobileTab('ads')}
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              mobileTab === 'ads' ? 'text-[#F59E0B]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutList className="w-5 h-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold">Live Ads ({ads.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('create')}
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              mobileTab === 'create'
                ? 'text-[#F59E0B]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlusCircle className="w-5 h-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold">Add Ad</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
              settingsOpen ? 'text-[#F59E0B]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-5 h-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold">Settings</span>
          </button>
        </div>
      </nav>

      {/* Supabase & PIN Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={handleSettingsSaved}
      />

      {/* Full-Size Animated GIF Lightbox Preview */}
      {previewAd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Banner preview for ${previewAd.agent_name}`}
          onClick={() => setPreviewAd(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#1E293B] border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3.5 border-b border-slate-700/80 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-100 truncate">
                  {previewAd.agent_name}
                </h3>
                <p className="text-xs font-mono text-[#F59E0B] mt-0.5">
                  {previewAd.slot_position} · Order #{previewAd.display_order}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAd(null)}
                aria-label="Close preview"
                className="w-10 h-10 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-4 bg-[#0F172A] flex items-center justify-center max-h-[65dvh] overflow-auto">
              {isSafeHttpUrl(previewAd.media_url) ? (
                <img
                  src={previewAd.media_url}
                  alt={`${previewAd.agent_name} full banner`}
                  referrerPolicy="no-referrer"
                  className="max-h-[58dvh] w-auto max-w-full object-contain rounded-lg"
                />
              ) : (
                <p className="py-10 text-sm text-slate-400">
                  Invalid media URL format.
                </p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-700/80 flex items-center justify-between gap-3 text-xs">
              <span className="font-mono tabular-nums text-slate-300">
                {Number(previewAd.clicks_count || 0).toLocaleString()} total clicks
              </span>
              {isSafeTargetUrl(previewAd.target_url) && (
                <a
                  href={previewAd.target_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#F59E0B] hover:text-amber-300"
                >
                  <span>Open Target Link</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl transition-all ${
            toast.tone === 'error'
              ? 'bg-rose-950/95 border-rose-500/50 text-rose-100'
              : 'bg-[#1E293B] border-[#F59E0B]/50 text-slate-100'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
