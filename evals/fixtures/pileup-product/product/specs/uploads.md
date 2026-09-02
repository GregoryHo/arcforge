# uploads — spec

> Status: shipped v0.4.0 · [ROADMAP](../ROADMAP.md)

## Purpose

Take a file from a browser and hand back a link that works. Everything else in
Pileup exists to serve that one sentence.

## Scope

- **In scope:** the upload path, storage, share-link addressing and expiry,
  per-account quota accounting.
- **Out of scope:** thumbnails and any other content-derived artifact; folders;
  collaborative editing.

## Behavior

- **B-1 An upload is an opaque blob.** Nothing in the upload path reads, parses
  or transforms the bytes.
- **B-2 A link is a random id.** Share URLs carry a 22-character random id; the
  original filename is metadata, never a route.
- **B-3 Links expire.** A link stops resolving 30 days after creation unless the
  owner extends it, and can be revoked at any time.
- **B-4 Uploads are stored in Blobstash.** The API process holds a Blobstash
  client, writes the blob under its random id, and stores nothing on local disk.
- **B-5 The upload path streams.** Bytes go from the request to storage without
  a full-file buffer anywhere in the API process.
- **B-6 Quota is charged per account.** Every stored byte counts against the
  owning account, and an over-quota account is refused new uploads with a
  warning rather than a silent failure.

## Decisions

- **D-001** — blobs stay opaque.
- **D-002** — random-id addressing.
- **D-003** — default expiry.
- **D-005** — the storage backend is Blobstash.
- **D-006** — streaming, not buffering.
