// SDD Pipeline section — the hero narrative of arcforge.
// Big subway-map diagram: Upstream → Downstream with annotations.

function SDDPipeline({theme:t}) {
  return (
    <PageSection theme={t} id="pipeline">
      <SectionHeader
        n="02"
        kicker="SDD · THE SPINE"
        title={<>A session that <em style={{color:t.brass,fontStyle:'italic'}}>designs</em> before it codes.</>}
        sub="Spec-driven development runs as two connected pipelines. Upstream explores, refines, and plans. Downstream implements, reviews, and learns. Skills advance the agent through each stage automatically."
        theme={t}
      />

      <div data-af-reveal style={{background:t.bg2,border:`1px solid ${t.line}`,borderRadius:4,padding:'48px 56px',position:'relative',overflow:'hidden'}}>
        <CornerMark pos={{top:10,left:10}} color={t.ember}/>
        <CornerMark pos={{top:10,right:10}} flip color={t.ember}/>
        <CornerMark pos={{bottom:10,left:10}} flipV color={t.ember}/>
        <CornerMark pos={{bottom:10,right:10}} flip flipV color={t.ember}/>

        <svg viewBox="0 0 1200 720" style={{width:'100%',height:'auto'}}>
          <SketchDefs id="sk-sdd" scale={1.1} seed={5}/>

          {/* Upstream band */}
          <g transform="translate(40,40)">
            <text x="0" y="0" fill={t.brass} fontSize="12" letterSpacing="3" fontFamily="JetBrains Mono,monospace" fontWeight="700">UPSTREAM · DESIGN</text>
            <text x="0" y="18" fill={t.dim} fontSize="11" fontFamily="Fraunces,serif" fontStyle="italic">from vague idea to a planned DAG</text>

            <g filter="url(#sk-sdd)">
              <path d="M0 60 H 1100" stroke={t.brass} strokeWidth="1.4" fill="none"/>
            </g>

            {/* Upstream stations */}
            <StageNode x={60} y={60} label="brainstorm" desc="explore ideas" color={t.brass} t={t}/>
            <StageNode x={380} y={60} label="refine" desc="spec + YAGNI" color={t.brass} t={t}/>
            <StageNode x={700} y={60} label="plan" desc="DAG of tasks" color={t.brass} t={t}/>
            <StageNode x={1020} y={60} label="coordinate" desc="worktrees" color={t.brass} t={t}/>

            {/* arrows */}
            <g filter="url(#sk-sdd)">
              <ArrowLine x1={150} x2={320} y={60} color={t.brass}/>
              <ArrowLine x1={470} x2={640} y={60} color={t.brass}/>
              <ArrowLine x1={790} x2={960} y={60} color={t.brass}/>
            </g>

            {/* sub-callouts */}
            <CalloutSmall x={60}  y={110} text='"add OAuth login"' t={t}/>
            <CalloutSmall x={380} y={110} text="spec.xml · scope declared" t={t}/>
            <CalloutSmall x={700} y={110} text="dag.yaml · 12 tasks" t={t}/>
            <CalloutSmall x={1020} y={110} text="3 epic worktrees" t={t}/>
          </g>

          {/* bridge */}
          <g transform="translate(580,190)">
            <g filter="url(#sk-sdd)">
              <rect x="-70" y="-18" width="140" height="36" fill={t.card} stroke={t.ember} strokeWidth="1.6" rx="4"/>
            </g>
            <text y="5" textAnchor="middle" fill={t.ember} fontSize="12" fontFamily="JetBrains Mono,monospace" letterSpacing="1.5">HANDOFF</text>
          </g>
          <g filter="url(#sk-sdd)">
            <path d="M580 150 L580 190" stroke={t.ember} strokeWidth="1.4" fill="none" strokeDasharray="3 3"/>
            <path d="M580 210 L580 280" stroke={t.ember} strokeWidth="1.4" fill="none" strokeDasharray="3 3"/>
            <polygon points="575,275 585,275 580,285" fill={t.ember}/>
          </g>

          {/* Downstream band — BRANCHING CHOOSER */}
          <g transform="translate(40,300)">
            <text x="0" y="0" fill={t.ember} fontSize="12" letterSpacing="3" fontFamily="JetBrains Mono,monospace" fontWeight="700">DOWNSTREAM · BUILD</text>
            <text x="0" y="18" fill={t.dim} fontSize="11" fontFamily="Fraunces,serif" fontStyle="italic">pick the execution mode that fits the work — not a pipeline, a chooser</text>

            {/* central decision hub */}
            <g transform="translate(560,70)">
              <g filter="url(#sk-sdd)">
                <polygon points="0,-28 96,0 0,28 -96,0" fill={t.card} stroke={t.ember} strokeWidth="1.6"/>
              </g>
              <text y="-4" textAnchor="middle" fill={t.ember} fontSize="10" letterSpacing="2" fontFamily="JetBrains Mono,monospace" fontWeight="700">ROUTE BY</text>
              <text y="12" textAnchor="middle" fill={t.ink} fontSize="12" fontFamily="Fraunces,serif" fontStyle="italic">scope × attendance</text>
            </g>

            {/* fan-out lines from hub to 4 modes */}
            <g filter="url(#sk-sdd)">
              <path d="M470 70 L 140 200" stroke={t.ember} strokeWidth="1.2" fill="none" strokeDasharray="3 3"/>
              <path d="M510 98 L 420 200" stroke={t.ember} strokeWidth="1.2" fill="none" strokeDasharray="3 3"/>
              <path d="M610 98 L 700 200" stroke={t.ember} strokeWidth="1.2" fill="none" strokeDasharray="3 3"/>
              <path d="M650 70 L 980 200" stroke={t.ember} strokeWidth="1.2" fill="none" strokeDasharray="3 3"/>
            </g>

            {/* 4 mode cards */}
            <ModeCard x={20}  y={200} name="arc-agent-driven"          axis="task · present"       note="fresh subagent per task, two-stage review" color={t.ember} t={t}/>
            <ModeCard x={300} y={200} name="arc-implementing"          axis="epic · orchestrator"  note="expands epic → features → tasks; calls skills" color={t.ember} t={t}/>
            <ModeCard x={580} y={200} name="arc-dispatching-teammates" axis="multi-epic · present" note="one teammate per ready epic; lead monitors"    color={t.ember} t={t}/>
            <ModeCard x={860} y={200} name="arc-looping"               axis="dag · walk-away"      note="fresh session per task, overnight"            color={t.ember} t={t}/>

            {/* review gate — applies when inside agent-driven / implementing / teammate flow */}
            <g transform="translate(320,330)">
              <g filter="url(#sk-sdd)">
                <rect width="500" height="46" fill={t.card} stroke={t.brass} strokeWidth="1.2" strokeDasharray="3 3" rx="4"/>
              </g>
              <text x="16" y="20" fill={t.brass} fontSize="10" letterSpacing="2" fontFamily="JetBrains Mono,monospace">TWO-STAGE REVIEW — spec-reviewer → quality-reviewer</text>
              <text x="16" y="36" fill={t.mute} fontSize="11" fontFamily="Fraunces,serif" fontStyle="italic">fires inside agent-driven and on every teammate completion · walk-away loops defer to verifier</text>
            </g>
          </g>

          {/* handwritten */}
          <g fontFamily="'Caveat',cursive" fontSize="18" fill={t.brass}>
            <text x="1000" y="260" transform="rotate(-4 1000 260)">YAGNI ruthlessly applied</text>
          </g>
          <g fontFamily="'Caveat',cursive" fontSize="18" fill={t.ember}>
            <text x="40" y="700" transform="rotate(-2 40 700)">one workflow, four gears — pick the one that fits the work</text>
          </g>
        </svg>
      </div>

      {/* upstream / downstream deep-dives */}
      <div className="af-grid-2col" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:48,marginTop:72}}>
        <DeepCard
          kicker="UPSTREAM"
          title="brainstorm → refine → plan"
          color={t.brass}
          bullets={[
            ['arc-brainstorming','One question at a time. 2–3 approaches with trade-offs. No design without exploration first.'],
            ['arc-refining','Lifts the design into a structured spec.xml. Detects new-topic vs iteration from the filesystem.'],
            ['arc-planning','Emits a dag.yaml — epics, features, dependencies. Parallel edges become worktrees.'],
            ['arc-coordinating','Spins isolated git worktrees so epics run without stepping on each other.'],
          ]}
          t={t}
        />
        <DeepCard
          kicker="DOWNSTREAM"
          title="pick the mode — not a pipeline"
          color={t.ember}
          bullets={[
            ['arc-agent-driven','In-session executor. Fresh subagent per task, two-stage review (spec → quality). Lead stays available to answer questions. Default for task lists.'],
            ['arc-implementing','Orchestrator for large projects with a dag.yaml in a worktree. Expands epic → features → tasks and delegates to the skills below — it does not write code itself.'],
            ['arc-dispatching-teammates','Epic-level parallel with the lead present. One Claude Code teammate per ready epic in its own worktree; lead monitors via SendMessage, intervenes on blockers.'],
            ['arc-looping','Cross-session unattended execution. Fresh Claude session per task, DAG+git persist state — built for walk-away overnight runs, not human-in-the-loop work.'],
          ]}
          t={t}
        />
      </div>
    </PageSection>
  );
}

function StageNode({x,y,label,desc,color,t}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <g filter="url(#sk-sdd)">
        <circle r="9" fill={t.bg} stroke={color} strokeWidth="2"/>
        <circle r="3" fill={color}/>
      </g>
      <text y="-18" textAnchor="middle" fill={t.ink} fontSize="13" fontFamily="JetBrains Mono,monospace" fontWeight="600">arc-{label}</text>
      <text y="-34" textAnchor="middle" fill={t.dim} fontSize="10" fontFamily="Fraunces,serif" fontStyle="italic">{desc}</text>
    </g>
  );
}

function ArrowLine({x1,x2,y,color}) {
  return (
    <g>
      <path d={`M${x1} ${y} L${x2} ${y}`} stroke={color} strokeWidth="1.4" fill="none" strokeDasharray="5 3"/>
      <polygon points={`${x2-6},${y-4} ${x2+2},${y} ${x2-6},${y+4}`} fill={color}/>
    </g>
  );
}

function CalloutSmall({x,y,text,t}) {
  return <text x={x} y={y} textAnchor="middle" fill={t.mute} fontSize="10" fontFamily="JetBrains Mono,monospace" fontStyle="italic">{text}</text>;
}

function ModeCard({x,y,name,axis,note,color,t}) {
  const w = 240, h = 96;
  // split note into ~28-char lines
  const words = note.split(' ');
  const lines = []; let cur = '';
  for (const w2 of words) {
    if ((cur + ' ' + w2).trim().length > 32) { lines.push(cur.trim()); cur = w2; }
    else cur = (cur + ' ' + w2).trim();
  }
  if (cur) lines.push(cur);
  return (
    <g transform={`translate(${x},${y})`}>
      <g filter="url(#sk-sdd)">
        <rect width={w} height={h} fill={t.card} stroke={color} strokeWidth="1.4" rx="3"/>
      </g>
      <text x="14" y="22" fill={color} fontSize="12" fontFamily="JetBrains Mono,monospace" fontWeight="700">{name}</text>
      <text x="14" y="38" fill={t.dim} fontSize="9" letterSpacing="1.5" fontFamily="JetBrains Mono,monospace">{axis.toUpperCase()}</text>
      {lines.map((ln,i)=>(
        <text key={i} x="14" y={58 + i*14} fill={t.mute} fontSize="11" fontFamily="Fraunces,serif" fontStyle="italic">{ln}</text>
      ))}
    </g>
  );
}

function DeepCard({kicker,title,color,bullets,t}) {
  return (
    <div data-af-reveal style={{background:t.card,border:`1px solid ${t.line}`,padding:'32px 36px',borderRadius:3,position:'relative'}}>
      <div style={{fontSize:11,letterSpacing:3,color,marginBottom:10,fontFamily:'"JetBrains Mono",monospace',fontWeight:700}}>{kicker}</div>
      <h3 style={{fontFamily:'"Fraunces",serif',fontWeight:400,fontSize:28,letterSpacing:-.5,margin:'0 0 24px 0',color:t.ink,fontStyle:'italic'}}>{title}</h3>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {bullets.map(([name,desc])=>(
          <div key={name} style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:16,paddingBottom:14,borderBottom:`1px dashed ${t.line}`}}>
            <div style={{fontFamily:'"JetBrains Mono",monospace',fontSize:12,color,fontWeight:600}}>{name}</div>
            <div style={{fontSize:13,color:t.mute,lineHeight:1.55}}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.SDDPipeline = SDDPipeline;
