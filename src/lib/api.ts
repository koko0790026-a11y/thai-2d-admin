import type { CreateAdPayload, SlotAd, UpdateAdPayload } from '../types/ads';

// Hold Bearer session token strictly in JS memory (never localStorage/sessionStorage)
let authToken: string | null = null;

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

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function clearAuthToken(): void {
  authToken = null;
}

export function hasAuthToken(): boolean {
  return authToken !== null;
}

async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let payload: Record<string, unknown> = {};
  let parsedJson = false;

  if (contentType.includes('application/json')) {
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === 'object') {
        payload = parsed as Record<string, unknown>;
        parsedJson = true;
      }
    } catch {
      parsedJson = false;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      authToken = null;
    }
    throw new ApiError(
      typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`,
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined,
    );
  }

  if (!parsedJson) {
    throw new ApiError(
      'Server returned an unexpected non-JSON response. Please refresh and try again.',
      502,
    );
  }

  return payload as T;
}

export async function checkSession(): Promise<{
  authenticated: boolean;
  supabaseConfigured: boolean;
}> {
  return apiRequest('/api/auth/session');
}

export async function loginWithPin(pin: string): Promise<{
  token: string;
  supabaseConfigured: boolean;
}> {
  const data = await apiRequest<{ token: string; supabaseConfigured: boolean }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ pin }),
    },
  );
  authToken = data.token;
  return data;
}

export async function logoutSession(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    authToken = null;
  }
}

export async function fetchAds(): Promise<SlotAd[]> {
  const data = await apiRequest<{ ads: SlotAd[] }>('/api/ads');
  return data.ads;
}

export async function createAd(payload: CreateAdPayload): Promise<SlotAd> {
  const data = await apiRequest<{ ad: SlotAd }>('/api/ads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.ad;
}

export async function updateAd(id: string | number, payload: UpdateAdPayload): Promise<SlotAd> {
  const data = await apiRequest<{ ad: SlotAd }>(`/api/ads/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.ad;
}

export async function deleteAd(id: string | number): Promise<void> {
  await apiRequest(`/api/ads/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  });
}

export async function uploadBannerFile(file: File): Promise<{
  media_url: string;
  path: string;
  content_type: string;
  size: number;
}> {
  const formData = new FormData();
  formData.append('file', file);

  const result = await apiRequest<{
    media_url?: string;
    path?: string;
    content_type?: string;
    size?: number;
  }>('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (typeof result.media_url !== 'string' || !result.media_url.trim()) {
    throw new ApiError(
      'Upload succeeded, but no public media URL was returned from Supabase Storage.',
      502,
    );
  }

  return {
    media_url: result.media_url.trim(),
    path: typeof result.path === 'string' ? result.path : '',
    content_type: typeof result.content_type === 'string' ? result.content_type : file.type,
    size: typeof result.size === 'number' ? result.size : file.size,
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
