import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Circle, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { CategoryIcon, CategoryPin } from '@/components/CategoryIcon';
import { Badge, Button, Card, Field, Segmented } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { distanceM } from '@/lib/distance';
import { allowedDistance, bestRecentPoint, useLocationHistory, type TrackPoint } from '@/lib/locationHistory';
import { useStreetName } from '@/lib/streetName';
import { submitReport, type ReportResult, type ReporterLocation } from '@/lib/submitReport';
import { googleMapStyle } from '@/theme/mapStyle';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_KEYS, categories, radius, size, space, type Category } from '@/theme/tokens';

type Step = 'category' | 'timing' | 'call' | 'pin' | 'details' | 'result';
type Timing = 'now' | 'recent';

const EMERGENCY = CATEGORY_KEYS.filter((k) => categories[k].emergency);
const NORMAL = CATEGORY_KEYS.filter((k) => !categories[k].emergency);

export default function ReportScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const history = useLocationHistory();

  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<Category | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(null);
  const [recentPoint, setRecentPoint] = useState<TrackPoint | null>(null);
  const [severity, setSeverity] = useState<'1' | '2' | '3'>('2');
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);

  const emergency = category ? categories[category].emergency : false;

  function back() {
    setError(null);
    if (step === 'category' || step === 'result') return router.back();
    if (step === 'timing') return setStep('category');
    if (step === 'call') return setStep('timing');
    if (step === 'pin') return setStep(emergency ? (timing === 'now' ? 'call' : 'timing') : 'category');
    if (step === 'details') return setStep('pin');
  }

  function pickCategory(c: Category) {
    setCategory(c);
    setTiming(categories[c].emergency ? null : null);
    setStep(categories[c].emergency ? 'timing' : 'pin');
  }

  async function takePhoto() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Allow camera access to take a photo of the problem.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: false, exif: false });
    if (!res.canceled && res.assets[0]) setPhotoUri(res.assets[0].uri);
  }

  async function send() {
    if (!category || !spot) return;
    if (!emergency && !photoUri) {
      setError('Take a photo of the problem first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let reporter: ReporterLocation;
      if (timing === 'recent') {
        if (!recentPoint) throw new ApiError(0, 'TOO_FAR', 'We have no record of you near this spot in the last hour.');
        reporter = { lat: recentPoint.lat, lng: recentPoint.lng, accuracy: recentPoint.accuracy, t: recentPoint.t };
      } else {
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        reporter = { lat: fix.coords.latitude, lng: fix.coords.longitude, accuracy: fix.coords.accuracy, t: fix.timestamp };
        history.add(reporter);
        if (distanceM(reporter.lat, reporter.lng, spot.lat, spot.lng) > allowedDistance(reporter.accuracy)) {
          throw new ApiError(403, 'TOO_FAR', 'You have moved more than 300 m from the spot. Go back to the spot and try again.');
        }
      }
      const r = await submitReport({
        spot, category, severity: Number(severity) as 1 | 2 | 3, note, timing: emergency ? timing : null, photoUri, reporter,
      });
      setResult(r);
      setStep('result');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      queryClient.invalidateQueries({ queryKey: ['heatmap'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const title: Record<Step, string> = {
    category: 'What is the problem?',
    timing: 'When did it happen?',
    call: 'Call 112 first',
    pin: 'Where is it?',
    details: 'Add details',
    result: 'Report sent',
  };

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm, borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={step === 'category' || step === 'result' ? 'Close' : 'Back'} style={styles.iconBtn}>
          <Ionicons name={step === 'category' || step === 'result' ? 'close' : 'chevron-back'} size={24} color={colors.text} />
        </Pressable>
        <AppText variant="h2" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>{title[step]}</AppText>
        {category && step !== 'category' && step !== 'result' ? <CategoryIcon category={category} size={32} /> : null}
      </View>

      {step === 'category' && <CategoryStep onPick={pickCategory} />}
      {step === 'timing' && category && (
        <TimingStep
          onPick={(t) => {
            setTiming(t);
            setStep(t === 'now' ? 'call' : 'pin');
          }}
        />
      )}
      {step === 'call' && <CallStep onContinue={() => setStep('pin')} />}
      {step === 'pin' && category && (
        <PinStep
          category={category}
          recent={timing === 'recent'}
          historyPoints={history.points}
          onConfirm={(p, rp) => {
            setSpot(p);
            setRecentPoint(rp);
            setStep('details');
          }}
        />
      )}
      {step === 'details' && category && spot && (
        <DetailsStep
          category={category}
          spot={spot}
          severity={severity}
          setSeverity={setSeverity}
          note={note}
          setNote={setNote}
          photoUri={photoUri}
          photoRequired={!emergency}
          onTakePhoto={takePhoto}
          onRemovePhoto={() => setPhotoUri(null)}
          onSend={send}
          busy={busy}
          error={error}
        />
      )}
      {step === 'result' && result && <ResultStep result={result} onDone={() => router.back()} />}
    </View>
  );
}

// ---------------- Step 1: category ----------------
function CategoryStep({ onPick }: { onPick: (c: Category) => void }) {
  const insets = useSafeAreaInsets();
  const group = (title: string, keys: readonly Category[], hint?: string) => (
    <View style={{ gap: space.md }}>
      <View>
        <AppText variant="label" color="muted">{title}</AppText>
        {hint ? <AppText variant="caption" color="muted">{hint}</AppText> : null}
      </View>
      <View style={styles.grid}>
        {keys.map((k) => <CategoryTile key={k} category={k} onPress={() => onPick(k)} />)}
      </View>
    </View>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxl, gap: space.xxl }}>
      {group('EMERGENCIES', EMERGENCY, 'Shows on the map at once. Photo optional.')}
      {group('OTHER PROBLEMS', NORMAL, 'Needs a photo. Appears on the map once 3 people report it.')}
    </ScrollView>
  );
}

function CategoryTile({ category, onPress }: { category: Category; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={categories[category].label}
      style={({ pressed }) => [styles.tile, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <CategoryIcon category={category} size={40} />
      <AppText variant="bodyStrong" numberOfLines={2}>{categories[category].label}</AppText>
    </Pressable>
  );
}

// ---------------- Step 2: happening now / recently ----------------
function TimingStep({ onPick }: { onPick: (t: Timing) => void }) {
  const option = (t: Timing, icon: React.ComponentProps<typeof Ionicons>['name'], title: string, body: string) => (
    <ChoiceCard key={t} icon={icon} title={title} body={body} onPress={() => onPick(t)} />
  );
  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
      {option('now', 'alert-circle', 'Happening now', "You'll be asked to call 112 first, then report it.")}
      {option('recent', 'time', 'Happened in the last hour', "Report it now that you're somewhere safe. You must have been near the spot in the last hour.")}
    </ScrollView>
  );
}

function ChoiceCard({ icon, title, body, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={body}>
      {({ pressed }) => (
        <Card style={[styles.choice, { opacity: pressed ? 0.85 : 1 }]}>
          <Ionicons name={icon} size={26} color={colors.text} />
          <View style={{ flex: 1, gap: space.xs }}>
            <AppText variant="h2">{title}</AppText>
            <AppText variant="body" color="muted">{body}</AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Card>
      )}
    </Pressable>
  );
}

// ---------------- Step 3: call 112 (happening now) ----------------
function CallStep({ onContinue }: { onContinue: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [called, setCalled] = useState(false);
  const street = useStreetName(here, 0);

  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }))
      .catch(() => {});
  }, []);

  async function call() {
    setCalled(true);
    try {
      await Linking.openURL('tel:112');
    } catch {
      /* dialer unavailable: the user can still dial manually */
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxl, gap: space.lg }}>
      <Card style={{ gap: space.md, borderColor: colors.sos }}>
        <AppText variant="h1">If you are in danger, call 112 now.</AppText>
        <AppText variant="body" color="muted">Reports in this app are not sent to 112.</AppText>
        <View style={[styles.addressBox, { backgroundColor: colors.cardAlt }]}>
          <AppText variant="label" color="muted">TELL THE OPERATOR YOU ARE AT</AppText>
          {street.name ? (
            <AppText variant="h2" selectable>{street.name}</AppText>
          ) : here ? (
            <AppText variant="bodyStrong" selectable>{here.lat.toFixed(5)}, {here.lng.toFixed(5)}</AppText>
          ) : (
            <AppText variant="body" color="muted">Finding your location…</AppText>
          )}
        </View>
        <Button title="Call 112" variant="danger" onPress={call} />
      </Card>
      <Button title={called ? 'Continue report' : 'Tap Call 112 first'} variant="secondary" disabled={!called} onPress={onContinue} />
    </ScrollView>
  );
}

// ---------------- Step 4: place the pin (fixed centre crosshair) ----------------
function PinStep({ category, recent, historyPoints, onConfirm }: {
  category: Category;
  recent: boolean;
  historyPoints: () => TrackPoint[];
  onConfirm: (spot: { lat: number; lng: number }, recentPoint: TrackPoint | null) => void;
}) {
  const { colors, zones, scheme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<TrackPoint | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const track = useMemo(() => (recent ? historyPoints() : []), [recent, historyPoints]);
  const mapStyle = useMemo(() => googleMapStyle(scheme), [scheme]);
  const street = useStreetName(center);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLocError('Turn on location so we can check you are near the problem.');
        return;
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const pt = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, t: p.timestamp };
      setMe(pt);
      setCenter({ lat: pt.lat, lng: pt.lng });
    })().catch(() => setLocError("Couldn't get your location. Try again outside or near a window."));
  }, []);

  const candidates = recent ? [...track, ...(me ? [me] : [])] : [];
  const recentMatch = center && recent ? bestRecentPoint(candidates, center) : null;
  const nearNow = center && me && !recent ? distanceM(me.lat, me.lng, center.lat, center.lng) <= allowedDistance(me.accuracy) : false;
  const valid = recent ? recentMatch !== null : nearNow;

  if (locError) {
    return (
      <View style={[styles.fill, { padding: space.xl, justifyContent: 'center', gap: space.lg }]}>
        <AppText variant="h2">{locError}</AppText>
        <Button title="Open settings" onPress={() => Linking.openSettings()} />
      </View>
    );
  }
  if (!me) {
    return (
      <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center', gap: space.md }]}>
        <ActivityIndicator color={colors.textMuted} />
        <AppText variant="body" color="muted">Finding your location…</AppText>
      </View>
    );
  }

  const onRegion = (r: Region) => setCenter({ lat: r.latitude, lng: r.longitude });
  // For "recent" reports, draw a few of the places you were in the last hour.
  const trail = recent ? candidates.filter((_, i) => i % Math.max(1, Math.ceil(candidates.length / 25)) === 0) : [];

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={styles.fill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={Platform.OS === 'android' ? mapStyle : undefined}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        initialRegion={{ latitude: me.lat, longitude: me.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
        onRegionChangeComplete={onRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {recent
          ? trail.map((p, i) => (
              <Circle key={`${p.t}-${i}`} center={{ latitude: p.lat, longitude: p.lng }} radius={allowedDistance(p.accuracy)} strokeWidth={0} fillColor="rgba(34, 197, 94, 0.08)" />
            ))
          : (
            <Circle center={{ latitude: me.lat, longitude: me.lng }} radius={allowedDistance(me.accuracy)} strokeWidth={1.5} strokeColor={valid ? colors.accent : zones.red} fillColor="rgba(34, 197, 94, 0.08)" />
          )}
      </MapView>

      {/* Fixed centre crosshair: drag the map under the pin */}
      <View pointerEvents="none" style={styles.crosshair}>
        <View style={{ alignItems: 'center', transform: [{ translateY: -24 }] }}>
          <CategoryPin category={category} size={40} />
          <View style={[styles.stem, { backgroundColor: colors.text }]} />
          <View style={[styles.dot, { backgroundColor: colors.text }]} />
        </View>
      </View>

      <View style={[styles.pinCard, { paddingBottom: insets.bottom + space.lg }]}>
        <Card style={{ gap: space.md }}>
          <AppText variant="label" color="muted">DRAG THE MAP TO PUT THE PIN ON THE PROBLEM</AppText>
          <AppText variant="h2" numberOfLines={2}>{street.loading && !street.name ? 'Finding street name…' : street.name ?? 'Unnamed road'}</AppText>
          {!valid ? (
            <AppText variant="caption" color={colors.danger}>
              {recent ? "You weren't near this spot in the last hour. Move the pin closer to where you were." : 'Move closer: the pin must be within 300 m of you.'}
            </AppText>
          ) : (
            <AppText variant="caption" color="muted">{recent ? 'You were near here in the last hour.' : 'Within 300 m of you.'}</AppText>
          )}
          <Button title="Use this spot" disabled={!valid || !center} onPress={() => center && onConfirm(center, recent ? recentMatch : null)} />
        </Card>
      </View>
    </View>
  );
}

// ---------------- Step 5: details + photo ----------------
function DetailsStep(p: {
  category: Category;
  spot: { lat: number; lng: number };
  severity: '1' | '2' | '3';
  setSeverity: (s: '1' | '2' | '3') => void;
  note: string;
  setNote: (n: string) => void;
  photoUri: string | null;
  photoRequired: boolean;
  onTakePhoto: () => void;
  onRemovePhoto: () => void;
  onSend: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const street = useStreetName(p.spot, 0);
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxl, gap: space.lg }}>
        <Card style={styles.choice}>
          <CategoryIcon category={p.category} size={40} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{categories[p.category].label}</AppText>
            <AppText variant="caption" color="muted" numberOfLines={2}>{street.name ?? 'Selected spot'}</AppText>
          </View>
        </Card>

        <View style={{ gap: space.sm }}>
          <AppText variant="label" color="muted">How serious is it?</AppText>
          <Segmented<'1' | '2' | '3'>
            accessibilityLabel="Severity"
            value={p.severity}
            onChange={p.setSeverity}
            options={[{ value: '1', label: 'Low' }, { value: '2', label: 'Medium' }, { value: '3', label: 'High' }]}
          />
        </View>

        <Field
          label="What's wrong? (optional)"
          value={p.note}
          onChangeText={p.setNote}
          placeholder="e.g. Garbage dumped next to the bus stop"
          multiline
          maxLength={500}
          style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: space.md }}
        />

        <View style={{ gap: space.sm }}>
          <AppText variant="label" color="muted">Photo {p.photoRequired ? '(required, taken now)' : '(optional)'}</AppText>
          {p.photoUri ? (
            <View style={{ gap: space.sm }}>
              <Image source={{ uri: p.photoUri }} style={[styles.photo, { borderColor: colors.border }]} accessibilityLabel="Your photo" />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}><Button title="Retake" variant="secondary" onPress={p.onTakePhoto} /></View>
                <View style={{ flex: 1 }}><Button title="Remove" variant="secondary" onPress={p.onRemovePhoto} /></View>
              </View>
            </View>
          ) : (
            <Pressable onPress={p.onTakePhoto} accessibilityRole="button" accessibilityLabel="Take a photo">
              {({ pressed }) => (
                <View style={[styles.photoEmpty, { borderColor: colors.border, backgroundColor: colors.cardAlt, opacity: pressed ? 0.8 : 1 }]}>
                  <Ionicons name="camera" size={28} color={colors.textMuted} />
                  <AppText variant="label" color="muted">Take a photo</AppText>
                </View>
              )}
            </Pressable>
          )}
        </View>

        {p.error ? (
          <Card style={{ borderColor: colors.danger }}>
            <AppText variant="body" color={colors.danger}>{p.error}</AppText>
          </Card>
        ) : null}

        <Button title="Send report" onPress={p.onSend} loading={p.busy} disabled={p.photoRequired && !p.photoUri} />
        {p.photoRequired && !p.photoUri ? <AppText variant="caption" color="muted" style={{ textAlign: 'center' }}>Take a photo to send this report.</AppText> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------- Step 6: result ----------------
function ResultStep({ result, onDone }: { result: ReportResult; onDone: () => void }) {
  const { colors } = useTheme();
  const badge =
    result.status === 'red_zone' ? { kind: 'redZone' as const, label: 'Red zone' }
      : result.status === 'grey_zone' ? { kind: 'redZone' as const, label: 'Incident area' }
        : result.status === 'verified' ? { kind: 'verified' as const, label: 'On the map' }
          : { kind: 'pending' as const, label: `${result.reporterCount} of 3 reports` };
  return (
    <View style={{ flex: 1, padding: space.xl, justifyContent: 'center', gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.lg }}>
        <View style={[styles.doneIcon, { backgroundColor: colors.cardAlt }]}>
          <Ionicons name="checkmark" size={40} color={colors.accentText} />
        </View>
        <Badge kind={badge.kind} label={badge.label} style={{ alignSelf: 'center' }} />
        <AppText variant="h1" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{result.message}</AppText>
      </View>
      <Button title="Back to map" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm, borderBottomWidth: 1 },
  iconBtn: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { width: '47%', flexGrow: 1, minHeight: 104, borderRadius: radius.card, borderWidth: 1, padding: space.lg, gap: space.md },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  addressBox: { borderRadius: radius.input, padding: space.md, gap: space.xs },
  crosshair: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  stem: { width: 2, height: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: -1 },
  pinCard: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.card, borderWidth: 1 },
  photoEmpty: { height: 140, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  doneIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
});
