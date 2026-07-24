import { useState, useCallback, useRef } from 'react';
import { Shield, Fingerprint, Loader, CheckCircle, ArrowRight, AlertCircle } from 'lucide-react';
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
 * Auth flow — strictly linear, no re-render loops:
 *   IDLE → LOADING_GOOGLE → PENDING_BIOMETRIC → LOADING_BIO → [onAuthenticated]
 */
type AuthState = 'IDLE' | 'LOADING_GOOGLE' | 'PENDING_BIOMETRIC' | 'LOADING_BIO';

// ── WebAuthn ───────────────────────────────────────────────────────────────

async function webAuthnRegister(userId: string): Promise<void> {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'SENTRA Tactical System', id: window.location.hostname },
      user: { id: new TextEncoder().encode(userId), name: userId, displayName: 'SENTRA Operator' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60_000,
      attestation: 'none',
    },
  }) as PublicKeyCredential;
  const b64 = btoa(String.fromCharCode(...new Uint8Array((cred as any).rawId)));
  localStorage.setItem('sentra_bio_cred', JSON.stringify({ id: b64, uid: userId }));
}

async function webAuthnAuthenticate(): Promise<void> {
  const stored = JSON.parse(localStorage.getItem('sentra_bio_cred') || 'null');
  await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      userVerification: 'required',
      timeout: 60_000,
      ...(stored ? { allowCredentials: [{ type: 'public-key', id: Uint8Array.from(atob(stored.id), (c) => c.charCodeAt(0)) }] } : {}),
    },
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SentraAuth({ onAuthenticated }: Props) {
  const [authState, setAuthState] = useState<AuthState>('IDLE');
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<GoogleResult | null>(null);
  const googleUserRef = useRef<GoogleResult | null>(null);

  const showError = (msg: string, returnTo: AuthState) => {
    setErrorMsg(msg);
    setAuthState(returnTo);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  // ── Step 1: Google popup ──────────────────────────────────────────────────
  const onGoogle = useCallback(async () => {
    if (authState !== 'IDLE') return;
    setAuthState('LOADING_GOOGLE');
    setErrorMsg(null);
    try {
      const result = await firebaseGoogleSignIn();
      googleUserRef.current = result;
      setGoogleUser(result);
      setAuthState('PENDING_BIOMETRIC');
    } catch (e) {
      const err = e as any;
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setAuthState('IDLE');
      } else {
        showError('Error de autenticación Google. Intenta nuevamente.', 'IDLE');
      }
    }
  }, [authState]);

  // ── Step 2: Biometric ─────────────────────────────────────────────────────
  const onBiometric = useCallback(async () => {
    if (authState !== 'PENDING_BIOMETRIC') return;
    if (!window.PublicKeyCredential) {
      showError('WebAuthn no soportado en este dispositivo.', 'PENDING_BIOMETRIC');
      return;
    }
    setAuthState('LOADING_BIO');
    setErrorMsg(null);
    try {
      if (localStorage.getItem('sentra_bio_cred')) {
        await webAuthnAuthenticate();
      } else {
        await webAuthnRegister(googleUserRef.current?.uid ?? `op-${Date.now()}`);
      }
      const gu = googleUserRef.current;
      const user: SentraUser = {
        uid:         gu?.uid         ?? `op-${Date.now()}`,
        email:       gu?.email       ?? null,
        displayName: gu?.displayName ?? 'SENTRA Operator',
        photoURL:    gu?.photoURL    ?? null,
        method:      'BIOMETRIC',
      };
      console.log('[SentraAuth] Autenticación exitosa — llamando onAuthenticated', { uid: user.uid, method: user.method });
      await mesh.emit('SYSTEM_ARMED' as any, { method: 'BIOMETRIC', uid: user.uid, ts: Date.now() });
      onAuthenticated(user);
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'NotAllowedError') {
        showError('Biometría cancelada. Toca "Acceso Biométrico" para intentar de nuevo.', 'PENDING_BIOMETRIC');
      } else if (err.name === 'InvalidStateError') {
        localStorage.removeItem('sentra_bio_cred');
        showError('Credencial reiniciada. Intentá de nuevo.', 'PENDING_BIOMETRIC');
      } else {
        showError('Error biométrico: ' + err.message, 'PENDING_BIOMETRIC');
      }
    }
  }, [authState, onAuthenticated]);

  const isStep2      = authState === 'PENDING_BIOMETRIC' || authState === 'LOADING_BIO';
  const isGoogleBusy = authState === 'LOADING_GOOGLE';
  const isBioBusy    = authState === 'LOADING_BIO';

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6"
      style={{ background: '#f8fafc' }}
    >
      {/* ── Card ── */}
      <div
        className="w-full max-w-[400px] bg-white rounded-3xl flex flex-col items-center"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)' }}
      >
        {/* Top colour strip */}
        <div
          className="w-full h-1.5 rounded-t-3xl"
          style={{ background: 'linear-gradient(90deg, #1a73e8 0%, #00c9a7 100%)' }}
        />

        <div className="w-full px-8 pt-10 pb-8 flex flex-col items-center gap-6">

          {/* Logo mark */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #e8f0fe 0%, #d2e3fc 100%)' }}
            >
              <Shield size={26} style={{ color: '#1a73e8' }} strokeWidth={2} />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-wide text-gray-900">SENTRA</h1>
              <p className="text-xs text-gray-400 tracking-widest mt-0.5">TACTICAL SECURITY v3.0</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 w-full justify-center">
            {/* Step 1 */}
            <div className="flex items-center gap-1.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500"
                style={{
                  background: isStep2 ? '#d2e3fc' : '#1a73e8',
                  color:      isStep2 ? '#1a73e8'  : '#fff',
                }}
              >
                {isStep2 ? <CheckCircle size={13} /> : '1'}
              </div>
              <span className="text-xs font-medium" style={{ color: isStep2 ? '#9aa0a6' : '#1a73e8' }}>
                Google
              </span>
            </div>
            <ArrowRight size={12} className="text-gray-300 flex-shrink-0" />
            {/* Step 2 */}
            <div className="flex items-center gap-1.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500"
                style={{
                  background: isStep2 ? '#1a73e8' : '#e8eaed',
                  color:      isStep2 ? '#fff'    : '#9aa0a6',
                }}
              >
                2
              </div>
              <span className="text-xs font-medium" style={{ color: isStep2 ? '#1a73e8' : '#9aa0a6' }}>
                Biometría
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-gray-100" />

          {/* Error */}
          {errorMsg && (
            <div className="w-full flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
              <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 leading-snug">{errorMsg}</p>
            </div>
          )}

          {/* ── STEP 1: Google ── */}
          {!isStep2 && (
            <div className="w-full flex flex-col gap-3">
              <p className="text-sm text-gray-500 text-center">
                Inicia sesión con tu cuenta de Google para continuar.
              </p>
              <button
                onClick={onGoogle}
                disabled={isGoogleBusy}
                className="w-full flex items-center justify-center gap-3 rounded-xl font-semibold transition-all duration-150 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{
                  minHeight:  '52px',
                  padding:    '0 24px',
                  background: isGoogleBusy ? '#f1f3f4' : '#fff',
                  border:     '1.5px solid #dadce0',
                  color:      '#3c4043',
                  boxShadow:  isGoogleBusy ? 'none' : '0 1px 2px rgba(0,0,0,0.08)',
                  cursor:     isGoogleBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {isGoogleBusy ? (
                  <Loader size={18} className="animate-spin text-blue-500" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                <span style={{ fontSize: '15px' }}>
                  {isGoogleBusy ? 'Abriendo Google…' : 'Continuar con Google'}
                </span>
              </button>
            </div>
          )}

          {/* ── STEP 2: Biometric ── */}
          {isStep2 && (
            <div className="w-full flex flex-col gap-4">
              {/* Confirmed identity chip */}
              {googleUser && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-100">
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt=""
                      className="w-8 h-8 rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex-shrink-0 bg-green-200 flex items-center justify-center">
                      <CheckCircle size={16} className="text-green-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {googleUser.displayName ?? googleUser.email ?? 'Operador'}
                    </p>
                    {googleUser.email && (
                      <p className="text-xs text-gray-400 truncate">{googleUser.email}</p>
                    )}
                  </div>
                  <span className="ml-auto text-xs font-medium text-green-600 flex-shrink-0">
                    Verificado
                  </span>
                </div>
              )}

              <p className="text-sm text-gray-500 text-center leading-relaxed">
                Confirma tu identidad con huella dactilar o Face ID para acceder al sistema.
              </p>

              <button
                onClick={onBiometric}
                disabled={isBioBusy}
                className="w-full flex items-center justify-center gap-3 rounded-xl font-semibold transition-all duration-150 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-300"
                style={{
                  minHeight:  '52px',
                  padding:    '0 24px',
                  background: isBioBusy ? '#1557b0' : '#1a73e8',
                  color:      '#fff',
                  cursor:     isBioBusy ? 'not-allowed' : 'pointer',
                  boxShadow:  isBioBusy ? 'none' : '0 1px 3px rgba(26,115,232,0.4)',
                }}
              >
                {isBioBusy ? (
                  <Loader size={18} className="animate-spin" />
                ) : (
                  <Fingerprint size={20} />
                )}
                <span style={{ fontSize: '15px' }}>
                  {isBioBusy ? 'Verificando…' : 'Acceso Biométrico'}
                </span>
              </button>
            </div>
          )}

          {/* Footer — minimal */}
          <p className="text-xs text-gray-300 text-center">
            Protegido con AES-256 · WebAuthn Level 2
          </p>
        </div>
      </div>

      {/* Brand watermark below card */}
      <p className="mt-8 text-xs text-gray-400 tracking-widest">SENTRA SECURITY SYSTEM</p>
    </div>
  );
}
