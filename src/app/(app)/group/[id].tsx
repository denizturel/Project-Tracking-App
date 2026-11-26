import { useLocalSearchParams } from 'expo-router';

import { Space } from '@/components/space/space';

/** A group, or a team inside a group. */
export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Space key={id} subgroupId={id} />;
}
