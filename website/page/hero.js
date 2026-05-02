// Hero section — spec-sheet layout, giant serif, schematic

function Hero({
  theme
}) {
  const t = theme;
  return /*#__PURE__*/React.createElement("section", {
    id: "hero",
    style: {
      minHeight: 900,
      padding: '0 80px',
      position: 'relative',
      overflow: 'hidden',
      background: t.bg,
      backgroundImage: gridBg(t.line)
    }
  }, /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      top: 20,
      left: 20
    },
    color: t.ember
  }), /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      top: 20,
      right: 20
    },
    flip: true,
    color: t.ember
  }), /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      bottom: 20,
      left: 20
    },
    flipV: true,
    color: t.ember
  }), /*#__PURE__*/React.createElement(CornerMark, {
    pos: {
      bottom: 20,
      right: 20
    },
    flip: true,
    flipV: true,
    color: t.ember
  }), /*#__PURE__*/React.createElement("nav", {
    className: "af-nav",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '28px 0',
      fontSize: 12,
      letterSpacing: 1.5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    size: 22,
    ember: t.ember,
    brass: t.brass
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '"Fraunces",serif',
      fontSize: 18,
      letterSpacing: 0,
      fontWeight: 500,
      color: t.ink
    }
  }, "arcforge"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.dim,
      marginLeft: 6
    }
  }, "v3.0.0-rc.1")), /*#__PURE__*/React.createElement("div", {
    className: "af-nav-links",
    style: {
      display: 'flex',
      gap: 28,
      color: t.dim,
      textTransform: 'uppercase'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#pipeline",
    style: {
      color: 'inherit',
      textDecoration: 'none'
    }
  }, "Pipeline"), /*#__PURE__*/React.createElement("a", {
    href: "#skills",
    style: {
      color: 'inherit',
      textDecoration: 'none'
    }
  }, "Skills"), /*#__PURE__*/React.createElement("a", {
    href: "#hooks",
    style: {
      color: 'inherit',
      textDecoration: 'none'
    }
  }, "Hooks"), /*#__PURE__*/React.createElement("a", {
    href: "#platforms",
    style: {
      color: 'inherit',
      textDecoration: 'none'
    }
  }, "Platforms"), /*#__PURE__*/React.createElement("a", {
    href: "#install",
    style: {
      color: 'inherit',
      textDecoration: 'none'
    }
  }, "Install"), /*#__PURE__*/React.createElement("a", {
    href: "https://github.com/GregoryHo/arcforge",
    style: {
      color: t.ember,
      textDecoration: 'none'
    }
  }, "GitHub \u2197"))), /*#__PURE__*/React.createElement("div", {
    className: "af-hero-grid",
    style: {
      display: 'grid',
      gridTemplateColumns: '1.05fr 1fr',
      gap: 60,
      paddingTop: 60,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    "data-af-reveal": true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: t.ember,
      letterSpacing: 3,
      marginBottom: 18,
      fontWeight: 600
    }
  }, "SPEC SHEET \xB7 001 / TOOLKIT"), /*#__PURE__*/React.createElement("h1", {
    className: "af-hero-h1",
    style: {
      fontFamily: '"Fraunces",serif',
      fontWeight: 400,
      fontSize: 110,
      lineHeight: .92,
      letterSpacing: -3,
      margin: 0,
      color: t.ink
    }
  }, "Forge", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontStyle: 'italic',
      color: t.brass
    }
  }, "disciplined"), /*#__PURE__*/React.createElement("br", null), "agents."), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 32,
      fontSize: 16,
      lineHeight: 1.7,
      color: t.mute,
      maxWidth: 520,
      fontFamily: '"JetBrains Mono",ui-monospace,monospace'
    }
  }, "A skill-based autonomous workflow engine for Claude Code, Codex, Gemini CLI, and OpenCode. Hooks inject the right skill at the right moment \u2014 so design, planning, TDD, and review happen", ' ', /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.ink
    }
  }, "because the workflow enforces them.")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 40,
      display: 'flex',
      gap: 14,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#install",
    style: {
      background: t.ember,
      border: 'none',
      color: '#111',
      padding: '14px 24px',
      fontFamily: '"JetBrains Mono",monospace',
      fontSize: 12,
      letterSpacing: 2,
      fontWeight: 700,
      textDecoration: 'none',
      display: 'inline-block'
    }
  }, "/plugin install arcforge \u2192"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: t.dim,
      letterSpacing: 1.5,
      fontFamily: '"JetBrains Mono",monospace'
    }
  }, "MIT \xB7 33 SKILLS \xB7 9 HOOKS")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 56,
      display: 'flex',
      gap: 16,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Stamp, {
    label: "SDD",
    sub: "PIPELINE",
    color: t.ember
  }), /*#__PURE__*/React.createElement(Stamp, {
    label: "TDD",
    sub: "ENFORCED",
    color: t.brass
  }), /*#__PURE__*/React.createElement(Stamp, {
    label: "EVAL",
    sub: "GRADED",
    color: t.ember
  }), /*#__PURE__*/React.createElement(Stamp, {
    label: "WIKI",
    sub: "OBSIDIAN",
    color: t.brass
  }), /*#__PURE__*/React.createElement(Stamp, {
    label: "LOOP",
    sub: "CROSS-SESS",
    color: t.ember
  }))), /*#__PURE__*/React.createElement("div", {
    "data-af-reveal": true,
    className: "af-hero-schematic",
    style: {
      position: 'relative',
      minHeight: 640
    }
  }, /*#__PURE__*/React.createElement(HeroSchematic, {
    theme: t
  }))), /*#__PURE__*/React.createElement("div", {
    className: "af-hero-ticker",
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 42,
      borderTop: `1px dashed ${t.line}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 80px',
      fontSize: 11,
      color: t.dim,
      letterSpacing: 2,
      justifyContent: 'space-between',
      fontFamily: '"JetBrains Mono",monospace'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u25C6 CLAUDE CODE \xB7 CODEX \xB7 GEMINI \xB7 OPENCODE"), /*#__PURE__*/React.createElement("span", null, "SCALE 1:1 \u2014 DRAFT 05.02.26 \u2014 SHEET 01/08")));
}
function HeroSchematic({
  theme: t
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 620 640",
    style: {
      width: '100%',
      height: 'auto',
      maxHeight: 680
    }
  }, /*#__PURE__*/React.createElement(SketchDefs, {
    id: "sk-hero",
    scale: 1.2,
    seed: 3
  }), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "220",
    y: "20",
    width: "180",
    height: "70",
    fill: "none",
    stroke: t.ink,
    strokeWidth: "1.4",
    rx: "4"
  })), /*#__PURE__*/React.createElement("text", {
    x: "310",
    y: "50",
    fill: t.ink,
    fontSize: "14",
    fontFamily: "Fraunces,serif",
    textAnchor: "middle",
    fontStyle: "italic"
  }, "coding agent"), /*#__PURE__*/React.createElement("text", {
    x: "310",
    y: "72",
    fill: t.dim,
    fontSize: "10",
    textAnchor: "middle",
    letterSpacing: "2"
  }, "SESSION START"), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M310 90 L310 130",
    stroke: t.ember,
    strokeWidth: "1.4",
    fill: "none"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "305,125 315,125 310,135",
    fill: t.ember
  })), /*#__PURE__*/React.createElement("text", {
    x: "330",
    y: "115",
    fill: t.ember,
    fontSize: "10",
    letterSpacing: "1.5",
    fontFamily: "JetBrains Mono,monospace"
  }, "HOOK \xB7 inject-skills"), /*#__PURE__*/React.createElement("g", {
    transform: "translate(310,220)"
  }, /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, /*#__PURE__*/React.createElement("circle", {
    r: "60",
    fill: "none",
    stroke: t.brass,
    strokeWidth: "1.2",
    strokeDasharray: "3 3"
  })), /*#__PURE__*/React.createElement("text", {
    y: "4",
    textAnchor: "middle",
    fill: t.brass,
    fontSize: "12",
    fontFamily: "Fraunces,serif",
    fontStyle: "italic"
  }, "skills"), /*#__PURE__*/React.createElement("text", {
    y: "22",
    textAnchor: "middle",
    fill: t.dim,
    fontSize: "9",
    letterSpacing: "1.5",
    fontFamily: "JetBrains Mono,monospace"
  }, "33 AVAILABLE"), ['brainstorm', 'refine', 'plan', 'tdd', 'review', 'learn', 'journal', 'diagram'].map((s, i) => {
    const a = i / 8 * Math.PI * 2 - Math.PI / 2;
    const r = 95;
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    return /*#__PURE__*/React.createElement("g", {
      key: s
    }, /*#__PURE__*/React.createElement("circle", {
      cx: x,
      cy: y,
      r: "3",
      fill: t.ember
    }), /*#__PURE__*/React.createElement("text", {
      x: x + (x > 0 ? 8 : -8),
      y: y + 3,
      fontSize: "10",
      fill: t.ink,
      textAnchor: x > 0 ? 'start' : 'end',
      fontFamily: "JetBrains Mono,monospace"
    }, s));
  })), /*#__PURE__*/React.createElement("g", {
    transform: "translate(60,400)",
    fontFamily: "JetBrains Mono,monospace"
  }, /*#__PURE__*/React.createElement("text", {
    x: "0",
    y: "0",
    fill: t.dim,
    fontSize: "10",
    letterSpacing: "2"
  }, "SDD \xB7 UPSTREAM"), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M0 20 H 500",
    stroke: t.ink,
    strokeWidth: "0.8"
  })), ['brainstorm', 'refine', 'plan', 'coordinate'].map((s, i) => /*#__PURE__*/React.createElement("g", {
    key: s,
    transform: `translate(${i * 130 + 30},35)`
  }, /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "-48",
    y: "-13",
    width: "96",
    height: "26",
    fill: t.bg,
    stroke: t.brass,
    strokeWidth: "1.2",
    rx: "3"
  })), /*#__PURE__*/React.createElement("text", {
    y: "4",
    textAnchor: "middle",
    fill: t.ink,
    fontSize: "10"
  }, "arc-", s))), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, [0, 1, 2].map(i => {
    const x1 = i * 130 + 30 + 48;
    const x2 = (i + 1) * 130 + 30 - 48;
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("path", {
      d: `M${x1 + 2} 35 L${x2 - 4} 35`,
      stroke: t.ember,
      strokeWidth: "1.4",
      fill: "none"
    }), /*#__PURE__*/React.createElement("polygon", {
      points: `${x2 - 8},31 ${x2},35 ${x2 - 8},39`,
      fill: t.ember
    }));
  }))), /*#__PURE__*/React.createElement("g", {
    transform: "translate(60,490)",
    fontFamily: "JetBrains Mono,monospace"
  }, /*#__PURE__*/React.createElement("text", {
    x: "0",
    y: "0",
    fill: t.dim,
    fontSize: "10",
    letterSpacing: "2"
  }, "SESSION \xB7 LIFECYCLE"), /*#__PURE__*/React.createElement("text", {
    x: "256",
    y: "0",
    fill: t.brass,
    fontSize: "10",
    fontStyle: "italic",
    fontFamily: "Fraunces,serif"
  }, "hooks fire at every gate"), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M0 20 H 500",
    stroke: t.ink,
    strokeWidth: "0.8"
  })), [{
    name: 'SessionStart',
    sub: 'inject-skills'
  }, {
    name: 'UserPrompt',
    sub: 'arc-using routes'
  }, {
    name: 'Pre/Post Tool',
    sub: 'observe · quality'
  }, {
    name: 'Stop',
    sub: 'journal · compact'
  }].map((o, i) => /*#__PURE__*/React.createElement("g", {
    key: o.name,
    transform: `translate(${i * 130 + 30},45)`
  }, /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "-56",
    y: "-16",
    width: "112",
    height: "32",
    fill: t.bg,
    stroke: t.ember,
    strokeWidth: "1.2",
    rx: "3"
  })), /*#__PURE__*/React.createElement("text", {
    y: "-3",
    textAnchor: "middle",
    fill: t.ink,
    fontSize: "10",
    fontWeight: "600"
  }, o.name), /*#__PURE__*/React.createElement("text", {
    y: "10",
    textAnchor: "middle",
    fill: t.dim,
    fontSize: "8",
    fontStyle: "italic",
    fontFamily: "Fraunces,serif"
  }, o.sub))), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, [0, 1, 2].map(i => {
    const x1 = i * 130 + 30 + 56;
    const x2 = (i + 1) * 130 + 30 - 56;
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("path", {
      d: `M${x1 + 2} 45 L${x2 - 4} 45`,
      stroke: t.ember,
      strokeWidth: "1.4",
      fill: "none"
    }), /*#__PURE__*/React.createElement("polygon", {
      points: `${x2 - 8},41 ${x2},45 ${x2 - 8},49`,
      fill: t.ember
    }));
  })), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M290 61 Q 225 85 160 61",
    stroke: t.brass,
    strokeWidth: "1.2",
    fill: "none",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "164,57 156,61 164,65",
    fill: t.brass
  })), /*#__PURE__*/React.createElement("text", {
    x: "225",
    y: "90",
    textAnchor: "middle",
    fill: t.brass,
    fontSize: "10",
    fontStyle: "italic",
    fontFamily: "Fraunces,serif"
  }, "loops per prompt")), /*#__PURE__*/React.createElement("g", {
    fontFamily: "'Caveat',cursive",
    fontSize: "17",
    fill: t.brass
  }, /*#__PURE__*/React.createElement("text", {
    x: "460",
    y: "200",
    transform: "rotate(-8 460 200)"
  }, "triggered by context,"), /*#__PURE__*/React.createElement("text", {
    x: "460",
    y: "220",
    transform: "rotate(-8 460 200)"
  }, "not commands.")), /*#__PURE__*/React.createElement("g", {
    filter: "url(#sk-hero)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M460 230 Q 410 235 390 218",
    stroke: t.brass,
    strokeWidth: "1.2",
    fill: "none"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "390,218 397,217 395,225",
    fill: t.brass
  })));
}
window.Hero = Hero;