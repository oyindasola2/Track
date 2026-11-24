import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: WorkspaceNotice })

const steps = [
  'cd track-rider',
  'cp package.template.json package.json',
  'npm install && npx expo install --fix',
  'eas login && eas init',
  'eas build -p android --profile preview',
]

function WorkspaceNotice() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-end gap-1.5">
          <span className="text-3xl font-black tracking-tighter">Track</span>
          <span className="pb-1 text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">Rider</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">This project is an Android app, not a website</h1>
          <p className="text-muted-foreground">
            The Expo source is in the <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">track-rider/</code>{' '}
            folder. It can't run in this browser preview. Build the Preview APK with:
          </p>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 text-sm leading-7 text-card-foreground">
          {steps.join('\n')}
        </pre>
        <p className="text-sm text-muted-foreground">
          See <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">track-rider/README.md</code> for App
          Links (assetlinks.json) and tester install steps.
        </p>
      </div>
    </main>
  )
}
