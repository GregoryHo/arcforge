// Remaining sections: Wiki, Evaluating, Session+Learning, Platforms, Skills grid, Day-in-life, Before/after, Install, Footer

// ─── Before / After ───
function BeforeAfter({theme:t}) {
  return (
    <PageSection theme={t} id="before-after">
      <SectionHeader
        n="03"
        kicker="WHY IT MATTERS"
        title={<>The <em style={{color:t.brass,fontStyle:'italic'}}>before</em>, and the <em style={{color:t.ember,fontStyle:'italic'}}>after</em>.</>}
        sub="What changes when discipline shows up by default — without forcing a workflow on every prompt."
        theme={t}
      />
      <div data-af-reveal className="af-grid-2col" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:40}}>
        <div style={{background:t.card,border:`1px dashed ${t.line}`,padding:'36px 40px',position:'relative'}}>
          <div style={{position:'absolute',top:-12,left:28,background:t.bg,padding:'2px 12px',fontSize:10,letterSpacing:3,color:t.dim,fontFamily:'"JetBrains Mono",monospace'}}>BEFORE</div>
          <h3 style={{fontFamily:'"Fraunces",serif',fontStyle:'italic',fontWeight:400,fontSize:32,margin:'0 0 24px 0',color:t.ink}}>undisciplined</h3>
          {[
            'Skips design. Jumps to code.',
            'Forgets the test-first discipline mid-session.',
            'Context evaporates between sessions.',
            'Multi-epic work stomps on itself in one branch.',
            'No record of what was tried, what failed, why.',
          ].map(x=>(
            <div key={x} style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:12,color:t.mute,fontSize:14,lineHeight:1.5}}>
              <span style={{color:t.dim,marginTop:2}}>✕</span><span>{x}</span>
            </div>
          ))}
        </div>
        <div style={{background:t.card,border:`1.5px solid ${t.ember}`,padding:'36px 40px',position:'relative'}}>
          <div style={{position:'absolute',top:-12,left:28,background:t.bg,padding:'2px 12px',fontSize:10,letterSpacing:3,color:t.ember,fontFamily:'"JetBrains Mono",monospace'}}>AFTER</div>
          <h3 style={{fontFamily:'"Fraunces",serif',fontStyle:'italic',fontWeight:400,fontSize:32,margin:'0 0 24px 0',color:t.ink}}>disciplined</h3>
          {[
            ['Designs before building.','arc-brainstorming blocks the agent from jumping to code.'],
            ['Tests before shipping.','arc-tdd enforces RED → GREEN → REFACTOR at every task.'],
            ['Remembers across sessions.','arc-journaling + arc-managing-sessions persist context.'],
            ['Parallelizes without chaos.','arc-coordinating spins isolated worktrees per epic.'],
            ['Learns from its runs.','arc-reflecting surfaces patterns; arc-recalling turns them into instincts.'],
          ].map(([h,d])=>(
            <div key={h} style={{display:'flex',gap:10,alignItems:'flex-start',marginBottom:14,fontSize:14,lineHeight:1.5}}>
              <span style={{color:t.ember,marginTop:2}}>◆</span>
              <div><span style={{color:t.ink,fontWeight:500}}>{h}</span> <span style={{color:t.mute}}>{d}</span></div>
            </div>
          ))}
        </div>
      </div>
    </PageSection>
  );
}

// ─── Day in the life ───
function DayInLife({theme:t}) {
  const steps = [
    ['09:02', 'session start', 'SessionStart hooks fire. inject-skills sets a minimal bootstrap. Previous session handover injected — five lines, not an archive.', t.brass],
    ['09:04', '"add OAuth login"', 'Vague intent. arc-using suggests arc-brainstorming as the smallest useful starting point.', t.ember],
    ['09:12', 'brainstorm → refine', 'Design doc committed. Refiner produces spec.xml. Scope declared.', t.brass],
    ['09:24', 'plan → coordinate', 'DAG emits 12 tasks across 3 epics. arc-using-worktrees spins isolated branches.', t.brass],
    ['09:38', 'implement (TDD)', 'Subagent per task. Red tests first. Green. Then two-stage review: spec, then quality.', t.ember],
    ['11:20', 'compact suggested', 'compact-suggester hook fires at 50 tool calls. /compact runs, pre-compact checkpoints state.', t.dim],
    ['14:05', 'dispatch teammates', 'Epic B and Epic C run in parallel via Claude Code teammate agents. Lead keeps context.', t.ember],
    ['17:40', 'journal + reflect', 'arc-journaling captures the day\'s reflections before compaction. arc-reflecting surfaces patterns.', t.brass],
    ['17:45', 'finish + merge', 'arc-finishing-epic runs the merge decision. Worktrees collapse back into main.', t.ember],
  ];
  return (
    <PageSection theme={t} id="day">
      <SectionHeader
        n="04"
        kicker="A DAY IN THE LIFE"
        title={<>One prompt, <em style={{color:t.brass,fontStyle:'italic'}}>a whole shift.</em></>}
        sub="A typical session: intent comes in, the smallest useful skill picks it up, larger workflows compose only when the work earns them."
        theme={t}
      />
      <div data-af-reveal style={{background:t.card,border:`1px solid ${t.line}`,position:'relative',paddingTop:48}}>
        <div style={{position:'absolute',top:16,left:16,fontFamily:'"JetBrains Mono",monospace',fontSize:10,letterSpacing:2,color:t.dim}}>LOG · session_20260502.jsonl</div>
        {steps.map((s,i)=>(
          <div key={i} className="af-day-row" style={{
            display:'grid',gridTemplateColumns:'80px 1fr',alignItems:'stretch',
            borderBottom: i<steps.length-1 ? `1px dashed ${t.line}` : 'none',
          }}>
            <div style={{
              padding:'20px 14px',fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:t.dim,
              borderRight:`1px dashed ${t.line}`,textAlign:'right',
            }}>{s[0]}</div>
            <div style={{padding:'20px 36px',position:'relative'}}>
              <span style={{position:'absolute',left:-6,top:24,width:11,height:11,borderRadius:6,background:t.bg,border:`2px solid ${s[3]}`}}/>
              <div style={{fontFamily:'"Fraunces",serif',fontStyle:'italic',fontSize:20,color:t.ink,marginBottom:4}}>{s[1]}</div>
              <div style={{color:t.mute,fontSize:13,lineHeight:1.55,maxWidth:720}}>{s[2]}</div>
            </div>
          </div>
        ))}
        <div style={{height:32}}/>
      </div>
    </PageSection>
  );
}

// ─── Wiki ───
function Wiki({theme:t}) {
  return (
    <PageSection theme={t} id="wiki">
      <SectionHeader
        n="05"
        kicker="LLM WIKI"
        title={<>A knowledge base <em style={{color:t.brass,fontStyle:'italic'}}>the agent writes</em> and reads.</>}
        sub={<>Inspired by Karpathy's LLM-wiki pattern. Arcforge maintains a unified Obsidian vault that agents can ingest, query, and audit — with diagrams as first-class nodes.</>}
        theme={t}
      />
      <div data-af-reveal className="af-grid-2col" style={{display:'grid',gridTemplateColumns:'1fr 1.2fr',gap:56,alignItems:'start'}}>
        <div>
          <SkillRow name="arc-maintaining-obsidian" desc="Unified Obsidian vault lifecycle: ingest, query, audit. Builds a searchable wiki from session artifacts." color={t.brass} t={t}/>
          <SkillRow name="arc-diagramming-obsidian" desc="First-class Excalidraw diagrams inside the vault. Agents draw as they think." color={t.ember} t={t}/>
          <div style={{marginTop:36,padding:'20px 24px',background:t.card,border:`1px dashed ${t.line}`,borderRadius:3}}>
            <div style={{fontSize:10,letterSpacing:3,color:t.dim,fontFamily:'"JetBrains Mono",monospace',marginBottom:8}}>WHY THIS MATTERS</div>
            <p style={{color:t.mute,fontSize:14,lineHeight:1.6,margin:0}}>
              Every session adds to a vault the next session can read. Agents build institutional memory instead of starting from zero.
            </p>
          </div>
        </div>

        {/* vault diagram */}
        <div style={{background:t.card,border:`1px solid ${t.line}`,borderRadius:3,padding:32,position:'relative'}}>
          <CornerMark pos={{top:8,left:8}} color={t.brass}/>
          <CornerMark pos={{top:8,right:8}} flip color={t.brass}/>
          <svg viewBox="0 0 540 420" style={{width:'100%',height:'auto'}}>
            <SketchDefs id="sk-wiki" scale={1} seed={9}/>
            {/* central vault */}
            <g transform="translate(270,210)" filter="url(#sk-wiki)">
              <rect x="-80" y="-36" width="160" height="72" fill={t.bg} stroke={t.ember} strokeWidth="1.6" rx="3"/>
            </g>
            <text x="270" y="206" textAnchor="middle" fill={t.ink} fontSize="14" fontFamily="Fraunces,serif" fontStyle="italic">obsidian vault</text>
            <text x="270" y="224" textAnchor="middle" fill={t.dim} fontSize="10" fontFamily="JetBrains Mono,monospace" letterSpacing="2">KNOWLEDGE · DIAGRAMS</text>

            {/* orbit nodes */}
            {[
              {a:-135,n:'specs',s:'spec.xml + design.md'},
              {a:-45,n:'journals',s:'per-session'},
              {a:45,n:'instincts',s:'learned patterns'},
              {a:135,n:'diagrams',s:'.excalidraw'},
            ].map((o)=>{
              const rad = o.a*Math.PI/180;
              const x = 270+Math.cos(rad)*160, y = 210+Math.sin(rad)*110;
              return (
                <g key={o.n}>
                  <g filter="url(#sk-wiki)">
                    <path d={`M${270+Math.cos(rad)*80} ${210+Math.sin(rad)*45} L${x} ${y}`}
                      stroke={t.brass} strokeWidth="1.2" strokeDasharray="3 3" fill="none"/>
                  </g>
                  <g filter="url(#sk-wiki)">
                    <rect x={x-46} y={y-16} width="92" height="32" fill={t.bg} stroke={t.brass} strokeWidth="1.2" rx="3"/>
                  </g>
                  <text x={x} y={y-2} textAnchor="middle" fill={t.ink} fontSize="11" fontFamily="JetBrains Mono,monospace" fontWeight="600">{o.n}</text>
                  <text x={x} y={y+11} textAnchor="middle" fill={t.dim} fontSize="9" fontFamily="Fraunces,serif" fontStyle="italic">{o.s}</text>
                </g>
              );
            })}

            {/* agent reading arrow — routes to central vault, clear of specs node */}
            <g filter="url(#sk-wiki)">
              <path d="M60 60 Q 150 40 250 110 T 270 172" stroke={t.ember} strokeWidth="1.4" fill="none"/>
              <polygon points="266,168 274,170 270,178" fill={t.ember}/>
            </g>
            <g fontFamily="'Caveat',cursive" fontSize="15" fill={t.ember}>
              <text x="44" y="36">agent reads,</text>
              <text x="44" y="54">agent writes</text>
            </g>
          </svg>
        </div>
      </div>
    </PageSection>
  );
}

// ─── Evaluating ───
function Evaluating({theme:t}) {
  return (
    <PageSection theme={t} id="eval">
      <SectionHeader
        n="06"
        kicker="EVAL"
        title={<>Trust comes from <em style={{color:t.brass,fontStyle:'italic'}}>behavior</em>, not promises.</>}
        sub={<>Every skill is graded by what an agent <em style={{color:t.ink,fontStyle:'italic'}}>actually did</em> — parsed from transcript action logs, not vibes. Activation, non-activation, and harness isolation are all measured, so the simple surface stays simple and the strict gates stay strict.</>}
        theme={t}
      />
      <div data-af-reveal className="af-grid-3col" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:24}}>
        <EvalCard n="A/B" title="Workflow trials" desc="Run the same scenario with and without a skill active. Compare action logs, turns used, outcome." t={t} color={t.ember}/>
        <EvalCard n="BA" title="Behavioral assertions" desc={<>Grade what the agent <em style={{fontStyle:'italic',color:t.ink}}>did</em> — not what it said — via parsed transcript events.</>} t={t} color={t.brass}/>
        <EvalCard n="MIX" title="Mixed grading" desc="Code-graded assertions where possible. Model-graded for qualitative aspects. Best of both." t={t} color={t.ember}/>
      </div>
      <div data-af-reveal style={{marginTop:48,background:t.card,border:`1px solid ${t.line}`,padding:'24px 28px',fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:t.mute,overflowX:'auto'}}>
        <div style={{fontSize:10,letterSpacing:3,color:t.dim,marginBottom:14}}>$ arcforge eval run auth-skill --max-turns 20 --plugin-dir ./arcforge</div>
        <div>{'→ trial 001  '}<span style={{color:t.brass}}>PASS</span>{' ·  12 turns · behavioral: 4/4 · quality: 92/100'}</div>
        <div>{'→ trial 002  '}<span style={{color:t.brass}}>PASS</span>{' ·   9 turns · behavioral: 4/4 · quality: 89/100'}</div>
        <div>{'→ trial 003  '}<span style={{color:t.ember}}>FAIL</span>{' ·  20 turns · behavioral: 2/4 — missed refine stage'}</div>
        <div style={{marginTop:10,color:t.dim}}>summary: 2/3 trials · mean turns 13.7 · spec compliance 83%</div>
      </div>
    </PageSection>
  );
}
function EvalCard({n,title,desc,t,color}) {
  return (
    <div style={{border:`1px solid ${t.line}`,padding:'28px 28px',background:t.card,position:'relative'}}>
      <div style={{fontFamily:'"Fraunces",serif',fontSize:60,lineHeight:1,color,fontStyle:'italic',marginBottom:12}}>{n}</div>
      <div style={{fontFamily:'"Fraunces",serif',fontSize:20,color:t.ink,marginBottom:10,fontStyle:'italic'}}>{title}</div>
      <div style={{fontSize:13,color:t.mute,lineHeight:1.55}}>{desc}</div>
    </div>
  );
}

// ─── Session + Learning ───
function SessionLearning({theme:t}) {
  return (
    <PageSection theme={t} id="session">
      <SectionHeader
        n="07"
        kicker="SESSION · SELF-LEARNING"
        title={<>Pick up where you <em style={{color:t.brass,fontStyle:'italic'}}>left off.</em> Learn only when it earns it.</>}
        sub={<>Lightweight handover by default — five-line "you are here" markers, not heavy archives. Opt-in learning is <em style={{color:t.ink,fontStyle:'italic'}}>off until you turn it on per project</em>; once enabled, three explicit gates stand between any pattern and active behavior.</>}
        theme={t}
      />
      <div data-af-reveal style={{background:t.bg2,border:`1px solid ${t.line}`,padding:'56px 56px',position:'relative'}}>
        <CornerMark pos={{top:10,left:10}} color={t.brass}/>
        <CornerMark pos={{top:10,right:10}} flip color={t.brass}/>
        <CornerMark pos={{bottom:10,left:10}} flipV color={t.brass}/>
        <CornerMark pos={{bottom:10,right:10}} flip flipV color={t.brass}/>
        <svg viewBox="0 0 1100 380" style={{width:'100%',height:'auto'}}>
          <SketchDefs id="sk-sess" scale={1.1} seed={13}/>
          {/* loop */}
          <g transform="translate(550,190)">
            <g filter="url(#sk-sess)">
              <ellipse rx="420" ry="150" fill="none" stroke={t.brass} strokeWidth="1.4" strokeDasharray="4 4"/>
            </g>
          </g>
          {[
            {x:150,y:190,n:'journaling',d:'per-session reflection',c:t.ember},
            {x:400,y:90,n:'reflecting',d:'patterns across entries',c:t.brass},
            {x:700,y:90,n:'learning',d:'opt-in candidate queue',c:t.brass},
            {x:950,y:190,n:'recalling',d:'instinct creation',c:t.ember},
            {x:700,y:290,n:'observing',d:'tool-call watch',c:t.brass},
            {x:400,y:290,n:'managing-sessions',d:'save / resume',c:t.brass},
          ].map(o=>{
            const label = 'arc-'+o.n;
            // 7.5px per char for JetBrains Mono 12px + 28px padding
            const w = Math.max(132, label.length * 7.5 + 28);
            const hw = w/2;
            return (
              <g key={o.n} transform={`translate(${o.x},${o.y})`}>
                <g filter="url(#sk-sess)">
                  <rect x={-hw} y="-24" width={w} height="48" fill={t.card} stroke={o.c} strokeWidth="1.4" rx="3"/>
                </g>
                <text y="-4" textAnchor="middle" fill={t.ink} fontSize="12" fontFamily="JetBrains Mono,monospace" fontWeight="600">{label}</text>
                <text y="12" textAnchor="middle" fill={t.dim} fontSize="9" fontFamily="Fraunces,serif" fontStyle="italic">{o.d}</text>
              </g>
            );
          })}
          <g fontFamily="'Caveat',cursive" fontSize="18" fill={t.ember}>
            <text x="485" y="210">handoff → resume → improve</text>
          </g>
        </svg>
      </div>
    </PageSection>
  );
}

// ─── Platforms ───
function Platforms({theme:t}) {
  const plats = [
    {name:'Claude Code',tag:'PRIMARY',cmd:'/plugin install arcforge@arcforge',note:'Full plugin marketplace. Hooks, agents, teammates, commands — all native.',primary:true},
    {name:'Codex',tag:'SUPPORTED',cmd:'Fetch .codex/INSTALL.md',note:'Manual install. Core skills + SDD pipeline.'},
    {name:'Gemini CLI',tag:'SUPPORTED',cmd:'Fetch .gemini/INSTALL.md',note:'Manual install. Core skills + SDD pipeline.'},
    {name:'OpenCode',tag:'SUPPORTED',cmd:'Clone + symlink plugin',note:'Plugin-shaped. Lives in ~/.config/opencode/plugin.'},
  ];
  return (
    <PageSection theme={t} id="platforms">
      <SectionHeader
        n="08"
        kicker="PLATFORMS"
        title={<>One toolkit, <em style={{color:t.brass,fontStyle:'italic'}}>four harnesses.</em></>}
        sub="Claude Code gets the deepest integration via the plugin marketplace. Codex, Gemini CLI, and OpenCode ship manually but share the same skill library."
        theme={t}
      />
      <div data-af-reveal className="af-grid-2col" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
        {plats.map(p=>(
          <div key={p.name} style={{
            background:t.card,border:`${p.primary?1.5:1}px solid ${p.primary?t.ember:t.line}`,
            padding:'28px 32px',position:'relative'
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
              <h3 style={{fontFamily:'"Fraunces",serif',fontSize:28,margin:0,color:t.ink,fontWeight:400,letterSpacing:-.5}}>{p.name}</h3>
              <Stamp label={p.tag} color={p.primary?t.ember:t.brass} small/>
            </div>
            <div style={{color:t.mute,fontSize:13,lineHeight:1.55,marginBottom:18}}>{p.note}</div>
            <div style={{fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:p.primary?t.ember:t.dim,background:t.bg,padding:'10px 14px',border:`1px dashed ${t.line}`}}>{p.cmd}</div>
          </div>
        ))}
      </div>
    </PageSection>
  );
}

// ─── Skills Grid (all 33) ───
function SkillsGrid({theme:t}) {
  // Aligned to the seven functional categories in docs/guide/skills-reference.md.
  // Meta is called out as project-level, not a normal user-facing skill.
  const groups = [
    ['Planning', t.brass, [
      ['arc-brainstorming','design exploration'],
      ['arc-refining','spec generation'],
      ['arc-writing-tasks','break into tasks'],
      ['arc-planning','DAG breakdown'],
    ]],
    ['Execution', t.ember, [
      ['arc-executing-tasks','human-in-the-loop'],
      ['arc-agent-driven','subagent per task + review'],
      ['arc-implementing','epic orchestrator'],
      ['arc-dispatching-parallel','parallel agent dispatch'],
      ['arc-dispatching-teammates','multi-epic teammates'],
      ['arc-looping','cross-session autonomy'],
    ]],
    ['Coordination', t.brass, [
      ['arc-using','bounded router · skill index'],
      ['arc-using-worktrees','isolated workspaces'],
      ['arc-coordinating','worktree lifecycle'],
      ['arc-finishing','branch completion'],
      ['arc-finishing-epic','epic completion'],
      ['arc-compacting','strategic /compact timing'],
      ['arc-managing-sessions','handover + archive'],
    ]],
    ['Quality', t.ember, [
      ['arc-tdd','RED → GREEN → REFACTOR'],
      ['arc-debugging','four-phase debug'],
      ['arc-verifying','evidence before claims'],
      ['arc-requesting-review','when to request review'],
      ['arc-receiving-review','handle feedback rigor'],
      ['arc-evaluating','measure behavioral change'],
      ['arc-auditing-spec','read-only spec audit'],
    ]],
    ['Learning', t.brass, [
      ['arc-journaling','pre-compaction reflection'],
      ['arc-reflecting','insights from diaries'],
      ['arc-learning','opt-in candidate lifecycle'],
      ['arc-observing','tool-call observation'],
      ['arc-recalling','instinct creation'],
      ['arc-researching','hypothesis experiments'],
    ]],
    ['Knowledge Base', t.ember, [
      ['arc-maintaining-obsidian','vault lifecycle'],
      ['arc-diagramming-obsidian','Excalidraw diagrams'],
    ]],
    ['Meta · project-level', t.dim, [
      ['arc-writing-skills','TDD for ArcForge\'s own skills'],
    ]],
  ];
  return (
    <PageSection theme={t} id="skills">
      <SectionHeader
        n="09"
        kicker="SKILLS"
        title={<>33 skills, organized by <em style={{color:t.brass,fontStyle:'italic'}}>functional role.</em></>}
        sub="Seven categories matching the docs reference. Call any skill directly when you know the path; let arc-using route on demand when you don't. Meta is project-level — for maintaining ArcForge itself, not normal product work."
        theme={t}
      />
      <div data-af-reveal style={{display:'flex',flexDirection:'column',gap:36}}>
        {groups.map(([name,color,items])=>(
          <div key={name}>
            <div style={{display:'flex',alignItems:'baseline',gap:16,marginBottom:18,paddingBottom:10,borderBottom:`1px dashed ${t.line}`}}>
              <h3 style={{fontFamily:'"Fraunces",serif',fontStyle:'italic',fontSize:22,color:t.ink,margin:0,fontWeight:400}}>{name}</h3>
              <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,color}}>{items.length} skills</span>
            </div>
            <div className="af-skill-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'14px 32px'}}>
              {items.map(([n,d])=>(
                <div key={n} style={{display:'flex',flexDirection:'column',gap:3,padding:'8px 0'}}>
                  <div style={{fontFamily:'"JetBrains Mono",monospace',fontSize:13,color,fontWeight:600}}>{n}</div>
                  <div style={{fontSize:12,color:t.mute,lineHeight:1.45,fontStyle:'italic',fontFamily:'"Fraunces",serif'}}>{d}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageSection>
  );
}

function SkillRow({name,desc,color,t}) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'240px 1fr',gap:16,padding:'20px 0',borderBottom:`1px dashed ${t.line}`}}>
      <div style={{fontFamily:'"JetBrains Mono",monospace',fontSize:13,color,fontWeight:600}}>{name}</div>
      <div style={{fontSize:14,color:t.mute,lineHeight:1.55}}>{desc}</div>
    </div>
  );
}

// ─── Hooks ───
function Hooks({theme:t}) {
  const hooks = [
    ['SessionStart','inject-skills','Minimal bootstrap: sets ARCFORGE_ROOT and tells the agent skills are tools, not laws. No mandatory routing.'],
    ['SessionStart','session-tracker/start','Resets counters, initializes session state.'],
    ['SessionStart','session-tracker/inject-context','Loads previous session context + learned instincts.'],
    ['UserPromptSubmit','user-message-counter','Counts prompts for session evaluation.'],
    ['PreToolUse','observe','Captures tool calls for behavioral pattern detection.'],
    ['PostToolUse','quality-check','Auto-format (Prettier), type-check (TSC), console.log warnings on Edit.'],
    ['PostToolUse','compact-suggester','Suggests /compact at 50 tool calls, then every 25.'],
    ['PreCompact','pre-compact','Marks session file with compaction timestamp.'],
    ['Stop','session-tracker/end','Saves session metrics (JSON + Markdown summary).'],
  ];
  return (
    <PageSection theme={t} id="hooks">
      <SectionHeader
        n="10"
        kicker="HOOKS"
        title={<>Hooks are how skills <em style={{color:t.brass,fontStyle:'italic'}}>show up without being called.</em></>}
        sub="Claude Code hooks run at lifecycle events. Arcforge uses them to inject skills, track sessions, auto-format code, and suggest compaction before context fills."
        theme={t}
      />
      <div data-af-reveal style={{background:t.card,border:`1px solid ${t.line}`,padding:'0 0'}}>
        <div className="af-hooks-row" style={{display:'grid',gridTemplateColumns:'160px 240px 1fr',padding:'16px 28px',borderBottom:`1px solid ${t.line}`,fontFamily:'"JetBrains Mono",monospace',fontSize:10,letterSpacing:2,color:t.dim}}>
          <span>EVENT</span><span>HOOK</span><span>BEHAVIOR</span>
        </div>
        {hooks.map(([e,h,d],i)=>(
          <div key={i} className="af-hooks-row" style={{
            display:'grid',gridTemplateColumns:'160px 240px 1fr',padding:'14px 28px',
            borderBottom: i<hooks.length-1?`1px dashed ${t.line}`:'none',alignItems:'center',
          }}>
            <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:11,color:t.ember,letterSpacing:1.5}}>{e}</span>
            <span style={{fontFamily:'"JetBrains Mono",monospace',fontSize:12,color:t.brass,fontWeight:600}}>{h}</span>
            <span style={{color:t.mute,fontSize:13,lineHeight:1.5}}>{d}</span>
          </div>
        ))}
      </div>
    </PageSection>
  );
}

// ─── Install ───
function Install({theme:t}) {
  return (
    <PageSection theme={t} id="install">
      <SectionHeader
        n="11"
        kicker="INSTALL"
        title={<>Two commands, <em style={{color:t.brass,fontStyle:'italic'}}>then /help.</em></>}
        theme={t}
      />
      <div data-af-reveal className="af-grid-2col" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:32}}>
        <div style={{background:t.card,border:`1.5px solid ${t.ember}`,padding:'36px 36px'}}>
          <div style={{fontSize:10,letterSpacing:3,color:t.ember,fontFamily:'"JetBrains Mono",monospace',marginBottom:10,fontWeight:700}}>CLAUDE CODE · RECOMMENDED</div>
          <h3 style={{fontFamily:'"Fraunces",serif',fontSize:26,color:t.ink,margin:'0 0 18px 0',fontStyle:'italic',fontWeight:400}}>Plugin marketplace</h3>
          <div style={{fontFamily:'"JetBrains Mono",monospace',fontSize:13,color:t.ink,lineHeight:2,background:t.bg,padding:'16px 20px',border:`1px dashed ${t.line}`}}>
            <div><span style={{color:t.dim}}>$ </span>/plugin marketplace add arcforge</div>
            <div><span style={{color:t.dim}}>$ </span>/plugin install arcforge@arcforge</div>
            <div><span style={{color:t.dim}}>$ </span>/help</div>
          </div>
        </div>
        <div style={{background:t.card,border:`1px solid ${t.line}`,padding:'36px 36px'}}>
          <div style={{fontSize:10,letterSpacing:3,color:t.brass,fontFamily:'"JetBrains Mono",monospace',marginBottom:10,fontWeight:700}}>OTHER HARNESSES</div>
          <h3 style={{fontFamily:'"Fraunces",serif',fontSize:26,color:t.ink,margin:'0 0 18px 0',fontStyle:'italic',fontWeight:400}}>Manual install</h3>
          <div style={{color:t.mute,fontSize:13,lineHeight:1.7}}>
            <div style={{marginBottom:10}}><b style={{color:t.ink,fontFamily:'monospace'}}>Codex:</b> Fetch <span style={{color:t.brass,fontFamily:'monospace'}}>.codex/INSTALL.md</span></div>
            <div style={{marginBottom:10}}><b style={{color:t.ink,fontFamily:'monospace'}}>Gemini:</b> Fetch <span style={{color:t.brass,fontFamily:'monospace'}}>.gemini/INSTALL.md</span></div>
            <div><b style={{color:t.ink,fontFamily:'monospace'}}>OpenCode:</b> Clone + symlink plugin</div>
          </div>
        </div>
      </div>
    </PageSection>
  );
}

// ─── Footer ───
function Footer({theme:t}) {
  return (
    <footer style={{borderTop:`1px dashed ${t.line}`,padding:'48px 80px',background:t.bg,color:t.dim,fontSize:12,fontFamily:'"JetBrains Mono",monospace'}}>
      <div className="af-footer" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:24}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <Logo size={20} ember={t.ember} brass={t.brass}/>
            <span style={{fontFamily:'"Fraunces",serif',fontSize:16,color:t.ink,fontWeight:500}}>arcforge</span>
          </div>
          <div style={{color:t.dim}}>MIT · v3.0.0-rc.1 · By Gregory Ho</div>
        </div>
        <div className="af-footer-links" style={{display:'flex',gap:48,letterSpacing:2,textTransform:'uppercase'}}>
          <a href="https://github.com/GregoryHo/arcforge" style={{color:t.ember,textDecoration:'none'}}>GitHub ↗</a>
          <a href="https://publish.obsidian.md/greghodev/ArcForge/MOC-ArcForge" style={{color:t.mute,textDecoration:'none'}}>Wiki ↗</a>
          <a href="#hero" style={{color:t.mute,textDecoration:'none'}}>Top</a>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { BeforeAfter, DayInLife, Wiki, Evaluating, SessionLearning, Platforms, SkillsGrid, Hooks, Install, Footer });
