import { type ReactNode, useEffect, useId, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

/**
 * Menus, cards and the picture viewer that lie over the page. They are plain layers drawn by the app
 * itself, not system pop-ups: on iPhones a system pop-up that closes while the page changes can leave
 * the screen frozen.
 */
const layers = new Map<string, ReactNode>();
const watchers = new Set<() => void>();
let shown: [string, ReactNode][] = [];

function changed() {
  shown = [...layers];
  watchers.forEach((watch) => watch());
}

function watch(onChange: () => void) {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

/** Draws its children over the whole screen for as long as it is on the page. `onClose` is the phone's back button. */
export function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const id = useId();
  useEffect(() => {
    layers.set(id, children);
    changed();
  });
  useEffect(
    () => () => {
      layers.delete(id);
      changed();
    },
    [id],
  );
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => back.remove();
  }, [onClose]);
  return null;
}

/** Where the layers are drawn. It sits once at the top of the signed-in app. */
export function OverlayHost() {
  const all = useSyncExternalStore(
    watch,
    () => shown,
    () => shown,
  );
  return all.map(([id, layer]) => (
    <View key={id} pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      {layer}
    </View>
  ));
}

const styles = StyleSheet.create({
  layer: { zIndex: 20 },
});
