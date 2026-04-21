# Epic: Verdict Tightening and Discipline Routing

## Summary
Introduce INSUFFICIENT_DATA verdict for k<5 so no SHIP claim can be issued without a confidence interval; register arc-evaluating as a Discipline Skill in arc-using routing table.

## Source
Detail file: `specs/arc-evaluating-v2/details/verdict-and-routing.xml`

## Dependencies
_none (can start immediately)_

## Features
- **vr-001** — INSUFFICIENT_DATA verdict when k<5 (source: `fr-vr-001`)
- **vr-002** — arc-using routing table integration (source: `fr-vr-002`)
