import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { isBatteryOptimized, manufacturerTip, openBatterySettings, requestBatteryExemption } from '../battery';
import { openAppSettings } from '../permissions';
import { colors, radius, space, type } from '../theme';
import { BigButton, Body, Brand, Notice, Screen, Title } from '../ui';

export function BatteryScreen({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [exempt, setExempt] = useState(false);
  const [tried, setTried] = useState(false);
  const tip = manufacturerTip();

  // Rider may change it in Settings and come back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s === 'active') setExempt(!(await isBatteryOptimized()));
    });
    return () => sub.remove();
  }, []);

  async function allow() {
    setBusy(true);
    try {
      const ok = await requestBatteryExemption();
      setExempt(ok);
      setTried(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        exempt ? (
          <BigButton label="Continue" onPress={onDone} />
        ) : (
          <>
            <BigButton label="Let Track run in background" loading={busy} onPress={allow} />
            {tried ? (
              <BigButton label="Open battery settings" variant="secondary" onPress={openBatterySettings} />
            ) : null}
            <BigButton label="Not now" variant="ghost" onPress={onDone} />
          </>
        )
      }
    >
      <Brand />
      <View style={{ height: space.md }} />
      <Title>Stop your phone from pausing Track</Title>
      <Body>
        To save battery, many phones switch off apps running in the background. If that happens, your pin freezes
        on the customer's map.
      </Body>
      <View style={s.card}>
        <Text style={s.cardText}>
          Tap the yellow button, then choose <Text style={s.strong}>Allow</Text>.
        </Text>
        <Text style={s.cardSmall}>Track only uses GPS while you're delivering, so battery use stays low.</Text>
      </View>

      {exempt ? <Notice tone="ok">Done. Track can keep sharing your location in the background.</Notice> : null}
      {!exempt && tried ? (
        <Notice>
          Not allowed yet. Tap Open battery settings → All apps → Track Rider → Don't optimise.
        </Notice>
      ) : null}

      {tip ? (
        <View style={s.tip}>
          <Text style={s.tipLabel}>ALSO ON YOUR PHONE</Text>
          <Text style={s.tipText}>{tip}</Text>
          <BigButton label="Open Track settings" variant="secondary" onPress={openAppSettings} style={{ marginTop: space.sm }} />
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  strong: { fontWeight: '900', color: colors.ink },
  card: {
    backgroundColor: colors.card,
    borderLeftWidth: 6,
    borderLeftColor: colors.yellow,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.xs,
  },
  cardText: { fontSize: type.heading - 3, fontWeight: '800', color: colors.ink, lineHeight: 29 },
  cardSmall: { fontSize: type.small, color: colors.inkMuted, lineHeight: 22 },
  tip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.xs,
  },
  tipLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 2, color: colors.inkMuted },
  tipText: { fontSize: type.small + 1, color: colors.ink, lineHeight: 24 },
});
