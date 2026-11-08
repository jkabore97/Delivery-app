import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { requestOtpSchema } from '@yaar/shared';
import { errorMessage } from '../api/client';
import { isBackOffice, useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ui';
import { DEMO_ACCOUNTS, DEMO_OTP_CODE } from '../lib/demo';
import { formatPhone } from '../lib/format';
import { useAppConfig } from '../realtime/AppConfigContext';

/** Connexion téléphone + code SMS, réservée aux rôles CONTROLLER / ADMIN. */
export function LoginPage() {
  const { api, login, token, logoutReason } = useAuth();
  const { config } = useAppConfig();
  const demo = config?.demoMode === true;
  const channel = config?.otpChannel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (token) return <Navigate to="/" replace />;

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const parsed = requestOtpSchema.safeParse({ phone: phoneInput });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Numéro invalide');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.requestOtp(parsed.data.phone);
      setPhone(parsed.data.phone);
      setStep('code');
      if (demo) setCode(DEMO_OTP_CODE);
      setInfo(
        demo
          ? `Mode démo : le code ${DEMO_OTP_CODE} est déjà saisi pour le ${parsed.data.phone}.`
          : `Code envoyé par ${channel} au ${parsed.data.phone}. Valable ${Math.round(res.expiresInSeconds / 60)} min.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Le code comporte 6 chiffres.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.verifyOtp(phone, code);
      if (!isBackOffice(res.user.role)) {
        setError('Accès réservé aux contrôleurs. Ce compte doit utiliser l’application mobile Yaar.');
        setBusy(false);
        return;
      }
      login(res.accessToken, res.user);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="logo logo-dark">
          Yaar<span>·</span>Console
        </div>
        <p className="muted">Console de contrôle · Ouagadougou</p>
        {logoutReason && step === 'phone' && <div className="alert alert-info">{logoutReason}</div>}
        {demo && step === 'phone' && (
          <div className="demo-notice" role="note" aria-label="Mode démo">
            <strong>Mode démo : utilisez le code {DEMO_OTP_CODE}</strong>
            <span className="muted small">Comptes de démonstration (un clic pour remplir) :</span>
            <ul className="demo-accounts">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.phone}>
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneInput(a.phone);
                      setError(null);
                    }}
                  >
                    <span>
                      {a.role} · {a.label}
                    </span>
                    <span className="muted">{formatPhone(`+226${a.phone}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {step === 'phone' ? (
          <form className="form" onSubmit={sendCode} noValidate>
            <label htmlFor="phone">Numéro de téléphone</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="70 00 00 02"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              autoFocus
            />
            <ErrorBanner message={error} />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Envoi…' : 'Recevoir le code'}
            </button>
          </form>
        ) : (
          <form className="form" onSubmit={verify} noValidate>
            {info && <div className="alert alert-info">{info}</div>}
            <label htmlFor="code">{demo ? `Code (démo : ${DEMO_OTP_CODE})` : `Code reçu par ${channel}`}</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <ErrorBanner message={error} />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Vérification…' : 'Se connecter'}
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
            >
              Changer de numéro
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
