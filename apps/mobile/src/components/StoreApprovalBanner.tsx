import type { StoreDto } from '@yaar/shared';
import { storeApprovalNotice } from '../lib/storeApproval';
import { colors } from '../theme';
import { Card, Muted, Subtitle } from './ui';

/** Statut de validation de la boutique par Yaar (rien si elle est validée). */
export function StoreApprovalBanner({ store }: { store: Pick<StoreDto, 'approvalStatus' | 'approvalNote'> | null }) {
  const notice = storeApprovalNotice(store);
  if (!notice) return null;
  return (
    <Card highlight={notice.tone === 'red' ? colors.red : colors.orange}>
      <Subtitle style={{ color: notice.tone === 'red' ? colors.red : colors.orange }}>{notice.title}</Subtitle>
      <Muted>{notice.message}</Muted>
    </Card>
  );
}
