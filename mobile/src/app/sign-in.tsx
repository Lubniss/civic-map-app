import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button, Card, Field } from '@/components/ui';
import { missingEnv } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendCode() {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) {
      setError(err.status === 429 ? 'Too many codes requested. Wait a minute and try again.' : err.message);
      return;
    }
    setEmail(clean);
    setCode('');
    setInfo(`We sent a code to ${clean}. It can take a minute to arrive; check spam too.`);
    setStep('code');
  }

  async function verify() {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) {
      setError('Enter the code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (err) setError('That code is wrong or has expired. Check it, or send a new one.');
    // On success the auth listener switches to the app automatically.
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl }]}
      >
        <View style={[styles.logo, { backgroundColor: colors.tabBar }]}>
          <AppText variant="display" color={colors.tabIcon}>C</AppText>
        </View>
        <AppText variant="display" accessibilityRole="header">Civic Map</AppText>
        <AppText variant="body" color="muted" style={{ marginBottom: space.xxl }}>
          Report problems in your area and see where it's safe.
        </AppText>

        {missingEnv.length > 0 && (
          <Card style={{ marginBottom: space.lg }}>
            <AppText variant="bodyStrong" color={colors.danger}>App setup incomplete</AppText>
            <AppText variant="caption" color="muted">Missing in mobile/.env: {missingEnv.join(', ')}</AppText>
          </Card>
        )}

        <Card style={{ gap: space.lg }}>
          {step === 'email' ? (
            <>
              <AppText variant="h2">Sign in or sign up</AppText>
              <Field
                label="Email"
                value={email}
                onChangeText={(t) => { setEmail(t); setError(null); }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={sendCode}
                error={error}
              />
              <Button title="Send code" onPress={sendCode} loading={busy} />
            </>
          ) : (
            <>
              <AppText variant="h2">Enter your code</AppText>
              {info ? <AppText variant="caption" color="muted">{info}</AppText> : null}
              <Field
                label="Code from the email"
                value={code}
                onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, 8)); setError(null); }}
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                returnKeyType="done"
                onSubmitEditing={verify}
                error={error}
              />
              <Button title="Sign in" onPress={verify} loading={busy} />
              <View style={styles.row}>
                <Pressable accessibilityRole="button" onPress={() => { setStep('email'); setError(null); }} style={styles.link}>
                  <AppText variant="label" color={colors.accentText}>Change email</AppText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={sendCode} disabled={busy} style={styles.link}>
                  <AppText variant="label" color={colors.accentText}>Send a new code</AppText>
                </Pressable>
              </View>
            </>
          )}
        </Card>

        <AppText variant="caption" color="muted" style={{ marginTop: space.xxl, textAlign: 'center' }}>
          In an emergency, call 112 first.
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: space.xl, gap: space.sm },
  logo: { width: 56, height: 56, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: 44, justifyContent: 'center' },
});
