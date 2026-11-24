import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';
import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';
import { ANDROID_PACKAGE } from './config';

const K_SEEN = 'track_battery_prompt_seen';

/** true = Android may pause Track in the background to save battery. */
export async function isBatteryOptimized(): Promise<boolean> {
  try {
    return await Battery.isBatteryOptimizationEnabledAsync();
  } catch {
    return false;
  }
}

/** Show the battery screen only if Track is still optimised and the rider hasn't dismissed it. */
export async function needsBatteryPrompt() {
  if (!(await isBatteryOptimized())) return false;
  return (await SecureStore.getItemAsync(K_SEEN)) !== '1';
}

export async function rememberBatteryPromptSeen() {
  await SecureStore.setItemAsync(K_SEEN, '1');
}

/**
 * Shows Android's own "Let app always run in background?" dialog.
 * Uses REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (fine for the test APK; Google Play reviews this
 * permission, so the settings-page fallback below is what Play builds can rely on).
 */
export async function requestBatteryExemption(): Promise<boolean> {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
      data: `package:${ANDROID_PACKAGE}`,
    });
  } catch {
    await openBatterySettings();
  }
  return !(await isBatteryOptimized());
}

/** Opens the system list of battery-optimised apps, falling back to Track's app settings page. */
export async function openBatterySettings() {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
  } catch {
    await Linking.openSettings();
  }
}

/** Extra steps for phone brands known to kill background apps even after the standard exemption. */
export function manufacturerTip(): string | null {
  const c = (Platform.constants ?? {}) as { Manufacturer?: string; Brand?: string };
  const m = `${c.Manufacturer ?? ''} ${c.Brand ?? ''}`.toLowerCase();
  if (/xiaomi|redmi|poco/.test(m))
    return 'On Xiaomi / Redmi / POCO: Settings → Apps → Track Rider → turn on Autostart, and set Battery saver to "No restrictions".';
  if (/samsung/.test(m))
    return 'On Samsung: Settings → Apps → Track Rider → Battery → choose "Unrestricted". Also remove it from "Sleeping apps".';
  if (/oppo|realme|oneplus/.test(m))
    return 'On OPPO / realme / OnePlus: Settings → Apps → Track Rider → Battery → allow background activity and auto launch.';
  if (/vivo|iqoo/.test(m))
    return 'On vivo: Settings → Battery → Background power consumption → allow Track Rider.';
  if (/huawei|honor/.test(m))
    return 'On Huawei / Honor: Settings → Battery → App launch → Track Rider → Manage manually, switch everything on.';
  if (/tecno|infinix|itel/.test(m))
    return 'On Tecno / Infinix / itel: Phone Master → App auto-start → allow Track Rider, and lock it in recent apps.';
  return null;
}
