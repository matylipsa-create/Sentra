import { useState, useCallback } from 'react';
import { Shield, Fingerprint, AlertTriangle, Loader } from 'lucide-react';
import { mesh } from '../lib/SentraMesh';

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

type AuthState = 'IDLE' | 'LOADING_GOOGLE' | 'LOADING_BIO' | 'ERROR';

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
      { type: 'public-key', alg: -7  }, // ES256
      { type: 'public-key', alg: -257 }, // RS256
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

async function webAuthnAuthenticate(): Promise<PublicKeyCredential> {
  const stored = JSON.parse(localStorage.getItem('sentra_bio_cred') || 'null');

  const opts: PublicKeyCredentialRequestOptions = {
    challenge: randomBuffer(32),
    rpId: RP_ID,
    userVerification: 'required',
    timeout: 60_000,
    ...(stored ? { allowCredentials: [{ type: 'public-key', id: Uint8Array.from(atob(stored.id), (c) => c.charCodeAt(0)) }] } : {}),
  };

  return navigator.credentials.get({ publicKey: opts }) as Promise<PublicKeyCredential>;
}

// ── Google OAuth stub ──────────────────────────────────────────────────────
// Replace this with your Firebase SDK call once integrated.
// e.g.:  import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
//        const result = await signInWithPopup(auth, new GoogleAuthProvider())

async function googleSignIn(): Promise<SentraUser> {
  // TODO: swap for Firebase implementation
  throw new Error('GOOGLE_NOT_CONFIGURED');
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SentraAuth({ onAuthenticated }: Props) {
  const [authState, setAuthState] = useState<AuthState>('IDLE');
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  const handleSuccess = useCallback(async (user: SentraUser) => {
    // Emit auth event through SentraMesh
    await mesh.emit(
      'SYSTEM_ARMED' as any, // typed as SYSTEM_ARMED until MeshEventType gets AUTH_SUCCESS
      { method: user.method, uid: user.uid, ts: Date.now() }
    );
    setAuthState('IDLE');
    onAuthenticated(user);
  }, [onAuthenticated]);

  const handleError = useCallback((msg: string) => {
    setAuthState('ERROR');
    setErrorMsg(msg);
    setTimeout(() => { setAuthState('IDLE'); setErrorMsg(null); }, 4000);
  }, []);

  // ── Google ────────────────────────────────────────────────────────────────
  const onGoogle = useCallback(async () => {
    setAuthState('LOADING_GOOGLE');
    setErrorMsg(null);
    try {
      const user = await googleSignIn();
      await handleSuccess(user);
    } catch (e) {
      const err = e as Error;
      handleError(
        err.message === 'GOOGLE_NOT_CONFIGURED'
          ? 'Google Auth no configurado. Integra Firebase SDK.'
          : 'Error de autenticación Google.'
      );
    }
  }, [handleSuccess, handleError]);

  // ── Biometric (WebAuthn) ───────────────────────────────────────────────────
  const onBiometric = useCallback(async () => {
    if (!window.PublicKeyCredential) {
      handleError('WebAuthn no soportado en este dispositivo.');
      return;
    }

    setAuthState('LOADING_BIO');
    setErrorMsg(null);

    try {
      const hasCred = !!localStorage.getItem('sentra_bio_cred');

      if (hasCred) {
        // Authenticate with existing credential
        await webAuthnAuthenticate();
      } else {
        // First-time registration
        const uid = `sentra-op-${Date.now()}`;
        const cred = await webAuthnRegister(uid);

        // Persist credential ID (base64) for future assertions
        const rawId = new Uint8Array((cred as any).rawId);
        const b64   = btoa(String.fromCharCode(...rawId));
        localStorage.setItem('sentra_bio_cred', JSON.stringify({ id: b64, uid }));
      }

      const stored = JSON.parse(localStorage.getItem('sentra_bio_cred')!);
      await handleSuccess({
        uid:         stored.uid,
        email:       null,
        displayName: 'SENTRA Operator',
        photoURL:    null,
        method:      'BIOMETRIC',
      });
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'NotAllowedError') {
        handleError('Verificación biométrica cancelada o denegada.');
      } else if (err.name === 'InvalidStateError') {
        handleError('Credencial ya registrada en este dispositivo.');
      } else {
        handleError('Error biométrico: ' + err.message);
      }
    }
  }, [handleSuccess, handleError]);

  // ── Colours ────────────────────────────────────────────────────────────────
  const G = '#00FF00';
  const C = '#00BFFF';

  const isLoading = authState === 'LOADING_GOOGLE' || authState === 'LOADING_BIO';

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #001a00 0%, #000000 70%)' }}
    >
      {/* Subtle scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.015) 2px, rgba(0,255,0,0.015) 4px)',
          zIndex: 0,
        }}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm mx-4 p-8 flex flex-col items-center gap-6"
        style={{
          background:   'rgba(0, 10, 0, 0.75)',
          border:       `1px solid ${G}30`,
          backdropFilter: 'blur(20px)',
          boxShadow:    `0 0 40px ${G}10, inset 0 0 60px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Top bracket accents */}
        <div className="absolute top-0 left-0 w-4 h-4" style={{ borderTop: `2px solid ${G}`, borderLeft: `2px solid ${G}` }} />
        <div className="absolute top-0 right-0 w-4 h-4" style={{ borderTop: `2px solid ${G}`, borderRight: `2px solid ${G}` }} />
        <div className="absolute bottom-0 left-0 w-4 h-4" style={{ borderBottom: `2px solid ${G}`, borderLeft: `2px solid ${G}` }} />
        <div className="absolute bottom-0 right-0 w-4 h-4" style={{ borderBottom: `2px solid ${G}`, borderRight: `2px solid ${G}` }} />

        {/* Logo mark */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-14 h-14 flex items-center justify-center"
            style={{
              background: `${G}08`,
              border: `1px solid ${G}40`,
              boxShadow: `0 0 20px ${G}20`,
            }}
          >
            <Shield size={28} style={{ color: G }} strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p style={{ color: G, fontFamily: 'monospace', fontSize: '18px', letterSpacing: '0.25em', fontWeight: 700 }}>
              SENTRA
            </p>
            <p style={{ color: `${G}50`, fontFamily: 'monospace', fontSize: '9px', letterSpacing: '0.3em' }}>
              TACTICAL SECURITY SYSTEM v3.0
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full" style={{ height: '1px', background: `linear-gradient(to right, transparent, ${G}30, transparent)` }} />

        {/* Error banner */}
        {authState === 'ERROR' && errorMsg && (
          <div
            className="w-full flex items-center gap-2 px-3 py-2"
            style={{ background: 'rgba(255,68,0,0.12)', border: '1px solid rgba(255,68,0,0.4)' }}
          >
            <AlertTriangle size={12} style={{ color: '#FF4400', flexShrink: 0 }} />
            <p style={{ color: '#FF4400', fontFamily: 'monospace', fontSize: '9px' }}>{errorMsg}</p>
          </div>
        )}

        {/* Google button */}
        <button
          onClick={onGoogle}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 py-3 transition-all duration-200"
          style={{
            background:   authState === 'LOADING_GOOGLE' ? `${G}12` : `${G}08`,
            border:       `1px solid ${G}${authState === 'LOADING_GOOGLE' ? '60' : '30'}`,
            boxShadow:    authState === 'LOADING_GOOGLE' ? `0 0 12px ${G}20` : 'none',
            cursor:       isLoading ? 'not-allowed' : 'pointer',
            opacity:      isLoading && authState !== 'LOADING_GOOGLE' ? 0.4 : 1,
          }}
        >
          {authState === 'LOADING_GOOGLE' ? (
            <Loader size={14} style={{ color: G }} className="animate-spin" />
          ) : (
            // Google "G" mark — inline SVG to avoid external dependency
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          <span style={{ color: G, fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.15em', fontWeight: 600 }}>
            {authState === 'LOADING_GOOGLE' ? 'AUTENTICANDO...' : 'ACCESO CON GOOGLE'}
          </span>
        </button>

        {/* Separator */}
        <div className="w-full flex items-center gap-3">
          <div className="flex-1" style={{ height: '1px', background: `${G}15` }} />
          <span style={{ color: `${G}30`, fontFamily: 'monospace', fontSize: '9px', letterSpacing: '0.2em' }}>O</span>
          <div className="flex-1" style={{ height: '1px', background: `${G}15` }} />
        </div>

        {/* Biometric button */}
        <button
          onClick={onBiometric}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 py-3 transition-all duration-200"
          style={{
            background:   authState === 'LOADING_BIO' ? `${C}12` : `${C}06`,
            border:       `1px solid ${C}${authState === 'LOADING_BIO' ? '60' : '25'}`,
            boxShadow:    authState === 'LOADING_BIO' ? `0 0 12px ${C}20` : 'none',
            cursor:       isLoading ? 'not-allowed' : 'pointer',
            opacity:      isLoading && authState !== 'LOADING_BIO' ? 0.4 : 1,
          }}
        >
          {authState === 'LOADING_BIO' ? (
            <Loader size={14} style={{ color: C }} className="animate-spin" />
          ) : (
            <Fingerprint size={14} style={{ color: C }} />
          )}
          <span style={{ color: C, fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.15em', fontWeight: 600 }}>
            {authState === 'LOADING_BIO' ? 'VERIFICANDO BIOMETRÍA...' : 'ACCESO BIOMÉTRICO'}
          </span>
        </button>

        {/* Footer */}
        <p style={{ color: `${G}25`, fontFamily: 'monospace', fontSize: '8px', letterSpacing: '0.2em', textAlign: 'center' }}>
          PROTOCOLO DE ACCESO CIFRADO · AES-256 · WebAuthn L2
        </p>
      </div>
    </div>
  );
}
