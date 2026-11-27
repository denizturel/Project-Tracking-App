import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon, IconButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { type Attachment, clock, fileUrl, openAttachment, sizeText } from '@/lib/attachments';

/** One file, picture or voice message inside a chat bubble or in the Media, links, docs lists. */
export function AttachmentView({ item }: { item: Attachment }) {
  const [failed, setFailed] = useState<string | null>(null);
  const open = async () => setFailed(await openAttachment(item));

  return (
    <View style={styles.box}>
      {item.kind === 'image' ? <Picture item={item} onOpen={open} /> : item.kind === 'voice' ? <Voice item={item} onOpen={open} /> : <FileLine item={item} onOpen={open} />}
      {!!failed && (
        <ThemedText type="small" themeColor="danger">
          {failed}
        </ThemedText>
      )}
    </View>
  );
}

function Picture({ item, onOpen }: { item: Attachment; onOpen: () => void }) {
  const theme = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (item.storage_path) fileUrl(item.storage_path).then((found) => active && setUrl(found));
    return () => {
      active = false;
    };
  }, [item.storage_path]);
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={item.file_name ?? 'Picture'} onPress={onOpen}>
      <Image source={url ? { uri: url } : undefined} contentFit="cover" style={[styles.picture, { backgroundColor: theme.backgroundElement }]} />
    </Pressable>
  );
}

function FileLine({ item, onOpen }: { item: Attachment; onOpen: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [styles.file, { borderColor: theme.border, backgroundColor: theme.background, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name="file-text" size={24} color="primary" />
      <View style={styles.grow}>
        <ThemedText type="smallBold" raw numberOfLines={2}>
          {item.file_name ?? ''}
        </ThemedText>
        {!!item.size_bytes && (
          <ThemedText type="small" themeColor="textSecondary" raw>
            {sizeText(item.size_bytes)}
          </ThemedText>
        )}
      </View>
      <Icon name="download" size={18} color="textSecondary" />
    </Pressable>
  );
}

/** On the website the voice message plays in place. The phone apps open it in the phone's own player for now. */
function Voice({ item, onOpen }: { item: Attachment; onOpen: () => void }) {
  const theme = useTheme();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  async function toggle() {
    if (Platform.OS !== 'web') return onOpen();
    if (audio.current) {
      if (playing) audio.current.pause();
      else void audio.current.play();
      return;
    }
    const url = item.storage_path ? await fileUrl(item.storage_path) : null;
    if (!url) return onOpen();
    const player = new Audio(url);
    player.onplay = () => setPlaying(true);
    player.onpause = () => setPlaying(false);
    player.onended = () => {
      setPlaying(false);
      setAt(0);
    };
    player.ontimeupdate = () => setAt(player.currentTime);
    player.onerror = () => onOpen();
    audio.current = player;
    void player.play();
  }

  const length = item.duration_seconds ?? 0;
  const part = length > 0 ? Math.min(1, at / length) : 0;
  return (
    <View style={[styles.file, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play voice message'} onPress={toggle} color="primary" />
      <View style={styles.grow}>
        <View style={[styles.track, { backgroundColor: theme.border }]}>
          <View style={[styles.trackDone, { backgroundColor: theme.primary, width: `${Math.round(part * 100)}%` }]} />
        </View>
      </View>
      <Icon name="mic" size={16} color="textSecondary" />
      <ThemedText type="small" themeColor="textSecondary" raw>
        {clock(playing || at > 0 ? at : length)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4 },
  grow: { flex: 1, minWidth: 0 },
  picture: { width: 240, maxWidth: '100%', height: 170, borderRadius: 12 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, minWidth: 220, maxWidth: '100%' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  trackDone: { height: 4 },
});
