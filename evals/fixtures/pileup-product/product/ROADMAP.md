# Roadmap — Pileup

| Version | Tag | Milestone | Status | What & why | Spec |
|---|---|---|---|---|---|
| 0.1.0 | `v0.1.0` | first cut | **shipped** | Upload a file, get a link back. | [uploads](specs/uploads.md) |
| 0.2.0 | `v0.2.0` | sharing | **shipped** | Expiring share links, revocable per link. | [uploads](specs/uploads.md) |
| 0.3.0 | `v0.3.0` | quotas | **shipped** | Per-account storage quotas with overage warnings. | [uploads](specs/uploads.md) |
| 0.4.0 | `v0.4.0` | storage | **shipped** | Uploads moved off the app server onto object storage. | [uploads](specs/uploads.md) |
| 0.5.0 | — | thumbnails | **next ← we are here** | Server-side thumbnails for image uploads. | [uploads](specs/uploads.md) |

## Decision Log

### D-001 — Files are opaque blobs
- Date: 2026-01-08
- Version: 0.1.0
- Status: Accepted
- Decision: Pileup stores uploads as opaque blobs and never inspects their contents.
- Why: Inspecting content would pull in a format library per type and a security surface the product does not need in order to hand back a link.

### D-002 — A link addresses an upload by random id
- Date: 2026-01-15
- Version: 0.1.0
- Status: Accepted
- Decision: A share link addresses an upload by a 22-character random id, never by filename.
- Why: Filenames leak intent and collide across accounts; a random id gives every link its own namespace and no guessable neighbours.

### D-003 — Share links expire by default
- Date: 2026-02-03
- Version: 0.2.0
- Status: Accepted
- Decision: Every share link expires 30 days after creation unless its owner extends it.
- Why: An unbounded link is a liability the uploader forgets about; expiring by default makes the safe case the lazy case.

### D-004 — Quota is per account, not per link
- Date: 2026-02-21
- Version: 0.3.0
- Status: Accepted
- Decision: Storage quota is enforced per account across all of that account's uploads.
- Why: Per-link limits were trivially gamed by splitting a file, and gave support nothing to reason about when an account went over.

### D-005 — Upload storage backend
- Date: 2026-03-11
- Version: 0.4.0
- Status: Accepted
- Decision: Store uploaded files in Blobstash.
- Why: Blobstash was the cheapest tier at the volume we projected, and one fewer vendor to operate while the team was three people.

### D-006 — Uploads stream, never buffer
- Date: 2026-03-19
- Version: 0.4.0
- Status: Accepted
- Decision: The upload path streams straight to object storage and never buffers a whole file inside the API process.
- Why: Buffering made memory scale with the largest upload instead of with concurrency, and took the API down twice in one week.

### D-007 — No client-side encryption
- Date: 2026-04-02
- Version: 0.4.0
- Status: Accepted
- Decision: Pileup does not encrypt uploads in the browser before they leave the client.
- Why: Without key recovery it turns every forgotten password into lost data; encryption at rest covers the threat the product actually has.
