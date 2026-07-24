// SENTRA v3.0 — Configuración central
//
// Contiene:
//   • Endpoints de telemetría / dispatch (Pipedream) — auditados 2026-01.
//   • Config pública de Google OAuth (Firebase) — apiKey y clientId son
//     PÚBLICOS por spec de Firebase; su seguridad depende de las restricciones
//     por dominio en Firebase Console + GCP OAuth Consent Screen.
//
// El TELEGRAM_BOT_TOKEN NUNCA vive en el cliente (auditoría 2026-01).

// ── Pipedream endpoints ─────────────────────────────────────────────────────
export const PIPEDREAM_ENDPOINT            = 'https://eoqv1v7e0297v4p.m.pipedream.net';
export const PIPEDREAM_TELEMETRY_ENDPOINT  = 'https://eoiypa957c7ukph.m.pipedream.net';
export const TELEGRAM_CHANNEL_ID           = '-1003914032579';

// ── Nominatim (reverse geocoding público) ───────────────────────────────────
export const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// ── Batch dispatcher / mesh — timings ───────────────────────────────────────
export const RTT_THRESHOLD_MS   = 200;
export const MAX_RETRIES        = 5;
export const FLUSH_INTERVAL_MS  = 15_000;
export const CACHE_PURGE_AGE_MS = 86_400_000; // 24 h

// ── Google OAuth / Firebase (público por diseño) ────────────────────────────
export interface FirebaseWebConfig {
  apiKey:              string;
  authDomain:          string;
  projectId:           string;
  storageBucket:       string;
  messagingSenderId:   string;
  appId:               string;
  measurementId?:      string;
}

export const FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey:            'AIzaSyCQq4nOjI40glv8vDbQZNtN_nAzj8tZ138',
  authDomain:        'sentra-security-system.firebaseapp.com',
  projectId:         'sentra-security-system',
  storageBucket:     'sentra-security-system.firebasestorage.app',
  messagingSenderId: '199332945502',
  appId:             '1:199332945502:web:80849d2eab3a8dfb8d9ecf',
  measurementId:     'G-5985BMM938',
};

export const GOOGLE_OAUTH_CLIENT_ID =
  '199332945502-85kfbpqiir99fhbl9arap2alrle4sn77.apps.googleusercontent.com';
