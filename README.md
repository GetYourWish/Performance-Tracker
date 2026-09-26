# Performance Tracker

> **A private, local-first record of what you accomplished.**

Performance Tracker is a Windows desktop app with a companion Android app for
capturing completed work, assigning it a meaningful effort score, and reviewing
the history you build over time. Your data remains in a single portable
`tracker.json` file—no account, server, or cloud service is required.

**In this guide:** [Quick start](#quick-start) ·
[Using the board](#how-to-use-the-board) ·
[Scoring](#understand-your-score) · [Reviews](#read-your-history) ·
[Your data](#your-data-and-backups) · [Development](#development)


---

## 🎯 What it is—and is not

Performance Tracker is deliberately focused on **completed work**. Add items to
the board as a lightweight prompt for yourself, then record the effort when you
finish them. The result is a history you can inspect by day, week, category, or
year.

It is **not** a project-management system, team workspace, calendar, or
cloud-synced to-do list. There are no required accounts, deadlines, assignees,
or online services. You can use as much or as little organization as you like:
typing a task and completing it is enough to get started.

## ✨ At a glance

- **Desktop and Android:** Both apps use the same `tracker.json` format, so
  scores and history match across devices.
- **A flexible board:** Quickly enter tasks, reorder them, use categories when
  useful, and keep a small list of what you are currently working on.
- **Intentional scoring:** Set your own difficulty levels and optionally reward
  multiple completions on a day with a configurable fatigue multiplier.
- **Useful reviews:** See a daily record, weekly totals, flow and category
  charts, a dashboard, and a year heatmap.
- **Your file, your control:** Choose where the data file lives, create manual
  backups, and use Syncthing if you want to carry the same file between devices.

---

## 🚀 Quick start

### 🖥️ Windows desktop

1. Download and run the Windows build, or run the app from source as described
   in [Development](#development).
2. On first launch, choose the folder that will contain `tracker.json`. The
   app can create a new file for you, or you can select an existing one.
3. On the **Board**, type a task into the entry field and press **Enter**.
4. When you finish it, select the task's complete action. Choose a difficulty,
   confirm the completion date, and optionally add a note.
5. Open **Reviews** to see your recorded work. Open **Settings** whenever you
   want to change scoring, categories, theme, or the data-file location.

> **Minimum workflow:** That is the complete minimum workflow. Categories,
> Working On, the randomizer, and syncing are optional additions rather than
> setup requirements.

### 📱 Android companion app

1. Install the Android build.
2. At setup, grant access to the folder containing `tracker.json`—typically the
   Syncthing folder you use for the desktop app.
3. If the folder has no file yet, choose **Create default tracker.json**. If it
   already contains your desktop file, select it instead.
4. Use the **Board**, **Reviews**, and **Settings** tabs in the same way as on
   desktop. The app checks for external file changes periodically, when it
   returns to the foreground, and when you pull to refresh.

Android uses the system folder picker and does not need broad storage access.
For the safest shared setup, let Syncthing finish syncing before editing on the
other device.

---

## 📋 How to use the board

### Add and arrange tasks

The board is your active list, not your permanent archive.

- Type a task and press **Enter** to add it.
- Drag and drop tasks on desktop to put them in the order that makes sense to
  you. Completed tasks leave the active board and remain in your history.
- Use the task actions to complete or remove an item. Removing an active task
  removes it from the board; completing it preserves a record in Reviews.
- Use the **Randomizer** (dice) when you want the app to choose an active task
  for you. It favors tasks that are not already marked as Working On.

### Mark something as Working On

Use **Working On** for active tasks you want to keep visible as in-progress.
The board indicator opens a list of those tasks, where you can jump to or
complete one. This is a convenience list only: it does not affect scoring or
turn a task into a separate status workflow.

### Complete a task

Completion is the central action in the app:

1. Select a task's complete action.
2. Select the difficulty that best represents the effort involved.
3. Check the completion date. Change it if you are recording work from an
   earlier day—for example, after working past midnight.
4. Add an optional note, then save.

The task is removed from the board, added to your completion history, and
included in the score for its selected date. Reviews allow you to inspect—and
where available edit—the saved completion details later.

---

## 🗂️ Organize with categories *(optional)*

Categories give sections of the board a name and color, such as *Work*,
*Health*, or *Learning*. Create and edit categories in **Settings**.

On desktop, drag a category from the category grabber onto the board to place a
marker. A task receives that category **only when it sits between two markers
of the same category at the moment you complete it**. This deliberate rule lets
you create bounded category sections and prevents a marker from accidentally
labeling the rest of the board. Moving markers later never changes a task's
saved history.

On Android, use the Categories sheet to add a marker or jump to an existing
marker. Tapping a category navigates to its first marker; the add control places
a new marker at the end of the board.

Categories are not required. Tasks outside a matching marker pair remain
uncategorized and still score normally.

---

## 📈 Understand your score

Each difficulty has a label, color, and base score. The defaults are:

| Difficulty | Base points |
| --- | ---: |
| Easy | 1 |
| Medium | 2 |
| Hard | 3 |
| Very Hard | 5 |

You can rename, recolor, reorder, or change the points for these levels in
**Settings → Difficulties**. The app uses the difficulty selected at completion
time, so use levels that feel meaningful to you—not somebody else's definition
of productive.

### Fatigue multiplier

By default, the first task completed on a date gets its base points. Later
tasks on the same date receive an additional multiplier:

```text
multiplier = min(1 + task position × fatigue increment, fatigue cap)
task score = base points × multiplier × category priority multiplier
```

- Task position starts at `0` and is based on completion time within that
  calendar day.
- The default fatigue increment is `0.10`, so the second task is worth `1.10×`
  its base points, the third `1.20×`, and so on.
- The default cap is `3.0×`; change or limit both values in **Settings →
  Scoring**.
- Categories can also have a priority multiplier. Leave it at `1` if you only
  want categories for organization.

Changing scoring settings recalculates the views built from your history. The
completion log retains the score breakdown recorded when each task was
completed, which is useful for auditing what happened at the time.

---

## 🔎 Read your history

Open **Reviews** to turn completions into a useful record:

- **Dashboard:** A high-level performance cockpit with intensity, records,
  rhythm, and composition cards. Choose which cards to show in Settings.
- **Daily:** Select a date to see its score and completed tasks.
- **Weekly:** Review totals, daily activity, and your strongest day for a week.
- **Flow State:** Follow your score over time in a continuous activity chart.
- **Stacked chart:** Compare completed work by category across the selected
  range.
- **Heatmap:** Browse a GitHub-style year view. Choose whether cell intensity
  represents score or completed-task count in Settings.

The exact set and presentation of review controls differs slightly between the
desktop and Android layouts, but both read the same history and use the same
scoring rules.

---

## ⚙️ Settings you may want to change

| Setting | Why change it? |
| --- | --- |
| **Difficulties** | Make labels and base points match the kind of effort you track. |
| **Categories** | Add color-coded areas of focus and, optionally, priority multipliers. |
| **Scoring** | Adjust the fatigue increment and cap. |
| **Appearance** | Choose light, dark, or system theme; desktop also offers board presentation options. |
| **Week start** | Make weekly reviews begin on Monday or Sunday. |
| **Heatmap mode** | Show daily score or simply the number of completed tasks. |
| **Data location** | View, open, back up, or move the folder containing `tracker.json`. |

---

## 🛡️ Your data and backups

Everything important lives in one UTF-8 JSON file named `tracker.json`. This
makes your history easy to keep, move, and back up.

### Default desktop location

The Windows app tries to create `SyncThis/tracker.json` beside the executable.
If that location cannot be used, it falls back to
`Documents/SyncThis/tracker.json`. You can choose another location during setup
or later in Settings.

### Safety measures

- Desktop saves use an atomic write: a temporary file is written, then renamed
  into place.
- Before risky operations, the desktop app keeps a rolling set of up to 20
  backups beside the data file in `.backups/`.
- Android also writes a verified temporary document and keeps its rolling
  backups in app-private storage.
- The apps validate and repair recoverable missing or malformed structure. A
  file from a newer, unsupported schema version is refused rather than silently
  overwritten.

Do not edit `tracker.json` by hand while either app is open unless you know the
schema. If you need to inspect or integrate with it, see the complete
[data schema](packages/core/SCHEMA.md).

---

## 🔄 Sync with Syncthing

Syncthing is optional, but it is a practical way to use the same history on a
Windows computer and Android device without introducing a cloud account.

1. Create or choose a folder that Syncthing shares between your devices.
2. Point the desktop app at that folder and select the same folder in Android
   setup.
3. Let Syncthing sync the initial `tracker.json` before opening the second app.
4. Avoid making simultaneous edits on both devices. Wait for one device's
   changes to arrive before editing on the other.
5. If Syncthing creates a `-conflict-` copy, the apps surface it for review;
   they do not automatically load or delete it. Compare the files and decide
   which history to keep before replacing the main `tracker.json`.

The file watcher/polling mechanisms detect external updates, but they cannot
merge two independently edited JSON files. Back up before resolving a conflict.

---

## 🛠️ Development

### Requirements

- Node.js and npm.
- Windows for running or packaging the Electron desktop application.
- For Android development: Android Studio, a configured Android SDK, and a
  device or emulator supported by Expo/React Native.

### Install and run the desktop app

```bash
git clone https://github.com/GetYourWish/Performance-Tracker.git
cd Performance-Tracker
npm install
npm run dev
```

Build the desktop renderer or Windows distributables with:

```bash
npm run build
npm run dist:win
```

### Run the Android app

From the repository root, after `npm install`:

```bash
npm run start --workspace @performance-tracker/mobile
# or, with an Android device/emulator configured:
npm run android --workspace @performance-tracker/mobile
```

For a release APK, use the Android Gradle project after installing dependencies:

```bash
cd mobile/android
./gradlew assembleRelease
```

On Windows shells, use the equivalent Gradle command (for example,
`gradlew.bat assembleRelease`). The release APK is written below
`mobile/android/app/build/outputs/apk/release/`.

### Checks

```bash
npm test                 # core and desktop tests
npm run test:core:rn     # Android/Jest compatibility tests
npm run lint
npm run check:core-pin
```

---

## 🧭 Project layout

```text
desktop/         Electron + React desktop application
mobile/          Expo + React Native Android application
packages/core/   Shared data model, validation, scoring, and schema
docs/            Design and workflow documentation
```

The shared core is intentionally the source of truth for the on-disk format,
data healing, and scoring. This is what lets desktop and Android show the same
result for the same `tracker.json`.

---

## 📄 License

[MIT](LICENSE)
