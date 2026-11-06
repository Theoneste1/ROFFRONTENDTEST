# Remaining Verification Plan (data-changing tests)

Prepared 2026-11-06 from a read-only survey of the local database. **Nothing in this plan has been executed.** Each block runs only after the owner approves it. This plan replaces `PHASE5_ADMIN_PLAN.md` §5 and the test list in `PHASE6_PLAN.md` §3.

**Owner clarification (2026-11-06):** the removal of mentor.junior's Algebra · Junior and Geometry · Junior access, the student `theoneste`, and "Assignment1" were all owner testing. `theoneste` is a test account. Option P0-a below is therefore uncontroversial.

## 0. Current state (read-only survey)

| Item | State | Consequence |
|---|---|---|
| `[TEST] Phase 4 wizard assignment …2390610` (`a266c16c…`) | **PUBLISHED** by admin at 12:07 UTC; Algebra · Junior; 0 submissions; resubmission allowed (×2); deadline 2026-12-20; 30 marks, 15 points | Workflow steps 1–2 (submit for approval, publish) are already done and are dropped. Junior students were already notified |
| Mentor access to **Algebra · Junior** | **None.** mentor.junior's Algebra · Junior and Geometry · Junior access was removed at 12:01 UTC | **Blocker:** the backend distributes work only to mentors with active access to the course × division (`MENTOR_NOT_ELIGIBLE`) |
| Other `[TEST]` assignments | `a7a543f0…` and `f0b37379…`: DRAFT, Algebra · Junior | Not needed |
| Owner records | "Assignment1" (Number Theory · Senior, published), student `theoneste` (Junior, S1, created today) | **Never touched.** `theoneste` can see the published `[TEST]` assignment and shares the Junior leaderboard with student.s2 |
| Demo accounts | student.s2 (Junior, 30 points, rank 1/2), student.s5 (Senior), mentor.junior (Number Theory and Combinatorics · Junior), mentor.senior (all Senior), admin | The only accounts the tests use |
| Phase 6 test thread `b068d3b9…` | Geometry · Junior, OPEN, started by student.s2 | mentor.junior now gets 403 on it, so it can't be the replier |

## 1. Phase 5: revised end-to-end workflow

### Prerequisite (owner decision P0)
One mentor needs active access to **Algebra · Junior**. Options:
- **P0-a (recommended):** temporarily re-grant mentor.junior Algebra · Junior (`POST /admin/mentor-assignments`), then remove it again during cleanup. Uses the existing published `[TEST]` assignment, so no new assignment is created.
- **P0-b:** use a new `[TEST]` assignment in Number Theory · Junior (where mentor.junior still has access): the mentor creates it, submits it for approval, and the admin publishes it. This creates one more permanent assignment and **notifies all Junior students again (including `theoneste`)**. Not recommended.

If the 12:01 removal was intentional, P0-a restores the access only for the duration of the test.

### Steps (with P0-a)

| # | Actor | Action | Database changes |
|---|---|---|---|
| P0 | admin | Grant mentor.junior Algebra · Junior | 1 mentor-assignment row; audit entry |
| 1–2 | — | ~~Submit for approval, publish~~ | Already done |
| 3 | student.s2 | Submit text + PDF | 1 submission row, 1 file in storage; notification to s2 |
| 4 | student.s2 | Resubmit before review | New attempt (revision); file |
| 5 | admin | Distribute to mentor.junior | Distribution batch, review cycle 1; notification to mentor; audit |
| 6 | mentor.junior | Start review → request resubmission (`[TEST]` note, due date) | Review state, resubmission request; notification to s2 |
| 7 | student.s2 | Resubmit after the request | New attempt; review cycle 2 back to mentor.junior |
| 8 | mentor.junior | Mark (score, `[TEST]` feedback) → send to admin | Review score and feedback; notification to admins |
| 9 | admin | **Send back** with a `[TEST]` reason | Review status; notification to mentor; audit |
| 10 | mentor.junior | Re-mark → send to admin | Review cycle 3 |
| 11 | admin | **Approve** | Review approved; audit |
| 12 | admin | **Publish results** | Result release; s2's points +score-based amount; notification to s2; audit |
| 13 | student.s2 | Read result and leaderboard (read-only) | — |
| 14 | admin | **Reopen** the result (`[TEST]` note), which is test H28 and also restores the points | Points back to 0 for this submission, so s2 returns to 30; result hidden from s2; the work returns to mentor.junior; audit |
| 15 | admin | Close, then **archive** the assignment | Assignment CLOSED → ARCHIVED; students can still open it read-only, but nobody can submit |
| 16 | admin | Remove the temporary mentor.junior Algebra · Junior access (P0 undone) | Mentor-assignment row `isActive=false`; 1 audit entry. **Correction (verified in the backend code):** open reviews are *not* moved; the reopened `[TEST]` review stays with mentor.junior |

At every step: student.s5 (Senior) cannot see s2's submission or result (404), mentor.senior cannot see the Junior work, and students and mentors are refused admin actions (403). These are read-only checks.

### How the run is kept safe
- Only one assignment is touched (`a266c16c…`, title starts with `[TEST]`). Distribute, approve and publish are called with that assignment id only. "Assignment1" and the Sample set are never called.
- Only demo accounts act. `theoneste` is never used. Its only effect is that its Junior leaderboard position changes while step 12's points are active; step 14 restores them.
- Every note, feedback and reason starts with `[TEST]`. The script records every created id in `phase5-workflow-created.json` (scratchpad).
- The script stops at the first failed step and never retries a data-changing call. It reports the exact state reached.
- The script checks preconditions before any write: assignment PUBLISHED with 0 submissions, an eligible Algebra · Junior mentor, and s2 at 30 points.

### What cannot be removed afterwards (backend has no delete)
Submission rows and their files, review cycles, the distribution batch, the result-release history, notifications, e-mail outbox rows (DRY_RUN) and audit entries. All of them belong to the archived `[TEST]` assignment.

## 2. Phase 6: data-changing checks (`api-p6-writes.mjs`)

The script needs one change before it runs: D2's reply will be posted by **admin** instead of mentor.junior, because mentor.junior has lost access to the Geometry thread. No new thread is needed.

### Required

| # | Account | Operation | Expected result | Database change (and restore) |
|---|---|---|---|---|
| N1 | mentor.junior | Mark its discussion notification read, then unread | `updated: 1`, unread count −1, then restored | `readAt` set, then reset to null |
| P1 | student.s2 | Home location → "Kigali [TEST]", then back to "Kigali" | 200 with the new value, then the original | Restored |
| P2 | student.s2 | E-mail for RESOURCES off, then on; ACCOUNT can't be turned off | Values as sent; ACCOUNT stays on | One preference row remains (value on, same as the default) |
| P3 | mentor.junior | One notification type switched off in-app; e-mail switch refused for an app-only type (400); reset | Switch off, 400, all on | Setting rows deleted by the reset |
| D1 | student.s2 | Post `[TEST] phase 6 comment <timestamp>` on its own thread `b068d3b9…` | 201 | Comment row |
| D2 | admin | Reply to that comment | 201; s2 gets "New reply to your comment" linking to `/discussions/b068d3b9…` | Reply row; notification to s2 (marked read again at the end) |
| D3 | student.s2 | Like the reply twice (on, off); edit own comment; try to edit admin's reply | Toggle OK; edit OK; 403 | Reaction row added and removed; `editedAt` on the comment |
| D4 | admin, student.s2 | Delete the reply and the comment | 200 | Both soft-deleted (rows stay, content shows `[deleted]`) |

### Optional

| # | Operation | Why optional | Change |
|---|---|---|---|
| N2 | s2: mark all read, then mark the same ids unread | Same mechanism as N1, plus the bulk endpoint | `readAt` on 3 notifications, restored |
| R1 | Report the `[TEST]` comment before it is deleted | Leaves an **open moderation report** that the admin must dismiss (a second data change); it would also test moderation end to end | Report row; notification to admins; then a dismissal and its audit entry |
| W1 | student.s5: change password and back | **Signs out every s5 session twice** and writes 2 audit entries | Password restored |
| UI | Click one notification in the browser (marks it read through the UI), then restore it with the API | Confirms the browser path for N1 | `readAt`, restored |

## 3. Admin-side Phase 6 checks (read-only, not yet written)

| Area | Checks |
|---|---|
| Bell and inbox | Badge = unread count; dropdown and `/admin/notifications` rows = API; admin notification links (`/admin/assignments/:id`, `/admin/submissions/:id`, `/admin/moderation/reports/:id`) open admin pages |
| Deep links | `/assignments/:id` → `/admin/assignments/:id`; `/discussions/:id` → `/admin/discussions/:id`; `/results/:id` → "not available" |
| Thread page | `/admin/discussions/b068d3b9…` renders (admins see every scope); report detail "View discussion" link |
| Profile | `/admin/profile` = `/me`; the 6 admin notification types with "App only" where applicable; Discard sends nothing |
| Navigation | Navbar → `/admin/profile`; sidebar Settings → `/admin/settings` (with a "My profile" link); Help → `/support` with the platform-settings link |

**Recommendation:** include these in final QA now, as about 20 read-only checks with one admin sign-in and no CSV download. They need no approval because they write nothing. Writing them is pending your go-ahead. In the same pass I'd update the two Phase 6 suites that still expect mentor.junior to open the Geometry thread.

## 4. Operations needing approval

| ID | Operation | Account(s) |
|---|---|---|
| A1 | P0-a: temporary mentor.junior Algebra · Junior access, removed in step 16 (or P0-b instead) | admin |
| A2 | Phase 5 workflow steps 3–16 on `a266c16c…` | s2, mentor.junior, admin |
| A3 | Phase 6 required: N1, P1, P2, P3, D1–D4 | mentor.junior, s2, admin |
| A4 | Phase 6 optional, each separately: N2, R1, W1, UI | as listed |
| A5 | Write and run the read-only admin Phase 6 checks (§3); no data change | admin |

## 5. Risks

| Risk | Mitigation |
|---|---|
| A step fails half-way, leaving the `[TEST]` assignment in an intermediate state | Stop at the first failure, report the state; finish or clean up only with approval |
| s2's leaderboard points change | Restored by step 14 (reopen). If the run stops between 12 and 14, the points stay until reopen is run |
| `theoneste` sees the `[TEST]` assignment | Already the case since 12:07; archiving keeps it visible read-only. P0-b would add another notification for it |
| Permanent rows (submissions, reviews, audit, notifications) | All tied to `[TEST]` records; listed in §1 |
| The temporary Algebra · Junior access stays if the run is interrupted | Step 16 is listed separately; it can run on its own |
| Password test (W1) locks s5 out if interrupted after the first change | Optional; the restore runs immediately after; the temporary password is recorded in the script only |

## 6. Results (2026-11-06, approved A1–A3 and A5)

| Run | Result | Data now |
|---|---|---|
| A5 | Admin phase 6 read-only 25/25; discussions suite (current access) 28/28; notifications suite expectation updated (s2 now also has assignment notifications) | — |
| A1 + A2 | 53/54. The failed check expected students to open an archived assignment; the backend returns 404 for archived assignments (brief files stay downloadable — a minor backend inconsistency). Stopped before step 16 | `[TEST]` assignment ARCHIVED; submission `49b2a4eb…` reopened (REJECTED, with mentor.junior); s2 back to 30 points; **temporary scope `1fd69010…` still active**; ids in `phase5-workflow-created.json` |
| A3 | 20/20 | Restored: s2 home location, RESOURCES e-mail, mentor.junior switches, N1 read state. Kept: 2 soft-deleted `[TEST]` comments; D2 notification marked read |

Permanent records from these runs: the `[TEST]` submission (3 attempts, PDFs), review cycles, distribution batch, result release, notifications (s2 and mentor.junior left unread), audit entries.

## 7. Contact form on the main database (proposed, not run)

Covered already on the disposable `rof-test` database (15 e2e tests). Optional confirmation on `rof`, only with approval:

| # | Step | Data written |
|---|---|---|
| C1 | Send one contact message from the homepage (subject "[TEST] contact form") | 1 `ContactMessage` row; an `EmailDelivery` row only if a support e-mail is set (DRY_RUN locally) |
| C2 | Admin → Messages: the message appears under New; open it; Mark handled; then Mark as new | Status changes + 2 audit entries |
| C3 | Leave it handled | — |

There is no delete for contact messages; the `[TEST]` row would stay (status Handled).

**Result (2026-11-07, approved):** run. 1 `ContactMessage` row (`ba0e0625…`, "[TEST] contact form 2026-11-06T22:13", from qa-test@example.org) left HANDLED; 1 e-mail queued to info@rwandaolympiadfoundation.org (DRY_RUN locally); 3 audit entries. 16/18 checks; the 2 failures were a wrong test expectation ("no support e-mail set") after the owner configured one.
