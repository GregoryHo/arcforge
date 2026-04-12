# Depth Enhancements for Comprehensive Diagrams

Read this file when Step 0 determines the diagram is **Comprehensive/Technical**. These enhancements add steps to the main pipeline — they don't replace it.

## When to Use

A diagram is comprehensive when it visualizes a **real system, protocol, or API** and the audience needs to see what things actually look like — not just what they're called. Tutorials, technical architectures, and educational content all qualify.

If the diagram is a conceptual mental model (abstract relationships, philosophies, high-level flows), these enhancements don't apply. The main pipeline handles it.

## Enhancement 1: Research Mandate

**When:** After Step 1 (Understand), before Step 2 (Pattern).

Before drawing anything technical, research the actual specifications:

1. Look up actual JSON/data formats
2. Find real event names, method names, API endpoints
3. Understand how pieces actually connect
4. Use real terminology, not generic placeholders

**Bad:** "Protocol" → "Frontend"
**Good:** "AG-UI streams events (RUN_STARTED, STATE_DELTA)" → "CopilotKit renders via createA2UIMessageRenderer()"

Research makes diagrams accurate AND educational.

## Enhancement 2: Multi-Zoom Architecture

**When:** During Step 2 (Pattern) — plan the zoom levels as part of pattern mapping.

Comprehensive diagrams operate at multiple zoom levels simultaneously, like a map with both country borders and street names:

### Level 1: Summary Flow
A simplified overview showing the full pipeline at a glance. Often placed at the top or bottom of the diagram.

*Example:* `Input → Processing → Output` or `Client → Server → Database`

### Level 2: Section Boundaries
Labeled regions that group related components. These create visual "rooms" that help viewers understand what belongs together.

*Example:* Grouping by responsibility (Backend / Frontend), by phase (Setup / Execution / Cleanup), or by team (User / System / External)

### Level 3: Detail Inside Sections
Evidence artifacts (see Enhancement 3), code snippets, and concrete examples within each section. This is where the educational value lives.

For comprehensive diagrams, aim to include all three levels. The summary gives context, the sections organize, and the details teach.

## Enhancement 3: Evidence Artifacts

**When:** During Phase 1 (Build) — add evidence elements alongside the regular diagram elements.

Evidence artifacts are concrete examples that prove the diagram is accurate and help viewers learn. They show what things actually look like, not just what they're called.

### Types

| Artifact Type | When to Use | How to Render |
|---------------|-------------|---------------|
| **Code snippets** | APIs, integrations, implementations | Dark rectangle + syntax-colored text |
| **Data/JSON examples** | Data formats, schemas, payloads | Dark rectangle + green text |
| **Event sequences** | Protocols, workflows, lifecycles | Timeline pattern with real event names |
| **UI mockups** | Showing actual output/results | Nested rectangles mimicking real UI |
| **Real input content** | Showing what goes IN to a system | Rectangle with sample content |
| **API/method names** | Real function calls, endpoints | Use actual names from docs |

### Rendering Evidence in EA

Use a dark rectangle with light-colored text for code/JSON artifacts:

```javascript
// Code snippet artifact
s.backgroundColor = '#1e293b';  // dark background (from palette: evidence artifact)
s.fontSize = 12;
s.strokeColor = '#22c55e';      // green text for JSON
const code = ea.addText(x, y, '{\n  "event": "RUN_STARTED",\n  "threadId": "abc-123"\n}', {
  box: 'rectangle',
  boxPadding: 12,
  boxStrokeColor: '#334155'
});
```

### Simple vs Comprehensive Comparison

| Simple Diagram | Comprehensive Diagram |
|----------------|----------------------|
| Generic: "Input" → "Process" → "Output" | Shows what input/output actually looks like |
| Named boxes: "API", "Database" | Named boxes + example requests/responses |
| "Events" or "Messages" label | Timeline with real event names from spec |
| ~30 seconds to explain | ~2-3 minutes of teaching content |
| Viewer learns the structure | Viewer learns the structure AND the details |

## Quality Checklist (Comprehensive Only)

In addition to the standard isomorphism test:

1. **Research done**: Did you look up actual specs, formats, event names?
2. **Evidence present**: Are there code snippets, JSON examples, or real data?
3. **Multi-zoom**: Does it have summary flow + section boundaries + detail?
4. **Concrete over abstract**: Real content shown, not just labeled boxes?
5. **Educational value**: Could someone learn something concrete from this?
