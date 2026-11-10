import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { DEMO_DATA_WARNING, requestOtpSchema } from '@yaar/shared';
import { errorMessage } from '../api/client';
import { isBackOffice, useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Banner, ErrorBanner } from '../components/ui';
import { DEMO_ACCOUNTS } from '../lib/demo';
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
      // Démo publique : les comptes de console n'acceptent pas le code 123456 des applications ; rien n'est
      // pré-rempli, le code d'accès démo est communiqué par Yaar.
      // Numéro lisible et insécable (« +226 70 00 00 02 », jamais coupé en fin de ligne).
      const shown = formatPhone(parsed.data.phone).replace(/ /g, '\u00a0');
      setInfo(
        demo
          ? `Mode démo\u00a0: saisissez le code d’accès démo fourni par Yaar pour le ${shown}.`
          : `Code envoyé par ${channel} au ${shown}. Valable ${Math.round(res.expiresInSeconds / 60)}\u00a0min.`,
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

  const brand = (
    <div className="brand">
      <span className="brand-word">
        Yaar<span className="brand-dot" aria-hidden="true" />
      </span>
      <span className="brand-tag">Console</span>
    </div>
  );

  return (
    <div className="login">
      <div className="login-shell">
        <section className="login-hero" aria-label="Yaar Console">
          {/* Motif décoratif : un livreur au centre d'ondes radar, comme sur la carte en direct. */}
          <svg className="login-radar" viewBox="0 0 440 440" aria-hidden="true" focusable="false">
            <circle cx="220" cy="220" r="64" />
            <circle cx="220" cy="220" r="116" />
            <circle cx="220" cy="220" r="168" />
          </svg>
          <span className="login-marker" aria-hidden="true">
            <Icon name="moto" size={24} />
          </span>
          {brand}
          <h1>Toutes les livraisons de Ouagadougou, en direct.</h1>
          <p>
            Carte des livreurs, livraisons en attente, validation des dossiers, litiges, SOS et caisse : l’outil de
            l’équipe Yaar.
          </p>
          <ul className="login-points">
            <li>
              <span aria-hidden="true">
                <Icon name="map" size={18} />
              </span>
              Carte en direct et affectation
            </li>
            <li>
              <span aria-hidden="true">
                <Icon name="id" size={18} />
              </span>
              Validation des livreurs
            </li>
            <li>
              <span aria-hidden="true">
                <Icon name="wallet" size={18} />
              </span>
              Litiges, SOS et caisse
            </li>
          </ul>
        </section>
        <main className="login-card">
          {brand}
          <div>
            <h2>Connexion</h2>
            <p className="login-sub">Console de contrôle · Ouagadougou. Réservée aux contrôleurs et administrateurs.</p>
          </div>
          {logoutReason && step === 'phone' && <Banner tone="info">{logoutReason}</Banner>}
          {demo && step === 'phone' && (
            <div className="demo-notice" role="note" aria-label="Mode démo">
              <strong>
                <Icon name="info" size={18} />
                Mode démo
              </strong>
              <span>
                Les comptes de démonstration de la console se connectent avec le code d’accès démo fourni par Yaar.
              </span>
              <span className="demo-warning">{DEMO_DATA_WARNING}</span>
              <span className="muted small">Comptes de démonstration (un clic pour remplir le numéro) :</span>
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
              <span className="input-prefix">
                <span aria-hidden="true">+226</span>
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
              </span>
              <ErrorBanner message={error} />
              <button type="submit" className="btn btn-primary btn-large btn-block" disabled={busy}>
                {busy ? 'Envoi…' : 'Recevoir le code'}
              </button>
            </form>
          ) : (
            <form className="form" onSubmit={verify} noValidate>
              {info && <Banner tone="info">{info}</Banner>}
              <label htmlFor="code">{demo ? 'Code d’accès démo (fourni par Yaar)' : `Code reçu par ${channel}`}</label>
              <input
                id="code"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6 chiffres"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              <ErrorBanner message={error} />
              <button type="submit" className="btn btn-primary btn-large btn-block" disabled={busy}>
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
        </main>
      </div>
    </div>
  );
}
