// Background tracking. This module is imported FIRST in index.ts so the task is defined at
// top level before React starts (required for Android to run it with the screen locked).
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { errCode, postFn } from './api';

export const TASK = 'track-rider-location';
const BATCH = 50;
const MAX_QUEUE = 5000;

const K = {
  queue: 'tr.queue',
  session: 'tr.session',
  lastSent: 'tr.lastSent',
  retryAt: 'tr.retryAt',
  issue: 'tr.issue',
  stop: 'tr.stop',
};

export type Session = { code: string; key: string; trip: boolean };
export type Issue = 'offline' | 'rate_limited' | 'server' | 'not_started' | null;
export type StopReason = 'delivered' | 'invalid_link' | 'manual';

export type Point = {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
};

// ---------- persistent storage ----------
export async function getSession(): Promise<Session | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(K.session)) ?? 'null');
  } catch {
    return null;
  }
}

let qLock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const p = qLock.then(fn);
  qLock = p.catch(() => {});
  return p;
}

async function readQueue(): Promise<Point[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(K.queue)) ?? '[]');
  } catch {
    return [];
  }
}

/** Every point is written to the phone BEFORE any upload attempt. */
const enqueue = (pts: Point[]) =>
  withLock(async () => {
    const all = [...(await readQueue()), ...pts];
    await AsyncStorage.setItem(K.queue, JSON.stringify(all.slice(-MAX_QUEUE)));
  });

/** Remove the first n points (the batch the server answered 200 for). */
const dropHead = (n: number) =>
  withLock(async () => {
    await AsyncStorage.setItem(K.queue, JSON.stringify((await readQueue()).slice(n)));
  });

const clearQueue = () =>
  withLock(async () => {
    await AsyncStorage.removeItem(K.queue);
    await AsyncStorage.removeItem(K.retryAt);
    await AsyncStorage.removeItem(K.issue);
  });

// ---------- state for the UI ----------
export type TrackState = {
  queued: number;
  lastSent: number | null;
  issue: Issue;
  stop: StopReason | null;
};

export async function getTrackState(): Promise<TrackState> {
  const [queue, lastSent, issue, stop] = await Promise.all([
    readQueue(),
    AsyncStorage.getItem(K.lastSent),
    AsyncStorage.getItem(K.issue),
    AsyncStorage.getItem(K.stop),
  ]);
  return {
    queued: queue.length,
    lastSent: lastSent ? Number(lastSent) : null,
    issue: (issue as Issue) || null,
    stop: (stop as StopReason) || null,
  };
}

const stopListeners = new Set<(r: StopReason) => void>();
export const onTrackingStopped = (fn: (r: StopReason) => void) => {
  stopListeners.add(fn);
  return () => {
    stopListeners.delete(fn);
  };
};

const setIssue = (i: Issue) =>
  i ? AsyncStorage.setItem(K.issue, i) : AsyncStorage.removeItem(K.issue);

// ---------- upload ----------
let running: Promise<void> | null = null;

/** Upload queued points in batches of up to 50. `force` ignores the back-off timer. */
export function flush(force = false): Promise<void> {
  if (running) return running;
  running = doFlush(force).finally(() => {
    running = null;
  });
  return running;
}

async function backOff(seconds: number, issue: Issue) {
  await AsyncStorage.setItem(K.retryAt, String(Date.now() + seconds * 1000));
  await setIssue(issue);
}

async function doFlush(force: boolean) {
  const s = await getSession();
  if (!s) return;
  while (true) {
    if (!force && Date.now() < Number((await AsyncStorage.getItem(K.retryAt)) ?? 0)) return;
    const batch = (await readQueue()).slice(0, BATCH);
    if (!batch.length) {
      await setIssue(null);
      return;
    }
    const r = await postFn('rider-location', {
      code: s.code,
      rider_key: s.key,
      trip: s.trip,
      points: batch,
    });
    const code = errCode(r.json);

    if (r.status === 200) {
      // Accepted points are stored by the server; rejected ones (low_accuracy, future_time,
      // too_old) are dropped and never retried. Either way this batch leaves the queue.
      await dropHead(batch.length);
      await AsyncStorage.removeItem(K.retryAt);
      await AsyncStorage.setItem(K.lastSent, String(Date.now()));
      await setIssue(null);
      continue;
    }
    if (r.status === 409 && code === 'delivery_complete') {
      await stopTracking('delivered', true);
      return;
    }
    if (r.status === 409 && code === 'delivery_not_started') {
      await backOff(20, 'not_started'); // don't stream yet, keep the queue
      return;
    }
    if (r.status === 401) {
      await stopTracking('invalid_link', true);
      return;
    }
    if (r.status === 429) {
      await backOff(r.retryAfter || 60, 'rate_limited');
      return;
    }
    if (r.status === 0) {
      await backOff(10, 'offline');
      return;
    }
    await backOff(30, 'server'); // 500 and anything unexpected: keep the queue, retry later
    return;
  }
}

// ---------- the background task ----------
const toPoint = (l: Location.LocationObject): Point => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  accuracy: l.coords.accuracy ?? null,
  speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
  recorded_at: new Date(l.timestamp).toISOString(),
});

TaskManager.defineTask(TASK, async ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  await enqueue((data.locations as Location.LocationObject[]).map(toPoint));
  await flush();
});

/** Take one position now (used as a heartbeat while the rider is standing still). */
export async function sampleNow() {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await enqueue([toPoint(pos)]);
    await flush();
  } catch {
    /* GPS off: the UI shows the warning */
  }
}

// ---------- start / stop ----------
export const isTrackingActive = () =>
  Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);

export async function startTracking(session: Session) {
  await AsyncStorage.setItem(K.session, JSON.stringify(session));
  await AsyncStorage.removeItem(K.stop);
  if (await isTrackingActive()) return;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10000,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Track is sharing your location',
      notificationBody: `Delivering order ${session.code}`,
      notificationColor: '#FFC93C',
      killServiceOnDestroy: false,
    },
  });
}

/**
 * Stops tracking. Unless skipFlush is set (the server already told us to stop), it first tries
 * to upload everything still queued so points recorded just before Delivered are not lost.
 */
export async function stopTracking(reason: StopReason, skipFlush = false) {
  if (await isTrackingActive()) {
    await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  }
  if (!skipFlush && reason !== 'invalid_link') {
    await Promise.race([
      flush(true).catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 10000)),
    ]);
  }
  await clearQueue();
  await AsyncStorage.removeItem(K.session);
  await AsyncStorage.setItem(K.stop, reason);
  stopListeners.forEach((fn) => fn(reason));
}
