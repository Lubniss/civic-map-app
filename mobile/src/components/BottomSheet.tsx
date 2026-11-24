import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useTabBarVisibility } from './FloatingTabBar';

/**
 * Simple bottom sheet (image 1 style): white surface, drag handle, scrim.
 * Hides the floating tab bar while open so it never covers sheet content.
 */
export function BottomSheet({ visible, onClose, children, accessibilityLabel }: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { setHidden } = useTabBarVisibility();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const height = Dimensions.get('window').height;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setHidden(true);
      Animated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    } else if (mounted) {
      setHidden(false);
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => setHidden(false), [setHidden]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            maxHeight: height * 0.82,
            paddingBottom: insets.bottom + space.lg,
            transform: [{ translateY }],
          },
        ]}
      >
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </Pressable>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  handleArea: { alignItems: 'center', paddingTop: space.md, paddingBottom: space.sm },
  handle: { width: 40, height: 5, borderRadius: 3 },
  content: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.lg },
});
