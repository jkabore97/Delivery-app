import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { ErrorBanner, Loading, Modal } from './ui';

/**
 * Affiche un fichier protégé (pièce KYC, photo de preuve) téléchargé avec le jeton,
 * via une URL objet libérée à la fermeture. Chaque ouverture est journalisée côté API.
 */
export function BlobViewer({
  title,
  load,
  notice,
  onClose,
}: {
  title: string;
  load: () => Promise<Blob>;
  notice?: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [type, setType] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    load()
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setType(blob.type);
        setUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Chargé une seule fois par ouverture (chaque consultation est auditée).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title={title} onClose={onClose} wide>
      {notice && <p className="hint">{notice}</p>}
      <ErrorBanner message={error} />
      {!url && !error && <Loading label="Téléchargement sécurisé…" />}
      {url &&
        (type === 'application/pdf' ? (
          <object data={url} type="application/pdf" className="doc-pdf" aria-label={title}>
            <a href={url} target="_blank" rel="noreferrer">
              Ouvrir le PDF
            </a>
          </object>
        ) : (
          <img src={url} alt={title} className="doc-image" />
        ))}
    </Modal>
  );
}
