import { useEffect, useRef, useState } from 'react';
import type { DeliveryQuoteInput, QuoteResponse } from '@yaar/shared';
import { errorMessage } from '../lib/api';
import { useApi } from '../state/auth';

/**
 * Devis d'une livraison d'entreprise (POST /business/deliveries/quote : prix et durée par véhicule),
 * relancé avec un délai anti-rebond quand la destination change. `input` null = destination incomplète.
 */
export function useDeliveryQuote(input: DeliveryQuoteInput | null, debounceMs = 400) {
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
        .quoteDelivery(JSON.parse(key) as DeliveryQuoteInput)
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
