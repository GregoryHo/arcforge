// SDD Pipeline section — the hero narrative of arcforge.
// Big subway-map diagram: Upstream → Downstream with annotations.

function SDDPipeline({
  theme: t
}) {
  return /*#__PURE__*/React.createElement(PageSection, {
    theme: t,
    id: "pipeline"
  }, /*#__PURE__*/React.createElement(SectionHeader, {
    n: "04",
    kicker: "V3 \xB7 LIVING SPEC WIKI \xB7 OPTIMIZATION LOOP",
    title: /*#__PURE__*/React.createElement(React.Fragment, null, "A spec that ", /*#__PURE__*/React.createElement("em", {
      style: {
        color: t.brass,
        fontStyle: 'italic'
      }
    }, "compounds"), ", agent after agent."),
    sub: /*#__PURE__*/React.createElement(React.Fragment, null, "The optimization flow at the core of v3. ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: t.ink
      }
    }, "Humans"), " contribute intent, tradeoffs, and approvals. ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: t.ink
      }
    }, "LLMs"), " maintain the artifacts \u2014 behavior scenarios, contracts, decisions, drift warnings \u2014 so each cycle leaves the next agent (or your future session) with a sharper map. Reconstruction beats re-explanation."),
    theme: t
  }), /*#__PURE__*/React.createElement("div", {
    "data-af-reveal": true,
    style: {
      background: t.bg2,
      border: `1px solid ${t.line}`,
      borderRadius: 4,
      padding: '48px 56px',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      top: 10,
      left: 10
    },
    color: t.ember
  }), /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      top: 10,
      right: 10
    },
    flip: true,
    color: t.ember
  }), /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      bottom: 10,
      left: 10
    },
    flipV: true,
    color: t.ember
  }), /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      bottom: 10,
      right: 10
    },
    flip: true,
    flipV: true,
    color: t.ember
  }), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 1200 720",
    style: {
      width: '100%',
      height: 'auto'
    }
  }, /*#__PURE__*/React.createElement(SketchDefs, {
    id: "sk-sdd",
    scale: 1.1,
    seed: 5
  }), /*#__PURE__*/React.createElement("g", {
    transform: "translate(40,40)"
  }, /*#__PURE__*/React.createElement("text", {
    x: "0",
    y: "0",
    fill: t.brass,
    fontSize: "12",
    letterSpacing: "3",
    fontFamily: "JetBrains Mono,monospace",
    fontWeight: "700"
  }, "UPSTREAM \xB7 DESIGN"), /*#__PURE__*/React.createElement("text", {
    x: "0",
    y: "18",
    fill: t.dim,
    fontSize: "11",
    fontFamily: "Fraunces,serif",
    fontStyle: "italic"
  }, "from vague idea to a planned DAG"), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-sdd)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M0 60 H 1100",
    stroke: t.brass,
    strokeWidth: "1.4",
    fill: "none"
  })), /*#__PURE__*/React.createElement(StageNode, {
    x: 60,
    y: 60,
    label: "brainstorm",
    desc: "explore ideas",
    color: t.brass,
    t: t
  }), /*#__PURE__*/React.createElement(StageNode, {
    x: 380,
    y: 60,
    label: "refine",
    desc: "spec + YAGNI",
    color: t.brass,
    t: t
  }), /*#__PURE__*/React.createElement(StageNode, {
    x: 700,
    y: 60,
    label: "plan",
    desc: "DAG of tasks",
    color: t.brass,
    t: t
  }), /*#__PURE__*/React.createElement(StageNode, {
    x: 1020,
    y: 60,
    label: "coordinate",
    desc: "worktrees",
    color: t.brass,
    t: t
  }), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-sdd)"
  }, /*#__PURE__*/React.createElement(ArrowLine, {
    x1: 150,
    x2: 320,
    y: 60,
    color: t.brass
  }), /*#__PURE__*/React.createElement(ArrowLine, {
    x1: 470,
    x2: 640,
    y: 60,
    color: t.brass
  }), /*#__PURE__*/React.createElement(ArrowLine, {
    x1: 790,
    x2: 960,
    y: 60,
    color: t.brass
  })), /*#__PURE__*/React.createElement(CalloutSmall, {
    x: 60,
    y: 110,
    text: "\"add OAuth login\"",
    t: t
  }), /*#__PURE__*/React.createElement(CalloutSmall, {
    x: 380,
    y: 110,
    text: "spec.xml \xB7 scope declared",
    t: t
  }), /*#__PURE__*/React.createElement(CalloutSmall, {
    x: 700,
    y: 110,
    text: "dag.yaml \xB7 12 tasks",
    t: t
  }), /*#__PURE__*/React.createElement(CalloutSmall, {
    x: 1020,
    y: 110,
    text: "3 epic worktrees",
    t: t
  })), /*#__PURE__*/React.createElement("g", {
    transform: "translate(580,190)"
  }, /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-sdd)"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "-70",
    y: "-18",
    width: "140",
    height: "36",
    fill: t.card,
    stroke: t.ember,
    strokeWidth: "1.6",
    rx: "4"
  })), /*#__PURE__*/React.createElement("text", {
    y: "5",
    textAnchor: "middle",
    fill: t.ember,
    fontSize: "12",
    fontFamily: "JetBrains Mono,monospace",
    letterSpacing: "1.5"
  }, "HANDOFF")), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-sdd)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M580 150 L580 190",
    stroke: t.ember,
    strokeWidth: "1.4",
    fill: "none",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M580 210 L580 280",
    stroke: t.ember,
    strokeWidth: "1.4",
    fill: "none",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "575,275 585,275 580,285",
    fill: t.ember
  })), /*#__PURE__*/React.createElement("g", {
    transform: "translate(40,300)"
  }, /*#__PURE__*/React.createElement("text", {
    x: "0",
    y: "0",
    fill: t.ember,
    fontSize: "12",
    letterSpacing: "3",
    fontFamily: "JetBrains Mono,monospace",
    fontWeight: "700"
  }, "DOWNSTREAM \xB7 BUILD"), /*#__PURE__*/React.createElement("text", {
    x: "0",
    y: "18",
    fill: t.dim,
    fontSize: "11",
    fontFamily: "Fraunces,serif",
    fontStyle: "italic"
  }, "pick the execution mode that fits the work \u2014 not a pipeline, a chooser"), /*#__PURE__*/React.createElement("g", {
    transform: "translate(560,70)"
  }, /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-sdd)"
  }, /*#__PURE__*/React.createElement("polygon", {
    points: "0,-28 96,0 0,28 -96,0",
    fill: t.card,
    stroke: t.ember,
    strokeWidth: "1.6"
  })), /*#__PURE__*/React.createElement("text", {
    y: "-4",
    textAnchor: "middle",
    fill: t.ember,
    fontSize: "10",
    letterSpacing: "2",
    fontFamily: "JetBrains Mono,monospace",
    fontWeight: "700"
  }, "ROUTE BY"), /*#__PURE__*/React.createElement("text", {
    y: "12",
    textAnchor: "middle",
    fill: t.ink,
    fontSize: "12",
    fontFamily: "Fraunces,serif",
    fontStyle: "italic"
  }, "scope \xD7 attendance")), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-sdd)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M470 70 L 140 200",
    stroke: t.ember,
    strokeWidth: "1.2",
    fill: "none",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M510 98 L 420 200",
    stroke: t.ember,
    strokeWidth: "1.2",
    fill: "none",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M610 98 L 700 200",
    stroke: t.ember,
    strokeWidth: "1.2",
    fill: "none",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M650 70 L 980 200",
    stroke: t.ember,
    strokeWidth: "1.2",
    fill: "none",
    strokeDasharray: "3 3"
  })), /*#__PURE__*/React.createElement(ModeCard, {
    x: 20,
    y: 200,
    name: "arc-agent-driven",
    axis: "task \xB7 present",
    note: "fresh subagent per task, two-stage review",
    color: t.ember,
    t: t
  }), /*#__PURE__*/React.createElement(ModeCard, {
    x: 300,
    y: 200,
    name: "arc-implementing",
    axis: "epic \xB7 orchestrator",
    note: "expands epic \u2192 features \u2192 tasks; calls skills",
    color: t.ember,
    t: t
  }), /*#__PURE__*/React.createElement(ModeCard, {
    x: 580,
    y: 200,
    name: "arc-dispatching-teammates",
    axis: "multi-epic \xB7 present",
    note: "one teammate per ready epic; lead monitors",
    color: t.ember,
    t: t
  }), /*#__PURE__*/React.createElement(ModeCard, {
    x: 860,
    y: 200,
    name: "arc-looping",
    axis: "dag \xB7 walk-away",
    note: "fresh session per task, overnight",
    color: t.ember,
    t: t
  }), /*#__PURE__*/React.createElement("g", {
    transform: "translate(320,330)"
  }, /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-sdd)"
  }, /*#__PURE__*/React.createElement("rect", {
    width: "500",
    height: "46",
    fill: t.card,
    stroke: t.brass,
    strokeWidth: "1.2",
    strokeDasharray: "3 3",
    rx: "4"
  })), /*#__PURE__*/React.createElement("text", {
    x: "16",
    y: "20",
    fill: t.brass,
    fontSize: "10",
    letterSpacing: "2",
    fontFamily: "JetBrains Mono,monospace"
  }, "TWO-STAGE REVIEW \u2014 spec-reviewer \u2192 quality-reviewer"), /*#__PURE__*/React.createElement("text", {
    x: "16",
    y: "36",
    fill: t.mute,
    fontSize: "11",
    fontFamily: "Fraunces,serif",
    fontStyle: "italic"
  }, "fires inside agent-driven and on every teammate completion \xB7 walk-away loops defer to verifier"))), /*#__PURE__*/React.createElement("g", {
    fontFamily: "'Caveat',cursive",
    fontSize: "18",
    fill: t.brass
  }, /*#__PURE__*/React.createElement("text", {
    x: "1000",
    y: "260",
    transform: "rotate(-4 1000 260)"
  }, "YAGNI ruthlessly applied")), /*#__PURE__*/React.createElement("g", {
    fontFamily: "'Caveat',cursive",
    fontSize: "18",
    fill: t.ember
  }, /*#__PURE__*/React.createElement("text", {
    x: "40",
    y: "700",
    transform: "rotate(-2 40 700)"
  }, "one workflow, four gears \u2014 pick the one that fits the work")))), /*#__PURE__*/React.createElement("div", {
    "data-af-reveal": true,
    style: {
      marginTop: 72,
      background: t.card,
      border: `1px solid ${t.line}`,
      borderRadius: 4,
      padding: '40px 48px 36px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      top: 8,
      left: 8
    },
    color: t.brass
  }), /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      top: 8,
      right: 8
    },
    flip: true,
    color: t.brass
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      fontSize: 11,
      letterSpacing: 3,
      color: t.brass,
      marginBottom: 14,
      fontFamily: '"JetBrains Mono",monospace'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "THE V3 LOOP"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 1,
      background: t.brass
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.dim
    }
  }, "INTENT \u2192 ARTIFACTS \u2192 BUILD \u2192 SYNC \u2192 RECONSTRUCT")), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: '"Fraunces",serif',
      fontWeight: 400,
      fontStyle: 'italic',
      fontSize: 30,
      letterSpacing: -.5,
      margin: '0 0 10px 0',
      color: t.ink
    }
  }, "Each cycle leaves the next agent a sharper map."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: t.mute,
      fontSize: 14,
      lineHeight: 1.6,
      maxWidth: 820,
      margin: '0 0 32px 0'
    }
  }, "Artifacts persist across sessions. When a new session starts \u2014 or a fresh agent inherits the work \u2014 the spec carries behavior, contracts, and decisions forward instead of re-asking. Code is reconstructable; intent and tradeoffs are not."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'stretch',
      gap: 0,
      marginBottom: 32,
      borderTop: `1px dashed ${t.line}`,
      borderBottom: `1px dashed ${t.line}`,
      padding: '18px 0'
    }
  }, (() => {
    const stages = [['intent', 'human signal', t.brass], ['living spec wiki', 'LLM-maintained', t.brass], ['dag · tasks', 'plan derived', t.brass], ['implementation', 'build the thing', t.ember], ['spec sync', 'LLM updates artifacts', t.ember], ['verify · eval', 'evidence gate', t.ember], ['resume · reconstruct', 'next agent inherits', t.brass]];
    const out = [];
    stages.forEach(([name, note, color], i) => {
      out.push(/*#__PURE__*/React.createElement("div", {
        key: `s-${i}`,
        style: {
          flex: '1 1 130px',
          minWidth: 120,
          padding: '4px 6px'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontFamily: '"JetBrains Mono",monospace',
          fontSize: 12,
          color,
          fontWeight: 700
        }
      }, name), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          color: t.mute,
          fontStyle: 'italic',
          fontFamily: '"Fraunces",serif',
          marginTop: 3,
          lineHeight: 1.4
        }
      }, note)));
      if (i < stages.length - 1) {
        out.push(/*#__PURE__*/React.createElement("div", {
          key: `a-${i}`,
          style: {
            display: 'flex',
            alignItems: 'center',
            color: t.dim,
            fontFamily: '"JetBrains Mono",monospace',
            fontSize: 14,
            padding: '0 2px'
          }
        }, "\u2192"));
      }
    });
    return out;
  })()), /*#__PURE__*/React.createElement("div", {
    className: "af-grid-2col",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      letterSpacing: 2.5,
      color: t.brass,
      fontWeight: 700,
      marginBottom: 10,
      fontFamily: '"JetBrains Mono",monospace'
    }
  }, "HUMAN-OWNED"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      paddingLeft: 18,
      color: t.mute,
      fontSize: 13,
      lineHeight: 1.7
    }
  }, /*#__PURE__*/React.createElement("li", null, "Intent and product principles"), /*#__PURE__*/React.createElement("li", null, "Priority and tradeoff decisions"), /*#__PURE__*/React.createElement("li", null, "Approving (or correcting) LLM summaries"), /*#__PURE__*/React.createElement("li", null, "Open questions the agent must not invent answers for"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      letterSpacing: 2.5,
      color: t.ember,
      fontWeight: 700,
      marginBottom: 10,
      fontFamily: '"JetBrains Mono",monospace'
    }
  }, "LLM-OWNED"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      paddingLeft: 18,
      color: t.mute,
      fontSize: 13,
      lineHeight: 1.7
    }
  }, /*#__PURE__*/React.createElement("li", null, "Behavior scenarios, contracts, architecture notes"), /*#__PURE__*/React.createElement("li", null, "Decision log: what was decided and why"), /*#__PURE__*/React.createElement("li", null, "Spec sync from diffs, tests, and conversation"), /*#__PURE__*/React.createElement("li", null, "Drift warnings when code and spec diverge"))))), /*#__PURE__*/React.createElement("div", {
    "data-af-reveal": true,
    style: {
      marginTop: 48,
      background: t.bg2,
      border: `1px solid ${t.line}`,
      borderRadius: 4,
      padding: '40px 48px 12px',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      fontSize: 11,
      letterSpacing: 3,
      color: t.ember,
      marginBottom: 14,
      fontFamily: '"JetBrains Mono",monospace'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "ARTIFACTS \xB7 specs/<id>/"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 1,
      background: t.ember
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.dim
    }
  }, "WHAT THE AGENT MAINTAINS")), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: '"Fraunces",serif',
      fontWeight: 400,
      fontStyle: 'italic',
      fontSize: 24,
      letterSpacing: -.3,
      margin: '0 0 24px 0',
      color: t.ink
    }
  }, "A small set of pages a future agent can rebuild from."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 0,
      borderTop: `1px solid ${t.line}`
    }
  }, [['intent.md', 'Why the product exists. Goals, non-goals, constraints, success criteria.'], ['behavior.md', 'Workflows, scenarios, acceptance criteria, edge cases, failure modes.'], ['architecture.md', 'Modules, boundaries, dependencies, invariants, rationale.'], ['contracts.md', 'CLI commands, APIs, config schemas, file formats, hook contracts.'], ['decisions.md', 'Decision log: choice, reason, alternatives, consequences, approval.'], ['verification.md', 'How a future agent knows it rebuilt the system right — tests, smoke checks, evals.'], ['open-questions.md', 'The only place unresolved human decisions accumulate. Agents ask, never invent.']].map(([name, desc]) => /*#__PURE__*/React.createElement("div", {
    key: name,
    style: {
      borderBottom: `1px solid ${t.line}`,
      padding: '16px 0',
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      gap: 16,
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '"JetBrains Mono",monospace',
      fontSize: 13,
      color: t.brass,
      fontWeight: 600
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: t.mute,
      lineHeight: 1.55
    }
  }, desc))))), /*#__PURE__*/React.createElement("div", {
    "data-af-reveal": true,
    className: "af-grid-2col",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 24,
      marginTop: 48
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.card,
      border: `1px solid ${t.line}`,
      padding: '28px 32px',
      borderRadius: 3
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: 3,
      color: t.brass,
      fontWeight: 700,
      marginBottom: 10,
      fontFamily: '"JetBrains Mono",monospace'
    }
  }, "SDD LITE"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '"Fraunces",serif',
      fontSize: 20,
      fontStyle: 'italic',
      color: t.ink,
      marginBottom: 10,
      letterSpacing: -.3
    }
  }, "For ordinary feature work."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: t.mute,
      fontSize: 13,
      lineHeight: 1.6,
      margin: 0
    }
  }, "Low human effort, not low artifact value. The LLM extracts and updates the artifacts; you review summaries and answer the few decisions that matter. No DAG, no worktrees, no audit required.")), /*#__PURE__*/React.createElement("div", {
    style: {
      background: t.card,
      border: `1px solid ${t.line}`,
      padding: '28px 32px',
      borderRadius: 3
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: 3,
      color: t.ember,
      fontWeight: 700,
      marginBottom: 10,
      fontFamily: '"JetBrains Mono",monospace'
    }
  }, "FULL SDD"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '"Fraunces",serif',
      fontSize: 20,
      fontStyle: 'italic',
      color: t.ink,
      marginBottom: 10,
      letterSpacing: -.3
    }
  }, "Only when scale or risk justifies it."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: t.mute,
      fontSize: 13,
      lineHeight: 1.6,
      margin: 0
    }
  }, "Multi-epic work, parallel agents, long-lived changes, high-risk contracts, skill or harness work that needs eval evidence. Adds DAGs, epics, worktrees, audits, and eval matrices on top of the Lite artifacts."))), /*#__PURE__*/React.createElement("div", {
    className: "af-grid-2col",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 48,
      marginTop: 72
    }
  }, /*#__PURE__*/React.createElement(DeepCard, {
    kicker: "UPSTREAM",
    title: "brainstorm \u2192 refine \u2192 plan",
    color: t.brass,
    bullets: [['arc-brainstorming', 'One question at a time. 2–3 approaches with trade-offs. No design without exploration first.'], ['arc-refining', 'Lifts the design into a structured spec.xml. Detects new-topic vs iteration from the filesystem.'], ['arc-planning', 'Emits a dag.yaml — epics, features, dependencies. Parallel edges become worktrees.'], ['arc-coordinating', 'Spins isolated git worktrees so epics run without stepping on each other.']],
    t: t
  }), /*#__PURE__*/React.createElement(DeepCard, {
    kicker: "DOWNSTREAM",
    title: "pick the mode \u2014 not a pipeline",
    color: t.ember,
    bullets: [['arc-agent-driven', 'In-session executor. Fresh subagent per task, two-stage review (spec → quality). Lead stays available to answer questions. Default for task lists.'], ['arc-implementing', 'Orchestrator for large projects with a dag.yaml in a worktree. Expands epic → features → tasks and delegates to the skills below — it does not write code itself.'], ['arc-dispatching-teammates', 'Epic-level parallel with the lead present. One Claude Code teammate per ready epic in its own worktree; lead monitors via SendMessage, intervenes on blockers.'], ['arc-looping', 'Cross-session unattended execution. Fresh Claude session per task, DAG+git persist state — built for walk-away overnight runs, not human-in-the-loop work.']],
    t: t
  })));
}
function StageNode({
  x,
  y,
  label,
  desc,
  color,
  t
}) {
  return /*#__PURE__*/React.createElement("g", {
    transform: `translate(${x},${y})`
  }, /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-sdd)"
  }, /*#__PURE__*/React.createElement("circle", {
    r: "9",
    fill: t.bg,
    stroke: color,
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    r: "3",
    fill: color
  })), /*#__PURE__*/React.createElement("text", {
    y: "-18",
    textAnchor: "middle",
    fill: t.ink,
    fontSize: "13",
    fontFamily: "JetBrains Mono,monospace",
    fontWeight: "600"
  }, "arc-", label), /*#__PURE__*/React.createElement("text", {
    y: "-34",
    textAnchor: "middle",
    fill: t.dim,
    fontSize: "10",
    fontFamily: "Fraunces,serif",
    fontStyle: "italic"
  }, desc));
}
function ArrowLine({
  x1,
  x2,
  y,
  color
}) {
  return /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: `M${x1} ${y} L${x2} ${y}`,
    stroke: color,
    strokeWidth: "1.4",
    fill: "none",
    strokeDasharray: "5 3"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: `${x2 - 6},${y - 4} ${x2 + 2},${y} ${x2 - 6},${y + 4}`,
    fill: color
  }));
}
function CalloutSmall({
  x,
  y,
  text,
  t
}) {
  return /*#__PURE__*/React.createElement("text", {
    x: x,
    y: y,
    textAnchor: "middle",
    fill: t.mute,
    fontSize: "10",
    fontFamily: "JetBrains Mono,monospace",
    fontStyle: "italic"
  }, text);
}
function ModeCard({
  x,
  y,
  name,
  axis,
  note,
  color,
  t
}) {
  const w = 240,
    h = 96;
  // split note into ~28-char lines
  const words = note.split(' ');
  const lines = [];
  let cur = '';
  for (const w2 of words) {
    if ((cur + ' ' + w2).trim().length > 32) {
      lines.push(cur.trim());
      cur = w2;
    } else cur = (cur + ' ' + w2).trim();
  }
  if (cur) lines.push(cur);
  return /*#__PURE__*/React.createElement("g", {
    transform: `translate(${x},${y})`
  }, /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-sdd)"
  }, /*#__PURE__*/React.createElement("rect", {
    width: w,
    height: h,
    fill: t.card,
    stroke: color,
    strokeWidth: "1.4",
    rx: "3"
  })), /*#__PURE__*/React.createElement("text", {
    x: "14",
    y: "22",
    fill: color,
    fontSize: "12",
    fontFamily: "JetBrains Mono,monospace",
    fontWeight: "700"
  }, name), /*#__PURE__*/React.createElement("text", {
    x: "14",
    y: "38",
    fill: t.dim,
    fontSize: "9",
    letterSpacing: "1.5",
    fontFamily: "JetBrains Mono,monospace"
  }, axis.toUpperCase()), lines.map((ln, i) => /*#__PURE__*/React.createElement("text", {
    key: i,
    x: "14",
    y: 58 + i * 14,
    fill: t.mute,
    fontSize: "11",
    fontFamily: "Fraunces,serif",
    fontStyle: "italic"
  }, ln)));
}
function DeepCard({
  kicker,
  title,
  color,
  bullets,
  t
}) {
  return /*#__PURE__*/React.createElement("div", {
    "data-af-reveal": true,
    style: {
      background: t.card,
      border: `1px solid ${t.line}`,
      padding: '32px 36px',
      borderRadius: 3,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: 3,
      color,
      marginBottom: 10,
      fontFamily: '"JetBrains Mono",monospace',
      fontWeight: 700
    }
  }, kicker), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: '"Fraunces",serif',
      fontWeight: 400,
      fontSize: 28,
      letterSpacing: -.5,
      margin: '0 0 24px 0',
      color: t.ink,
      fontStyle: 'italic'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, bullets.map(([name, desc]) => /*#__PURE__*/React.createElement("div", {
    key: name,
    style: {
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      gap: 16,
      paddingBottom: 14,
      borderBottom: `1px dashed ${t.line}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '"JetBrains Mono",monospace',
      fontSize: 12,
      color,
      fontWeight: 600
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: t.mute,
      lineHeight: 1.55
    }
  }, desc)))));
}
window.SDDPipeline = SDDPipeline;