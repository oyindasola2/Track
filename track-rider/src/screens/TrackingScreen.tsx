import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import * as IntentLauncher from 'expo-intent-launcher';
import NetInfo from '@react-native-community/netinfo';
import { errCode, postFn } from '../api';
import type { RiderLink } from '../link';
import { getPermissionState } from '../permissions';
import {
  flush,
  getTrackState,
  isTrackingActive,
  onTrackingStopped,
  sampleNow,
  startTracking,
  stopTracking,
  TrackState,
} from '../tracking';
import { colors, radius, space, type } from '../theme';
import { shortCode } from '../format';
import { BigButton, Body, Brand, Notice, Screen, Title } from '../ui';

type Order = {
  id: string;
  tracking_number: string;
  status: string;
  item_name: string;
  buyer_name: string;
  buyer_phone: string;
  pickup_address: string;
  delivery_address: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  started_at?: string | null;
  delivered_at?: string | null;
};

const STARTED = ['picked_up', 'out_for_delivery', 'in_transit', 'on_the_way', 'started'];
const isDelivered = (o: Order) => o.status === 'delivered' || !!o.delivered_at;
const isStarted = (o: Order) => isDelivered(o) || STARTED.includes(o.status) || !!o.started_at;

function statusLabel(o: Order) {
  if (isDelivered(o)) return 'Delivered';
  if (o.status === 'picked_up') return 'Picked up';
  if (o.status === 'out_for_delivery' || o.status === 'in_transit' || o.status === 'on_the_way')
    return 'On the way';
  if (isStarted(o)) return 'In progress';
  return 'Waiting to start';
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const GPS_FAIL = "Couldn't get your location. Check that GPS is on, then try again.";

async function freshFix() {
  const fix = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('gps_timeout')), 25000)),
  ]);
  return { lat: fix.coords.latitude, lng: fix.coords.longitude };
}

function navigate(o: Order) {
  const url =
    o.delivery_lat != null && o.delivery_lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${o.delivery_lat},${o.delivery_lng}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.delivery_address)}`;
  Linking.openURL(url).catch(() => {});
}

type Props = {
  link: RiderLink;
  message?: string | null;
  onChangeLink: () => void;
  onNeedPermissions: () => void;
};

export function TrackingScreen({ link, message, onChangeLink, onNeedPermissions }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Order | null>(null);
  const [tracking, setTracking] = useState(false);
  const [ts, setTs] = useState<TrackState>({ queued: 0, lastSent: null, issue: null, stop: null });
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(true);
  const [gpsOn, setGpsOn] = useState(true);
  const ordersRef = useRef<Order[]>([]);
  ordersRef.current = orders;

  const isTrip = orders.length > 1;
  const allDelivered = orders.length > 0 && orders.every(isDelivered);
  const anyActive = orders.some((o) => isStarted(o) && !isDelivered(o));
  const anyPending = orders.some((o) => !isStarted(o));

  // ---------- load the order or trip ----------
  const load = useCallback(async () => {
    const r = await postFn('rider-order', { tracking_number: link.code, rider_token: link.key });
    if (r.status === 401) {
      setFatal('This rider link is no longer valid');
      await stopTracking('invalid_link');
      setLoaded(true);
      return;
    }
    if (r.status !== 200 || !r.json) {
      setLoadError(
        r.status === 0
          ? 'No internet. Connect and try again.'
          : "Couldn't load the order. Try again in a moment.",
      );
      setLoaded(true);
      return;
    }
    setLoadError(null);
    setFatal(null);
    const list: Order[] = Array.isArray(r.json.trip) && r.json.trip.length ? r.json.trip : [r.json.order];
    const clean = list.filter(Boolean);
    setOrders(clean);
    setLoaded(true);

    const active = await isTrackingActive();
    const done = clean.length > 0 && clean.every(isDelivered);
    if (done && active) {
      await stopTracking('delivered');
    } else if (!done && !active && clean.some((o) => isStarted(o) && !isDelivered(o))) {
      // Phone restarted or the service was killed mid-delivery: pick tracking back up.
      const perms = await getPermissionState();
      if (perms.ready) {
        await startTracking({ code: link.code, key: link.key, trip: clean.length > 1 }).catch(() => {});
      }
    }
  }, [link.code, link.key]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  // ---------- live status: last sent, GPS, internet ----------
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const [state, active, gps] = await Promise.all([
        getTrackState(),
        isTrackingActive(),
        Location.hasServicesEnabledAsync().catch(() => true),
      ]);
      if (!alive) return;
      setTs(state);
      setTracking(active);
      setGpsOn(gps);
    };
    poll();
    const poller = setInterval(poll, 2000);
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    const net = NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false));
    const stopSub = onTrackingStopped(() => poll());
    return () => {
      alive = false;
      clearInterval(poller);
      clearInterval(ticker);
      net();
      stopSub();
    };
  }, []);

  // Heartbeat: the background task only fires when the rider moves 15 m. While the app is open and
  // the rider is standing still, take a position now so the pin and "Last sent" stay fresh.
  useEffect(() => {
    if (!tracking) return;
    const t = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      const last = ts.lastSent ?? 0;
      if (Date.now() - last > 40000) sampleNow();
    }, 20000);
    return () => clearInterval(t);
  }, [tracking, ts.lastSent]);

  // ---------- status calls ----------
  async function sendStatus(
    status: 'picked_up' | 'out_for_delivery' | 'delivered',
    o: Order,
    pos: { lat: number; lng: number },
  ) {
    const body: Record<string, unknown> = {
      code: link.code,
      rider_key: link.key,
      status,
      lat: pos.lat,
      lng: pos.lng,
    };
    if (isTrip) body.order_id = o.id;
    const r = await postFn('rider-status', body);
    return { ...r, wrongStep: r.status === 409 && errCode(r.json) === 'wrong_step' };
  }

  function failMessage(r: { status: number; wrongStep: boolean }) {
    if (r.status === 401) return 'This rider link is no longer valid.';
    if (r.wrongStep) return 'Complete the current delivery step first.';
    if (r.status === 0) return 'No internet. Nothing was saved. Try again when you are online.';
    return 'That did not save. Please try again.';
  }

  async function startDelivery() {
    setBanner(null);
    setBusy(true);
    try {
      const perms = await getPermissionState();
      if (!perms.ready) return onNeedPermissions();
      let pos: { lat: number; lng: number };
      try {
        pos = await freshFix();
      } catch {
        return setBanner(GPS_FAIL);
      }
      for (const o of ordersRef.current.filter((x) => !isStarted(x))) {
        const r = await sendStatus('picked_up', o, pos);
        if (r.status === 401) {
          setFatal('This rider link is no longer valid');
          return;
        }
        if (r.status !== 200) return setBanner(failMessage(r));
        // Moves the order to "on the way". Sends no customer message, so a failure here is not fatal.
        await sendStatus('out_for_delivery', o, pos);
      }
      // Status saved on the server first, THEN background tracking starts.
      await startTracking({ code: link.code, key: link.key, trip: ordersRef.current.length > 1 });
      await load();
    } catch {
      setBanner('Could not start tracking. Check location permission and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function markDelivered(o: Order) {
    setConfirm(null);
    setBanner(null);
    setBusy(true);
    try {
      let pos: { lat: number; lng: number } | null = null;
      try {
        pos = await freshFix();
      } catch {
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last) pos = { lat: last.coords.latitude, lng: last.coords.longitude };
      }
      if (!pos) return setBanner(GPS_FAIL);

      await flush(true); // get queued points to the customer's map before closing the order
      let r = await sendStatus('delivered', o, pos);
      if (r.wrongStep) {
        await sendStatus('out_for_delivery', o, pos);
        r = await sendStatus('delivered', o, pos);
      }
      if (r.status === 401) {
        setFatal('This rider link is no longer valid');
        return;
      }
      if (r.status !== 200) return setBanner(failMessage(r));
      await load(); // stops tracking once every order is delivered
    } finally {
      setBusy(false);
    }
  }

  // ---------- render ----------
  const brand = (
    <>
      <Brand />
      <View style={{ height: space.sm }} />
    </>
  );

  if (!loaded) {
    return (
      <Screen>
        {brand}
        <Title>Loading your order…</Title>
      </Screen>
    );
  }

  if (fatal) {
    return (
      <Screen footer={<BigButton label="Use a different link" onPress={onChangeLink} />}>
        {brand}
        <Notice tone="danger">{fatal}</Notice>
        <Body muted>Ask your seller to send the rider link again.</Body>
      </Screen>
    );
  }

  if (!orders.length) {
    return (
      <Screen
        footer={
          <>
            <BigButton label="Try again" onPress={load} />
            <BigButton label="Use a different link" variant="ghost" onPress={onChangeLink} />
          </>
        }
      >
        {brand}
        <Notice tone="danger">{loadError ?? "Couldn't load the order."}</Notice>
      </Screen>
    );
  }

  const lastSentText = ts.lastSent ? `Last sent ${ago(now - ts.lastSent)} ago` : 'Nothing sent yet';
  const stale = tracking && ts.lastSent != null && now - ts.lastSent > 60000;

  const footer = (
    <>
      {anyPending && (
        <BigButton
          label={isTrip ? 'Start all deliveries' : 'Start delivery'}
          onPress={startDelivery}
          loading={busy}
          disabled={!gpsOn}
        />
      )}
      {!anyPending && anyActive && !isTrip && (
        <BigButton
          label="Delivered"
          onPress={() => setConfirm(orders.find((o) => !isDelivered(o)) ?? orders[0])}
          loading={busy}
        />
      )}
      <BigButton
        label="Use a different link"
        variant={anyPending || anyActive ? 'ghost' : 'primary'}
        onPress={onChangeLink}
      />
    </>
  );

  return (
    <>
      <Screen footer={footer}>
        {brand}

        {message ? <Notice>{message}</Notice> : null}
        {banner ? <Notice tone="danger">{banner}</Notice> : null}
        {loadError ? <Notice>{loadError}</Notice> : null}

        {!gpsOn && (
          <View style={{ gap: space.sm }}>
            <Notice tone="danger">
              Location is OFF. The customer cannot see you. Turn on location (GPS).
            </Notice>
            <BigButton
              label="Turn on location"
              variant="secondary"
              onPress={() =>
                IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS).catch(() =>
                  Linking.openSettings(),
                )
              }
            />
          </View>
        )}
        {!online && (
          <Notice tone="danger">
            No internet. Your location is saved on this phone and will be sent when you are back online
            {ts.queued ? ` (${ts.queued} waiting).` : '.'}
          </Notice>
        )}
        {online && ts.issue === 'rate_limited' && <Notice>Server is busy. Retrying shortly.</Notice>}
        {online && ts.issue === 'server' && <Notice>Server problem. Your location is saved and will be retried.</Notice>}
        {stale && online && gpsOn && ts.issue == null && (
          <Notice>Nothing sent for over a minute. Move your phone or open the app to refresh.</Notice>
        )}

        {allDelivered ? (
          <Notice tone="ok">
            {isTrip ? 'All orders delivered.' : 'Delivered.'} Location sharing has stopped. Thank you!
          </Notice>
        ) : (
          <View style={[s.statusCard, tracking ? s.statusOn : s.statusOff]}>
            <Text style={s.statusTitle}>{tracking ? '● Sharing your location' : 'Not sharing location'}</Text>
            <Text style={s.statusSub}>
              {tracking ? lastSentText : anyPending ? 'Tap Start delivery to begin.' : 'Tracking is paused.'}
              {tracking && ts.queued > 0 ? `  ·  ${ts.queued} waiting` : ''}
            </Text>
          </View>
        )}

        {isTrip && !allDelivered && (
          <Body muted>
            {orders.filter(isDelivered).length} of {orders.length} delivered
          </Body>
        )}

        {orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            showDeliver={isTrip && isStarted(o) && !isDelivered(o) && !anyPending}
            busy={busy}
            onDeliver={() => setConfirm(o)}
          />
        ))}

        {tracking && (
          <Pressable onPress={() => Linking.openSettings()}>
            <Text style={s.hint}>
              Tracking stops on some phones? Tap here, open Battery and choose "Unrestricted".
            </Text>
          </Pressable>
        )}
      </Screen>

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={s.backdrop}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Mark as delivered?</Text>
            {confirm && (
              <Text style={s.dialogBody}>
                {confirm.item_name} (#{shortCode(confirm.tracking_number)}) for {confirm.buyer_name}. The customer will get a WhatsApp
                message.
              </Text>
            )}
            <BigButton label="Yes, delivered" onPress={() => confirm && markDelivered(confirm)} />
            <BigButton label="Not yet" variant="secondary" onPress={() => setConfirm(null)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function OrderCard({
  order: o,
  showDeliver,
  busy,
  onDeliver,
}: {
  order: Order;
  showDeliver: boolean;
  busy: boolean;
  onDeliver: () => void;
}) {
  const done = isDelivered(o);
  return (
    <View style={[s.card, done && { opacity: 0.65 }]}>
      <Text style={s.item}>{o.item_name}</Text>
      <View style={[s.chip, done && { backgroundColor: colors.okBg }]}>
        <Text style={[s.chipText, done && { color: colors.ok }]}>{statusLabel(o)}</Text>
      </View>
      <Text style={s.code}>Order #{shortCode(o.tracking_number)}</Text>

      <Text style={s.label}>CUSTOMER</Text>
      <Text style={s.value}>{o.buyer_name}</Text>

      <Text style={s.label}>PICKUP</Text>
      <Text style={s.value}>{o.pickup_address}</Text>

      <Text style={s.label}>DELIVER TO</Text>
      <Text style={s.value}>{o.delivery_address}</Text>

      {!done && (
        <View style={s.row}>
          <BigButton
            label="Call customer"
            variant="secondary"
            style={s.half}
            onPress={() => Linking.openURL(`tel:${o.buyer_phone}`).catch(() => {})}
          />
          <BigButton label="Navigate" variant="secondary" style={s.half} onPress={() => navigate(o)} />
        </View>
      )}
      {showDeliver && <BigButton label="Delivered" onPress={onDeliver} disabled={busy} style={{ marginTop: space.sm }} />}
    </View>
  );
}

const s = StyleSheet.create({
  statusCard: { borderRadius: radius.card, padding: space.md, gap: 4 },
  statusOn: { backgroundColor: colors.okBg },
  statusOff: { backgroundColor: colors.creamDeep },
  statusTitle: { fontSize: type.heading - 2, fontWeight: '900', color: colors.ink },
  statusSub: { fontSize: type.body, fontWeight: '700', color: colors.inkSoft },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: 2,
  },
  code: { fontSize: type.small + 1, fontWeight: '800', color: colors.inkMuted, marginTop: 8 },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warnBg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  chipText: { fontSize: type.small, fontWeight: '800', color: colors.ink },
  item: { fontSize: type.heading, fontWeight: '900', color: colors.ink, lineHeight: 30 },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 2, color: colors.inkMuted, marginTop: space.md },
  value: { fontSize: type.body, color: colors.ink, lineHeight: 26 },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  half: { flex: 1, paddingHorizontal: space.sm },
  hint: { fontSize: type.small, color: colors.inkMuted, textAlign: 'center', marginTop: space.sm, textDecorationLine: 'underline' },
  backdrop: { flex: 1, backgroundColor: 'rgba(27,26,23,0.55)', justifyContent: 'flex-end', padding: space.md },
  dialog: { backgroundColor: colors.cream, borderRadius: radius.card, padding: space.lg, gap: space.sm },
  dialogTitle: { fontSize: type.title, fontWeight: '900', color: colors.ink },
  dialogBody: { fontSize: type.body, color: colors.inkSoft, lineHeight: 27, marginBottom: space.sm },
});
