import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { savePendingJoin, tokenFrom } from '@/lib/join-link';

/** Opened by a project's invite link or QR code. Home finishes joining once the person is signed in. */
export default function JoinByLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const found = tokenFrom(token ?? '');
    (found ? savePendingJoin(found) : Promise.resolve()).then(() => setSaved(true));
  }, [token]);

  return saved ? <Redirect href="/" /> : null;
}
