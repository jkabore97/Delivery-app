import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { requestOtpSchema } from '@yaar/shared';
import { errorMessage } from '../api/client';
import { isBackOffice, useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ui';

/** Connexion téléphone + code SMS, réservée aux rôles CONTROLLER / ADMIN. */
export function LoginPage() {
  const { api, login, token, logoutReason } = useAuth();
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
      setInfo(`Code envoyé par SMS au ${parsed.data.phone}. Valable ${Math.round(res.expiresInSeconds / 60)} min.`);
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
            <label htmlFor="code">Code reçu par SMS</label>
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
