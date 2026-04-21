// Shared theme + primitives for arcforge landing page (Direction A — Blueprint Forge)
// All colors, fonts, common sketch SVG helpers.

const AF = {
  // palettes
  dark: {
    bg: '#0b1220',
    bg2: '#0f1728',
    card: '#111a2e',
    line: '#1f2a44',
    ink: '#e8ecf4',
    dim: '#6b7a96',
    mute: '#9aa8c2',
    ember: '#ff6a3d',
    brass: '#d9a441',
    steel: '#7aa6d9'
  },
  light: {
    bg: '#f5f1ea',
    bg2: '#eee8de',
    card: '#fbf7f0',
    line: '#d6ccb8',
    ink: '#1a1611',
    dim: '#716653',
    mute: '#4a4234',
    ember: '#c94f26',
    brass: '#a87722',
    steel: '#3d628f'
  }
};

// grid background as a data URL given color
function gridBg(c) {
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='1' cy='1' r='0.8' fill='${encodeURIComponent(c)}'/></svg>")`;
}

// sketchy turbulence filter (used everywhere)
function SketchDefs({
  id = 'sketch',
  scale = 1.2,
  seed = 3
}) {
  return /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("filter", {
    id: id
  }, /*#__PURE__*/React.createElement("feTurbulence", {
    baseFrequency: "0.04",
    numOctaves: "2",
    seed: seed
  }), /*#__PURE__*/React.createElement("feDisplacementMap", {
    in: "SourceGraphic",
    scale: scale
  })));
}

// crosshair corner mark
function CornerMark({
  pos,
  flip,
  flipV,
  color = '#ff6a3d'
}) {
  const sx = flip ? -1 : 1,
    sy = flipV ? -1 : 1;
  return /*#__PURE__*/React.createElement("svg", {
    width: "28",
    height: "28",
    viewBox: "0 0 28 28",
    style: {
      position: 'absolute',
      ...pos,
      transform: `scale(${sx},${sy})`,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 10V1h9",
    stroke: color,
    strokeWidth: "1.2",
    fill: "none"
  }));
}
function Logo({
  size = 32,
  ember = '#ff6a3d',
  brass = '#d9a441'
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 40 40"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 30 L20 6 L34 30",
    stroke: ember,
    strokeWidth: "2.4",
    fill: "none",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11 24 Q20 21 29 24",
    stroke: brass,
    strokeWidth: "1.6",
    fill: "none",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "20",
    cy: "6",
    r: "1.8",
    fill: ember
  }));
}
function Stamp({
  label,
  sub,
  color,
  small
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: `1.5px solid ${color}`,
      color,
      padding: small ? '4px 8px' : '6px 10px',
      fontSize: small ? 9 : 10,
      letterSpacing: 2,
      textAlign: 'center',
      borderRadius: 2,
      display: 'inline-block'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700
    }
  }, label), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      opacity: .7,
      fontSize: small ? 7 : 8,
      marginTop: 2
    }
  }, sub));
}

// Section header shared across the page
function SectionHeader({
  n,
  kicker,
  title,
  sub,
  theme
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      marginBottom: 56
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      fontSize: 11,
      letterSpacing: 3,
      color: theme.ember
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "\u2116 ", n), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 1,
      background: theme.ember
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: theme.dim
    }
  }, kicker)), /*#__PURE__*/React.createElement("h2", {
    className: "af-section-h2",
    style: {
      fontFamily: '"Fraunces",serif',
      fontWeight: 400,
      fontSize: 56,
      lineHeight: 1,
      letterSpacing: -1.4,
      margin: 0,
      color: theme.ink,
      maxWidth: 880
    }
  }, title), sub && /*#__PURE__*/React.createElement("p", {
    style: {
      color: theme.mute,
      fontSize: 16,
      lineHeight: 1.6,
      maxWidth: 720,
      margin: 0
    }
  }, sub));
}
function PageSection({
  children,
  theme,
  id,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    id: id,
    style: {
      padding: '120px 80px',
      position: 'relative',
      borderTop: `1px dashed ${theme.line}`,
      ...style
    }
  }, children);
}
Object.assign(window, {
  AF,
  gridBg,
  SketchDefs,
  CornerMark,
  Logo,
  Stamp,
  SectionHeader,
  PageSection
});