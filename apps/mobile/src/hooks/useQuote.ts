import { useEffect, useRef, useState } from 'react';
import type { QuoteInput, QuoteResponse, VehicleType } from '@yaar/shared';
import { errorMessage } from '../lib/api';
import { useApi } from '../state/auth';

/** Choisit le véhicule par défaut : celui déjà choisi s'il reste disponible, sinon la moto, sinon le premier disponible. */
export function pickVehicle(quote: QuoteResponse, current: VehicleType | null): VehicleType | null {
  const available = quote.options.filter((o) => o.available).map((o) => o.vehicleType);
  if (current && available.includes(current)) return current;
  if (available.includes('MOTO')) return 'MOTO';
  return available[0] ?? null;
}

/**
 * Devis automatique (POST /orders/quote) quand la commande change, avec un délai anti-rebond.
 * `input` null = formulaire incomplet (pas d'appel).
 */
export function useQuote(input: QuoteInput | null, debounceMs = 600) {
  const api = useApi();
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = input ? JSON.stringify(input) : null;
  const callId = useRef(0);

  useEffect(() => {
    if (!key) {
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++callId.current;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .quote(JSON.parse(key) as QuoteInput)
        .then((q) => {
          if (id === callId.current) {
            setQuote(q);
            setError(null);
          }
        })
        .catch((e: unknown) => {
          if (id === callId.current) {
            setQuote(null);
            setError(errorMessage(e));
          }
        })
        .finally(() => {
          if (id === callId.current) setLoading(false);
        });
    }, debounceMs);
    return () => clearTimeout(t);
  }, [api, key, debounceMs]);

  return { quote, error, loading };
}
