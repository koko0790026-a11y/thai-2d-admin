import type { CreateAdPayload, SlotAd, SlotPosition, UpdateAdPayload } from '../types/ads';

export const DEFAULT_SUPABASE_URL = 'https://faaxbpzyfbmuykbqjxsa.supabase.co';
export const DEFAULT_ADMIN_PIN = '1234';
export const STORAGE_BUCKET = 'ad-banners';
export const ADS_TABLE = 'slot_ads';

const ALLOWED_SLOTS: readonly SlotPosition[] = [
  'popup',
  'top_slider',
  'middle_banner',
  'grid_logo',
  'bottom_sticky',
];

const STORAGE_KEYS = {
  supabaseUrl: 'ads_manager_supabase_url',
  supabaseAnonKey: 'ads_manager_supabase_anon_key',
  adminPin: 'ads_manager_admin_pin',
} as const;

export interface AppSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  adminPin: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function safeLocalStorageGet(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_SUPABASE_URL;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    }
  } catch {
    // Fall back to default URL
  }
  return DEFAULT_SUPABASE_URL;
}

export function getAppSettings(): AppSettings {
  const envUrl =
    typeof import.meta.env?.VITE_SUPABASE_URL === 'string'
      ? import.meta.env.VITE_SUPABASE_URL.trim()
      : '';
  const envAnonKey =
    typeof import.meta.env?.VITE_SUPABASE_ANON_KEY === 'string'
      ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
      : '';

  const storedUrl = safeLocalStorageGet(STORAGE_KEYS.supabaseUrl).trim();
  const storedKey = safeLocalStorageGet(STORAGE_KEYS.supabaseAnonKey).trim();
  const storedPin = safeLocalStorageGet(STORAGE_KEYS.adminPin).trim();

  return {
    supabaseUrl: normalizeBaseUrl(storedUrl || envUrl || DEFAULT_SUPABASE_URL),
    supabaseAnonKey: storedKey || envAnonKey,
    adminPin: /^\d{4}$/.test(storedPin) ? storedPin : DEFAULT_ADMIN_PIN,
  };
}

export function saveAppSettings(next: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();

  const supabaseUrl =
    next.supabaseUrl !== undefined
      ? normalizeBaseUrl(next.supabaseUrl)
      : current.supabaseUrl;

  const supabaseAnonKey =
    next.supabaseAnonKey !== undefined
      ? next.supabaseAnonKey.trim()
      : current.supabaseAnonKey;

  let adminPin = current.adminPin;
  if (next.adminPin !== undefined) {
    const cleanedPin = next.adminPin.trim();
    if (!/^\d{4}$/.test(cleanedPin)) {
      throw new ApiError('Admin PIN must be exactly 4 digits (0–9).', 400);
    }
    adminPin = cleanedPin;
  }

  safeLocalStorageSet(STORAGE_KEYS.supabaseUrl, supabaseUrl);
  safeLocalStorageSet(STORAGE_KEYS.supabaseAnonKey, supabaseAnonKey);
  safeLocalStorageSet(STORAGE_KEYS.adminPin, adminPin);

  return { supabaseUrl, supabaseAnonKey, adminPin };
}

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey } = getAppSettings();
  return isSafeHttpUrl(supabaseUrl) && supabaseAnonKey.length > 0;
}

export function verifyPin(candidate: string): boolean {
  const cleaned = (candidate ?? '').trim();
  const { adminPin } = getAppSettings();
  return cleaned.length === 4 && cleaned === adminPin;
}

function getRequiredConfig(): { supabaseUrl: string; supabaseAnonKey: string } {
  const { supabaseUrl, supabaseAnonKey } = getAppSettings();
  if (!isSafeHttpUrl(supabaseUrl) || !supabaseAnonKey) {
    throw new ApiError(
      'Supabase Anon Key is not configured yet. Open Settings to paste and save your SUPABASE_ANON_KEY.',
      503,
      'SUPABASE_NOT_CONFIGURED',
    );
  }
  return { supabaseUrl, supabaseAnonKey };
}

function buildSupabaseHeaders(
  anonKey: string,
  extra: Record<string, string> = {},
): Headers {
  const headers = new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    ...extra,
  });
  return headers;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = (await response.json()) as Record<string, unknown>;
      const msg =
        (typeof body.message === 'string' && body.message) ||
        (typeof body.error_description === 'string' && body.error_description) ||
        (typeof body.error === 'string' && body.error) ||
        (typeof body.hint === 'string' && body.hint);
      if (msg) return msg;
    } catch {
      // Fall through to fallback
    }
  } else {
    try {
      const text = (await response.text()).trim();
      if (text && text.length <= 240 && !text.startsWith('<')) {
        return text;
      }
    } catch {
      // Ignore
    }
  }
  return `${fallback} (HTTP ${response.status})`;
}

async function supabaseRestRequest<T>(
  pathWithQuery: string,
  init: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const { supabaseUrl, supabaseAnonKey } = getRequiredConfig();
  const url = `${supabaseUrl}/rest/v1/${pathWithQuery}`;
  const headers = buildSupabaseHeaders(supabaseAnonKey, {
    Accept: 'application/json',
    ...extraHeaders,
  });

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(
      'Network error while reaching Supabase. Verify your Supabase URL and internet connection.',
      0,
      'NETWORK_ERROR',
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response, 'Supabase request failed');
    throw new ApiError(message, response.status, 'SUPABASE_REST_ERROR');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      'Supabase returned an unexpected non-JSON response. Check your Supabase URL and Anon Key.',
      502,
    );
  }
}

function normalizeEndDate(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    throw new ApiError('End date is required.', 400);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const iso = `${trimmed}T23:59:59.000Z`;
    if (Number.isNaN(new Date(iso).getTime())) {
      throw new ApiError('Invalid end date.', 400);
    }
    return iso;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError('Invalid end date format.', 400);
  }
  return parsed.toISOString();
}

export async function fetchAds(): Promise<SlotAd[]> {
  try {
    const rows = await supabaseRestRequest<SlotAd[]>(
      `${ADS_TABLE}?select=*&order=display_order.asc,created_at.desc`,
      { method: 'GET' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    // Graceful fallback if the user's slot_ads table does not have a created_at column
    if (
      err instanceof ApiError &&
      err.message.toLowerCase().includes('created_at')
    ) {
      const rows = await supabaseRestRequest<SlotAd[]>(
        `${ADS_TABLE}?select=*&order=display_order.asc`,
        { method: 'GET' },
      );
      return Array.isArray(rows) ? rows : [];
    }
    throw err;
  }
}

export async function createAd(payload: CreateAdPayload): Promise<SlotAd> {
  const agentName = (payload.agent_name ?? '').trim();
  if (!agentName || agentName.length > 120) {
    throw new ApiError('Agent / Client Name is required (max 120 characters).', 400);
  }
  if (!ALLOWED_SLOTS.includes(payload.slot_position)) {
    throw new ApiError('Invalid Ad Slot Position selected.', 400);
  }
  const mediaUrl = (payload.media_url ?? '').trim();
  if (!isSafeHttpUrl(mediaUrl)) {
    throw new ApiError('Media URL must be a valid http:// or https:// URL.', 400);
  }
  const targetUrl = (payload.target_url ?? '').trim();
  if (!isSafeTargetUrl(targetUrl)) {
    throw new ApiError('Target Link must start with https://, http://, tg://, or viber://', 400);
  }
  const endDate = normalizeEndDate(payload.end_date);
  const displayOrder = Number(payload.display_order ?? 1);
  if (!Number.isInteger(displayOrder) || displayOrder < 1 || displayOrder > 9999) {
    throw new ApiError('Display Order must be a whole number between 1 and 9999.', 400);
  }

  const body = {
    agent_name: agentName,
    slot_position: payload.slot_position,
    media_url: mediaUrl,
    target_url: targetUrl,
    end_date: endDate,
    display_order: displayOrder,
    is_active: typeof payload.is_active === 'boolean' ? payload.is_active : true,
    clicks_count: 0,
  };

  const rows = await supabaseRestRequest<SlotAd[]>(
    ADS_TABLE,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    { Prefer: 'return=representation' },
  );

  const created = Array.isArray(rows) ? rows[0] : (rows as unknown as SlotAd);
  if (!created) {
    throw new ApiError('Ad was created, but Supabase returned no record. Check RLS SELECT policies.', 502);
  }
  return created;
}

export async function updateAd(id: string | number, payload: UpdateAdPayload): Promise<SlotAd> {
  const safeId = String(id ?? '').trim();
  if (!safeId) {
    throw new ApiError('Invalid ad identifier.', 400);
  }

  const updates: Record<string, unknown> = {};
  if (payload.is_active !== undefined) {
    updates.is_active = Boolean(payload.is_active);
  }
  if (payload.agent_name !== undefined) {
    const clean = payload.agent_name.trim();
    if (!clean || clean.length > 120) {
      throw new ApiError('Agent / Client Name must be 1–120 characters.', 400);
    }
    updates.agent_name = clean;
  }
  if (payload.slot_position !== undefined) {
    if (!ALLOWED_SLOTS.includes(payload.slot_position)) {
      throw new ApiError('Invalid Ad Slot Position.', 400);
    }
    updates.slot_position = payload.slot_position;
  }
  if (payload.media_url !== undefined) {
    const clean = payload.media_url.trim();
    if (!isSafeHttpUrl(clean)) {
      throw new ApiError('Media URL must be a valid http:// or https:// URL.', 400);
    }
    updates.media_url = clean;
  }
  if (payload.target_url !== undefined) {
    const clean = payload.target_url.trim();
    if (!isSafeTargetUrl(clean)) {
      throw new ApiError('Target Link must start with https://, http://, tg://, or viber://', 400);
    }
    updates.target_url = clean;
  }
  if (payload.end_date !== undefined) {
    updates.end_date = normalizeEndDate(payload.end_date);
  }
  if (payload.display_order !== undefined) {
    const orderNum = Number(payload.display_order);
    if (!Number.isInteger(orderNum) || orderNum < 1 || orderNum > 9999) {
      throw new ApiError('Display Order must be between 1 and 9999.', 400);
    }
    updates.display_order = orderNum;
  }

  const rows = await supabaseRestRequest<SlotAd[]>(
    `${ADS_TABLE}?id=eq.${encodeURIComponent(safeId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
    { Prefer: 'return=representation' },
  );

  const updated = Array.isArray(rows) ? rows[0] : (rows as unknown as SlotAd);
  if (!updated) {
    throw new ApiError('Update failed or was blocked by Supabase RLS policy.', 403);
  }
  return updated;
}

export async function deleteAd(id: string | number): Promise<void> {
  const safeId = String(id ?? '').trim();
  if (!safeId) {
    throw new ApiError('Invalid ad identifier.', 400);
  }

  await supabaseRestRequest<unknown>(
    `${ADS_TABLE}?id=eq.${encodeURIComponent(safeId)}`,
    { method: 'DELETE' },
    { Prefer: 'return=minimal' },
  );
}

async function detectImageSignature(
  file: File,
): Promise<{ ext: string; mime: string } | null> {
  const headerBuffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(headerBuffer);
  if (bytes.length < 12) return null;

  // GIF87a or GIF89a
  const gifSig = String.fromCharCode(
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
    bytes[4],
    bytes[5],
  );
  if (gifSig === 'GIF87a' || gifSig === 'GIF89a') {
    return { ext: 'gif', mime: 'image/gif' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  return null;
}

function generateRandomHex(byteLength = 6): string {
  const arr = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i += 1) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function uploadBannerFile(file: File): Promise<{
  media_url: string;
  path: string;
  content_type: string;
  size: number;
}> {
  const { supabaseUrl, supabaseAnonKey } = getRequiredConfig();

  if (file.size > 10 * 1024 * 1024) {
    throw new ApiError('File is too large. Maximum allowed size is 10 MB.', 413);
  }

  const detected = await detectImageSignature(file);
  if (!detected) {
    throw new ApiError(
      'Unsupported file format. Please upload a valid .gif, .png, or .jpg image.',
      400,
    );
  }

  const safeFileName = `banner-${Date.now()}-${generateRandomHex(6)}.${detected.ext}`;
  const uploadEndpoint = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(safeFileName)}`;

  let response: Response;
  try {
    response = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: buildSupabaseHeaders(supabaseAnonKey, {
        'Content-Type': detected.mime,
        'x-upsert': 'false',
        'cache-control': '3600',
      }),
      body: file,
    });
  } catch {
    throw new ApiError(
      'Network error while uploading to Supabase Storage. Check your connection and CORS settings.',
      0,
      'NETWORK_ERROR',
    );
  }

  if (!response.ok) {
    const message = await parseErrorMessage(
      response,
      `Storage upload failed (${STORAGE_BUCKET})`,
    );
    throw new ApiError(message, response.status, 'SUPABASE_STORAGE_ERROR');
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${encodeURIComponent(safeFileName)}`;

  return {
    media_url: publicUrl,
    path: safeFileName,
    content_type: detected.mime,
    size: file.size,
  };
}

export function isSafeHttpUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSafeTargetUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return ['https:', 'http:', 'tg:', 'viber:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

export function formatExpiryInfo(endDateValue: string): {
  formattedDate: string;
  statusText: string;
  tone: 'normal' | 'warning' | 'expired';
} {
  const parsed = new Date(endDateValue);
  if (Number.isNaN(parsed.getTime())) {
    return {
      formattedDate: endDateValue || 'No date',
      statusText: 'Unknown expiry',
      tone: 'normal',
    };
  }

  const formattedDate = parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const now = new Date();
  const msDiff = parsed.getTime() - now.getTime();
  const daysLeft = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      formattedDate,
      statusText: `Expired ${Math.abs(daysLeft)}d ago`,
      tone: 'expired',
    };
  }
  if (daysLeft === 0) {
    return {
      formattedDate,
      statusText: 'Expires today',
      tone: 'warning',
    };
  }
  if (daysLeft <= 3) {
    return {
      formattedDate,
      statusText: `${daysLeft}d left`,
      tone: 'warning',
    };
  }

  return {
    formattedDate,
    statusText: `${daysLeft}d left`,
    tone: 'normal',
  };
}
