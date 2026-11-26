import { useLocalSearchParams } from 'expo-router';

import { Space } from '@/components/space/space';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Space key={id} projectId={id} />;
}
