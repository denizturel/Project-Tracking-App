import { LegalPage } from '@/components/legal-page';
import { PRIVACY } from '@/lib/legal';

export default function PrivacyScreen() {
  return <LegalPage doc={PRIVACY} />;
}
