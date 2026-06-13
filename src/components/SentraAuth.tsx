import { useState, useCallback, useRef } from 'react';
import { Shield, Fingerprint, AlertTriangle, Loader, CheckCircle, ArrowRight } from 'lucide-react';
import { mesh } from '../lib/SentraMesh';
import { firebaseGoogleSignIn, type GoogleResult } from '../lib/firebase';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SentraUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  method: 'GOOGLE' | 'BIOMETRIC';
}

interface Props {
  onAuthenticated: (user: SentraUser) => void;
}

/**
 * Auth states — strictly linear, no loops:
 *
 *   IDLE  ──[Google btn]──▶  LOADING_GOOGLE
 *                                  │
 *                            popup resolves
 *                                  │
 *                         PENDING_BIOMETRIC  ──[Bio btn]──▶  LOADING_BIO
 *                                                                  │
 *                                                           bio resolves
 *                                                                  │
 *                                                           onAuthenticated()
 */
type AuthState = 'IDLE' | 'LOADING_GOOGLE' | 'PENDING_BIOMETRIC' | 'LOADING_BIO';

// ── WebAuthn helpers ───────────────────────────────────────────────────────

const RP_NAME = 'SENTRA Tactical System';
const RP_ID   = window.location.hostname;

function randomBuffer(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len));
}

async function webAuthnRegister(userId: string): Promise<PublicKeyCredential> {
  const opts: PublicKeyCredentialCreationOptions = {
    challenge: randomBuffer(32),
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: new TextEncoder().encode(userId),
      name: userId,
      displayName: 'SENTRA Operator',
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
    },
    timeout: 60_000,
    attestation: 'none',
  };
  return navigator.credentials.create({ publicKey: opts }) as Promise<PublicKeyCredential>;
}

async function webAuthnAuthenticate(): Promise<void> {
  const stored = JSON.parse(localStorage.getItem('sentra_bio_cred') || 'null');
  const opts: PublicKeyCredentialRequestOptions = {
    challenge: randomBuffer(32),
    rpId: RP_ID,
    userVerification: 'required',
    timeout: 60_000,
    ...(stored
      ? { allowCredentials: [{ type: 'public-key', id: Uint8Array.from(atob(stored.id), (c) => c.charCodeAt(0)) }] }
      : {}),
  };
  await navigator.credentials.get({ publicKey: opts });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SentraAuth({ onAuthenticated }: Props) {
  // authState drives the UI — one direction only, never goes backwards
  const [authState, setAuthState] = useState<AuthState>('IDLE');
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  // googleUser is set once when Google popup resolves and never cleared
  const googleUserRef = useRef<GoogleResult | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleResult | null>(null);

  // ── Error display (non-fatal for bio step, fatal for Google step) ─────────
  const showError = (msg: string, returnTo: AuthState) => {
    setErrorMsg(msg);
    setAuthState(returnTo);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  // ── Step 1: Google popup ──────────────────────────────────────────────────
  const onGoogle = useCallback(async () => {
    if (authState !== 'IDLE') return; // guard: only callable from IDLE
    setAuthState('LOADING_GOOGLE');
    setErrorMsg(null);

    try {
      const result = await firebaseGoogleSignIn();
      // Store in both ref (for bio callback closure) and state (for render)
      googleUserRef.current = result;
      setGoogleUser(result);
      // Immediately advance to step 2 — no re-render gap
      setAuthState('PENDING_BIOMETRIC');
    } catch (e) {
      const err = e as Error;
      // popup-closed-by-user is not an error worth showing
      if ((err as any).code === 'auth/popup-closed-by-user' ||
          (err as any).code === 'auth/cancelled-popup-request') {
        setAuthState('IDLE');
      } else {
        showError('Error Google: ' + (err.message ?? 'intenta de nuevo'), 'IDLE');
      }
    }
  }, [authState]);

  // ── Step 2: Biometric (WebAuthn) ──────────────────────────────────────────
  const onBiometric = useCallback(async () => {
    if (authState !== 'PENDING_BIOMETRIC') return; // guard: only callable from step 2

    if (!window.PublicKeyCredential) {
      showError('WebAuthn no soportado en este dispositivo.', 'PENDING_BIOMETRIC');
      return;
    }

    setAuthState('LOADING_BIO');
    setErrorMsg(null);

    try {
      const hasCred = !!localStorage.getItem('sentra_bio_cred');

      if (hasCred) {
        await webAuthnAuthenticate();
      } else {
        // First-time: register with the Google uid so the cred is tied to this operator
        const uid = googleUserRef.current?.uid ?? `sentra-op-${Date.now()}`;
        const cred = await webAuthnRegister(uid);
        const rawId = new Uint8Array((cred as any).rawId);
        const b64   = btoa(String.fromCharCode(...rawId));
        localStorage.setItem('sentra_bio_cred', JSON.stringify({ id: b64, uid }));
      }

      // Both factors confirmed — emit and grant access
      const gu = googleUserRef.current;
      const finalUser: SentraUser = {
        uid:         gu?.uid         ?? `sentra-op-${Date.now()}`,
        email:       gu?.email       ?? null,
        displayName: gu?.displayName ?? 'SENTRA Operator',
        photoURL:    gu?.photoURL    ?? null,
        method:      'BIOMETRIC',
      };

      await mesh.emit('SYSTEM_ARMED' as any, {
        method: 'BIOMETRIC',
        uid: finalUser.uid,
        ts: Date.now(),
      });

      // Call parent — App.tsx will unmount this component and mount the dashboard
      onAuthenticated(finalUser);

    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'NotAllowedError') {
        showError('Biometría cancelada o denegada. Intentá de nuevo.', 'PENDING_BIOMETRIC');
      } else if (err.name === 'InvalidStateError') {
        // Cred already registered — try assertion instead
        localStorage.removeItem('sentra_bio_cred');
        showError('Credencial inválida. Se reinició el registro. Intentá de nuevo.', 'PENDING_BIOMETRIC');
      } else {
        showError('Error biométrico: ' + err.message, 'PENDING_BIOMETRIC');
      }
    }
  }, [authState, onAuthenticated]);

  // ── Derived flags ─────────────────────────────────────────────────────────
  const isStep2    = authState === 'PENDING_BIOMETRIC' || authState === 'LOADING_BIO';
  const isGoogleBusy = authState === 'LOADING_GOOGLE';
  const isBioBusy    = authState === 'LOADING_BIO';

  const ACCENT = '#00FF88';
  const BLUE   = '#38BDF8';

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 20%, #0f2545 0%, #0f172a 70%)' }}
    >
      {/* Perimeter vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)',
          zIndex: 0,
        }}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm mx-5 rounded-2xl p-8 flex flex-col items-center gap-5"
        style={{
          background:     'rgba(15,23,42,0.85)',
          border:         '1px solid rgba(56,189,248,0.18)',
          backdropFilter: 'blur(24px)',
          boxShadow:      '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Tactical corner accents */}
        <div className="absolute top-0 left-0 w-5 h-5 rounded-tl-2xl"
          style={{ borderTop: `1.5px solid ${ACCENT}60`, borderLeft: `1.5px solid ${ACCENT}60` }} />
        <div className="absolute top-0 right-0 w-5 h-5 rounded-tr-2xl"
          style={{ borderTop: `1.5px solid ${ACCENT}60`, borderRight: `1.5px solid ${ACCENT}60` }} />
        <div className="absolute bottom-0 left-0 w-5 h-5 rounded-bl-2xl"
          style={{ borderBottom: `1.5px solid ${ACCENT}60`, borderLeft: `1.5px solid ${ACCENT}60` }} />
        <div className="absolute bottom-0 right-0 w-5 h-5 rounded-br-2xl"
          style={{ borderBottom: `1.5px solid ${ACCENT}60`, borderRight: `1.5px solid ${ACCENT}60` }} />

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${ACCENT}14 0%, ${BLUE}0a 100%)`,
              border:     `1px solid ${ACCENT}35`,
              boxShadow:  `0 0 24px ${ACCENT}18`,
            }}
          >
            <Shield size={30} style={{ color: ACCENT }} strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p style={{
              color: '#FFFFFF',
              fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
              fontSize: '22px', letterSpacing: '0.22em', fontWeight: 700,
            }}>
              SENTRA
            </p>
            <p style={{
              color: `${BLUE}90`, fontFamily: 'monospace',
              fontSize: '9px', letterSpacing: '0.28em', marginTop: '2px',
            }}>
              TACTICAL SECURITY SYSTEM v3.0
            </p>
          </div>
        </div>

        {/* 2-step progress indicator */}
        <div className="w-full flex items-center gap-2 px-2">
          <div className="flex items-center gap-1.5 flex-1">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500"
              style={{
                background: isStep2 ? `${ACCENT}25` : `${BLUE}20`,
                border:     isStep2 ? `1.5px solid ${ACCENT}70` : `1.5px solid ${BLUE}60`,
              }}
            >
              {isStep2
                ? <CheckCircle size={11} style={{ color: ACCENT }} />
                : <span style={{ color: BLUE, fontSize: '9px', fontWeight: 700 }}>1</span>}
            </div>
            <span style={{
              color: isStep2 ? `${ACCENT}80` : '#94A3B8',
              fontSize: '9px', fontFamily: "'Inter', system-ui",
              letterSpacing: '0.1em', fontWeight: 500,
            }}>
              GOOGLE
            </span>
          </div>

          <ArrowRight size={12} style={{ color: '#334155', flexShrink: 0 }} />

          <div className="flex items-center gap-1.5 flex-1 justify-end">
            <span style={{
              color: isStep2 ? '#FFFFFF' : '#475569',
              fontSize: '9px', fontFamily: "'Inter', system-ui",
              letterSpacing: '0.1em', fontWeight: isStep2 ? 600 : 400,
            }}>
              BIOMÉTRICO
            </span>
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500"
              style={{
                background: isStep2 ? `${ACCENT}20` : 'rgba(71,85,105,0.2)',
                border:     isStep2 ? `1.5px solid ${ACCENT}60` : '1.5px solid #334155',
              }}
            >
              <span style={{
                color: isStep2 ? ACCENT : '#475569',
                fontSize: '9px', fontWeight: 700,
              }}>2</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full" style={{
          height: '1px',
          background: 'linear-gradient(to right, transparent, rgba(56,189,248,0.2), transparent)',
        }} />

        {/* Error banner */}
        {errorMsg && (
          <div
            className="w-full flex items-start gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <AlertTriangle size={13} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <p style={{ color: '#FCA5A5', fontFamily: "'Inter', system-ui", fontSize: '11px', lineHeight: 1.4 }}>
              {errorMsg}
            </p>
          </div>
        )}

        {/* ── STEP 1: Google button ── */}
        {!isStep2 && (
          <button
            onClick={onGoogle}
            disabled={isGoogleBusy}
            className="w-full flex items-center justify-center gap-3 rounded-xl transition-all duration-200 active:scale-[0.98]"
            style={{
              padding:    '14px 20px',
              minHeight:  '52px',
              background: isGoogleBusy ? 'rgba(56,189,248,0.08)' : 'rgba(56,189,248,0.06)',
              border:     `1px solid rgba(56,189,248,${isGoogleBusy ? '0.4' : '0.2'})`,
              boxShadow:  isGoogleBusy ? '0 0 16px rgba(56,189,248,0.12)' : 'none',
              cursor:     isGoogleBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {isGoogleBusy ? (
              <Loader size={16} style={{ color: BLUE }} className="animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            <span style={{
              color: '#FFFFFF',
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em',
            }}>
              {isGoogleBusy ? 'Abriendo Google...' : 'Continuar con Google'}
            </span>
          </button>
        )}

        {/* ── STEP 2: Biometric button (shown only after Google resolves) ── */}
        {isStep2 && (
          <>
            {/* Google identity chip */}
            {googleUser && (
              <div
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}25` }}
              >
                <CheckCircle size={14} style={{ color: ACCENT, flexShrink: 0 }} />
                <div className="flex flex-col min-w-0">
                  <span style={{
                    color: '#FFFFFF', fontSize: '11px',
                    fontFamily: "'Inter', system-ui", fontWeight: 600,
                  }}>
                    {googleUser.displayName ?? googleUser.email ?? 'Operador'}
                  </span>
                  {googleUser.email && (
                    <span style={{ color: `${ACCENT}70`, fontSize: '9px', fontFamily: 'monospace' }}>
                      {googleUser.email}
                    </span>
                  )}
                </div>
                <span style={{
                  color: `${ACCENT}80`, fontSize: '8px', fontFamily: 'monospace',
                  letterSpacing: '0.15em', marginLeft: 'auto', flexShrink: 0,
                }}>
                  VERIFICADO
                </span>
              </div>
            )}

            <p style={{
              color: '#64748B', fontSize: '11px',
              fontFamily: "'Inter', system-ui", textAlign: 'center', lineHeight: 1.5,
            }}>
              Confirma tu identidad con biometría para acceder al sistema táctico.
            </p>

            <button
              onClick={onBiometric}
              disabled={isBioBusy}
              className="w-full flex items-center justify-center gap-3 rounded-xl transition-all duration-200 active:scale-[0.98]"
              style={{
                padding:    '14px 20px',
                minHeight:  '52px',
                background: isBioBusy
                  ? `${ACCENT}12`
                  : `linear-gradient(135deg, ${ACCENT}14 0%, ${ACCENT}08 100%)`,
                border:     `1px solid ${ACCENT}${isBioBusy ? '60' : '35'}`,
                boxShadow:  isBioBusy ? `0 0 20px ${ACCENT}18` : 'none',
                cursor:     isBioBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {isBioBusy ? (
                <Loader size={16} style={{ color: ACCENT }} className="animate-spin" />
              ) : (
                <Fingerprint size={18} style={{ color: ACCENT }} />
              )}
              <span style={{
                color: isBioBusy ? `${ACCENT}80` : '#FFFFFF',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em',
              }}>
                {isBioBusy ? 'Verificando...' : 'Acceso Biométrico'}
              </span>
            </button>
          </>
        )}

        {/* Footer */}
        <p style={{
          color: '#1E293B', fontFamily: 'monospace',
          fontSize: '8px', letterSpacing: '0.18em', textAlign: 'center',
        }}>
          AES-256 · WebAuthn L2 · E2E ENCRYPTED
        </p>
      </div>
    </div>
  );
}
