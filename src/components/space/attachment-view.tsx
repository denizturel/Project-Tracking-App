import Feather from '@expo/vector-icons/Feather';
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Overlay } from '@/components/overlay';
import { ThemedText } from '@/components/themed-text';
import { Icon, IconButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { type Attachment, clock, fileUrl, openAttachment, openInApp, sizeText } from '@/lib/attachments';

/** One file, picture or voice message inside a chat bubble or in the Media, links, docs lists. */
export function AttachmentView({ item }: { item: Attachment }) {
  const [failed, setFailed] = useState<string | null>(null);
  const open = async () => setFailed(await openAttachment(item));

  return (
    <View style={styles.box}>
      {item.kind === 'image' ? <Picture item={item} /> : item.kind === 'voice' ? <Voice item={item} onOpen={open} /> : <FileLine item={item} onOpen={open} />}
      {!!failed && (
        <ThemedText type="small" themeColor="danger">
          {failed}
        </ThemedText>
      )}
    </View>
  );
}

function Picture({ item }: { item: Attachment }) {
  const theme = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const [large, setLarge] = useState(false);
  useEffect(() => {
    let active = true;
    if (item.storage_path) fileUrl(item.storage_path).then((found) => active && setUrl(found));
    return () => {
      active = false;
    };
  }, [item.storage_path]);
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={item.file_name ?? 'Picture'} onPress={() => setLarge(true)} disabled={!url}>
        <Image source={url ? { uri: url } : undefined} contentFit="cover" style={[styles.picture, { backgroundColor: theme.backgroundElement }]} />
      </Pressable>
      {large && url && <Viewer url={url} name={item.file_name ?? ''} onClose={() => setLarge(false)} />}
    </>
  );
}

/** The picture over the whole screen, inside the app. On iPhones two fingers make it larger. */
function Viewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const picture = <Image source={{ uri: url }} contentFit="contain" style={{ width: '100%', height: '100%' }} />;
  return (
    <Overlay onClose={onClose}>
      <View style={[StyleSheet.absoluteFill, styles.viewer]}>
        {Platform.OS === 'ios' ? (
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            bouncesZoom
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ width: screen.width, height: screen.height }}>
            {picture}
          </ScrollView>
        ) : (
          <Pressable style={StyleSheet.absoluteFill} onPress={Platform.OS === 'web' ? onClose : undefined} accessibilityLabel="Close">
            {picture}
          </Pressable>
        )}
        <View style={[styles.viewerBar, { paddingTop: insets.top + 6 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={styles.viewerButton}>
            <Feather name="x" size={26} color="#fff" />
          </Pressable>
          <ThemedText type="smallBold" raw numberOfLines={1} style={styles.viewerName}>
            {name}
          </ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="Open outside the app" onPress={() => void openInApp(url)} hitSlop={8} style={styles.viewerButton}>
            <Feather name="external-link" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Overlay>
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

/** The voice message plays in place: with the browser's player on the website, with the phone's player in the apps. */
function Voice({ item, onOpen }: { item: Attachment; onOpen: () => void }) {
  const theme = useTheme();
  const audio = useRef<HTMLAudioElement | null>(null);
  const phone = useRef<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);

  useEffect(
    () => () => {
      audio.current?.pause();
      phone.current?.remove();
    },
    [],
  );

  async function togglePhone() {
    try {
      if (phone.current) {
        if (playing) phone.current.pause();
        else phone.current.play();
        return;
      }
      const url = item.storage_path ? await fileUrl(item.storage_path) : null;
      if (!url) return onOpen();
      // Plays through the loudspeaker, also when the phone's ring switch is on silent.
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const player = createAudioPlayer(url, { updateInterval: 250 });
      player.addListener('playbackStatusUpdate', (status) => {
        setPlaying(status.playing);
        setAt(status.didJustFinish ? 0 : status.currentTime);
        if (status.didJustFinish) void player.seekTo(0);
      });
      phone.current = player;
      player.play();
    } catch {
      onOpen();
    }
  }

  async function toggle() {
    if (Platform.OS !== 'web') return togglePhone();
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
  viewer: { backgroundColor: '#000' },
  viewerBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.45)' },
  viewerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewerName: { flex: 1, color: '#fff' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  trackDone: { height: 4 },
});
