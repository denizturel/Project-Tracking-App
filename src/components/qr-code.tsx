import makeQr from 'qrcode-generator';
import { View } from 'react-native';

/** A QR code drawn with plain boxes, so it works the same on phones and on the website. */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const qr = makeQr(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.floor(size / count);

  const rows = [];
  for (let row = 0; row < count; row++) {
    // Neighbouring dark squares are drawn as one box.
    const runs = [];
    let start = -1;
    for (let col = 0; col <= count; col++) {
      const dark = col < count && qr.isDark(row, col);
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        runs.push(
          <View
            key={start}
            style={{ position: 'absolute', left: start * cell, width: (col - start) * cell, height: cell, backgroundColor: '#000' }}
          />,
        );
        start = -1;
      }
    }
    rows.push(
      <View key={row} style={{ height: cell, width: count * cell }}>
        {runs}
      </View>,
    );
  }

  // Always black on white with a white edge, also in night mode, so cameras can read it.
  return (
    <View accessibilityLabel="QR code" style={{ backgroundColor: '#fff', padding: cell * 3, borderRadius: 12, alignSelf: 'center' }}>
      {rows}
    </View>
  );
}
