# Track Rider (Android, Expo)

Native rider app for usetracktech.com. Package: `com.usetracktech.rider`.
Talks only to the existing Supabase Edge Functions (`rider-order`, `rider-location`, `rider-status`)
with the public anon key. No other backend, no service-role key.

## Status

- [x] Phase 1: App Links + paste-link screen, permission walkthrough, battery exemption
- [x] Phase 2: background location task + offline queue (`src/tracking.ts`)
- [x] Phase 3: order / trip screen, Start + Delivered flows (`src/screens/TrackingScreen.tsx`)
- [x] Phase 4: status warnings ("Last sent 12s ago", no GPS / no internet)

Code complete but never compiled or run on a phone from this workspace. Run `npm run typecheck`, build the preview APK, and walk through the six done-checks on a real phone before sending it to riders.

## 1. Set up (one time, on your computer)

You need Node.js 18+ installed and a free account at https://expo.dev.

This folder lives inside a web workspace, so the dependency file is named `package.template.json`.

```bash
cd track-rider
cp package.template.json package.json
npm install
npx expo install react react-native react-native-safe-area-context expo-status-bar expo-dev-client \
  expo-location expo-task-manager expo-secure-store expo-clipboard expo-battery expo-intent-launcher \
  @react-native-async-storage/async-storage @react-native-community/netinfo
npx expo install typescript @types/react -- --save-dev
npm i -g eas-cli
eas login        # sign in with your Expo account
eas init         # links the project and writes the projectId into app.json
```

## 2. Build the Preview APK

```bash
eas build -p android --profile preview
```

1. EAS asks to generate an Android keystore the first time. Answer **Yes**.
2. The build runs on Expo's servers (usually 10-20 minutes). You can close the terminal and
   follow it at https://expo.dev under your project > Builds.
3. When it finishes, the terminal prints a link, and the build page shows an **Install** / **Download** button.
   That link downloads the `.apk`. Send it to riders on WhatsApp.
4. Riders must allow "Install unknown apps" for WhatsApp or Files when Android asks.

Expo Go will NOT work (background location needs the built app).

## 3. Make WhatsApp links open the app (App Links)

1. After the first build: `eas credentials` > Android > preview > copy **SHA-256 Fingerprint**.
2. Put it into `assetlinks.json` (this folder) and publish that file at
   `https://usetracktech.com/.well-known/assetlinks.json` (served as `application/json`, no redirect).
3. Reinstall the APK. Check on a phone:
   `adb shell pm get-app-links com.usetracktech.rider` -> should say `verified`.
4. When you publish on Google Play, add the **App signing key** SHA-256 from
   Play Console > Setup > App integrity as a second fingerprint in the same file.

Until the file is live, links open the browser; riders can use **Paste link from WhatsApp** in the app.

## Accepted link formats

- `https://usetracktech.com/track/<code>?role=rider&key=<key>` (tap or paste)
- `<code>?key=<key>`
- `<code> <key>`

Code and key are stored with `expo-secure-store`.
