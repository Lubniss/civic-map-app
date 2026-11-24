import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { Button, Card, Segmented } from '@/components/ui';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useMyPhone, useRequirePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { useAppearance, useTheme, type AppearancePref } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { pref, setPref } = useAppearance();
  const { session } = useAuth();
  const phone = useMyPhone();
  const requirePhone = useRequirePhone();
  const insets = useSafeAreaInsets();
  const bottomSpace = useTabBarSpace();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    // The auth listener takes the user back to the sign-in screen.
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: bottomSpace, gap: space.lg }}
    >
      <AppText variant="display" accessibilityRole="header">Profile</AppText>

      <Card style={{ gap: space.xs }}>
        <AppText variant="label" color="muted">Signed in as</AppText>
        <AppText variant="bodyStrong" numberOfLines={1}>{session?.user.email ?? '—'}</AppText>
      </Card>

      <Card style={styles.notice}>
        <Ionicons name={phone.confirmed ? 'shield-checkmark' : 'phone-portrait-outline'} size={20} color={phone.confirmed ? colors.accentText : colors.textMuted} />
        <View style={{ flex: 1, gap: space.xs }}>
          <AppText variant="bodyStrong">{phone.confirmed ? 'Phone verified' : 'Phone not verified'}</AppText>
          <AppText variant="caption" color="muted">
            {phone.confirmed
              ? `${phone.phone}. Never shown to other people.`
              : requirePhone
                ? 'Needed to report problems and confirm fixes.'
                : 'Helps stop fake reports. One account per phone number.'}
          </AppText>
          {!phone.confirmed ? <Button title="Verify phone" variant="secondary" onPress={() => router.push('/verify-phone')} /> : null}
        </View>
      </Card>

      <Card style={{ gap: space.md }}>
        <AppText variant="h2">Appearance</AppText>
        <Segmented<AppearancePref>
          accessibilityLabel="Appearance"
          value={pref}
          onChange={setPref}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <AppText variant="caption" color="muted">System follows your phone's light or dark setting.</AppText>
      </Card>

      <Card style={styles.notice}>
        <Ionicons name="call" size={20} color={colors.sos} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">In an emergency, call 112 first</AppText>
          <AppText variant="caption" color="muted">Reports in this app are not sent to 112.</AppText>
        </View>
      </Card>

      <Button title="Sign out" variant="secondary" onPress={signOut} loading={signingOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
});
