// Hero section — spec-sheet layout, giant serif, schematic

function Hero({theme}) {
  const t = theme;
  return (
    <section id="hero" style={{
      minHeight: 900, padding:'0 80px', position:'relative', overflow:'hidden',
      background: t.bg, backgroundImage: gridBg(t.line),
    }}>
      <CornerMark pos={{top:20,left:20}} color={t.ember}/>
      <CornerMark pos={{top:20,right:20}} flip color={t.ember}/>
      <CornerMark pos={{bottom:20,left:20}} flipV color={t.ember}/>
      <CornerMark pos={{bottom:20,right:20}} flip flipV color={t.ember}/>

      {/* nav */}
      <nav className="af-nav" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'28px 0',fontSize:12,letterSpacing:1.5}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <Logo size={22} ember={t.ember} brass={t.brass}/>
          <span style={{fontFamily:'"Fraunces",serif',fontSize:18,letterSpacing:0,fontWeight:500,color:t.ink}}>arcforge</span>
          <span style={{color:t.dim,marginLeft:6}}>v2.1.0</span>
        </div>
        <div className="af-nav-links" style={{display:'flex',gap:28,color:t.dim,textTransform:'uppercase'}}>
          <a href="#pipeline" style={{color:'inherit',textDecoration:'none'}}>Pipeline</a>
          <a href="#skills" style={{color:'inherit',textDecoration:'none'}}>Skills</a>
          <a href="#hooks" style={{color:'inherit',textDecoration:'none'}}>Hooks</a>
          <a href="#platforms" style={{color:'inherit',textDecoration:'none'}}>Platforms</a>
          <a href="#install" style={{color:'inherit',textDecoration:'none'}}>Install</a>
          <a href="https://github.com/GregoryHo/arcforge" style={{color:t.ember,textDecoration:'none'}}>GitHub ↗</a>
        </div>
      </nav>

      <div className="af-hero-grid" style={{display:'grid',gridTemplateColumns:'1.05fr 1fr',gap:60,paddingTop:60,alignItems:'start'}}>
        {/* left: spec sheet */}
        <div data-af-reveal>
          <div style={{fontSize:11,color:t.ember,letterSpacing:3,marginBottom:18,fontWeight:600}}>SPEC SHEET · 001 / TOOLKIT</div>
          <h1 className="af-hero-h1" style={{
            fontFamily:'"Fraunces",serif',fontWeight:400,fontSize:110,
            lineHeight:.92,letterSpacing:-3,margin:0,color:t.ink,
          }}>
            Forge<br/>
            <span style={{fontStyle:'italic',color:t.brass}}>disciplined</span><br/>
            agents.
          </h1>
          <p style={{marginTop:32,fontSize:16,lineHeight:1.7,color:t.mute,maxWidth:520,fontFamily:'"JetBrains Mono",ui-monospace,monospace'}}>
            A skill-based autonomous workflow engine for Claude Code, Codex, Gemini CLI, and OpenCode. Hooks inject the right skill at the right moment — so design, planning, TDD, and review happen{' '}
            <span style={{color:t.ink}}>because the workflow enforces them.</span>
          </p>

          <div style={{marginTop:40,display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
            <a href="#install" style={{
              background:t.ember,border:'none',color:'#111',padding:'14px 24px',
              fontFamily:'"JetBrains Mono",monospace',fontSize:12,letterSpacing:2,fontWeight:700,
              textDecoration:'none',display:'inline-block',
            }}>/plugin install arcforge →</a>
            <div style={{fontSize:11,color:t.dim,letterSpacing:1.5,fontFamily:'"JetBrains Mono",monospace'}}>MIT · 33 SKILLS · 9 HOOKS</div>
          </div>

          <div style={{marginTop:56,display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
            <Stamp label="SDD" sub="PIPELINE" color={t.ember}/>
            <Stamp label="TDD" sub="ENFORCED" color={t.brass}/>
            <Stamp label="EVAL" sub="GRADED" color={t.ember}/>
            <Stamp label="WIKI" sub="OBSIDIAN" color={t.brass}/>
            <Stamp label="LOOP" sub="CROSS-SESS" color={t.ember}/>
          </div>
        </div>

        {/* right: schematic */}
        <div data-af-reveal className="af-hero-schematic" style={{position:'relative',minHeight:640}}>
          <HeroSchematic theme={t}/>
        </div>
      </div>

      {/* ticker */}
      <div className="af-hero-ticker" style={{
        position:'absolute',bottom:0,left:0,right:0,height:42,
        borderTop:`1px dashed ${t.line}`,display:'flex',alignItems:'center',
        padding:'0 80px',fontSize:11,color:t.dim,letterSpacing:2,justifyContent:'space-between',
        fontFamily:'"JetBrains Mono",monospace',
      }}>
        <span>◆ CLAUDE CODE · CODEX · GEMINI · OPENCODE</span>
        <span>SCALE 1:1 — DRAFT 04.21.26 — SHEET 01/08</span>
      </div>
    </section>
  );
}

function HeroSchematic({theme:t}) {
  return (
    <svg viewBox="0 0 620 640" style={{width:'100%',height:'auto',maxHeight:680}}>
      <SketchDefs id="sk-hero" scale={1.2} seed={3}/>

      {/* Agent box */}
      <g filter="url(#sk-hero)">
        <rect x="220" y="20" width="180" height="70" fill="none" stroke={t.ink} strokeWidth="1.4" rx="4"/>
      </g>
      <text x="310" y="50" fill={t.ink} fontSize="14" fontFamily="Fraunces,serif" textAnchor="middle" fontStyle="italic">coding agent</text>
      <text x="310" y="72" fill={t.dim} fontSize="10" textAnchor="middle" letterSpacing="2">SESSION START</text>

      {/* hook inject */}
      <g filter="url(#sk-hero)">
        <path d="M310 90 L310 130" stroke={t.ember} strokeWidth="1.4" fill="none"/>
        <polygon points="305,125 315,125 310,135" fill={t.ember}/>
      </g>
      <text x="330" y="115" fill={t.ember} fontSize="10" letterSpacing="1.5" fontFamily="JetBrains Mono,monospace">HOOK · inject-skills</text>

      {/* Skills ring */}
      <g transform="translate(310,220)">
        <g filter="url(#sk-hero)">
          <circle r="60" fill="none" stroke={t.brass} strokeWidth="1.2" strokeDasharray="3 3"/>
        </g>
        <text y="4" textAnchor="middle" fill={t.brass} fontSize="12" fontFamily="Fraunces,serif" fontStyle="italic">skills</text>
        <text y="22" textAnchor="middle" fill={t.dim} fontSize="9" letterSpacing="1.5" fontFamily="JetBrains Mono,monospace">33 AVAILABLE</text>
        {['brainstorm','refine','plan','tdd','review','learn','journal','diagram'].map((s,i)=>{
          const a = (i/8)*Math.PI*2 - Math.PI/2;
          const r = 95;
          const x = Math.cos(a)*r, y = Math.sin(a)*r;
          return (
            <g key={s}>
              <circle cx={x} cy={y} r="3" fill={t.ember}/>
              <text x={x+(x>0?8:-8)} y={y+3} fontSize="10" fill={t.ink}
                textAnchor={x>0?'start':'end'} fontFamily="JetBrains Mono,monospace">{s}</text>
            </g>
          );
        })}
      </g>

      {/* SDD flow below */}
      <g transform="translate(60,400)" fontFamily="JetBrains Mono,monospace">
        <text x="0" y="0" fill={t.dim} fontSize="10" letterSpacing="2">SDD · UPSTREAM</text>
        <g filter="url(#sk-hero)">
          <path d="M0 20 H 500" stroke={t.ink} strokeWidth="0.8"/>
        </g>
        {['brainstorm','refine','plan'].map((s,i)=>(
          <g key={s} transform={`translate(${i*170+40},35)`}>
            <g filter="url(#sk-hero)">
              <rect x="-55" y="-14" width="110" height="28" fill={t.bg} stroke={t.brass} strokeWidth="1.2" rx="3"/>
            </g>
            <text y="4" textAnchor="middle" fill={t.ink} fontSize="11">arc-{s}</text>
          </g>
        ))}
        <g filter="url(#sk-hero)">
          <path d="M95 35 L125 35 M265 35 L295 35" stroke={t.ember} strokeWidth="1.4" fill="none"/>
          <polygon points="121,31 129,35 121,39" fill={t.ember}/>
          <polygon points="291,31 299,35 291,39" fill={t.ember}/>
        </g>

        <text x="0" y="90" fill={t.dim} fontSize="10" letterSpacing="2">SDD · DOWNSTREAM</text>
        <g filter="url(#sk-hero)">
          <path d="M0 110 H 500" stroke={t.ink} strokeWidth="0.8"/>
        </g>
        {['implement','loop','dispatch'].map((s,i)=>(
          <g key={s} transform={`translate(${i*170+40},125)`}>
            <g filter="url(#sk-hero)">
              <rect x="-55" y="-14" width="110" height="28" fill={t.bg} stroke={t.ember} strokeWidth="1.2" rx="3"/>
            </g>
            <text y="4" textAnchor="middle" fill={t.ink} fontSize="11">arc-{s}</text>
          </g>
        ))}
        <g filter="url(#sk-hero)">
          <path d="M95 125 L125 125 M265 125 L295 125" stroke={t.ember} strokeWidth="1.4" fill="none"/>
          <polygon points="121,121 129,125 121,129" fill={t.ember}/>
          <polygon points="291,121 299,125 291,129" fill={t.ember}/>
        </g>
      </g>

      {/* annotation */}
      <g fontFamily="'Caveat',cursive" fontSize="17" fill={t.brass}>
        <text x="460" y="200" transform="rotate(-8 460 200)">triggered by context,</text>
        <text x="460" y="220" transform="rotate(-8 460 200)">not commands.</text>
      </g>
      <g filter="url(#sk-hero)">
        <path d="M460 230 Q 410 235 390 218" stroke={t.brass} strokeWidth="1.2" fill="none"/>
        <polygon points="390,218 397,217 395,225" fill={t.brass}/>
      </g>
    </svg>
  );
}

window.Hero = Hero;
