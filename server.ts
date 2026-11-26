import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Admin PIN Configuration
// Easily change DEFAULT_ADMIN_PIN below, or set ADMIN_PIN in environment secrets.
// ============================================================================
const DEFAULT_ADMIN_PIN = '1234';
const STORAGE_BUCKET = 'ad-banners';
const ADS_TABLE = 'slot_ads';
const PORT = Number(process.env.PORT) || 3000;

const ALLOWED_SLOTS = [
  'popup',
  'top_slider',
  'middle_banner',
  'grid_logo',
  'bottom_sticky',
] as const;

type SlotPosition = (typeof ALLOWED_SLOTS)[number];

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const sessions = new Map<string, { expiresAt: number }>();

const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_LOGIN_ATTEMPTS = 12;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getExpectedPin(): string {
  const envPin = process.env.ADMIN_PIN?.trim();
  return envPin && envPin.length > 0 ? envPin : DEFAULT_ADMIN_PIN;
}

function constantTimeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length >= 32 ? token : null;
}

function isValidSession(token: string | null): boolean {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return true;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!isValidSession(token)) {
    res.status(401).json({ error: 'Unauthorized. Please unlock with your PIN.' });
    return;
  }
  next();
}

function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

let cachedSupabase: SupabaseClient | null = null;
let cachedSupabaseKey = '';

function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const url = process.env.SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_ANON_KEY!.trim();
  const cacheKey = `${url}::${key.slice(0, 12)}`;
  if (!cachedSupabase || cachedSupabaseKey !== cacheKey) {
    cachedSupabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedSupabaseKey = cacheKey;
  }
  return cachedSupabase;
}

function validateUrl(
  value: unknown,
  allowedProtocols: string[],
  fieldLabel: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldLabel} must be a valid URL.` };
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) {
    return { ok: false, error: `${fieldLabel} is required (max 2048 characters).` };
  }
  try {
    const parsed = new URL(trimmed);
    if (!allowedProtocols.includes(parsed.protocol)) {
      return {
        ok: false,
        error: `${fieldLabel} must use one of: ${allowedProtocols.join(', ')}`,
      };
    }
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, error: `${fieldLabel} is not a valid URL.` };
  }
}

function isValidSlotPosition(value: unknown): value is SlotPosition {
  return typeof value === 'string' && (ALLOWED_SLOTS as readonly string[]).includes(value);
}

function parseEndDate(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: 'End date is required.' };
  }
  const trimmed = value.trim();
  // Accept YYYY-MM-DD (convert to end-of-day UTC ISO so ads remain live through the chosen day)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const iso = `${trimmed}T23:59:59.000Z`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, error: 'Invalid end date.' };
    }
    return { ok: true, value: iso };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: 'Invalid end date format.' };
  }
  return { ok: true, value: parsed.toISOString() };
}

function parseDisplayOrder(
  value: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 9999) {
    return { ok: false, error: 'Display order must be a whole number between 1 and 9999.' };
  }
  return { ok: true, value: num };
}

function isValidAdId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

function detectImageType(buffer: Buffer): { ext: string; mime: string } | null {
  if (buffer.length < 12) return null;

  // GIF87a or GIF89a
  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return { ext: 'gif', mime: 'image/gif' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
    files: 1,
  },
});

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Security headers (iframe-friendly, no X-Frame-Options)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ============================================================================
// Auth Routes
// ============================================================================
app.get('/api/auth/session', (req, res) => {
  pruneExpiredSessions();
  const token = extractBearerToken(req);
  res.json({
    authenticated: isValidSession(token),
    supabaseConfigured: isSupabaseConfigured(),
  });
});

app.post('/api/auth/login', (req, res) => {
  pruneExpiredSessions();
  const clientIp = req.ip || 'unknown';
  const now = Date.now();
  const attemptRecord = loginAttempts.get(clientIp);

  if (attemptRecord && attemptRecord.resetAt > now && attemptRecord.count >= MAX_LOGIN_ATTEMPTS) {
    const retrySeconds = Math.ceil((attemptRecord.resetAt - now) / 1000);
    res.status(429).json({
      error: `Too many failed PIN attempts. Try again in ${retrySeconds}s.`,
    });
    return;
  }

  const submittedPin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
  if (!submittedPin || submittedPin.length > 16) {
    res.status(400).json({ error: 'Please enter a valid PIN.' });
    return;
  }

  const expectedPin = getExpectedPin();
  if (!constantTimeEqual(submittedPin, expectedPin)) {
    const nextCount =
      attemptRecord && attemptRecord.resetAt > now ? attemptRecord.count + 1 : 1;
    loginAttempts.set(clientIp, {
      count: nextCount,
      resetAt:
        attemptRecord && attemptRecord.resetAt > now
          ? attemptRecord.resetAt
          : now + LOGIN_WINDOW_MS,
    });
    res.status(401).json({ error: 'Incorrect PIN. Please try again.' });
    return;
  }

  loginAttempts.delete(clientIp);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: now + SESSION_TTL_MS });

  res.json({
    token,
    supabaseConfigured: isSupabaseConfigured(),
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractBearerToken(req);
  if (token) {
    sessions.delete(token);
  }
  res.json({ ok: true });
});

// ============================================================================
// Protected Supabase Proxy Routes
// ============================================================================
app.get('/api/ads', requireAuth, async (_req, res) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    res.status(503).json({
      code: 'SUPABASE_NOT_CONFIGURED',
      error: 'Supabase environment variables (SUPABASE_URL and SUPABASE_ANON_KEY) are not configured yet.',
    });
    return;
  }

  try {
    let result = await supabase
      .from(ADS_TABLE)
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    // Graceful fallback if the user's slot_ads table does not have a created_at column
    if (result.error && result.error.message.toLowerCase().includes('created_at')) {
      result = await supabase
        .from(ADS_TABLE)
        .select('*')
        .order('display_order', { ascending: true });
    }

    if (result.error) {
      res.status(502).json({
        code: 'SUPABASE_QUERY_ERROR',
        error: result.error.message,
      });
      return;
    }

    res.json({ ads: result.data ?? [] });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load ads from Supabase.',
    });
  }
});

app.post('/api/ads', requireAuth, async (req, res) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    res.status(503).json({
      code: 'SUPABASE_NOT_CONFIGURED',
      error: 'Supabase environment variables (SUPABASE_URL and SUPABASE_ANON_KEY) are not configured yet.',
    });
    return;
  }

  const agentName = typeof req.body?.agent_name === 'string' ? req.body.agent_name.trim() : '';
  if (!agentName || agentName.length > 120) {
    res.status(400).json({ error: 'Agent / Client Name is required (max 120 characters).' });
    return;
  }

  if (!isValidSlotPosition(req.body?.slot_position)) {
    res.status(400).json({
      error: `Ad Slot Position must be one of: ${ALLOWED_SLOTS.join(', ')}.`,
    });
    return;
  }

  const mediaUrlCheck = validateUrl(req.body?.media_url, ['http:', 'https:'], 'Media URL');
  if (!mediaUrlCheck.ok) {
    res.status(400).json({ error: mediaUrlCheck.error });
    return;
  }

  const targetUrlCheck = validateUrl(
    req.body?.target_url,
    ['http:', 'https:', 'tg:', 'viber:'],
    'Target Link',
  );
  if (!targetUrlCheck.ok) {
    res.status(400).json({ error: targetUrlCheck.error });
    return;
  }

  const endDateCheck = parseEndDate(req.body?.end_date);
  if (!endDateCheck.ok) {
    res.status(400).json({ error: endDateCheck.error });
    return;
  }

  const orderCheck = parseDisplayOrder(req.body?.display_order ?? 1);
  if (!orderCheck.ok) {
    res.status(400).json({ error: orderCheck.error });
    return;
  }

  const isActive = typeof req.body?.is_active === 'boolean' ? req.body.is_active : true;

  try {
    const { data, error } = await supabase
      .from(ADS_TABLE)
      .insert({
        agent_name: agentName,
        slot_position: req.body.slot_position,
        media_url: mediaUrlCheck.value,
        target_url: targetUrlCheck.value,
        end_date: endDateCheck.value,
        display_order: orderCheck.value,
        is_active: isActive,
        clicks_count: 0,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json({ ad: data });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to create ad.',
    });
  }
});

app.patch('/api/ads/:id', requireAuth, async (req, res) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    res.status(503).json({
      code: 'SUPABASE_NOT_CONFIGURED',
      error: 'Supabase environment variables (SUPABASE_URL and SUPABASE_ANON_KEY) are not configured yet.',
    });
    return;
  }

  const id = String(req.params.id || '');
  if (!isValidAdId(id)) {
    res.status(400).json({ error: 'Invalid ad identifier.' });
    return;
  }

  const updates: Record<string, unknown> = {};

  if (req.body?.is_active !== undefined) {
    if (typeof req.body.is_active !== 'boolean') {
      res.status(400).json({ error: 'is_active must be a boolean.' });
      return;
    }
    updates.is_active = req.body.is_active;
  }

  if (req.body?.agent_name !== undefined) {
    const agentName = typeof req.body.agent_name === 'string' ? req.body.agent_name.trim() : '';
    if (!agentName || agentName.length > 120) {
      res.status(400).json({ error: 'Agent / Client Name must be 1–120 characters.' });
      return;
    }
    updates.agent_name = agentName;
  }

  if (req.body?.slot_position !== undefined) {
    if (!isValidSlotPosition(req.body.slot_position)) {
      res.status(400).json({
        error: `Ad Slot Position must be one of: ${ALLOWED_SLOTS.join(', ')}.`,
      });
      return;
    }
    updates.slot_position = req.body.slot_position;
  }

  if (req.body?.media_url !== undefined) {
    const check = validateUrl(req.body.media_url, ['http:', 'https:'], 'Media URL');
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    updates.media_url = check.value;
  }

  if (req.body?.target_url !== undefined) {
    const check = validateUrl(
      req.body.target_url,
      ['http:', 'https:', 'tg:', 'viber:'],
      'Target Link',
    );
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    updates.target_url = check.value;
  }

  if (req.body?.end_date !== undefined) {
    const check = parseEndDate(req.body.end_date);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    updates.end_date = check.value;
  }

  if (req.body?.display_order !== undefined) {
    const check = parseDisplayOrder(req.body.display_order);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    updates.display_order = check.value;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No valid update fields provided.' });
    return;
  }

  try {
    const { data, error } = await supabase
      .from(ADS_TABLE)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ ad: data });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to update ad.',
    });
  }
});

app.delete('/api/ads/:id', requireAuth, async (req, res) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    res.status(503).json({
      code: 'SUPABASE_NOT_CONFIGURED',
      error: 'Supabase environment variables (SUPABASE_URL and SUPABASE_ANON_KEY) are not configured yet.',
    });
    return;
  }

  const id = String(req.params.id || '');
  if (!isValidAdId(id)) {
    res.status(400).json({ error: 'Invalid ad identifier.' });
    return;
  }

  try {
    const { error } = await supabase.from(ADS_TABLE).delete().eq('id', id);

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ deletedId: id });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to delete ad.',
    });
  }
});

app.post('/api/upload', requireAuth, (req, res) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    res.status(503).json({
      code: 'SUPABASE_NOT_CONFIGURED',
      error: 'Supabase environment variables (SUPABASE_URL and SUPABASE_ANON_KEY) are not configured yet.',
    });
    return;
  }

  upload.single('file')(req, res, async (uploadErr: unknown) => {
    if (uploadErr) {
      if (uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File is too large. Maximum allowed size is 10 MB.' });
        return;
      }
      res.status(400).json({
        error: uploadErr instanceof Error ? uploadErr.message : 'File upload failed.',
      });
      return;
    }

    const file = req.file;
    if (!file || !file.buffer) {
      res.status(400).json({ error: 'No image file received.' });
      return;
    }

    const detected = detectImageType(file.buffer);
    if (!detected) {
      res.status(400).json({
        error: 'Unsupported file format. Please upload a valid .gif, .png, or .jpg image.',
      });
      return;
    }

    const safeFileName = `banner-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${detected.ext}`;

    try {
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(safeFileName, file.buffer, {
          contentType: detected.mime,
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) {
        res.status(400).json({
          error: `Storage upload failed (${STORAGE_BUCKET}): ${storageError.message}`,
        });
        return;
      }

      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(safeFileName);

      if (!urlData?.publicUrl) {
        res.status(502).json({
          error: `File uploaded to ${STORAGE_BUCKET}, but failed to generate a public URL.`,
        });
        return;
      }

      res.status(201).json({
        media_url: urlData.publicUrl,
        path: safeFileName,
        content_type: detected.mime,
        size: file.size,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to upload image to Supabase Storage.',
      });
    }
  });
});

// ============================================================================
// Frontend Serving (Vite dev middleware or static dist in production)
// ============================================================================
async function startServer(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ads Manager server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Ads Manager server:', err);
  process.exit(1);
});
