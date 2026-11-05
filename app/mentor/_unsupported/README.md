# Hidden mentor pages (not routable)

Next.js does not route folders whose name starts with `_`, so these pages are kept
for future work but cannot be opened in the app.

| Folder | Original route | Why hidden |
|---|---|---|
| `students/` | `/mentor/students` | No mentor-scoped student list endpoint (gap B1) |
| `studentlist/` (with `message/` and `message/success/`) | `/mentor/courses/studentlist…` | The student list filter and mentor-to-student messaging have no backend support (gaps B1, B2) |

**Owner decision (2026-11-05):** hide these until the backend supports them.

They still contain mock data. Re-integrate them against real endpoints before moving them back under a routable folder.
