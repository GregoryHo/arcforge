# reports — spec

> Status: shipped v0.3.0 · [ROADMAP](../ROADMAP.md)

## Purpose

Run a saved query, keep the result, and hand it back in a format the caller can
use. A report is the durable answer to a question somebody asked once and will
ask again.

## Scope

- **In scope:** saved queries, runs, schedules, and the export surface over a
  stored run.
- **Out of scope:** the query language itself; charting; anything that mutates a
  run after it is written.

## Behavior

- **B-1 A run is immutable.** Once a run is written its rows never change; a
  re-execution creates a new run with a new id.
- **B-2 A run carries its column order.** Column order is stored with the run and
  is part of what the run means.
- **B-3 Export never re-executes.** An export reads a stored run and formats it;
  it never touches the datasource.
- **B-4 JSON export is available over the API.** A caller can pull any stored run
  as JSON, with the run's declared column order preserved in the object keys.
- **B-5 An unknown export format is refused loudly.** Asking for a format the
  tool does not implement fails with the format named in the error, never with a
  silent fallback.

## Decisions

- **D-001** — a report is a saved query plus an immutable run.
- **D-003** — export is a pure function of a stored run.
- **D-004** — runs carry declared column order.
