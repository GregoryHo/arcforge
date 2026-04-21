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
    steel: '#7aa6d9',
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
    steel: '#3d628f',
  },
};

// grid background as a data URL given color
function gridBg(c) {
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='1' cy='1' r='0.8' fill='${encodeURIComponent(c)}'/></svg>")`;
}

// sketchy turbulence filter (used everywhere)
function SketchDefs({ id = 'sketch', scale = 1.2, seed = 3 }) {
  return (
    <defs>
      <filter id={id}>
        <feTurbulence baseFrequency="0.04" numOctaves="2" seed={seed}/>
        <feDisplacementMap in="SourceGraphic" scale={scale}/>
      </filter>
    </defs>
  );
}

// crosshair corner mark
function CornerMark({pos,flip,flipV,color='#ff6a3d'}) {
  const sx = flip ? -1 : 1, sy = flipV ? -1 : 1;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" style={{position:'absolute',...pos,transform:`scale(${sx},${sy})`,pointerEvents:'none'}}>
      <path d="M1 10V1h9" stroke={color} strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

function Logo({size=32, ember='#ff6a3d', brass='#d9a441'}) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M6 30 L20 6 L34 30" stroke={ember} strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      <path d="M11 24 Q20 21 29 24" stroke={brass} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <circle cx="20" cy="6" r="1.8" fill={ember}/>
    </svg>
  );
}

function Stamp({label, sub, color, small}) {
  return (
    <div style={{
      border:`1.5px solid ${color}`,color,padding: small?'4px 8px':'6px 10px',
      fontSize: small?9:10, letterSpacing:2, textAlign:'center', borderRadius:2, display:'inline-block',
    }}>
      <div style={{fontWeight:700}}>{label}</div>
      {sub && <div style={{opacity:.7,fontSize: small?7:8,marginTop:2}}>{sub}</div>}
    </div>
  );
}

// Section header shared across the page
function SectionHeader({n, kicker, title, sub, theme}) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:56}}>
      <div style={{display:'flex',alignItems:'center',gap:14,fontSize:11,letterSpacing:3,color:theme.ember}}>
        <span style={{fontWeight:700}}>№ {n}</span>
        <span style={{width:28,height:1,background:theme.ember}}/>
        <span style={{color:theme.dim}}>{kicker}</span>
      </div>
      <h2 className="af-section-h2" style={{
        fontFamily:'"Fraunces",serif', fontWeight:400, fontSize:56, lineHeight:1,
        letterSpacing:-1.4, margin:0, color:theme.ink, maxWidth:880,
      }}>{title}</h2>
      {sub && <p style={{color:theme.mute,fontSize:16,lineHeight:1.6,maxWidth:720,margin:0}}>{sub}</p>}
    </div>
  );
}

function PageSection({children, theme, id, style}) {
  return (
    <section id={id} style={{padding:'120px 80px',position:'relative',borderTop:`1px dashed ${theme.line}`, ...style}}>
      {children}
    </section>
  );
}

Object.assign(window, {
  AF, gridBg, SketchDefs, CornerMark, Logo, Stamp, SectionHeader, PageSection,
});
