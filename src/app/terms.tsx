import { LegalPage } from '@/components/legal-page';
import { TERMS } from '@/lib/legal';

export default function TermsScreen() {
  return <LegalPage doc={TERMS} />;
}
