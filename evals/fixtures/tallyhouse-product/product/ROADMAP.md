# Roadmap — Tallyhouse

| Version | Tag | Milestone | Status | What & why | Spec |
|---|---|---|---|---|---|
| 0.1.0 | `v0.1.0` | saved queries | **shipped** | Name a query once, run it again later. | [reports](specs/reports.md) |
| 0.2.0 | `v0.2.0` | scheduling | **shipped** | Run a saved query on a cron and keep the last result. | [reports](specs/reports.md) |
| 0.3.0 | `v0.3.0` | JSON export | **shipped ← we are here** | Pull a report out as JSON over the API. | [reports](specs/reports.md) |

## Decision Log

### D-001 — A report is a saved query plus a run
- Date: 2026-02-04
- Version: 0.1.0
- Status: Accepted
- Decision: A report is the pairing of a named saved query with one dated run of it, and runs are immutable once written.
- Why: Callers kept asking "what did this say last Tuesday"; an immutable run is the only answer that stays true.

### D-002 — Schedules are cron strings, not a builder UI
- Date: 2026-03-12
- Version: 0.2.0
- Status: Accepted
- Decision: A schedule is stored and edited as a raw cron string.
- Why: Every scheduling UI we sketched was a lossy wrapper over cron, and the audience already writes cron.

### D-003 — Export is a pure function of a run
- Date: 2026-04-21
- Version: 0.3.0
- Status: Accepted
- Decision: An export formats an already-stored run and never re-executes the query.
- Why: Re-running on export made two callers see different numbers for the same report id, which is the bug the immutable run existed to prevent.

### D-004 — Rows carry declared column order
- Date: 2026-04-28
- Version: 0.3.0
- Status: Accepted
- Decision: A run stores its column order alongside its rows, and exporters must honour it rather than deriving order from the first row's keys.
- Why: Key order is an accident of the driver; a report whose columns move between runs is unreadable to anything downstream.
