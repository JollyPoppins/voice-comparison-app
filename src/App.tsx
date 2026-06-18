import { useState, CSSProperties } from 'react';

// ── Light theme tokens ────────────────────────────────────────────────────────
const lt = {
  bg:     { editor: '#FFFFFF' },
  text:   { primary: '#111827', secondary: '#6B7280', tertiary: '#9CA3AF', onAccent: '#FFFFFF' },
  accent: { primary: '#2563EB' },
  stroke: { primary: '#E5E7EB', secondary: '#D1D5DB', tertiary: '#F3F4F6' },
  fill:   { secondary: '#EFF6FF', tertiary: '#F9FAFB', quaternary: '#F3F4F6' },
};
const pl = { diffInsertedLine: '#F0FDF4', diffRemovedLine: '#FEF2F2', diffStripRemoved: '#DC2626' };
const cl = { green: '#16A34A', yellow: '#D97706' };

// ── useLocalState — persists to localStorage ──────────────────────────────────
function useLocalState<T>(key: string, defaultValue: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const s = localStorage.getItem(`vca-${key}`);
      return s !== null ? (JSON.parse(s) as T) : defaultValue;
    } catch { return defaultValue; }
  });
  function setState(newValue: T | ((prev: T) => T)) {
    setValue(prev => {
      const next = typeof newValue === 'function' ? (newValue as (p: T) => T)(prev) : newValue;
      try { localStorage.setItem(`vca-${key}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  return [value, setState];
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Provider = 'HappyRobot' | 'Phenom';
type DimKey =
  | 'latency' | 'prosody' | 'interruption' | 'backchanneling' | 'asrAccuracy'
  | 'endOfTurn' | 'recovery' | 'conversationFlow' | 'voiceAffect'
  | 'agentInterrupting';
type Scores   = Record<DimKey, number>;
type DimNotes = Record<DimKey, string>;

interface CallEntry {
  id: string; provider: Provider; tenant: string; jobId: string;
  fullName: string; reviewer: string; scores: Scores; dimNotes: DimNotes; notes: string;
}
interface DeleteState { id: string; pw: string; error: boolean; }

// ── Dimension metadata ────────────────────────────────────────────────────────
const DIM_KEYS: DimKey[] = [
  'latency','prosody','interruption','agentInterrupting','backchanneling','asrAccuracy',
  'endOfTurn','recovery','conversationFlow','voiceAffect',
];
const OPTIONAL_DIMS: DimKey[] = ['asrAccuracy'];

interface DimMeta { label: string; hint: string; what: string; anchors: string[]; techRoot: string; realtimeTip?: string; }

const DIMS: Record<DimKey, DimMeta> = {
  latency: {
    label: 'Response Latency',
    hint: "Count 'one... two...' when the caller stops — does the agent reply before 'two'?",
    what: "The pause between the caller finishing a sentence and the agent's first word.",
    anchors: ['Replies feel instant — no conscious gap','One beat — noticeable but not disruptive','Consistent pause — conversation rhythm is off','Clear wait every turn — stilted','Long waits throughout — feels broken'],
    techRoot: 'STT processing, LLM inference latency, TTS buffer start delay. Fix: real-time streaming pipeline.',
    realtimeTip: 'Score your impression on the first 2–3 exchanges, then revise at the end if needed.',
  },
  prosody: {
    label: 'Naturalness of Speech',
    hint: 'Does the voice sound like a real person, or like a GPS reading directions?',
    what: 'Prosody: pitch variation, stress on key words, natural pausing within sentences, overall rhythm.',
    anchors: ['Indistinguishable from a real person','Natural with occasional robotic moments','Noticeable TTS quality — still intelligible','Clearly robotic — awkward stress or flat delivery','Monotone or broken'],
    techRoot: 'TTS model expressiveness, SSML tuning, prompt phrasing.',
  },
  interruption: {
    label: 'Interruption Handling',
    hint: 'Talk over the agent mid-sentence — does it stop and hear you out?',
    what: 'The agent should stop speaking immediately when the caller starts and correctly process what was said.',
    anchors: ['Stops immediately, understands perfectly','Stops reliably, occasional brief overlap','Sometimes ignores, 1–2 s reaction lag','Frequently ignores barge-ins','No barge-in support at all'],
    techRoot: 'VAD sensitivity, barge-in endpoint, ASR streaming during TTS playback.',
    realtimeTip: 'Test this early — start speaking while the agent is mid-response.',
  },
  backchanneling: {
    label: 'Backchanneling',
    hint: "Speak for 15 seconds — does the agent say 'mm-hmm' or 'I see' during your silence?",
    what: "Short verbal cues ('mm-hmm', 'I see', 'got it') that signal active listening.",
    anchors: ['Natural cues at right moments — active listening','Occasional, mostly appropriate','Rare or poorly timed','Essentially absent — dead silence while you speak','No backchanneling at all'],
    techRoot: 'Requires a parallel backchannel model. Absence is an architectural gap.',
    realtimeTip: "Give a long 15–20 second answer without pausing. Note whether the agent says anything at all.",
  },
  asrAccuracy: {
    label: 'ASR Accuracy',
    hint: "Note every time the agent responds to something you didn't say, or asks to repeat.",
    what: 'Speech recognition accuracy: does the agent transcribe the caller correctly?',
    anchors: ['No transcription errors observed','1–2 minor misheards, recovered quickly','3–5 errors, some changed the conversation','Frequent errors — often responded irrelevantly','Unable to understand caller reliably'],
    techRoot: 'STT model accuracy, vocabulary coverage, acoustic model.',
  },
  endOfTurn: {
    label: 'End-of-Turn Detection',
    hint: 'Pause mid-thought then finish — does the agent cut in early or wait too long after you stop?',
    what: 'Accurate turn detection: waits for sentence completions without cutting off the caller.',
    anchors: ['Perfect — responds within a beat of turn end','Occasional cut-in or slight delay, not disruptive','Noticeable cut-ins or long post-turn silences','Frequently interrupts or waits > 2 s','Systematically wrong — always cuts in or always waits'],
    techRoot: 'Silence timeout tuning, sentence-boundary models, VAD thresholds.',
    realtimeTip: 'Try mid-call: pause for 1–2 seconds mid-thought. If the agent jumps in during your pause, mark a low score.',
  },
  recovery: {
    label: 'Error Recovery',
    hint: 'When something is misunderstood, does the agent ask a targeted follow-up or repeat itself?',
    what: 'When the agent mishears or goes off-topic, does it recover with a targeted clarification?',
    anchors: ['Seamless — short targeted clarification','Recovers well, slightly generic follow-up','Recovers eventually but with friction','Often stuck — repeats the same response','Fails to recover — escalates or breaks'],
    techRoot: 'Fallback prompt design, confidence thresholds, retry logic, escalation paths.',
    realtimeTip: "Give a deliberately vague answer once. A good agent asks about the specific gap.",
  },
  conversationFlow: {
    label: 'Overall Conversation Flow',
    hint: 'At the very end: did this feel like talking to a person, or talking to a phone menu?',
    what: 'Holistic feel of the entire call — natural rhythm, coherence, and two-way engagement.',
    anchors: ['Completely natural — felt like a real conversation','Mostly natural, minor robotic moments','Functional but clearly automated','Stilted and hard to follow','Frustrating or incoherent'],
    techRoot: 'Composite signal. High individual scores but low here → pacing or prompt design.',
    realtimeTip: 'Score this last, as your overall impression of the full experience.',
  },
  voiceAffect: {
    label: 'Voice Affect & Tone',
    hint: "Express frustration or urgency — does the agent's tone shift to match, or stay flat?",
    what: "Whether the agent's tone adapts: warmer when empathizing, brisk for factual exchanges.",
    anchors: ['Adapts naturally — empathetic when needed, brisk when factual','Generally appropriate, rare mismatch','Mostly flat regardless of context','Frequent mismatches — upbeat when caller is frustrated','Completely flat or consistently wrong tone'],
    techRoot: 'TTS expressiveness controls, sentiment-aware prompts, emotion-conditioned TTS.',
  },
  agentInterrupting: {
    label: 'Agent Interrupting',
    hint: 'Does the agent cut in while the candidate is still speaking? Note every premature interruption.',
    what: 'Whether the agent breaks into the candidate\'s speech before they have finished their turn. Measured from the listener\'s perspective — any overlap where the agent starts talking over the candidate counts.',
    anchors: ['Never interrupts — always waits for a complete turn','Rare, minor overlap (1 instance) that did not disrupt the flow','Occasional interruptions (2–3) that cause noticeable friction','Frequent interruptions — candidate has to restart several times','Constant cut-ins — conversation is repeatedly broken'],
    techRoot: 'End-of-turn detection threshold, VAD aggressiveness, silence timeout set too short, or missing sentence-boundary model.',
    realtimeTip: 'Give a long, flowing answer with a mid-sentence pause — note whether the agent jumps in before you finish.',
  },
};

// ── Seed data ─────────────────────────────────────────────────────────────────
const EMPTY_DIM_NOTES: DimNotes = {
  latency:'',prosody:'',interruption:'',agentInterrupting:'',backchanneling:'',asrAccuracy:'',
  endOfTurn:'',recovery:'',conversationFlow:'',voiceAffect:'',
};

const SEED: CallEntry[] = [
  { id:'s1', provider:'HappyRobot', tenant:'DHL', jobId:'JD-2481', fullName:'Marcus Rivera', reviewer:'Priya M.',
    scores:{latency:5,prosody:4,interruption:5,agentInterrupting:5,backchanneling:4,asrAccuracy:5,endOfTurn:4,recovery:4,conversationFlow:5,voiceAffect:4},
    dimNotes:{...EMPTY_DIM_NOTES,latency:"Consistent sub-1 s — felt instant",backchanneling:"Said 'mm-hmm' naturally ~3 times",agentInterrupting:"Never cut in — clean turn-taking throughout"},
    notes:"Very natural pacing. Said 'mm-hmm' at right moments. Stopped immediately when I interrupted." },
  { id:'s2', provider:'Phenom', tenant:'DHL', jobId:'JD-2481', fullName:'Marcus Rivera', reviewer:'Priya M.',
    scores:{latency:3,prosody:3,interruption:2,agentInterrupting:2,backchanneling:1,asrAccuracy:4,endOfTurn:3,recovery:3,conversationFlow:3,voiceAffect:2},
    dimNotes:{...EMPTY_DIM_NOTES,latency:'~1.5 s gap before every response',backchanneling:'Zero backchanneling throughout',agentInterrupting:'Cut in twice mid-sentence'},
    notes:"~1.5 s latency. No backchanneling — felt like talking to a wall. Agent cut in before I finished twice." },
  { id:'s3', provider:'HappyRobot', tenant:'DHL', jobId:'JD-1893', fullName:'Priya Nair', reviewer:'Daniel K.',
    scores:{latency:4,prosody:5,interruption:4,agentInterrupting:5,backchanneling:5,asrAccuracy:4,endOfTurn:5,recovery:3,conversationFlow:4,voiceAffect:5},
    dimNotes:{...EMPTY_DIM_NOTES,prosody:'Pitch dropped noticeably when I described a stressful situation',agentInterrupting:'Zero interruptions — excellent patience'},
    notes:'Very expressive voice. Strong backchanneling throughout. Never interrupted the candidate.' },
  { id:'s4', provider:'Phenom', tenant:'DHL', jobId:'JD-1893', fullName:'Priya Nair', reviewer:'Daniel K.',
    scores:{latency:3,prosody:2,interruption:3,agentInterrupting:2,backchanneling:1,asrAccuracy:3,endOfTurn:2,recovery:2,conversationFlow:2,voiceAffect:2},
    dimNotes:{...EMPTY_DIM_NOTES,asrAccuracy:"Misheard 'Azure' as 'Asia'",agentInterrupting:"Interrupted 3 times — twice mid-answer"},
    notes:"Cut the candidate off multiple times. Flat tone. Misheard 'Azure' as 'Asia'." },
  { id:'s5', provider:'HappyRobot', tenant:'DHL', jobId:'JD-3062', fullName:'Tom Bauer', reviewer:'Sana R.',
    scores:{latency:5,prosody:4,interruption:4,agentInterrupting:5,backchanneling:3,asrAccuracy:5,endOfTurn:4,recovery:5,conversationFlow:4,voiceAffect:3},
    dimNotes:{...EMPTY_DIM_NOTES,recovery:"Asked specifically about the gap I left, not a generic 'please repeat'"},
    notes:'Recovery was impressive. Never talked over the candidate.' },
  { id:'s6', provider:'Phenom', tenant:'DHL', jobId:'JD-3062', fullName:'Tom Bauer', reviewer:'Sana R.',
    scores:{latency:2,prosody:2,interruption:2,agentInterrupting:1,backchanneling:1,asrAccuracy:3,endOfTurn:3,recovery:2,conversationFlow:2,voiceAffect:2},
    dimNotes:{...EMPTY_DIM_NOTES,latency:'2+ s before every reply',recovery:'Asked me to repeat the whole answer',agentInterrupting:'Constantly cut in — 5+ times'},
    notes:'2+ second latency. Generic error recovery. Backchanneling absent. Constantly interrupted candidate.' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const ZERO: Scores = {
  latency:0,prosody:0,interruption:0,agentInterrupting:0,backchanneling:0,asrAccuracy:0,
  endOfTurn:0,recovery:0,conversationFlow:0,voiceAffect:0,
};
const REQUIRED_DIMS = DIM_KEYS.filter(k => !OPTIONAL_DIMS.includes(k));

function uid(): string { return Math.random().toString(36).slice(2,9); }
function avg(ns: number[]): number { const v=ns.filter(n=>n>0); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0; }
function fmt(n: number): string { return n>0 ? n.toFixed(1) : '—'; }
function callOverall(c: CallEntry): number { return avg(REQUIRED_DIMS.map(k=>c.scores[k])); }
function gapLabel(g: number) { return g>2?'Critical':g>1?'High':g>0.3?'Medium':'On Par'; }
function scoreColor(s: number): string {
  if (s>=4) return cl.green; if (s===3) return lt.text.primary; if (s>0) return cl.yellow;
  return lt.text.tertiary;
}

function buildCSV(calls: CallEntry[]): string {
  const dimH  = DIM_KEYS.map(k => DIMS[k].label);
  const noteH = DIM_KEYS.map(k => `${DIMS[k].label} — Note`);
  const headers = ['Provider','Tenant','Job ID','Full Name','Reviewer','Overall Score',...dimH,...noteH,'Overall Notes'];
  const esc = (v: string|number) => `"${String(v).replace(/"/g,'""')}"`;
  const rows = calls.map(c => {
    const o = callOverall(c);
    return [c.provider,c.tenant,c.jobId,c.fullName,c.reviewer,o>0?o.toFixed(2):'',
      ...DIM_KEYS.map(k=>c.scores[k]||''),
      ...DIM_KEYS.map(k=>c.dimNotes[k]||''),
      c.notes].map(esc).join(',');
  });
  return [headers.map(esc).join(','),...rows].join('\n');
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const inputBase: CSSProperties = {
  width:'100%', padding:'6px 10px', fontSize:13, borderRadius:6,
  border:`1.5px solid ${lt.stroke.secondary}`, background:lt.bg.editor,
  color:lt.text.primary, outline:'none', boxSizing:'border-box', fontFamily:font,
};

// ── ScorePills ────────────────────────────────────────────────────────────────
function ScorePills({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display:'flex', gap:4, flexShrink:0 }}>
      {[5,4,3,2,1].map(n => (
        <button key={n} onClick={() => onChange(n)} style={{
          width:30, height:28, border:`1.5px solid ${value===n?lt.accent.primary:lt.stroke.primary}`,
          borderRadius:5, cursor:'pointer', fontSize:12, fontWeight:value===n?700:500,
          background:value===n?lt.accent.primary:lt.bg.editor,
          color:value===n?lt.text.onAccent:lt.text.primary, fontFamily:font,
        }}>{n}</button>
      ))}
    </div>
  );
}

// ── DimRow ────────────────────────────────────────────────────────────────────
function DimRow({ dimKey, scores, setScore, dimNote, setDimNote, isOptional }: {
  dimKey: DimKey; scores: Scores; setScore: (k: DimKey, v: number) => void;
  dimNote: string; setDimNote: (k: DimKey, v: string) => void; isOptional: boolean;
}) {
  const [open, setOpen] = useLocalState<boolean>(`open-${dimKey}`, false);
  const d  = DIMS[dimKey];
  const cv = scores[dimKey];

  return (
    <div style={{ borderBottom:`1px solid ${lt.stroke.tertiary}` }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', alignItems:'center', columnGap:16, padding:'10px 16px', background:cv>0?lt.fill.secondary:'transparent' }}>
        <div style={{ minWidth:0, cursor:'pointer' }} onClick={() => setOpen(!open)}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:14, fontWeight:600, color:lt.text.primary }}>{d.label}</span>
            {isOptional && <span style={{ fontSize:10, fontWeight:600, color:lt.text.tertiary, background:lt.fill.tertiary, border:`1px solid ${lt.stroke.secondary}`, borderRadius:3, padding:'1px 5px' }}>optional</span>}
            {cv>0 && <div style={{ width:20, height:20, borderRadius:10, flexShrink:0, background:lt.accent.primary, display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ fontSize:11, fontWeight:700, color:lt.text.onAccent }}>{cv}</span></div>}
            {dimNote.trim() && <span style={{ fontSize:10, fontWeight:600, color:lt.accent.primary, background:lt.fill.secondary, border:`1px solid ${lt.stroke.secondary}`, borderRadius:3, padding:'1px 5px' }}>note</span>}
          </div>
          <div style={{ fontSize:12, color:lt.text.tertiary, lineHeight:'16px', marginTop:2, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{d.hint}</div>
        </div>
        <ScorePills value={cv} onChange={v => setScore(dimKey, v)} />
        <button onClick={() => setOpen(!open)} style={{ background:'none', border:'none', cursor:'pointer', color:lt.text.secondary, fontSize:12, padding:'4px 6px', borderRadius:3, fontFamily:font }}>
          {open?'▲':'▼'}
        </button>
      </div>

      {open && (
        <div style={{ margin:'0 16px 14px 16px', paddingLeft:14, borderLeft:`2px solid ${lt.accent.primary}` }}>
          <div style={{ display:'flex', flexDirection:'column', gap:12, paddingTop:12 }}>
            {isOptional && (
              <div style={{ background:lt.fill.tertiary, border:`1px solid ${lt.stroke.secondary}`, borderRadius:6, padding:'8px 12px' }}>
                  <span style={{ fontSize:12, color:lt.text.secondary, lineHeight:'18px' }}>
                  <strong>Optional.</strong> Only score this if you can reliably verify transcription accuracy (e.g. access to a transcript or replay tool). Skip it if evaluating purely from listening.
                </span>
              </div>
            )}
            {d.realtimeTip && (
              <div style={{ background:lt.fill.tertiary, border:`1px solid ${lt.stroke.secondary}`, borderRadius:6, padding:'8px 12px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:lt.accent.primary, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>While listening</div>
                <div style={{ fontSize:12, color:lt.text.secondary, lineHeight:'18px' }}>{d.realtimeTip}</div>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:lt.text.tertiary, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>What it measures</div>
                <div style={{ fontSize:12, color:lt.text.secondary, lineHeight:'18px' }}>{d.what}</div>
                <div style={{ borderTop:`1px solid ${lt.stroke.tertiary}`, margin:'10px 0' }} />
                <div style={{ fontSize:10, fontWeight:700, color:lt.text.tertiary, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Engineering note</div>
                <div style={{ fontSize:12, color:lt.text.secondary, lineHeight:'18px', fontStyle:'italic' }}>{d.techRoot}</div>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:lt.text.tertiary, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Anchors</div>
                {d.anchors.map((anchor, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6 }}>
                    <div style={{ width:20, height:20, borderRadius:4, flexShrink:0, background:cv===(5-i)?lt.accent.primary:lt.fill.tertiary, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:cv===(5-i)?lt.text.onAccent:lt.text.tertiary }}>{5-i}</span>
                    </div>
                    <span style={{ fontSize:12, lineHeight:'20px', color:cv===(5-i)?lt.text.primary:lt.text.secondary, fontWeight:cv===(5-i)?600:400 }}>{anchor}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:lt.text.tertiary, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Note for this dimension (optional)</div>
              <textarea style={{ ...inputBase, resize:'vertical', lineHeight:'18px' }} rows={2} value={dimNote} onChange={e => setDimNote(dimKey, e.target.value)} placeholder="Quick observation while listening..." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── LogTab ────────────────────────────────────────────────────────────────────
function LogTab({ setCalls }: { calls: CallEntry[]; setCalls: (v: CallEntry[] | ((p: CallEntry[]) => CallEntry[])) => void }) {
  const [provider, setProvider] = useLocalState<Provider>('form-provider', 'HappyRobot');
  const [tenant,   setTenant]   = useLocalState('form-tenant', 'DHL');
  const [jobId,    setJobId]    = useLocalState('form-jobId', '');
  const [fullName, setFullName] = useLocalState('form-fullName', '');
  const [reviewer, setReviewer] = useLocalState('form-reviewer', '');
  const [scores,   setScores]   = useLocalState<Scores>('form-scores', { ...ZERO });
  const [dimNotes, setDimNotes] = useLocalState<DimNotes>('form-dimNotes', { ...EMPTY_DIM_NOTES });
  const [notes,    setNotes]    = useLocalState('form-notes', '');
  const [saved,    setSaved]    = useLocalState('form-saved', false);

  const tenantLocked = provider === 'HappyRobot';

  function handleProviderChange(p: Provider) {
    setProvider(p); setTenant(p === 'HappyRobot' ? 'DHL' : ''); setSaved(false);
  }
  function setScore(k: DimKey, v: number) { setScores(prev => ({ ...prev, [k]: v })); setSaved(false); }
  function setDimNote(k: DimKey, v: string) { setDimNotes(prev => ({ ...prev, [k]: v })); setSaved(false); }

  const scoredRequired  = REQUIRED_DIMS.filter(k => scores[k] > 0).length;
  const allScored       = REQUIRED_DIMS.every(k => scores[k] > 0);
  const optionalScored  = scores['asrAccuracy'] > 0;
  const effectiveTenant = tenantLocked ? 'DHL' : tenant;
  const canSubmit       = !!(effectiveTenant.trim() && jobId.trim() && fullName.trim() && reviewer.trim() && allScored);

  function handleSubmit() {
    if (!canSubmit) return;
    setCalls(prev => [...prev, { id:uid(), provider, tenant:effectiveTenant, jobId:jobId.trim(), fullName:fullName.trim(), reviewer:reviewer.trim(), scores:{...scores}, dimNotes:{...dimNotes}, notes:notes.trim() }]);
    setJobId(''); setFullName(''); setReviewer('');
    if (!tenantLocked) setTenant('');
    setScores({...ZERO}); setDimNotes({...EMPTY_DIM_NOTES}); setNotes(''); setSaved(true);
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {saved && (
        <div style={{ background:pl.diffInsertedLine, border:`1px solid ${lt.stroke.secondary}`, borderRadius:6, padding:'10px 14px' }}>
          <span style={{ fontSize:13, fontWeight:600, color:cl.green }}>Saved. </span>
          <span style={{ fontSize:13, color:lt.text.secondary }}>Switch to Results to see the comparison, or log another call.</span>
        </div>
      )}
      <div style={{ background:lt.fill.tertiary, border:`1px solid ${lt.stroke.secondary}`, borderRadius:6, padding:'10px 14px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:lt.text.secondary, marginBottom:3 }}>Use while listening</div>
        <div style={{ fontSize:12, color:lt.text.secondary, lineHeight:'18px' }}>Keep this open alongside the call recording. Score each dimension as you hear it. ASR Accuracy is optional — only score it if you have a reliable way to confirm transcription errors.</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:12, fontWeight:600, color:lt.text.secondary }}>Provider</div>
          <select style={{ ...inputBase, cursor:'pointer' }} value={provider} onChange={e => handleProviderChange(e.target.value as Provider)}>
            <option value="HappyRobot">HappyRobot</option>
            <option value="Phenom">Phenom</option>
          </select>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:12, fontWeight:600, color:lt.text.secondary }}>Tenant</span>
            {tenantLocked && <span style={{ fontSize:10, fontWeight:600, color:lt.text.tertiary, background:lt.fill.secondary, border:`1px solid ${lt.stroke.secondary}`, borderRadius:3, padding:'1px 5px' }}>auto-locked</span>}
          </div>
          <input style={tenantLocked?{...inputBase,background:lt.fill.secondary,color:lt.text.secondary,cursor:'not-allowed'}:inputBase} value={tenantLocked?'DHL':tenant} disabled={tenantLocked} onChange={e => { setTenant(e.target.value); setSaved(false); }} placeholder="e.g. Acme Corp" />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:12, fontWeight:600, color:lt.text.secondary }}>Reviewer</div>
          <input style={inputBase} value={reviewer} onChange={e => { setReviewer(e.target.value); setSaved(false); }} placeholder="Your name" />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:16 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:12, fontWeight:600, color:lt.text.secondary }}>Job ID</div>
          <input style={inputBase} value={jobId} onChange={e => { setJobId(e.target.value); setSaved(false); }} placeholder="e.g. JD-2481" />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ fontSize:12, fontWeight:600, color:lt.text.secondary }}>Full Name (candidate)</div>
          <input style={inputBase} value={fullName} onChange={e => { setFullName(e.target.value); setSaved(false); }} placeholder="e.g. Marcus Rivera" />
        </div>
      </div>

      <div style={{ borderTop:`1px solid ${lt.stroke.secondary}` }} />

      <div>
        <div style={{ display:'flex', alignItems:'center', marginBottom:6 }}>
          <div style={{ fontSize:18, fontWeight:600, color:lt.text.primary }}>Score each dimension</div>
          <div style={{ flex:1 }} />
          <div style={{ fontSize:12, color:allScored?cl.green:lt.text.tertiary, fontWeight:allScored?600:400 }}>
            {scoredRequired} / {REQUIRED_DIMS.length} required{optionalScored?' + optional':''}
          </div>
        </div>
        <div style={{ fontSize:12, color:lt.text.tertiary, marginBottom:12 }}>Click any label to expand anchors, a real-time tip, and a note field. ASR Accuracy is optional.</div>
        <div style={{ border:`1px solid ${lt.stroke.secondary}`, borderRadius:8, overflow:'hidden' }}>
          {DIM_KEYS.map(k => <DimRow key={k} dimKey={k} scores={scores} setScore={setScore} dimNote={dimNotes[k]} setDimNote={setDimNote} isOptional={OPTIONAL_DIMS.includes(k)} />)}
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        <div style={{ fontSize:12, fontWeight:600, color:lt.text.secondary }}>Overall notes (optional)</div>
        <div style={{ fontSize:11, color:lt.text.tertiary, marginBottom:2 }}>Overall impression, themes across the call.</div>
        <textarea style={{ ...inputBase, resize:'vertical', lineHeight:'20px' }} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Broader thoughts — call vibe, anything that stood out..." />
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button disabled={!canSubmit} onClick={handleSubmit} style={{ padding:'8px 18px', borderRadius:6, border:'none', background:canSubmit?lt.accent.primary:lt.fill.secondary, color:canSubmit?lt.text.onAccent:lt.text.tertiary, fontSize:14, fontWeight:600, cursor:canSubmit?'pointer':'not-allowed', fontFamily:font }}>
          Save Evaluation
        </button>
        {!allScored && jobId.trim() && <span style={{ fontSize:12, color:lt.text.tertiary }}>{REQUIRED_DIMS.length-scoredRequired} required dimension{REQUIRED_DIMS.length-scoredRequired!==1?'s':''} still unscored</span>}
      </div>
    </div>
  );
}

// ── ResultsTab ────────────────────────────────────────────────────────────────
function ResultsTab({ calls, setCalls }: { calls: CallEntry[]; setCalls: (v: CallEntry[] | ((p: CallEntry[]) => CallEntry[])) => void }) {
  const [expandedCalls, setExpandedCalls] = useLocalState<Record<string,boolean>>('expanded-calls', {});
  const [deleteState,   setDeleteState]   = useLocalState<DeleteState|null>('delete-state', null);
  const [csvPanel,      setCsvPanel]      = useLocalState('csv-panel', '');

  function toggleExpand(id: string) { setExpandedCalls(prev => ({ ...prev, [id]: !prev[id] })); }
  function requestDelete(id: string) {
    if (deleteState?.id === id) { setDeleteState(null); return; }
    setDeleteState({ id, pw:'', error:false });
  }
  function confirmDelete() {
    if (!deleteState) return;
    if (deleteState.pw === 'Delete') { setCalls(prev => prev.filter(x => x.id !== deleteState.id)); setDeleteState(null); }
    else setDeleteState({ ...deleteState, error:true });
  }
  function handleExport() {
    const csv = buildCSV(calls);
    setCsvPanel(csv);
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(csv).catch(() => {}); }
    try {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
      a.setAttribute('download', 'voice-provider-evaluations.csv');
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch { /* ignore */ }
  }

  const hr = calls.filter(c => c.provider === 'HappyRobot');
  const ph = calls.filter(c => c.provider === 'Phenom');
  const hrOverall = avg(hr.map(callOverall));
  const phOverall = avg(ph.map(callOverall));

  const gapRows = REQUIRED_DIMS
    .map(k => ({ k, hrAvg:avg(hr.map(c=>c.scores[k])), phAvg:avg(ph.map(c=>c.scores[k])), gap:avg(hr.map(c=>c.scores[k]))-avg(ph.map(c=>c.scores[k])) }))
    .sort((a,b) => b.gap-a.gap);

  function priorityColors(g: number) {
    if (g>2)   return { bg:pl.diffRemovedLine,  text:pl.diffStripRemoved };
    if (g>1)   return { bg:lt.fill.secondary,   text:cl.yellow };
    if (g>0.3) return { bg:lt.fill.tertiary,    text:lt.accent.primary };
    return           { bg:pl.diffInsertedLine,  text:cl.green };
  }

  const colLabel: CSSProperties = { fontSize:10, fontWeight:700, color:lt.text.tertiary, textTransform:'uppercase', letterSpacing:'0.05em' };
  const cell:     CSSProperties = { padding:'10px 14px', borderBottom:`1px solid ${lt.stroke.tertiary}`, verticalAlign:'middle' };
  const head:     CSSProperties = { padding:'8px 14px', fontSize:10, fontWeight:700, color:lt.text.tertiary, textTransform:'uppercase', letterSpacing:'0.05em', background:lt.fill.tertiary, borderBottom:`1px solid ${lt.stroke.secondary}` };
  const gridCols = '100px 80px 80px 140px 100px 66px 1fr 88px';

  if (calls.length === 0) return (
    <div style={{ background:lt.fill.tertiary, border:`1px solid ${lt.stroke.secondary}`, borderRadius:6, padding:'14px 16px' }}>
      <div style={{ fontSize:14, color:lt.text.secondary }}>No evaluations yet — use Log a Call to add your first.</div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ fontSize:18, fontWeight:600, color:lt.text.primary }}>Summary</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { value:fmt(hrOverall), label:'HappyRobot avg',    color:hrOverall>=4?cl.green:hrOverall>=3?lt.accent.primary:cl.yellow },
            { value:fmt(phOverall), label:'Phenom avg',         color:phOverall>=4?cl.green:phOverall>=3?lt.accent.primary:cl.yellow },
            { value:String(hr.length), label:'HappyRobot calls', color:lt.text.primary },
            { value:String(ph.length), label:'Phenom calls',      color:lt.text.primary },
          ].map((s,i) => (
            <div key={i} style={{ background:lt.fill.tertiary, borderRadius:8, padding:'14px 16px', border:`1px solid ${lt.stroke.secondary}` }}>
              <div style={{ fontSize:28, fontWeight:700, color:s.color, lineHeight:'34px' }}>{s.value}</div>
              <div style={{ fontSize:12, color:lt.text.tertiary, marginTop:4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop:`1px solid ${lt.stroke.secondary}` }} />

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ fontSize:18, fontWeight:600, color:lt.text.primary }}>Dimension Gap Analysis</div>
        <div style={{ fontSize:13, color:lt.text.secondary }}>Sorted by gap — largest first. Required dimensions only.</div>
        <div style={{ border:`1px solid ${lt.stroke.secondary}`, borderRadius:8, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...head, textAlign:'left'   }}>Dimension</th>
                <th style={{ ...head, textAlign:'center' }}>HappyRobot</th>
                <th style={{ ...head, textAlign:'center' }}>Phenom</th>
                <th style={{ ...head, textAlign:'center' }}>Gap</th>
                <th style={{ ...head, textAlign:'center' }}>Priority</th>
              </tr>
            </thead>
            <tbody>
              {gapRows.map((r,i) => {
                const pc = priorityColors(r.gap);
                return (
                  <tr key={i} style={{ background:i%2===1?lt.fill.quaternary:'transparent' }}>
                    <td style={{ ...cell, textAlign:'left' }}>
                      <div style={{ fontSize:13, fontWeight:600, color:lt.text.primary }}>{DIMS[r.k].label}</div>
                      <div style={{ fontSize:11, color:lt.text.tertiary, marginTop:2 }}>{DIMS[r.k].hint}</div>
                    </td>
                    <td style={{ ...cell, textAlign:'center' }}><span style={{ fontSize:15, fontWeight:700 }}>{fmt(r.hrAvg)}</span></td>
                    <td style={{ ...cell, textAlign:'center' }}><span style={{ fontSize:15, fontWeight:700 }}>{fmt(r.phAvg)}</span></td>
                    <td style={{ ...cell, textAlign:'center' }}><span style={{ fontSize:15, fontWeight:700, color:r.gap>1?lt.text.primary:lt.text.tertiary }}>{r.gap>0.05?`+${r.gap.toFixed(1)}`:r.gap<-0.05?r.gap.toFixed(1):'—'}</span></td>
                    <td style={{ ...cell, textAlign:'center' }}><span style={{ display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:600, background:pc.bg, color:pc.text }}>{gapLabel(r.gap)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize:11, color:lt.text.tertiary }}>Gap = HappyRobot avg − Phenom avg (1–5). {hr.length} HappyRobot and {ph.length} Phenom evaluations.</div>
      </div>

      <div style={{ borderTop:`1px solid ${lt.stroke.secondary}` }} />

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:18, fontWeight:600, color:lt.text.primary }}>All Evaluations</div>
          <div style={{ flex:1 }} />
          <button onClick={handleExport} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:6, border:`1.5px solid ${lt.stroke.primary}`, background:lt.bg.editor, color:lt.text.primary, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:font }}>
            ↓ Export CSV
          </button>
        </div>

        {csvPanel && (
          <div style={{ border:`1.5px solid ${lt.accent.primary}`, borderRadius:8, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'10px 14px', background:lt.fill.secondary, borderBottom:`1px solid ${lt.stroke.secondary}` }}>
              <span style={{ fontSize:13, fontWeight:600, color:lt.accent.primary, flex:1 }}>
                CSV ready — click the text area below, then press Ctrl+A → Ctrl+C (Cmd+A → Cmd+C on Mac).
              </span>
              <button onClick={() => setCsvPanel('')} style={{ background:'none', border:'none', cursor:'pointer', color:lt.text.secondary, fontSize:14, padding:'2px 6px', fontFamily:font }}>✕</button>
            </div>
            <textarea readOnly value={csvPanel} onClick={e => (e.target as HTMLTextAreaElement).select()} rows={7}
              style={{ width:'100%', padding:'10px 14px', fontSize:11, fontFamily:'monospace', color:lt.text.secondary, background:lt.bg.editor, border:'none', outline:'none', resize:'vertical', lineHeight:'18px', display:'block' }} />
          </div>
        )}

        <div style={{ border:`1px solid ${lt.stroke.secondary}`, borderRadius:8, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:gridCols, padding:'8px 14px', background:lt.fill.tertiary, borderBottom:`1px solid ${lt.stroke.secondary}`, gap:'0 10px' }}>
            {['Provider','Tenant','Job ID','Full Name','Reviewer','Overall','Notes',''].map((h,i) => <div key={i} style={colLabel}>{h}</div>)}
          </div>

          {calls.map((c,i) => {
            const o = callOverall(c);
            const isOpen = expandedCalls[c.id] === true;
            const isPendingDelete = deleteState?.id === c.id;
            const notedDims = DIM_KEYS.filter(k => c.dimNotes[k]?.trim());
            return (
              <div key={c.id} style={{ borderBottom:i<calls.length-1?`1px solid ${lt.stroke.tertiary}`:'none' }}>
                <div style={{ display:'grid', gridTemplateColumns:gridCols, padding:'10px 14px', alignItems:'center', gap:'0 10px', background:isPendingDelete?pl.diffRemovedLine:isOpen?lt.fill.secondary:i%2===1?lt.fill.quaternary:'transparent' }}>
                  <div><span style={{ display:'inline-block', padding:'2px 7px', borderRadius:4, fontSize:11, fontWeight:600, background:c.provider==='HappyRobot'?lt.accent.primary:lt.fill.secondary, color:c.provider==='HappyRobot'?lt.text.onAccent:lt.text.secondary, whiteSpace:'nowrap' }}>{c.provider==='HappyRobot'?'HR':'Phenom'}</span></div>
                  <div style={{ fontSize:12, color:lt.text.secondary, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.tenant}</div>
                  <div style={{ fontSize:12, color:lt.text.secondary, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>{c.jobId}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:lt.text.primary, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.fullName}</div>
                  <div style={{ fontSize:12, color:lt.text.secondary, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.reviewer}</div>
                  <div style={{ fontSize:16, fontWeight:700, color:scoreColor(o) }}>{fmt(o)}</div>
                  <div style={{ fontSize:12, color:lt.text.tertiary, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.notes||'—'}</div>
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={() => toggleExpand(c.id)} style={{ padding:'4px 7px', borderRadius:4, border:`1px solid ${lt.stroke.primary}`, background:isOpen?lt.fill.secondary:lt.bg.editor, color:lt.text.primary, cursor:'pointer', fontSize:11, fontFamily:font }}>{isOpen?'▲':'▼'}</button>
                    <button onClick={() => requestDelete(c.id)} style={{ padding:'4px 7px', borderRadius:4, border:`1px solid ${isPendingDelete?pl.diffStripRemoved:lt.stroke.primary}`, background:isPendingDelete?pl.diffRemovedLine:lt.bg.editor, color:isPendingDelete?pl.diffStripRemoved:lt.text.secondary, cursor:'pointer', fontSize:11, fontFamily:font, fontWeight:isPendingDelete?700:400 }}>✕</button>
                  </div>
                </div>

                {isPendingDelete && (
                  <div style={{ padding:'12px 14px', background:pl.diffRemovedLine, borderTop:`1px solid ${pl.diffStripRemoved}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                      <span style={{ fontSize:12, fontWeight:600, color:lt.text.primary }}>Type <span style={{ fontFamily:'monospace', background:lt.fill.secondary, padding:'1px 5px', borderRadius:3 }}>Delete</span> to permanently remove:</span>
                      <input type="text" value={deleteState?.pw??''} onChange={e => setDeleteState({ id:c.id, pw:e.target.value, error:false })} placeholder="Delete" style={{ padding:'4px 8px', fontSize:12, borderRadius:4, width:100, border:`1.5px solid ${deleteState?.error?pl.diffStripRemoved:lt.stroke.primary}`, background:lt.bg.editor, color:lt.text.primary, fontFamily:'monospace', outline:'none' }} />
                      <button onClick={confirmDelete} disabled={deleteState?.pw!=='Delete'} style={{ padding:'4px 12px', borderRadius:4, border:'none', fontSize:12, fontWeight:600, fontFamily:font, cursor:deleteState?.pw==='Delete'?'pointer':'not-allowed', background:deleteState?.pw==='Delete'?pl.diffStripRemoved:lt.fill.secondary, color:deleteState?.pw==='Delete'?lt.text.onAccent:lt.text.tertiary }}>Confirm delete</button>
                      <button onClick={() => setDeleteState(null)} style={{ padding:'4px 12px', borderRadius:4, border:`1px solid ${lt.stroke.primary}`, fontSize:12, background:lt.bg.editor, color:lt.text.secondary, cursor:'pointer', fontFamily:font }}>Cancel</button>
                      {deleteState?.error && <span style={{ fontSize:12, color:pl.diffStripRemoved, fontWeight:600 }}>Wrong — type exactly <span style={{ fontFamily:'monospace' }}>Delete</span></span>}
                    </div>
                  </div>
                )}

                {isOpen && (
                  <div style={{ padding:'16px 16px 18px 16px', background:lt.fill.tertiary, borderTop:`1px solid ${lt.stroke.secondary}` }}>
                    <div style={{ display:'flex', gap:20, marginBottom:14, flexWrap:'wrap' }}>
                      {[{l:'Provider',v:c.provider},{l:'Tenant',v:c.tenant},{l:'Job ID',v:c.jobId},{l:'Full Name',v:c.fullName},{l:'Reviewer',v:c.reviewer}].map((f,fi) => (
                        <div key={fi}>
                          <div style={{ fontSize:10, fontWeight:700, color:lt.text.tertiary, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2 }}>{f.l}</div>
                          <div style={{ fontSize:13, fontWeight:600, color:lt.text.primary }}>{f.v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ ...colLabel, marginBottom:10 }}>
                      Dimension scores {notedDims.length>0 && <span style={{ fontWeight:400, textTransform:'none', color:lt.accent.primary, letterSpacing:0 }}>— {notedDims.length} with notes</span>}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
                      {DIM_KEYS.map(k => {
                        const dn = c.dimNotes[k]?.trim();
                        const isOpt = OPTIONAL_DIMS.includes(k);
                        return (
                          <div key={k} style={{ background:lt.bg.editor, border:`1px solid ${dn?lt.accent.primary:lt.stroke.secondary}`, borderRadius:6, padding:'8px 10px' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                <span style={{ fontSize:11, fontWeight:600, color:lt.text.secondary }}>{DIMS[k].label}</span>
                                {isOpt && <span style={{ fontSize:9, color:lt.text.tertiary, background:lt.fill.tertiary, borderRadius:3, padding:'0 4px' }}>opt</span>}
                              </div>
                              <span style={{ fontSize:16, fontWeight:700, color:c.scores[k]>0?scoreColor(c.scores[k]):lt.text.tertiary }}>{c.scores[k]||'—'}</span>
                            </div>
                            {c.scores[k]>0 && <div style={{ fontSize:11, color:lt.text.tertiary, lineHeight:'15px' }}>{DIMS[k].anchors[5-c.scores[k]]}</div>}
                            {dn && <div style={{ fontSize:11, color:lt.text.secondary, lineHeight:'16px', marginTop:6, paddingTop:6, borderTop:`1px solid ${lt.stroke.tertiary}`, fontStyle:'italic' }}>"{dn}"</div>}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ ...colLabel, marginBottom:6 }}>Overall notes</div>
                    <div style={{ fontSize:13, color:c.notes?lt.text.secondary:lt.text.tertiary, lineHeight:'20px', background:lt.bg.editor, border:`1px solid ${lt.stroke.secondary}`, borderRadius:6, padding:'10px 12px' }}>
                      {c.notes||'No overall notes added.'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,   setTab]   = useLocalState<'log'|'results'>('tab', 'log');
  const [calls, setCalls] = useLocalState<CallEntry[]>('calls', SEED);
  return (
    <div style={{ background:lt.bg.editor, minHeight:'100vh', fontFamily:font, color:lt.text.primary }}>
      <div style={{ background:lt.accent.primary, padding:'18px 24px 16px' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <div style={{ fontSize:22, fontWeight:700, color:lt.text.onAccent }}>Voice Provider Comparison</div>
          <div style={{ fontSize:13, color:lt.text.onAccent, opacity:0.85, marginTop:2 }}>HappyRobot vs Phenom — score while listening</div>
        </div>
      </div>
      <div style={{ maxWidth:960, margin:'0 auto', padding:'20px 24px' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {(['log','results'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding:'6px 14px', borderRadius:6, cursor:'pointer', fontSize:13, fontFamily:font, border:`1.5px solid ${tab===t?lt.accent.primary:lt.stroke.primary}`, background:tab===t?lt.accent.primary:lt.bg.editor, color:tab===t?lt.text.onAccent:lt.text.primary, fontWeight:tab===t?600:400 }}>
                {t==='log'?'Log a Call':'Results'}
              </button>
            ))}
            <div style={{ flex:1 }} />
            <span style={{ fontSize:12, color:lt.text.tertiary }}>{calls.length} evaluation{calls.length!==1?'s':''} logged</span>
          </div>
          <div style={{ borderTop:`1px solid ${lt.stroke.secondary}` }} />
          {tab==='log'     && <LogTab     calls={calls} setCalls={setCalls} />}
          {tab==='results' && <ResultsTab calls={calls} setCalls={setCalls} />}
        </div>
      </div>
    </div>
  );
}
