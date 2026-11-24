import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alertBadge, alertInfoLine } from '@/components/AlertPreview';
import { AppText } from '@/components/AppText';
import { BottomSheet } from '@/components/BottomSheet';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Badge, Button, Card, Field } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { distanceM } from '@/lib/distance';
import { timeAgo } from '@/lib/geo';
import { allowedDistance, useLocationHistory } from '@/lib/locationHistory';
import { useAlertDetail, useSummaryNear } from '@/lib/queries';
import { useStreetName } from '@/lib/streetName';
import { confirmFix } from '@/lib/submitReport';
import type { AlertDetail } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { categories, radius, size, space } from '@/theme/tokens';

const SEVERITY = ['', 'Low', 'Medium', 'High'];

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const detail = useAlertDetail(id);
  const a = detail.data?.alert;
  const point = a ? { lat: a.lat, lng: a.lng } : null;
  const street = useStreetName(point, 0);
  const nearby = useSummaryNear(point);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function share() {
    if (!a) return;
    const label = categories[a.category].label;
    await Share.share({
      message: `⚠️ ${label} reported near ${street.name ?? 'this spot'} · Civic Map\nhttps://maps.google.com/?q=${a.lat},${a.lng}`,
    }).catch(() => {});
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <AppText variant="h2" style={{ flex: 1 }} numberOfLines={1} accessibilityRole="header">
          {a ? categories[a.category].label : 'Alert'}
        </AppText>
        {a ? (
          <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share this alert" style={styles.iconBtn}>
            <Ionicons name="share-outline" size={22} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {detail.isPending ? (
        <View style={[styles.fill, styles.center]}><ActivityIndicator color={colors.textMuted} /></View>
      ) : detail.isError || !detail.data || !a ? (
        <View style={[styles.fill, styles.center, { padding: space.xl, gap: space.md }]}>
          <AppText variant="h2">This alert isn't available</AppText>
          <AppText variant="body" color="muted" style={{ textAlign: 'center' }}>
            {detail.error instanceof Error ? detail.error.message : 'It may have been fixed or removed.'}
          </AppText>
          <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl, gap: space.lg }}>
          <PhotoStrip data={detail.data} />

          <View style={{ paddingHorizontal: space.xl, gap: space.lg }}>
            <Card style={{ gap: space.md }}>
              <View style={styles.row}>
                <CategoryIcon category={a.category} size={44} />
                <View style={{ flex: 1, gap: space.xs }}>
                  <AppText variant="h2" numberOfLines={2}>{street.name ?? (street.loading ? 'Finding street name…' : 'Unnamed road')}</AppText>
                  <Badge kind={alertBadge(a).kind} label={alertBadge(a).label} />
                </View>
              </View>
              <AppText variant="body">{alertInfoLine(a)}</AppText>
              <AppText variant="caption" color="muted">First reported {timeAgo(a.createdAt)} · last update {timeAgo(a.updatedAt)}</AppText>
            </Card>

            {detail.data.onlyMine ? (
              <Card style={{ backgroundColor: colors.cardAlt, borderColor: colors.cardAlt }}>
                <AppText variant="bodyStrong">Not on the map {a.status === 'red_zone' ? 'any more' : 'yet'}</AppText>
                <AppText variant="caption" color="muted">
                  {a.status === 'red_zone'
                    ? 'This red zone expired because nobody else reported it within 48 hours.'
                    : `It appears on the map once 3 different people report it (${a.reporterCount} of 3 so far). Only your own report is shown here.`}
                </AppText>
              </Card>
            ) : null}

            {nearby.data && nearby.data.total > 0 ? (
              <Card style={{ gap: space.xs }}>
                <AppText variant="label" color="muted">WITHIN 300 M</AppText>
                <AppText variant="bodyStrong">{nearby.data.headline}</AppText>
              </Card>
            ) : null}

            <FixSection data={detail.data} onConfirm={() => setConfirmOpen(true)} />

            <View style={{ gap: space.md }}>
              <AppText variant="label" color="muted">REPORTS ({detail.data.reports.length})</AppText>
              {detail.data.reports.map((r) => (
                <Card key={r.id} style={styles.reportRow}>
                  {r.photoUrl ? (
                    <Image source={{ uri: r.photoUrl }} style={[styles.thumb, { borderColor: colors.border }]} accessibilityLabel="Report photo" />
                  ) : (
                    <CategoryIcon category={r.category} size={56} />
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={styles.row}>
                      <AppText variant="bodyStrong">{SEVERITY[r.severity]} severity</AppText>
                      {r.isMine ? <Badge kind="verified" label="You" /> : null}
                    </View>
                    {r.note ? <AppText variant="body">{r.note}</AppText> : null}
                    <AppText variant="caption" color="muted">
                      {timeAgo(r.createdAt)}
                      {r.timing === 'now' ? ' · while it was happening' : r.timing === 'recent' ? ' · reported afterwards' : ''}
                    </AppText>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {detail.data ? <ConfirmFixSheet visible={confirmOpen} onClose={() => setConfirmOpen(false)} data={detail.data} /> : null}
    </View>
  );
}

/** Swipeable photo strip (report photos first, then fix-proof photos). */
function PhotoStrip({ data }: { data: AlertDetail }) {
  const { colors } = useTheme();
  const width = Dimensions.get('window').width;
  const photos = [
    ...data.reports.filter((r) => r.photoUrl).map((r) => ({ uri: r.photoUrl!, label: 'Report photo' })),
    ...data.fixes.items.filter((f) => f.photoUrl).map((f) => ({ uri: f.photoUrl!, label: 'Fix proof' })),
  ];
  if (!photos.length) {
    return (
      <View style={[styles.noPhoto, { backgroundColor: colors.cardAlt }]}>
        <CategoryIcon category={data.alert.category} size={56} />
        <AppText variant="caption" color="muted">No photos. Emergency reports can be sent without one.</AppText>
      </View>
    );
  }
  return (
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
      {photos.map((p, i) => (
        <View key={`${p.uri}-${i}`} style={{ width, paddingHorizontal: space.xl, paddingTop: space.lg }}>
          <Image source={{ uri: p.uri }} style={[styles.photo, { borderColor: colors.border }]} accessibilityLabel={p.label} />
          <AppText variant="caption" color="muted" style={{ marginTop: space.xs }}>{p.label} · {i + 1} of {photos.length}</AppText>
        </View>
      ))}
    </ScrollView>
  );
}

function FixSection({ data, onConfirm }: { data: AlertDetail; onConfirm: () => void }) {
  const { colors } = useTheme();
  const a = data.alert;
  const { count, needed, confirmedByMe, iAmFirstReporter, proofNeeded } = data.fixes;

  if (a.status === 'resolved') {
    return (
      <Card style={{ gap: space.sm }}>
        <Badge kind="fixed" label="Fixed" />
        <AppText variant="body">{needed} people confirmed this problem has been fixed.</AppText>
      </Card>
    );
  }
  if (data.onlyMine) return null;

  let action: React.ReactNode = <Button title="Confirm it's fixed" onPress={onConfirm} />;
  if (iAmFirstReporter) {
    action = <AppText variant="caption" color="muted">You reported this, so 3 other people need to confirm the fix.</AppText>;
  } else if (confirmedByMe) {
    action = <AppText variant="caption" color={colors.accentText}>You confirmed this fix. Thanks!</AppText>;
  }

  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.row}>
        <AppText variant="h2" style={{ flex: 1 }}>Fixed?</AppText>
        <AppText variant="bodyStrong">{count}/{needed}</AppText>
      </View>
      <View style={[styles.track, { backgroundColor: colors.cardAlt }]}>
        <View style={{ width: `${Math.min(1, count / needed) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: colors.accent }} />
      </View>
      <AppText variant="caption" color="muted">Proof needed: {proofNeeded}</AppText>
      {action}
    </Card>
  );
}

function ConfirmFixSheet({ visible, onClose, data }: { visible: boolean; onClose: () => void; data: AlertDetail }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const history = useLocationHistory();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const a = data.alert;

  async function takePhoto() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError('Allow camera access to take the proof photo.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8, exif: false });
    if (!res.canceled && res.assets[0]) setPhotoUri(res.assets[0].uri);
  }

  async function send() {
    if (!photoUri) return setError('Take a photo showing the fix.');
    setBusy(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') throw new ApiError(0, 'LOCATION', 'Turn on location so we can check you are at the spot.');
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const reporter = { lat: fix.coords.latitude, lng: fix.coords.longitude, accuracy: fix.coords.accuracy, t: fix.timestamp };
      history.add(reporter);
      if (distanceM(reporter.lat, reporter.lng, a.lat, a.lng) > allowedDistance(reporter.accuracy)) {
        throw new ApiError(403, 'TOO_FAR', 'You need to be within 300 m of the problem to confirm a fix.');
      }
      const r = await confirmFix(a.id, photoUri, note, reporter);
      setDone(r.message);
      queryClient.invalidateQueries({ queryKey: ['alert', a.id] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'reports'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    onClose();
    setTimeout(() => { setPhotoUri(null); setNote(''); setError(null); setDone(null); }, 250);
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      accessibilityLabel="Confirm it's fixed"
      header={<AppText variant="h2" accessibilityRole="header">Confirm it's fixed</AppText>}
    >
      {done ? (
        <>
          <AppText variant="h2">{done}</AppText>
          <Button title="Done" onPress={close} />
        </>
      ) : (
        <>
          <Card style={{ backgroundColor: colors.cardAlt, borderColor: colors.cardAlt, gap: space.xs }}>
            <AppText variant="label" color="muted">TAKE A PHOTO SHOWING</AppText>
            <AppText variant="bodyStrong">{data.fixes.proofNeeded}</AppText>
            <AppText variant="caption" color="muted">You need to be within 300 m of the spot.</AppText>
          </Card>
          {photoUri ? (
            <View style={{ gap: space.sm }}>
              <Image source={{ uri: photoUri }} style={[styles.photo, { borderColor: colors.border }]} accessibilityLabel="Your proof photo" />
              <Button title="Retake" variant="secondary" onPress={takePhoto} />
            </View>
          ) : (
            <Pressable onPress={takePhoto} accessibilityRole="button" accessibilityLabel="Take a photo">
              <View style={[styles.photoEmpty, { borderColor: colors.border, backgroundColor: colors.cardAlt }]}>
                <Ionicons name="camera" size={28} color={colors.textMuted} />
                <AppText variant="label" color="muted">Take a photo</AppText>
              </View>
            </Pressable>
          )}
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. New lights installed" maxLength={500} />
          {error ? <AppText variant="body" color={colors.danger}>{error}</AppText> : null}
          <Button title="Send confirmation" onPress={send} loading={busy} disabled={!photoUri} />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm, borderBottomWidth: 1 },
  iconBtn: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.card, borderWidth: 1 },
  noPhoto: { marginHorizontal: space.xl, marginTop: space.lg, height: 140, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  reportRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  thumb: { width: 56, height: 56, borderRadius: radius.input, borderWidth: 1 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  photoEmpty: { height: 140, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: space.sm },
});
