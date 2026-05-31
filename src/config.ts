// SENTRA v3.0 — Central configuration
// All network endpoints are hardcoded here for offline-first resilience.

export const PIPEDREAM_ENDPOINT = 'https://eoqv1v7e0297v4p.m.pipedream.net';
export const TELEGRAM_CHANNEL_ID = '-1003914032579';
export const TELEGRAM_BOT_TOKEN = '8156157833:AAEn86wHwB4w-bYjT0-wV15hV74P8qL2m90';
export const TELEGRAM_SEND_PHOTO_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;

export const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export const RTT_THRESHOLD_MS = 200;
export const MAX_RETRIES = 5;
export const FLUSH_INTERVAL_MS = 15_000;
export const CACHE_PURGE_AGE_MS = 86_400_000; // 24h
