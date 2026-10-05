# Development & deployment

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 20+ (24 tested) | app, functions, pipeline |
| Java | 21+ | Firebase emulators (firebase-tools 15). `dev/emulators.sh` uses Android Studio's bundled JDK if your default `java` is older. |
| firebase-tools | 15.x (installed locally as a devDependency) | emulators and deploy. Use `npx firebase …` so the version matches `firebase-functions` v7. |

```bash
npm install
npm --prefix functions install
```

## Running locally

```bash
npm run emulators   # Auth :9099, Firestore :8080, Functions :5001, Cloud Tasks :9499, UI :4044
npm run dev:emu     # Vite on :5173 (also on your LAN IP, so phones on the same Wi-Fi can join)
```

`VITE_USE_EMULATORS=true` (set by `dev:emu`) points the SDK at the emulators and switches auth to **per-tab sessions**, so every browser tab is a separate player. In production, auth persists in local storage so a refreshed phone keeps its identity.

The Functions emulator hot-reloads when `functions/lib` changes. Run `npm --prefix functions run build` (or `npx tsc -w` in `functions/`) after editing functions. Newly *added* functions need an emulator restart.

### Dev tools

| Command | What it does |
|---|---|
| `npm run bots -- ABCD 8` | Adds 8 simulated players to room `ABCD`. Each guesses a random year 2–10s into every round. Good for testing big-group layouts. |
| `http://localhost:5173/dev/phone.html?src=/play/ABCD` | Frames any route in a 390×844 phone (Chrome won't shrink a window below ~500px). Dev-only; not part of the production build. |
| Emulator UI at `http://localhost:4044` | Inspect `rooms/…` documents live, and watch function and task logs. |

### Tests & checks

```bash
npm --prefix functions test   # scoring curve + decade-balanced photo picker
npx tsc -b                    # typecheck the web app
npm run build                 # production bundle (dist/)
```

What's been verified end-to-end in the browser against the emulators:

- create room (the creator auto-joins), join by code, link and QR, lobby roster, kick
- start from the creator's phone; the big screen works as a read-only spectator
- server-timed reveal; early reveal when everyone locks in; host "Reveal now"; zero-guess rounds
- auto-advance after the reveal (Cloud Task), with a "Next photo in N s" countdown; host "Skip ahead"
- scoring, leaderboard reorder, final podium, player final ranking, Play again
- 10 concurrent players (8 bots + 2 humans): locked-in grid, stacked timeline pins, top-5 reveal board
- the production bundle contains no answer data and no dev harness

---

## Deploying to Firebase

### Current production project

`chronosnap-bu722` (Blaze, Firestore `nam5`, Anonymous Auth). Live at <https://chronosnap-bu722.web.app>. `.firebaserc` points at it, and `.env.local` holds its web config. The emulators always use `demo-chronosnap`.

### One-time project setup (new project)

The CLI can do all of this. It's how `chronosnap-bu722` was created:

```bash
npx firebase projects:create <id> --display-name ChronoSnap
npx firebase apps:create web "ChronoSnap Web" --project <id>
npx firebase apps:sdkconfig web <appId> --project <id>     # → .env.local
gcloud services enable firestore.googleapis.com identitytoolkit.googleapis.com --project <id>
npx firebase firestore:databases:create "(default)" --location nam5 --project <id>
npx firebase deploy --only auth --project <id>              # enables Anonymous via firebase.json "auth.providers"
# Link a billing account (Blaze) in the console, then grant the compute SA (see below) and deploy.
```

Or the same in the console:

1. **Create a project** (Analytics isn't needed).
2. **Upgrade to Blaze** (Usage and billing → Modify plan). Cloud Functions, Cloud Tasks and Cloud Scheduler require it. Set a **budget alert** (e.g. $5).
3. **Authentication → Sign-in method → Anonymous → Enable.**
4. **Firestore Database → Create database** in production mode. Pick a location close to your players (e.g. `nam5`, `eur3`). It can't be changed later.
5. **Project settings → Your apps → Add web app.** Copy the config into `.env.local`:

```bash
cp .env.example .env.local
```

```ini
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_APP_ID=1:…:web:…
VITE_USE_EMULATORS=false
```

These values are public identifiers, not secrets. Access is controlled by the security rules and function checks.

### Deploy

```bash
npx firebase login
npx firebase use --add        # select the project, alias "default"
npm run deploy                # vite build + functions build + firebase deploy
```

`firebase deploy` publishes:

- **Hosting:** `dist/` (SPA rewrite to `index.html`; `/photos/**` and `/assets/**` cached for a year as immutable)
- **Firestore:** `firestore.rules` and `firestore.indexes.json`
- **Functions:** 8 callable/trigger functions, 2 task-queue functions (the queues are created automatically) and the 6-hourly `cleanupRooms` schedule

The live URL is `https://<project-id>.web.app`. A custom domain can be added under Hosting.

### First-deploy checklist

- [ ] Open the site, create a room, and join from a phone on mobile data (not office Wi-Fi) to check connectivity end to end.
- [ ] Let one round time out without guesses. It should reveal about 1.5s after the countdown, which proves Cloud Tasks are wired.
- [ ] Let a reveal auto-advance.
- [ ] In the Cloud Console, confirm the `revealRoundTask` and `advanceRoundTask` queues exist (Cloud Tasks → Queues).

### Service account permissions (new GCP orgs)

Newer Google Cloud organizations don't auto-grant the default compute service account any roles, so the first functions deploy fails with *"missing permission on the build service account"*. Grant `PROJECT_NUMBER-compute@developer.gserviceaccount.com`:

`roles/cloudbuild.builds.builder`, `roles/logging.logWriter`, `roles/artifactregistry.writer`, `roles/storage.objectViewer` (build) and `roles/datastore.user`, `roles/cloudtasks.enqueuer`, `roles/iam.serviceAccountUser` (runtime).

If a deploy *created* functions but failed before finishing, the callables may lack public access, so clients get `internal` errors and HTTP 403. Fix it with:

```bash
for s in createroom advance revealround resetroom kickplayer endgame servertime; do
  gcloud run services add-iam-policy-binding $s --region us-central1 --member=allUsers --role=roles/run.invoker
done
```

Only the callables need this; task, trigger and scheduled functions stay private.

### Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Rounds reveal ~3s late, or only when the creator's phone is open | The task enqueue is failing and the client fallback is doing the work. Check the Functions logs for `Failed to enqueue`. Grant the functions' runtime service account (default compute SA) the **Cloud Tasks Enqueuer** role, plus **Service Account User** on itself. |
| Every callable fails with `internal` / HTTP 403 | Missing public invoker on the Cloud Run services. See "Service account permissions" above. |
| `createRoom` fails with `failed-precondition` | `functions/src/photos.json` is empty. Run the pipeline build, then redeploy functions. |
| Players stuck on "Developing…" behind a corporate proxy | Firestore auto-detects long-polling, but some proxies block `*.googleapis.com` entirely. Try a phone on mobile data. |
| Emulator: "Java version before 21" | Install JDK 21+ or Android Studio, or set `JAVA_HOME`. |
| Emulator: `functions.config() has been removed` | You're running an old global `firebase` CLI. Use `npx firebase` or `npm run emulators`. |

---

## Costs

Blaze bills only beyond the free tier, and a meeting game barely touches it.

Rough usage for **one 10-player, 5-round game**:

| Resource | Usage | Free monthly allowance (Blaze) |
|---|---|---|
| Function invocations | ~25 callables/tasks + ~50 guess triggers | 2,000,000 |
| Firestore reads | ~500–1,000 (listeners × updates) | ~1.5M (50k/day) |
| Firestore writes | ~120 | ~600k (20k/day) |
| Cloud Tasks | ~10 | 1,000,000 |
| Hosting egress | ~15 MB (5 photos × ~250 KB × 10 phones + app shell) | 10 GB |

That's on the order of **hundreds of games per month at $0**. Hosting egress is usually the first limit you'd hit; past it, egress costs about $0.15/GB.

## Configuration reference

| Setting | Where | Default |
|---|---|---|
| Rounds per game | Create-room form → `settings.totalRounds` | 5 (5/8/10; server allows 1–15) |
| Seconds per photo | form → `settings.roundSeconds` | 45 (30/45/60; server allows 10–120) |
| Auto-advance after reveal | form → `settings.autoAdvanceSeconds` | 15 (Manual/10/15/25; server allows 0–60) |
| Reveal grace period | `REVEAL_GRACE_MS` in `functions/src/index.ts` | 1500 ms |
| Room lifetime | `ROOM_TTL_MS` | 24 h |
| Scoring curve | `functions/src/scoring.ts` | 5000 · e^(−0.15·Δ) |
| Year range | `MIN_YEAR`/`MAX_YEAR` in `src/types.ts`, guess rule in `firestore.rules` | 1880 → current year |
