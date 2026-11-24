import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  clearRiderLink,
  loadRiderLink,
  parseErrorMessage,
  parseRiderLink,
  RiderLink,
  saveRiderLink,
} from './src/link';
import { getPermissionState } from './src/permissions';
import { needsBatteryPrompt, rememberBatteryPromptSeen } from './src/battery';
import { getSession, isTrackingActive, stopTracking } from './src/tracking';
import { LinkEntryScreen } from './src/screens/LinkEntryScreen';
import { PermissionScreen } from './src/screens/PermissionScreen';
import { BatteryScreen } from './src/screens/BatteryScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { colors } from './src/theme';

type Stage = 'loading' | 'link' | 'permissions' | 'battery' | 'ready';

export default function App() {
  const [stage, setStage] = useState<Stage>('loading');
  const [link, setLink] = useState<RiderLink | null>(null);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const linkRef = useRef<RiderLink | null>(null);

  /** Decide which screen comes next for a given rider link. */
  const route = useCallback(async (l: RiderLink | null) => {
    if (!l) return setStage('link');
    const perms = await getPermissionState();
    if (!perms.ready) return setStage('permissions');
    if (await needsBatteryPrompt()) return setStage('battery');
    setStage('ready');
  }, []);

  const acceptLink = useCallback(
    async (l: RiderLink) => {
      await saveRiderLink(l);
      linkRef.current = l;
      setLink(l);
      setLinkMessage(null);
      await route(l);
    },
    [route],
  );

  /** Handle a URL from an App Link tap (cold start or while running). */
  const handleUrl = useCallback(
    async (url: string | null | undefined) => {
      if (!url) return false;
      const r = parseRiderLink(url);
      if (r.ok) {
        // Never swap orders under a rider who is mid-delivery.
        const active = await getSession();
        if (active && active.code !== r.link.code && (await isTrackingActive())) {
          setLinkMessage(
            `You are still delivering order #${active.code}. Mark it delivered before opening another link.`,
          );
          const saved = await loadRiderLink();
          if (saved) {
            linkRef.current = saved;
            setLink(saved);
            await route(saved);
          }
          return true;
        }
        await acceptLink(r.link);
        return true;
      }
      // A /track/ link without a rider key (e.g. the customer link): explain, keep current order.
      setLinkMessage(parseErrorMessage[r.reason]);
      if (!linkRef.current) setStage('link');
      return false;
    },
    [acceptLink, route],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const [initialUrl, saved] = await Promise.all([Linking.getInitialURL(), loadRiderLink()]);
      if (!alive) return;
      if (await handleUrl(initialUrl)) return;
      linkRef.current = saved;
      setLink(saved);
      await route(saved);
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [handleUrl, route]);

  // If a permission is revoked in Settings while the app is in the background, go back to the walkthrough.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active' || !linkRef.current) return;
      const perms = await getPermissionState();
      if (!perms.ready) setStage('permissions');
    });
    return () => sub.remove();
  }, []);

  async function reallyChangeLink() {
    await stopTracking('manual');
    await clearRiderLink();
    linkRef.current = null;
    setLink(null);
    setLinkMessage(null);
    setStage('link');
  }

  async function changeLink() {
    if (await isTrackingActive()) {
      Alert.alert(
        'Stop sharing your location?',
        'A delivery is in progress. Switching links stops live tracking for the customer.',
        [
          { text: 'Keep tracking', style: 'cancel' },
          { text: 'Stop and switch', style: 'destructive', onPress: reallyChangeLink },
        ],
      );
      return;
    }
    await reallyChangeLink();
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={colors.cream} />
      {stage === 'loading' && (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      )}

      {stage === 'link' && <LinkEntryScreen onLink={acceptLink} message={linkMessage} />}

      {stage === 'permissions' && <PermissionScreen onDone={() => route(linkRef.current)} />}

      {stage === 'battery' && (
        <BatteryScreen
          onDone={async () => {
            await rememberBatteryPromptSeen();
            setStage('ready');
          }}
        />
      )}

      {stage === 'ready' && link && (
        <TrackingScreen
          key={`${link.code}:${link.key}`}
          link={link}
          message={linkMessage}
          onChangeLink={changeLink}
          onNeedPermissions={() => setStage('permissions')}
        />
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
});
