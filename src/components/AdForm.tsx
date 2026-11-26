import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Calendar,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { SLOT_OPTIONS } from '../types/ads';
import type { CreateAdPayload, SlotAd, SlotPosition } from '../types/ads';
import {
  ApiError,
  addDaysFromToday,
  createAd,
  isSafeHttpUrl,
  isSafeTargetUrl,
  uploadBannerFile,
} from '../lib/api';

interface AdFormProps {
  onCreated: (ad: SlotAd) => void;
  disabled?: boolean;
  nextDisplayOrder: number;
}

type MediaInputMode = 'upload' | 'url';

const DURATION_PRESETS = [
  { label: '7 Days', days: 7 },
  { label: '15 Days', days: 15 },
  { label: '30 Days', days: 30 },
] as const;

export function AdForm({ onCreated, disabled = false, nextDisplayOrder }: AdFormProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [agentName, setAgentName] = useState('');
  const [slotPosition, setSlotPosition] = useState<SlotPosition>('top_slider');
  const [mediaMode, setMediaMode] = useState<MediaInputMode>('upload');
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);

  const [targetUrl, setTargetUrl] = useState('');
  const [activePresetDays, setActivePresetDays] = useState<number | null>(30);
  const [endDate, setEndDate] = useState(() => addDaysFromToday(30));
  const [displayOrder, setDisplayOrder] = useState<string>(() => String(nextDisplayOrder));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  // Sync suggested next display order when form is clean
  useEffect(() => {
    setDisplayOrder((current) => {
      const parsed = Number(current);
      if (!current || Number.isNaN(parsed) || parsed < 1) {
        return String(nextDisplayOrder);
      }
      return current;
    });
  }, [nextDisplayOrder]);

  // Revoke object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const activePreviewSrc = mediaMode === 'upload' ? mediaUrl || localPreviewUrl : mediaUrl;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setPreviewFailed(false);

    const allowedExt = /\.(gif|png|jpe?g)$/i;
    if (!allowedExt.test(file.name)) {
      setError('Please choose a .gif, .png, or .jpg image file.');
      event.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image is larger than 10 MB. Please optimize and try again.');
      event.target.value = '';
      return;
    }

    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }

    const blobUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setLocalPreviewUrl(blobUrl);
    setUploadInfo(null);

    // Upload directly into Supabase Storage bucket `ad-banners`
    setIsUploading(true);
    try {
      const uploaded = await uploadBannerFile(file);
      const uploadedUrl = typeof uploaded?.media_url === 'string' ? uploaded.media_url.trim() : '';
      if (!uploadedUrl) {
        throw new ApiError('Upload completed, but no public media URL was returned.', 502);
      }
      setMediaUrl(uploadedUrl);
      setUploadInfo(`Uploaded to ad-banners (${(file.size / 1024).toFixed(0)} KB)`);
    } catch (err) {
      setMediaUrl('');
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to upload image to Supabase Storage.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelectedFile = () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setSelectedFile(null);
    setLocalPreviewUrl(null);
    setMediaUrl('');
    setUploadInfo(null);
    setPreviewFailed(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const applyDurationPreset = (days: number) => {
    setActivePresetDays(days);
    setEndDate(addDaysFromToday(days));
  };

  const handleDateChange = (value: string) => {
    setActivePresetDays(null);
    setEndDate(value);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const cleanAgent = (agentName ?? '').trim();
    if (!cleanAgent) {
      setError('Please enter the Agent / Client Name.');
      return;
    }

    if (isUploading) {
      setError('Please wait for the GIF upload to finish.');
      return;
    }

    let finalMediaUrl = (mediaUrl ?? '').trim();
    if (!finalMediaUrl && mediaMode === 'upload' && selectedFile) {
      // Retry upload if previous upload failed
      setIsUploading(true);
      try {
        const uploaded = await uploadBannerFile(selectedFile);
        const uploadedUrl = typeof uploaded?.media_url === 'string' ? uploaded.media_url.trim() : '';
        if (!uploadedUrl) {
          throw new ApiError('Upload completed, but no public media URL was returned.', 502);
        }
        finalMediaUrl = uploadedUrl;
        setMediaUrl(uploadedUrl);
      } catch (err) {
        setIsUploading(false);
        setError(
          err instanceof ApiError ? err.message : 'Failed to upload file to ad-banners.',
        );
        return;
      }
      setIsUploading(false);
    }

    if (!finalMediaUrl || !isSafeHttpUrl(finalMediaUrl)) {
      setError(
        mediaMode === 'upload'
          ? 'Please upload a GIF/image file first.'
          : 'Please paste a valid https:// or http:// GIF/image URL.',
      );
      return;
    }

    const cleanTarget = (targetUrl ?? '').trim();
    if (!cleanTarget || !isSafeTargetUrl(cleanTarget)) {
      setError(
        'Please enter a valid Target Link starting with https://, http://, tg://, or viber://',
      );
      return;
    }

    if (!endDate) {
      setError('Please select a Duration or End Date.');
      return;
    }

    const orderNum = Number(displayOrder);
    if (!Number.isInteger(orderNum) || orderNum < 1 || orderNum > 9999) {
      setError('Display Order must be a whole number starting at 1.');
      return;
    }

    const payload: CreateAdPayload = {
      agent_name: cleanAgent,
      slot_position: slotPosition,
      media_url: finalMediaUrl,
      target_url: cleanTarget,
      end_date: endDate,
      display_order: orderNum,
      is_active: true,
    };

    setIsSubmitting(true);
    try {
      const created = await createAd(payload);
      onCreated(created);

      // Reset form cleanly for next entry
      setAgentName('');
      setTargetUrl('');
      clearSelectedFile();
      setActivePresetDays(30);
      setEndDate(addDaysFromToday(30));
      setDisplayOrder(String(orderNum + 1));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the ad.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#1E293B] border border-slate-700/70 rounded-xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-50 tracking-tight">Add New Ad</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload a GIF banner or paste an external URL to publish immediately
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-rose-500/10 border border-rose-500/40 px-3.5 py-2.5 text-xs font-medium text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Agent / Client Name */}
      <div>
        <label
          htmlFor="agent_name"
          className="block text-xs font-medium text-slate-300 mb-1.5"
        >
          Agent / Client Name
        </label>
        <input
          id="agent_name"
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          disabled={disabled || isSubmitting}
          placeholder="e.g. Golden Star 2D Agent"
          maxLength={120}
          required
          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors disabled:opacity-50"
        />
      </div>

      {/* Ad Slot Position & Display Order */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="sm:col-span-2">
          <label
            htmlFor="slot_position"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Ad Slot Position
          </label>
          <select
            id="slot_position"
            value={slotPosition}
            onChange={(e) => setSlotPosition(e.target.value as SlotPosition)}
            disabled={disabled || isSubmitting}
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors disabled:opacity-50"
          >
            {SLOT_OPTIONS.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label} ({slot.value})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="display_order"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Display Order
          </label>
          <input
            id="display_order"
            type="number"
            min={1}
            max={9999}
            step={1}
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            disabled={disabled || isSubmitting}
            required
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors disabled:opacity-50"
          />
        </div>
      </div>

      {/* Media Source Segmented Toggle */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-slate-300">GIF / Image Creative</span>
          <div className="inline-flex p-0.5 rounded-lg bg-[#0F172A] border border-slate-700/80">
            <button
              type="button"
              onClick={() => {
                setMediaMode('upload');
                setPreviewFailed(false);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mediaMode === 'upload'
                  ? 'bg-[#F59E0B] text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Upload File
            </button>
            <button
              type="button"
              onClick={() => {
                setMediaMode('url');
                setPreviewFailed(false);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mediaMode === 'url'
                  ? 'bg-[#F59E0B] text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              External URL
            </button>
          </div>
        </div>

        {mediaMode === 'upload' ? (
          <div className="space-y-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".gif,.png,.jpg,.jpeg,image/gif,image/png,image/jpeg"
              onChange={handleFileChange}
              disabled={disabled || isUploading || isSubmitting}
              className="hidden"
              id="ad_banner_file"
            />
            <label
              htmlFor="ad_banner_file"
              className={`flex flex-col items-center justify-center gap-2 min-h-[104px] px-4 py-4 rounded-lg border border-dashed transition-colors text-center ${
                disabled || isUploading
                  ? 'border-slate-700 bg-[#0F172A]/60 opacity-60 cursor-not-allowed'
                  : 'border-slate-600 bg-[#0F172A] hover:border-[#F59E0B] cursor-pointer'
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 text-[#F59E0B] animate-spin" aria-hidden="true" />
                  <span className="text-xs font-medium text-amber-300">
                    Uploading to Supabase bucket ad-banners…
                  </span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-[#F59E0B]" aria-hidden="true" />
                  <span className="text-sm font-medium text-slate-200">
                    {selectedFile ? selectedFile.name : 'Tap to choose GIF, PNG, or JPG'}
                  </span>
                  <span className="text-xs text-slate-400">
                    Direct upload to <span className="font-mono text-slate-300">ad-banners</span> · Max 10 MB
                  </span>
                </>
              )}
            </label>

            {uploadInfo && (
              <div className="flex items-center justify-between gap-2 text-xs text-emerald-400">
                <span className="truncate">{uploadInfo}</span>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <ImageIcon
              className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="media_url"
              type="url"
              value={mediaUrl}
              onChange={(e) => {
                setMediaUrl(e.target.value);
                setPreviewFailed(false);
              }}
              disabled={disabled || isSubmitting}
              placeholder="https://example.com/promo-banner.gif"
              className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors disabled:opacity-50"
            />
          </div>
        )}

        {/* Live Animated GIF / Image Preview */}
        {activePreviewSrc && (
          <div className="mt-3 rounded-lg bg-[#0F172A] border border-slate-700/80 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Live Banner Preview</span>
              {mediaUrl && (
                <span className="font-mono text-[11px] text-emerald-400">Ready</span>
              )}
            </div>
            <div className="p-2.5 flex items-center justify-center min-h-[96px] max-h-[180px] bg-slate-950/60">
              {!previewFailed ? (
                <img
                  src={activePreviewSrc}
                  alt="Ad banner preview"
                  referrerPolicy="no-referrer"
                  onError={() => setPreviewFailed(true)}
                  className="max-h-[160px] w-auto max-w-full object-contain rounded"
                />
              ) : (
                <div className="py-4 text-center text-xs text-slate-400">
                  Preview unavailable for this URL. Check that the link points directly to an image or GIF.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Target Link */}
      <div>
        <label
          htmlFor="target_url"
          className="block text-xs font-medium text-slate-300 mb-1.5"
        >
          Target Link (Telegram, Viber, or Website)
        </label>
        <div className="relative">
          <Link2
            className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="target_url"
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            disabled={disabled || isSubmitting}
            placeholder="https://t.me/your_agent_channel"
            required
            className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors disabled:opacity-50"
          />
        </div>
      </div>

      {/* Duration Quick Buttons + Custom End Date */}
      <div>
        <label
          htmlFor="end_date"
          className="block text-xs font-medium text-slate-300 mb-1.5"
        >
          Duration / End Date
        </label>
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          {DURATION_PRESETS.map((preset) => {
            const isSelected = activePresetDays === preset.days;
            return (
              <button
                key={preset.days}
                type="button"
                disabled={disabled || isSubmitting}
                onClick={() => applyDurationPreset(preset.days)}
                className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 ${
                  isSelected
                    ? 'bg-[#F59E0B]/15 border-[#F59E0B] text-[#F59E0B]'
                    : 'bg-[#0F172A] border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Calendar
            className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="end_date"
            type="date"
            value={endDate}
            onChange={(e) => handleDateChange(e.target.value)}
            disabled={disabled || isSubmitting}
            required
            className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700 text-sm font-mono text-slate-100 focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] transition-colors disabled:opacity-50"
          />
        </div>
      </div>

      {/* Primary Submit CTA */}
      <button
        type="submit"
        disabled={disabled || isUploading || isSubmitting}
        className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#F59E0B] text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E293B] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Publishing Ad…</span>
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
            <span>Publish Ad to Slot</span>
          </>
        )}
      </button>
    </form>
  );
}
