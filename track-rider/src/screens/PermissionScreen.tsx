import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  getPermissionState,
  openAppSettings,
  PermissionState,
  requestBackground,
  requestForeground,
  requestNotifications,
} from '../permissions';
import { colors, radius, space, type } from '../theme';
import { BigButton, Body, Brand, Notice, Screen, StepDots, Title } from '../ui';

type Step = 'intro' | 'foreground' | 'precise' | 'background' | 'notifications';
const ORDER: Step[] = ['intro', 'foreground', 'precise', 'background', 'notifications'];

/** First thing still missing, or null when the walkthrough is complete. */
function nextStep(p: PermissionState, notificationsHandled: boolean): Step | null {
  if (!p.foreground) return 'foreground';
  if (!p.precise) return 'precise';
  if (!p.background) return 'background';
  if (!p.notifications && !notificationsHandled) return 'notifications';
  return null;
}

export function PermissionScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step | null>(null);
  const [perm, setPerm] = useState<PermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const notifHandled = useRef(false);
  const stepRef = useRef<Step | null>(null);
  stepRef.current = step;

  const advance = useCallback(
    (p: PermissionState) => {
      setPerm(p);
      const n = nextStep(p, notifHandled.current);
      if (!n) return onDone();
      if (n !== stepRef.current) setRefused(false);
      setStep(n);
    },
    [onDone],
  );

  useEffect(() => {
    getPermissionState().then((p) => {
      setPerm(p);
      // Show the explanation first if the rider hasn't granted anything yet.
      if (!p.foreground) setStep('intro');
      else advance(p);
    });
  }, [advance]);

  // Coming back from Android Settings: re-check and move on automatically.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active' || stepRef.current === 'intro' || stepRef.current === null) return;
      advance(await getPermissionState());
    });
    return () => sub.remove();
  }, [advance]);

  async function run(fn: () => Promise<PermissionState>) {
    setBusy(true);
    try {
      const before = stepRef.current;
      const p = await fn();
      const n = nextStep(p, notifHandled.current);
      if (n === before) setRefused(true);
      advance(p);
    } finally {
      setBusy(false);
    }
  }

  if (!step || !perm) return <Screen><Brand /></Screen>;

  const dots = <StepDots total={ORDER.length} current={ORDER.indexOf(step)} />;

  if (step === 'intro') {
    return (
      <Screen footer={<BigButton label="Continue" onPress={() => setStep('foreground')} />}>
        <Brand />
        {dots}
        <Title>Before your first delivery</Title>
        <View style={s.quote}>
          <Text style={s.quoteText}>
            Track shares your location only while you're delivering, so the customer can see their order coming.
          </Text>
        </View>
        <Body>Sharing starts when you tap Start delivery and stops by itself when you tap Delivered.</Body>
        <Body muted>Next, Android will ask a few questions. It takes about 30 seconds.</Body>
      </Screen>
    );
  }

  if (step === 'foreground') {
    const blocked = refused && !perm.canAskForeground;
    return (
      <Screen
        footer={
          blocked ? (
            <BigButton label="Open settings" onPress={openAppSettings} />
          ) : (
            <BigButton label="Allow location" loading={busy} onPress={() => run(requestForeground)} />
          )
        }
      >
        <Brand />
        {dots}
        <Title>Allow location</Title>
        <Body>
          When Android asks, choose <Text style={s.strong}>While using the app</Text> and keep{' '}
          <Text style={s.strong}>Precise</Text> switched on.
        </Body>
        {refused ? (
          <Notice tone="danger">
            {blocked
              ? 'Location is turned off for Track. Tap Open settings → Permissions → Location → Allow.'
              : "Without location, the customer can't see you coming. Tap Allow location to try again."}
          </Notice>
        ) : null}
      </Screen>
    );
  }

  if (step === 'precise') {
    return (
      <Screen footer={<BigButton label="Open settings" onPress={openAppSettings} />}>
        <Brand />
        {dots}
        <Title>Turn on precise location</Title>
        <Body>
          Track only has your approximate location, so the customer's map would be off by up to 3 km.
        </Body>
        <Body>
          Tap Open settings → <Text style={s.strong}>Permissions → Location</Text> → switch on{' '}
          <Text style={s.strong}>Use precise location</Text>, then come back.
        </Body>
      </Screen>
    );
  }

  if (step === 'background') {
    return (
      <Screen
        footer={
          <>
            <BigButton
              label={refused ? 'Try again' : 'Allow all the time'}
              loading={busy}
              onPress={() => run(requestBackground)}
            />
            {refused ? <BigButton label="Open settings" variant="secondary" onPress={openAppSettings} /> : null}
          </>
        }
      >
        <Brand />
        {dots}
        <Title>Keep sharing when your screen is locked</Title>
        <Body>
          On the next screen, choose <Text style={s.strong}>Allow all the time</Text>, then press Back.
        </Body>
        <Body muted>
          This lets the customer's map keep moving while your phone is in your pocket or you're using WhatsApp or
          Maps. Track still only shares during a delivery.
        </Body>
        {refused ? (
          <Notice tone="danger">
            "Allow all the time" is not selected yet. Without it, your pin freezes as soon as you lock the screen.
            Open settings → Permissions → Location → Allow all the time.
          </Notice>
        ) : null}
      </Screen>
    );
  }

  // notifications
  return (
    <Screen
      footer={
        <>
          <BigButton
            label={refused ? 'Open settings' : 'Allow notifications'}
            loading={busy}
            onPress={() => (refused ? openAppSettings() : run(requestNotifications))}
          />
          <BigButton
            label="Not now"
            variant="ghost"
            onPress={() => {
              notifHandled.current = true;
              advance(perm);
            }}
          />
        </>
      }
    >
      <Brand />
      {dots}
      <Title>Show the tracking notification</Title>
      <Body>
        While you deliver, Track shows a notification: <Text style={s.strong}>"Track is sharing your location"</Text>.
        It's how you know sharing is on, and it keeps Android from stopping it.
      </Body>
      {refused ? (
        <Notice>Notifications are off. Tap Open settings → Notifications → On.</Notice>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  strong: { fontWeight: '900', color: colors.ink },
  quote: {
    backgroundColor: colors.card,
    borderLeftWidth: 6,
    borderLeftColor: colors.yellow,
    borderRadius: radius.card,
    padding: space.lg,
  },
  quoteText: { fontSize: type.heading - 2, fontWeight: '800', color: colors.ink, lineHeight: 31 },
});
