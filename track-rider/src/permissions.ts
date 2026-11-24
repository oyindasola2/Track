import * as Location from 'expo-location';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

export type PermissionState = {
  foreground: boolean;
  /** Android 12+: rider may pick "Approximate". Tracking needs "Precise". */
  precise: boolean;
  background: boolean;
  notifications: boolean;
  canAskForeground: boolean;
  canAskBackground: boolean;
  /** Everything location tracking needs (notifications are strongly recommended, not blocking). */
  ready: boolean;
};

const needsNotificationPermission = Platform.OS === 'android' && Number(Platform.Version) >= 33;

async function hasNotificationPermission() {
  if (!needsNotificationPermission) return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
}

export async function getPermissionState(): Promise<PermissionState> {
  const [fg, bg, notifications] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    hasNotificationPermission(),
  ]);
  const foreground = fg.status === 'granted';
  const precise = foreground && fg.android?.accuracy !== 'coarse';
  const background = bg.status === 'granted';
  return {
    foreground,
    precise,
    background,
    notifications,
    canAskForeground: fg.canAskAgain,
    canAskBackground: bg.canAskAgain,
    ready: foreground && precise && background,
  };
}

export async function requestForeground() {
  await Location.requestForegroundPermissionsAsync();
  return getPermissionState();
}

/** On Android 11+ this opens the app's location settings page; rider must pick "Allow all the time". */
export async function requestBackground() {
  await Location.requestBackgroundPermissionsAsync();
  return getPermissionState();
}

export async function requestNotifications() {
  if (!needsNotificationPermission) return getPermissionState();
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return getPermissionState();
}

export const openAppSettings = () => Linking.openSettings();
