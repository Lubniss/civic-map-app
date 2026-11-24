import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef } from 'react';
import { Alert, Animated, Easing, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { size } from '@/theme/tokens';
import { AppText } from './AppText';

export const HOLD_MS = 1500;

export async function dial112() {
  try {
    await Linking.openURL('tel:112');
  } catch {
    Alert.alert("Couldn't open the dialer", 'Dial 112 on your phone now.');
  }
}

/**
 * SOS / 112. Needs a 1.5 s press-and-hold (a red fill rises while holding) so it can't be
 * triggered by accident. A short tap only shows a hint. Screen-reader users get a confirm dialog.
 */
export function SosButton({ onHint }: { onHint: (message: string) => void }) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const done = useRef(false);

  const start = () => {
    done.current = false;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) {
        done.current = true;
        progress.setValue(0);
        dial112();
      }
    });
  };

  const release = () => {
    if (done.current) return;
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    onHint('Hold the SOS button to call 112');
  };

  const fillHeight = progress.interpolate({ inputRange: [0, 1], outputRange: [0, size.mapButton] });

  return (
    <Pressable
      onPressIn={start}
      onPressOut={release}
      accessibilityRole="button"
      accessibilityLabel="SOS, call 112"
      accessibilityHint="Press and hold for one and a half seconds to call 112"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() =>
        Alert.alert('Call 112?', 'This opens your phone dialer with 112.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Call 112', style: 'destructive', onPress: dial112 },
        ])
      }
      style={[styles.button, { backgroundColor: colors.sos, borderColor: colors.pinRing }]}
    >
      <View style={styles.clip} pointerEvents="none">
        <Animated.View style={[styles.fill, { height: fillHeight }]} />
      </View>
      <Ionicons name="call" size={14} color={colors.onSos} />
      <AppText variant="pillBadge" color={colors.onSos} style={{ fontSize: 10, lineHeight: 12 }}>SOS</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: size.mapButton,
    height: size.mapButton,
    borderRadius: size.mapButton / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  fill: { backgroundColor: 'rgba(0, 0, 0, 0.28)', width: '100%' },
});
