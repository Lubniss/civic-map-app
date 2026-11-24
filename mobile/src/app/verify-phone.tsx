import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button, Card, Field } from '@/components/ui';
import { phoneErrorMessage, toE164, useMyPhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { size, space } from '@/theme/tokens';

/**
 * Phase 5: confirm a phone number by SMS code (Twilio Verify through Supabase).
 * One account per phone number. The number is never shown to other users.
 */
export default function VerifyPhoneScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const current = useMyPhone();
  const [step, setStep] = useState<'number' | 'code' | 'done'>(current.confirmed ? 'done' : 'number');
  const [cc, setCc] = useState('+91');
  const [number, setNumber] = useState('');
  const [e164, setE164] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const phone = toE164(cc, number);
    if (!phone) return setError('Enter your mobile number, e.g. 98765 43210.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ phone });
    setBusy(false);
    if (err) return setError(phoneErrorMessage(err.message));
    setE164(phone);
    setCode('');
    setStep('code');
  }

  async function verify() {
    const token = code.replace(/\D/g, '');
    if (!e164 || token.length < 4) return setError('Enter the code from the SMS.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone: e164, token, type: 'phone_change' });
    if (!err) await supabase.auth.refreshSession().catch(() => {});
    setBusy(false);
    if (err) return setError(phoneErrorMessage(err.message));
    setStep('done');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <AppText variant="h2" accessibilityRole="header">Verify your phone</AppText>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxl, gap: space.lg }}>
        {step === 'done' ? (
          <Card style={{ gap: space.md, alignItems: 'flex-start' }}>
            <Ionicons name="shield-checkmark" size={32} color={colors.accentText} />
            <AppText variant="h2">Phone verified</AppText>
            <AppText variant="body" color="muted">{current.phone ?? e164 ?? ''} is linked to your account. You can report problems and confirm fixes.</AppText>
            <Button title="Done" onPress={() => router.back()} />
          </Card>
        ) : (
          <>
            <AppText variant="body" color="muted">
              To stop fake reports, each account needs its own phone number. We send one SMS code. Your number is never shown to anyone.
            </AppText>
            <Card style={{ gap: space.lg }}>
              {step === 'number' ? (
                <>
                  <View style={styles.row}>
                    <View style={{ width: 84 }}>
                      <Field label="Code" value={cc} onChangeText={(t) => { setCc(t); setError(null); }} keyboardType="phone-pad" maxLength={5} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Mobile number"
                        value={number}
                        onChangeText={(t) => { setNumber(t); setError(null); }}
                        placeholder="98765 43210"
                        keyboardType="phone-pad"
                        autoComplete="tel"
                        textContentType="telephoneNumber"
                        returnKeyType="send"
                        onSubmitEditing={sendCode}
                      />
                    </View>
                  </View>
                  {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
                  <Button title="Send SMS code" onPress={sendCode} loading={busy} />
                </>
              ) : (
                <>
                  <AppText variant="caption" color="muted">We sent a code by SMS to {e164}.</AppText>
                  <Field
                    label="Code from the SMS"
                    value={code}
                    onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, 8)); setError(null); }}
                    placeholder="123456"
                    keyboardType="number-pad"
                    autoComplete="sms-otp"
                    textContentType="oneTimeCode"
                    returnKeyType="done"
                    onSubmitEditing={verify}
                    error={error}
                  />
                  <Button title="Verify" onPress={verify} loading={busy} />
                  <View style={styles.links}>
                    <Pressable onPress={() => { setStep('number'); setError(null); }} accessibilityRole="button" style={styles.link}>
                      <AppText variant="label" color={colors.accentText}>Change number</AppText>
                    </Pressable>
                    <Pressable onPress={sendCode} disabled={busy} accessibilityRole="button" style={styles.link}>
                      <AppText variant="label" color={colors.accentText}>Send a new code</AppText>
                    </Pressable>
                  </View>
                </>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm, borderBottomWidth: 1 },
  iconBtn: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: size.touch, justifyContent: 'center' },
});
