# Unicloud — Session Development Log

> **Project:** Unicloud — Multi-cloud file manager (Google Drive, Dropbox, OneDrive, Amazon S3, Box)
> **Stack:** React + Vite (frontend) · Node.js + Express + MongoDB (backend)
> **Session Duration:** Full day · July 19–20, 2026

---

## 1. Features Added

### 🔵 Amazon S3 Integration
**What was built:**
- Backend OAuth-style connect flow using AWS Access Key + Secret Key
- `s3.routes.js` — connect, sync, download endpoints
- `s3.provider.js` — recursive bucket object listing, pre-signed download URLs via `@aws-sdk/s3-request-presigner`
- Folder hierarchy construction from S3 key paths (e.g. `folder/subfolder/file.jpg`)
- Activity logging on connect and sync events
- Frontend: S3 account card on Dashboard, S3 logo in sidebar and file rows, S3 download routing in `handleSingleDownload`

**Status:** ✅ Fully working

---

### 📦 Box.com Integration
**What was built:**
- Backend OAuth2 flow (authorize → callback → token exchange)
- `box.routes.js` — connect, callback, sync, download endpoints
- `box.provider.js` — token refresh, recursive file/folder listing via Box Search API, path traversal
- `ActivityLog` model + `activityLogger.js` utility for backend event logging
- `activity.routes.js` — `GET /api/activity` endpoint
- Frontend: Box logo asset (`box.png`), Box account card, sidebar and file rows, download routing

**Status:** ✅ Fully working

---

### 📁 Shared Folder Visibility Fix
**Problem:** Shared folders from Google Drive/Dropbox were visible in the sidebar but their contents were not loading when clicked.

**Root cause:** The file fetch API was filtering by `folderId` but shared folders returned a different ID format from the provider, causing empty results.

**Fix:** Updated `fileAggregator.service.js` to fall back to real-time folder enumeration when the cached result is empty for a given folder ID.

**Status:** ✅ Fixed

---

### 🌲 Cascading Hover Explorer (Folder Tree)
**What was built:**
- A toggle button bar in the left sidebar: **Classic Tree** | **Hover Explore**
- **Classic Tree mode** — original expandable folder list
- **Hover Explore mode** — Mac Finder-style cascading flyout panels:
  - Hover an account → flyout shows its root folders
  - Hover a folder → next flyout shows subfolders and files
  - Clicking a folder navigates to it; clicking a file opens it
- `getAccountTree()` helper that builds a recursive tree from flat folder/file arrays
- CSS flyout panels with backdrop blur, dark glass styling, arrow indicators

**Status:** ✅ Fully working

---

### 🔍 Search Bar Repositioned
**Change:** Moved the global search bar from the top toolbar to a dedicated full-width row directly **above the filter dropdowns**, with the Grid/List view toggle buttons placed to its right (same row).

**Status:** ✅ Done

---

## 2. Problems Encountered & How They Were Solved

### ❌ Problem 1 — `Files.jsx` Failed to Compile (Multiple Syntax Errors)
**What happened:** After applying 85+ sequential edits to `Files.jsx` over the course of the session, the file accumulated several structural errors:
1. A missing closing brace `};` on the `getPercent` utility function (swallowed during an edit)
2. An extra `</div>` inside the sidebar layout that mismatched the `<aside>` tag
3. Misaligned download provider logic inside `handleSingleDownload` (Box/S3 cases nested inside the Dropbox `if` block)

**How it was solved:**
- Wrote `extract_all_edits_from_beginning.js` to scrape all 85 historical edits from the conversation logs
- Wrote `rebuild_files_page.js` to replay them from scratch on the original template
- Wrote `find_mismatched_brace.js` — a character-by-character brace scanner that ignores strings/comments — which pinpointed the exact missing `};` at line 66
- Wrote `fix_get_percent_brace.js` and `fix_files_jsx_aside_div.js` to apply targeted patches
- Ran `npm run build` → **compiled successfully** after all fixes

---

### ❌ Problem 2 — Missing `activityLogger.js` in Frontend
**What happened:** `Files.jsx` imported `logActivity` from `../utils/activityLogger` but the file was never successfully written to the `frontend/src/utils/` directory, causing a Vite build error: *"Could not resolve ../utils/activityLogger"*.

**How it was solved:**
- Searched the raw conversation transcript (`transcript_full.jsonl`) for the exact step where the file was originally written
- Extracted the `localStorage`-based implementation from the log
- Re-created the file with the exact original code

---

### ❌ Problem 3 — Hover Explorer Flyout Vanished Before Reaching It (Horizontal Gap)
**What happened:** The flyout panel was positioned too far to the right. When moving the mouse from the account list to the flyout, the cursor had to cross an empty pixel gap — triggering the `onMouseLeave` event and closing the flyout prematurely.

**How it was solved:**
1. Added a **200ms debounce** (`hoverLeaveTimer` ref) — the flyout only closes if the mouse doesn't re-enter within the grace period
2. Added a CSS `::before` pseudo-element on `.hover-explorer-flyout` — a 12px invisible transparent strip extending to the left, bridging the visual gap so the browser still considers the cursor "inside" the hover zone
3. Increased debounce to **350ms** for extra stability

---

### ❌ Problem 4 — Flyout Appeared Too High / Far from Cursor (Vertical Misalignment)
**What happened:** The flyout always rendered at `top: 0` of the container regardless of which account row was being hovered. For accounts 3–7 in the list, the flyout appeared near the top of the sidebar far above the cursor, causing it to disappear before the user could reach it.

**How it was solved:**
- Added `flyoutTops` state array and `hoverContainerRef`
- Added `getRelativeTop(el)` helper using `getBoundingClientRect()` to measure the exact Y offset of the hovered row relative to the container
- Applied `top: flyoutTops[level]px` to each flyout dynamically — panels now open right beside the row that triggered them

---

### ❌ Problem 5 — Hover Explorer Blinked Rapidly on Mouse Movement
**What happened:** Every mouse move triggered a state update (`hoveredPath`, `flyoutTops`), which re-rendered `Files`. Because `HoverFolderExplorer` was **defined as a component inside `Files`**, React saw a new function reference on every render, causing a full unmount → remount cycle. This replayed the slide-in animation on every hover, producing a visible blink.

**How it was solved:**
- Renamed `HoverFolderExplorer` to `renderHoverFolderExplorer` and changed the call from `<HoverFolderExplorer />` to `renderHoverFolderExplorer()` — a plain function call. React now diffs the returned JSX in-place with no mount/unmount cycle
- Replaced the `slideInCascade` (opacity + scale + translate) animation with a simple 100ms `flyoutFadeIn` (opacity only) — eliminates layout shifts during transitions
- Debounce timer increased to 350ms

---

### ❌ Problem 6 — JSX Syntax Error After Render Function Conversion
**What happened:** After converting to a render function call, the usage was written as `{renderHoverFolderExplorer()}` inside a ternary's `( )`. This is invalid — inside `()` you're already in a JS expression context, so the `{}` is treated as an object literal by the JSX parser.

**Fix:** Removed the curly braces — `renderHoverFolderExplorer()` directly inside the `()`.

---

### 🧹 Cleanup — 93 Recovery Scripts Deleted
During the debugging phase, ~93 temporary diagnostic and rebuild scripts were created in the `backend/` root directory. Once the build was verified, all were deleted in one batch command. Real application files (`box.routes.js`, `activityLogger.js`, etc.) were preserved.

---

## 3. Current Feature Status

| Feature | Status | Notes |
|---|---|---|
| Google Drive integration | ✅ Working | Original feature |
| Dropbox integration | ✅ Working | Original feature |
| OneDrive integration | ✅ Working | Added this session |
| Amazon S3 integration | ✅ Working | Added this session |
| Box.com integration | ✅ Working | Added this session |
| Activity logging (backend) | ✅ Working | `ActivityLog` model + `/api/activity` route |
| Activity logging (frontend) | ✅ Working | `localStorage`-based `logActivity()` |
| Dashboard recent activity feed | ✅ Working | Reads from backend + localStorage |
| Classic Tree folder sidebar | ✅ Working | Expandable account/folder tree |
| Hover Explorer (cascading flyouts) | ✅ Working | Stable, aligned, no blink |
| Shared folder contents visible | ✅ Fixed | Real-time fallback on empty cache |
| Search bar above filters | ✅ Done | Full-width row with Grid/List buttons |
| Vite production build | ✅ Passing | `npm run build` — zero errors |
| Backend server | ✅ Running | `http://localhost:5001` |
| Frontend dev server | ✅ Running | `http://localhost:5173` |

---

## 4. Files Modified / Created (Key Files)

### Backend (New)
| File | Purpose |
|---|---|
| `src/routes/box.routes.js` | Box OAuth, sync, download |
| `src/routes/s3.routes.js` | Amazon S3 connect, sync, download |
| `src/routes/onedrive.routes.js` | OneDrive OAuth, sync, download |
| `src/routes/dropbox.routes.js` | Dropbox OAuth, sync, download |
| `src/routes/activity.routes.js` | Recent activity API |
| `src/services/providers/box.provider.js` | Box file/folder listing |
| `src/services/providers/s3.provider.js` | S3 file/folder listing |
| `src/services/providers/onedrive.provider.js` | OneDrive file/folder listing |
| `src/services/providers/dropbox.provider.js` | Dropbox file/folder listing |
| `src/models/ActivityLog.js` | MongoDB activity log schema |
| `src/utils/activityLogger.js` | Backend log writer & reader |
| `src/utils/cache.js` | File cache utility |

### Backend (Modified)
| File | Change |
|---|---|
| `src/app.js` | Mounted all new provider routes |
| `src/services/fileAggregator.service.js` | Added Box, S3, OneDrive, Dropbox aggregation |
| `src/utils/fileNormalizer.js` | Added normalization for all new providers |
| `src/controllers/upload.controller.js` | Added activity logging on uploads |

### Frontend (Modified)
| File | Change |
|---|---|
| `src/pages/Files.jsx` | Full rebuild — all provider support, hover explorer, search repositioned |
| `src/pages/Dashboard.jsx` | Storage donut, activity feed, all provider cards |
| `src/pages/ManageAccounts.jsx` | Connect/sync UI for Box, S3, OneDrive |
| `src/styles/files.css` | Hover explorer styles, flyout CSS, search row layout |
| `src/styles/dashboard.css` | Activity timeline, storage donut |

### Frontend (New)
| File | Purpose |
|---|---|
| `src/utils/activityLogger.js` | localStorage activity tracker |
| `public/assets/box.png` | Box logo asset |
| `public/assets/s3.png` | Amazon S3 logo asset |
