import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Beaker,
  Bell,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Clock3,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileImage,
  FileJson,
  Filter,
  Fingerprint,
  GitBranch,
  Globe2,
  Hash,
  History,
  Home,
  KeyRound,
  LayoutGrid,
  Link2,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Network,
  Pause,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  TerminalSquare,
  TimerReset,
  Upload,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, applyNodeChanges, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { useApp, currentSnapshot } from './stores/app';
import { useWallet } from './stores/wallet';
import { useAnalysis } from './lib/useAnalysis';
import { classify, extractCandidates } from './lib/classify';
import { db, exportCase } from './lib/storage';
import { date, domain, short, strengths, units, type CaseFile, type Entity, type Finding, type Relationship, type Scene, type Snapshot, type Strength, type Transfer } from './lib/model';
import { supportedWalletNames, type SupportedWalletName } from './lib/wallet';

const sceneMeta: Record<Scene, { label: string; eyebrow: string; icon: typeof Home }> = {
  lab: { label: 'Sniff Lab', eyebrow: 'Start here', icon: Beaker },
  map: { label: 'Scent Map', eyebrow: 'Relationship graph', icon: Network },
  wallet: { label: 'Wallet Autopsy', eyebrow: 'Account evidence', icon: WalletCards },
  token: { label: 'Token Crime Scene', eyebrow: 'Asset evidence', icon: Fingerprint },
  trail: { label: 'Money Trail', eyebrow: 'Transfer tracing', icon: GitBranch },
  social: { label: 'Social Footprint', eyebrow: 'Public metadata', icon: Globe2 },
  ocr: { label: 'Screenshot Forensics', eyebrow: 'Local extraction', icon: FileImage },
  evidence: { label: 'Evidence Board', eyebrow: 'Saved locally', icon: LayoutGrid },
};

const sceneOrder: Scene[] = ['lab', 'map', 'wallet', 'token', 'trail', 'social', 'ocr', 'evidence'];
const kindLabels: Record<Entity['kind'], string> = {
  unknown: 'Unknown entity', wallet: 'Wallet', token: 'Token', tokenAccount: 'Token account', program: 'Program', authority: 'Authority', pool: 'Liquidity pool', transaction: 'Transaction', website: 'Website', social: 'X account',
};
const relationLabels: Record<Relationship['type'], string> = {
  funding: 'Direct funding transfer', transfer: 'Token transfer', holding: 'Token holding', authority: 'Authority permission', pool: 'Liquidity pool', website: 'Published website', social: 'Published social link', interaction: 'Transaction interaction', initialization: 'Mint initialization',
};

function useCaseData() {
  const caseFile = useApp((s) => s.caseFile);
  const selected = useApp((s) => s.selected);
  const analysis = useApp((s) => s.analysis);
  const fallback = currentSnapshot({ caseFile, selected });
  const snapshots = caseFile.snapshots;
  const entities = useMemo(() => {
    const source = analysis.entities.length ? analysis.entities : snapshots.flatMap((s) => [s.root, ...s.entities]);
    return [...new Map(source.map((entity) => [entity.id, entity])).values()];
  }, [analysis.entities, snapshots]);
  const relationships = useMemo(() => {
    const source = analysis.relationships.length ? analysis.relationships : snapshots.flatMap((s) => s.relationships);
    return [...new Map(source.map((relationship) => [relationship.id, relationship])).values()];
  }, [analysis.relationships, snapshots]);
  const findings = useMemo(() => {
    const source = analysis.findings.length ? analysis.findings : snapshots.flatMap((s) => s.findings);
    return [...new Map(source.map((finding) => [finding.id, finding])).values()];
  }, [analysis.findings, snapshots]);
  const transfers = useMemo(() => {
    const source = analysis.transfers.length ? analysis.transfers : snapshots.flatMap((s) => s.transfers);
    return [...new Map(source.map((transfer) => [transfer.id, transfer])).values()];
  }, [analysis.transfers, snapshots]);
  const selectedEntity = entities.find((entity) => entity.id === selected) ?? fallback?.root;
  return { caseFile, selected, analysis, fallback, entities, relationships, findings, transfers, selectedEntity };
}

function App() {
  useAnalysis();
  const navigate = useApp((s) => s.navigate);
  const run = useApp((s) => s.run);
  const fresh = useApp((s) => s.fresh);
  const open = useApp((s) => s.open);
  const cancel = useApp((s) => s.cancel);
  const select = useApp((s) => s.select);
  const follow = useApp((s) => s.follow);
  const pin = useApp((s) => s.pin);
  const rename = useApp((s) => s.rename);
  const setFilter = useApp((s) => s.setFilter);
  const scene = useApp((s) => s.scene);
  const busy = useApp((s) => s.busy);
  const status = useApp((s) => s.status);
  const error = useApp((s) => s.error);
  const notice = useApp((s) => s.notice);
  const progress = useApp((s) => s.progress);
  const provider = useApp((s) => s.provider);
  const caseData = useCaseData();
  const [draft, setDraft] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [history, setHistory] = useState<CaseFile[]>([]);
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const walletStatus = useWallet((state) => state.status);
  const walletName = useWallet((state) => state.walletName);
  const walletAddress = useWallet((state) => state.address);
  const walletError = useWallet((state) => state.error);
  const connectWallet = useWallet((state) => state.connect);
  const disconnectWallet = useWallet((state) => state.disconnect);
  const clearWalletError = useWallet((state) => state.clearError);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const loadHistory = async () => {
    try {
      const rows = await db.cases.orderBy('updatedAt').reverse().limit(12).toArray();
      setHistory(rows);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => { void loadHistory(); }, [caseData.caseFile.snapshots.length, caseData.caseFile.updatedAt]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); }
      if (event.key === 'Escape') { setCommandOpen(false); setHistoryOpen(false); setMenuOpen(false); setWalletOpen(false); clearWalletError(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const handleRun = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!draft.trim()) return;
    await run(draft.trim());
  };
  const handleCopy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setToast('Copied to clipboard'); } catch { setToast('Clipboard permission was not available'); }
  };
  const handlePaste = async () => {
    try { setDraft(await navigator.clipboard.readText()); setToast('Pasted from clipboard'); } catch { setToast('Clipboard permission was not available'); }
  };
  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { open(JSON.parse(await file.text()), true); setHistoryOpen(false); setToast('Evidence file imported locally'); }
    catch { setToast('That file is not a valid SNIFF evidence file'); }
  };
  const handleScreenshot = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) { navigate('ocr'); window.setTimeout(() => window.dispatchEvent(new CustomEvent('sniff:screenshot', { detail: file })), 0); }
  };
  const investigateConnectedWallet = () => {
    if (!walletAddress) return;
    setWalletOpen(false);
    setDraft(walletAddress);
    void run(walletAddress);
  };
  const openScene = (next: Scene) => { navigate(next); setMobileNav(false); };
  const currentTitle = sceneMeta[scene].label;
  const activeTarget = caseData.fallback?.root;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup" onClick={() => openScene('lab')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openScene('lab')}>
          <div className="brand-mark"><span className="brand-nose" /><span className="brand-ear left" /><span className="brand-ear right" /></div>
          <div><div className="brand-name">SNIFF<span className="brand-dot">.</span></div><div className="brand-tag">evidence / on-chain</div></div>
        </div>
        <div className="sidebar-rule" />
        <div className="nav-label">Investigation desk</div>
        <nav className="scene-nav" aria-label="Investigation scenes">
          {sceneOrder.map((item) => { const meta = sceneMeta[item]; const Icon = meta.icon; return <button key={item} className={`scene-link ${scene === item ? 'active' : ''}`} onClick={() => openScene(item)}><Icon size={16} strokeWidth={1.8} /><span>{meta.label}</span>{item === 'map' && caseData.entities.length > 0 && <span className="nav-count">{caseData.entities.length}</span>}</button>; })}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">Case file</div>
          <button className="side-action" onClick={() => setHistoryOpen(true)}><History size={16} /><span>Recent investigations</span></button>
          <button className="side-action" onClick={() => exportCase(caseData.caseFile)} disabled={!caseData.caseFile.snapshots.length}><Download size={16} /><span>Export evidence</span></button>
          <div className="storage-chip"><span className="status-dot online" /> <span>{useApp.getState().saveStatus}</span></div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav((value) => !value)}><Menu size={20} /></button>
          <div className="breadcrumb"><span className="breadcrumb-root">SNIFF /</span><span>{currentTitle}</span>{activeTarget && <><ChevronRight size={14} /><span className="crumb-target">{short(activeTarget.label || activeTarget.value, 14)}</span></>}</div>
          <div className="topbar-actions">
            <div className="provider-indicator"><span className="status-dot online" /><span>Solana mainnet</span><span className="provider-latency">public read-only</span></div>
            <button className={`connect-wallet-button ${walletStatus === 'connected' ? 'connected' : ''}`} onClick={() => setWalletOpen(true)} aria-label={walletStatus === 'connected' ? `${walletName} Connected ${walletShort(walletAddress)}` : 'Connect wallet'}>
              <WalletCards size={15} />
              {walletStatus === 'connected' ? <><span><strong>{walletName}</strong><small>Active</small></span><code>{walletShort(walletAddress)}</code></> : 'Connect Wallet'}
            </button>
            <button className="icon-button" aria-label="Open command palette" title="Command palette (⌘K)" onClick={() => setCommandOpen(true)}><TerminalSquare size={17} /></button>
            <button className="icon-button" aria-label="Start a new case" title="New case" onClick={fresh}><Plus size={18} /></button>
            <button className="avatar-button" aria-label="Case menu" onClick={() => setMenuOpen((value) => !value)}>S</button>
          </div>
          {menuOpen && <div className="case-menu"><button onClick={() => { rename('Untitled investigation'); setMenuOpen(false); }}>Rename case</button><button onClick={() => { setHistoryOpen(true); setMenuOpen(false); }}>Open history</button><button onClick={() => { exportCase(caseData.caseFile); setMenuOpen(false); }}>Export JSON</button></div>}
        </header>

        <div className="main-content">
          {error && <div className="alert-banner error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => useApp.setState({ error: '' })} aria-label="Dismiss error"><X size={16} /></button></div>}
          {notice && !error && <div className="alert-banner notice" role="status"><BadgeCheck size={17} /><span>{notice}</span><button onClick={() => useApp.setState({ notice: '' })} aria-label="Dismiss notice"><X size={16} /></button></div>}
          {busy && <ProgressStrip progress={progress} onCancel={cancel} />}
          {scene === 'lab' && <Lab draft={draft} setDraft={setDraft} onSubmit={handleRun} onPaste={handlePaste} onUpload={() => fileInput.current?.click()} onRecent={() => setHistoryOpen(true)} status={status} caseData={caseData} />}
          {scene === 'map' && <MapSceneFlow data={caseData} onSelect={select} onFollow={follow} onPin={pin} onCopy={handleCopy} onNavigate={openScene} />}
          {scene === 'wallet' && <WalletScene data={caseData} onSelect={select} onFollow={follow} onCopy={handleCopy} onNavigate={openScene} />}
          {scene === 'token' && <TokenScene data={caseData} onSelect={select} onFollow={follow} onCopy={handleCopy} />}
          {scene === 'trail' && <TrailScene data={caseData} onSelect={select} onFollow={follow} onNavigate={openScene} />}
          {scene === 'social' && <div className="scene-stack"><SocialScene data={caseData} onFollow={follow} onNavigate={openScene} /><SharedEvidencePanel data={caseData} onSelect={select} /></div>}
          {scene === 'ocr' && <OcrScene onRun={(value) => { setDraft(value); void run(value); }} />}
          {scene === 'evidence' && <EvidenceScene data={caseData} onSelect={select} onCopy={handleCopy} onImport={() => importInput.current?.click()} />}
        </div>
        <footer className="app-footer"><span><LockKeyhole size={12} /> Local-first workspace</span><span>Sources are timestamped · findings are bounded by provider coverage</span><span className="footer-build">SNIFF / 01</span></footer>
      </main>

      <input ref={fileInput} type="file" accept="image/*" hidden aria-label="Upload screenshot" onChange={handleScreenshot} />
      <input ref={importInput} type="file" accept="application/json,.json" hidden aria-label="Import evidence JSON" onChange={handleImport} />
      {historyOpen && <HistoryModal history={history} onClose={() => setHistoryOpen(false)} onOpen={(file) => { open(file); setHistoryOpen(false); }} onImport={() => importInput.current?.click()} />}
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} onNavigate={(next) => { openScene(next); setCommandOpen(false); }} onRun={(value) => { setDraft(value); void run(value); setCommandOpen(false); }} onExport={() => { exportCase(caseData.caseFile); setCommandOpen(false); }} onReset={() => { fresh(); setCommandOpen(false); }} onHistory={() => { setHistoryOpen(true); setCommandOpen(false); }} />}
      {walletOpen && <WalletModal status={walletStatus} walletName={walletName} address={walletAddress} error={walletError} onClose={() => { setWalletOpen(false); clearWalletError(); }} onConnect={(name) => void connectWallet(name)} onDisconnect={() => void disconnectWallet()} onInvestigate={investigateConnectedWallet} onCopy={handleCopy} />}
      {toast && <div className="toast" role="status"><BadgeCheck size={15} />{toast}</div>}
    </div>
  );
}

function ProgressStrip({ progress, onCancel }: { progress: { name: string; state: 'loading' | 'complete' | 'error'; detail?: string }[]; onCancel: () => void }) {
  return <div className="progress-strip"><div className="progress-head"><div className="progress-intro"><DogMascot state="sniffing" compact /><div><span className="eyebrow">LIVE INVESTIGATION</span><span className="progress-copy">Reading public sources and preserving provenance</span></div></div><button className="quiet-button" onClick={onCancel}><Pause size={13} /> Pause</button></div><div className="progress-steps">{progress.slice(-5).map((step) => <div className={`progress-step ${step.state}`} key={step.name}>{step.state === 'loading' ? <LoaderCircle size={14} className="spin" /> : step.state === 'complete' ? <BadgeCheck size={14} /> : <XCircle size={14} />}<span>{step.name}</span>{step.detail && <small>{step.detail}</small>}</div>)}</div></div>;
}

function Lab({ draft, setDraft, onSubmit, onPaste, onUpload, onRecent, status, caseData }: { draft: string; setDraft: (value: string) => void; onSubmit: (event: FormEvent) => void; onPaste: () => void; onUpload: () => void; onRecent: () => void; status: string; caseData: ReturnType<typeof useCaseData> }) {
  const [classification, setClassification] = useState<{ label: string; detail: string; tone: string } | null>(null);
  useEffect(() => {
    if (!draft.trim()) { setClassification(null); return; }
    try { const target = classify(draft); setClassification({ label: target.kind === 'address' ? 'Solana identifier' : target.kind === 'transaction' ? 'Transaction signature' : target.kind === 'social' ? 'X profile' : target.kind === 'website' ? 'Website' : 'Project search', detail: target.kind === 'address' ? 'Account type resolves from RPC' : 'Public metadata route', tone: 'valid' }); }
    catch (error) { setClassification({ label: 'Check input', detail: error instanceof Error ? error.message : 'Unsupported value', tone: 'invalid' }); }
  }, [draft]);
  const targetCount = caseData.caseFile.snapshots.length;
  return <section className="lab-scene">
    <div className="lab-grid-overlay" />
    <div className="lab-copy"><div className="eyebrow lime"><span className="eyebrow-pulse" /> DIGITAL FORENSICS / SOLANA MAINNET</div><h1>PASTE ANYTHING.<br /><em>SNIFF EVERYTHING.</em></h1><p className="hero-lede">A read-only investigation desk for following public traces across wallets, tokens, transactions, and project metadata.</p><div className="lab-trust-row"><span><LockKeyhole size={14} /> Wallet never required</span><span><Database size={14} /> Sources stay visible</span><span><Sparkles size={14} /> Local case file</span></div></div>
    <div className="lab-panel panel-glow"><div className="panel-kicker"><span>01 / START A SNIFF</span><span className="command-hint">⌘ ↵</span></div><form onSubmit={onSubmit}><div className="universal-input-wrap"><textarea aria-label="Investigation input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste a Solana address, transaction signature, website, X profile, or token name…" rows={3} /><div className="input-footer"><div className={`classification ${classification?.tone ?? ''}`}>{classification ? <><span className="classification-dot" />{classification.label}<small>{classification.detail}</small></> : <><Target size={14} /> Auto-classification on</>}</div><span className="char-count">{draft.length} / 2048</span></div></div><div className="lab-actions"><button className="primary-button" type="submit" disabled={!draft.trim() || status === 'sniffing'}>{status === 'sniffing' ? <LoaderCircle size={17} className="spin" /> : <Radar size={17} />} {status === 'sniffing' ? 'Sniffing…' : 'Start Sniffing'}<ChevronRight size={16} /></button><button className="secondary-button" type="button" onClick={onPaste}><Clipboard size={15} /> Paste from Clipboard</button><button className="secondary-button" type="button" onClick={onUpload}><Upload size={15} /> Upload Screenshot</button><button className="secondary-button" type="button" onClick={() => setDraft('')}><XCircle size={15} /> Clear Input</button></div></form><div className="input-footnote"><CircleHelp size={13} /> Supports Solana mainnet only. A name search returns candidates; confirm the mint before drawing conclusions.</div></div>
    <div className="lab-lower"><button className="recent-entry" onClick={onRecent}><div className="recent-icon"><History size={17} /></div><div><strong>View Recent Investigations</strong><span>{targetCount ? `${targetCount} saved source page${targetCount === 1 ? '' : 's'} in this case` : 'Your local case file is empty'}</span></div><ChevronRight size={17} /></button><div className="signal-card"><div className="signal-orbit orbit-one" /><div className="signal-orbit orbit-two" /><div className="signal-orbit orbit-three" /><div className="dog-mini"><DogMascot state={status === 'sniffing' ? 'sniffing' : status === 'found' ? 'complete' : status === 'error' ? 'alert' : 'idle'} compact /></div><div><span className="eyebrow">THE SNIFF SIGNAL</span><strong>Every connection needs a source.</strong><span>On-chain observations and public links stay distinct.</span></div></div></div>
  </section>;
}

type FlowNodeData = { entity: Entity; active: boolean };
const flowNodeTypes = { sniff: SniffFlowNode };

function SniffFlowNode({ data }: { data: FlowNodeData }) {
  const { entity, active } = data;
  const glyph = entity.kind === 'wallet' ? 'W' : entity.kind === 'token' ? 'T' : entity.kind === 'pool' ? 'LP' : entity.kind === 'transaction' ? 'TX' : entity.kind === 'website' || entity.kind === 'social' ? '↗' : '?';
  return <div className={`flow-node node-${entity.kind} ${active ? 'selected' : ''}`}><Handle type="target" position={Position.Left} /><div className="flow-node-circle">{glyph}</div><strong>{short(entity.label, 16)}</strong><small>{kindLabels[entity.kind]}</small><Handle type="source" position={Position.Right} /></div>;
}

function MapSceneFlow({ data, onSelect, onFollow, onPin, onCopy, onNavigate }: { data: ReturnType<typeof useCaseData>; onSelect: (id: string) => void; onFollow: (entity: Entity) => void; onPin: (id: string) => void; onCopy: (value: string) => void; onNavigate: (scene: Scene) => void }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => data.entities.filter((entity) => (filter === 'all' || entity.kind === filter) && (!query || `${entity.label} ${entity.value}`.toLowerCase().includes(query.toLowerCase()))).slice(0, 60), [data.entities, filter, query]);
  const relations = useMemo(() => data.relationships.filter((relation) => filtered.some((e) => e.id === relation.from) && filtered.some((e) => e.id === relation.to)), [data.relationships, filtered]);
  const positions = useGraphPositions(filtered, relations, data.fallback?.root.id, data.caseFile.positions);
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>(() => filtered.map((entity) => ({ id: entity.id, type: 'sniff', position: positions[entity.id] ?? { x: 120, y: 120 }, data: { entity, active: entity.id === data.selectedEntity?.id } })));
  useEffect(() => { setNodes(filtered.map((entity) => ({ id: entity.id, type: 'sniff', position: positions[entity.id] ?? { x: 120, y: 120 }, data: { entity, active: entity.id === data.selectedEntity?.id } }))); }, [filtered, positions, data.selectedEntity?.id]);
  const onNodesChange = (changes: NodeChange<Node<FlowNodeData>>[]) => setNodes((current) => applyNodeChanges(changes, current));
  const edges: Edge[] = relations.map((relation) => ({ id: relation.id, source: relation.from, target: relation.to, label: relationLabels[relation.type], animated: true, style: { stroke: relation.type === 'funding' || relation.type === 'transfer' ? '#b7f34b' : '#8876a9', strokeWidth: 1.2 }, labelStyle: { fill: '#71806d', fontSize: 9, fontFamily: 'DM Mono' }, labelBgStyle: { fill: '#0d120e', fillOpacity: .9 }, type: 'smoothstep' }));
  const selected = data.selectedEntity;
  return <section className="scene map-scene"><SceneHeading eyebrow="02 / RELATIONSHIP GRAPH" title="Scent map" description="A bounded view of documented entities and connections. Drag, zoom, and expand a node to query another supported source." actions={<div className="heading-actions"><button className="secondary-button compact" onClick={() => setFilter('all')}><RefreshCw size={14} /> Reset view</button><button className="secondary-button compact" onClick={() => data.caseFile.snapshots.length && exportCase(data.caseFile)}><Download size={14} /> Export case</button></div>} /><div className="map-toolbar"><div className="toolbar-search"><Search size={15} /><input aria-label="Search graph" placeholder="Search entities" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="filter-pills"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{data.entities.length}</span></button>{['wallet', 'token', 'pool', 'website'].map((kind) => <button key={kind} className={filter === kind ? 'active' : ''} onClick={() => setFilter(kind)}>{kindLabels[kind as Entity['kind']]} <span>{data.entities.filter((e) => e.kind === kind).length}</span></button>)}</div><span className="map-limit">{filtered.length} / 60 visible</span></div><div className="map-layout"><div className="graph-card"><div className="graph-meta"><span><span className="status-dot online" /> LIVE EVIDENCE MAP</span><span>{relations.length} documented edges</span><span className="graph-zoom">Drag nodes · scroll to zoom</span></div><div className="graph-canvas flow-canvas">{filtered.length ? <ReactFlow nodes={nodes} edges={edges} nodeTypes={flowNodeTypes} onNodesChange={onNodesChange} onNodeClick={(_, node) => onSelect(node.id)} onNodeDragStop={(_, node) => { useApp.getState().setPositions({ ...useApp.getState().caseFile.positions, [node.id]: node.position }); }} fitView fitViewOptions={{ padding: .22 }} minZoom={.35} maxZoom={1.8} attributionPosition="bottom-left"><Background color="#243025" gap={34} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={(node) => { const entity = (node.data as FlowNodeData | undefined)?.entity; return entity?.kind === 'token' ? '#efac5a' : entity?.kind === 'pool' ? '#7ecaf0' : '#b7f34b'; }} /></ReactFlow> : <EmptyState icon={<Network size={28} />} title="No scent map yet" description="Run an address, token mint, or transaction from the Sniff Lab. Only returned evidence will appear here." action="Open Sniff Lab" onAction={() => onNavigate('lab')} />}</div><div className="graph-legend"><span><i className="legend-dot wallet" />Wallet</span><span><i className="legend-dot token" />Token</span><span><i className="legend-dot pool" />Pool</span><span><i className="legend-dot metadata" />Public metadata</span><span className="legend-note"><Link2 size={12} /> line labels are relationship types</span></div></div><EntityInspector entity={selected} data={data} onFollow={onFollow} onPin={onPin} onCopy={onCopy} /></div></section>;
}

function MapScene({ data, onSelect, onFollow, onPin, onCopy, onNavigate }: { data: ReturnType<typeof useCaseData>; onSelect: (id: string) => void; onFollow: (entity: Entity) => void; onPin: (id: string) => void; onCopy: (value: string) => void; onNavigate: (scene: Scene) => void }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const filtered = data.entities.filter((entity) => (filter === 'all' || entity.kind === filter) && (!query || `${entity.label} ${entity.value}`.toLowerCase().includes(query.toLowerCase()))).slice(0, 60);
  const relations = data.relationships.filter((relation) => filtered.some((e) => e.id === relation.from) && filtered.some((e) => e.id === relation.to));
  const positions = useGraphPositions(filtered, relations, data.fallback?.root.id);
  const selected = data.selectedEntity;
  return <section className="scene map-scene"><SceneHeading eyebrow="02 / RELATIONSHIP GRAPH" title="Scent map" description="A bounded view of documented entities and connections. Expand a node to query another supported source." actions={<div className="heading-actions"><button className="secondary-button compact" onClick={() => setFilter('all')}><RefreshCw size={14} /> Reset view</button><button className="secondary-button compact" onClick={() => data.caseFile.snapshots.length && exportCase(data.caseFile)}><Download size={14} /> Export case</button></div>} /><div className="map-toolbar"><div className="toolbar-search"><Search size={15} /><input aria-label="Search graph" placeholder="Search entities" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="filter-pills"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{data.entities.length}</span></button>{['wallet', 'token', 'pool', 'website'].map((kind) => <button key={kind} className={filter === kind ? 'active' : ''} onClick={() => setFilter(kind)}>{kindLabels[kind as Entity['kind']]} <span>{data.entities.filter((e) => e.kind === kind).length}</span></button>)}</div><span className="map-limit">{filtered.length} / 60 visible</span></div><div className="map-layout"><div className="graph-card"><div className="graph-meta"><span><span className="status-dot online" /> LIVE EVIDENCE MAP</span><span>{relations.length} documented edges</span><span className="graph-zoom"><button aria-label="Zoom out">−</button><span>100%</span><button aria-label="Zoom in">+</button></span></div><div className="graph-canvas">{filtered.length ? <svg viewBox="0 0 980 590" role="img" aria-label="Investigation relationship graph"><defs><filter id="node-glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter><linearGradient id="edge-line" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b7f34b" stopOpacity=".65" /><stop offset="1" stopColor="#f1a84b" stopOpacity=".38" /></linearGradient></defs><g className="graph-grid">{Array.from({ length: 12 }, (_, index) => <line key={`v-${index}`} x1={index * 90} y1="0" x2={index * 90} y2="590" />)}{Array.from({ length: 8 }, (_, index) => <line key={`h-${index}`} x1="0" y1={index * 90} x2="980" y2={index * 90} />)}</g>{relations.map((relation) => { const from = positions[relation.from]; const to = positions[relation.to]; if (!from || !to) return null; return <g key={relation.id} className="graph-edge"><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} /><circle r="3" cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2}><animate attributeName="opacity" values="0.2;1;0.2" dur="2.4s" repeatCount="indefinite" /></circle><text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8}>{relation.type}</text></g>; })}{filtered.map((entity) => { const p = positions[entity.id]; if (!p) return null; const active = entity.id === selected?.id; return <g key={entity.id} className={`graph-node node-${entity.kind} ${active ? 'selected' : ''}`} transform={`translate(${p.x} ${p.y})`} onClick={() => onSelect(entity.id)} role="button" tabIndex={0} aria-label={`Select ${entity.label}`} onKeyDown={(e) => e.key === 'Enter' && onSelect(entity.id)}><circle className="node-halo" r={active ? 38 : 32} /><circle className="node-circle" r="23" filter={active ? 'url(#node-glow)' : undefined} /><text className="node-glyph" textAnchor="middle" dy="6">{entity.kind === 'wallet' ? 'W' : entity.kind === 'token' ? 'T' : entity.kind === 'pool' ? 'LP' : entity.kind === 'transaction' ? 'TX' : entity.kind === 'website' || entity.kind === 'social' ? '↗' : '?'}</text><text className="node-label" textAnchor="middle" y="50">{short(entity.label, 13)}</text><text className="node-type" textAnchor="middle" y="65">{kindLabels[entity.kind].toUpperCase()}</text></g>; })}</svg> : <EmptyState icon={<Network size={28} />} title="No scent map yet" description="Run an address, token mint, or transaction from the Sniff Lab. Only returned evidence will appear here." action="Open Sniff Lab" onAction={() => onNavigate('lab')} />}</div><div className="graph-legend"><span><i className="legend-dot wallet" />Wallet</span><span><i className="legend-dot token" />Token</span><span><i className="legend-dot pool" />Pool</span><span><i className="legend-dot metadata" />Public metadata</span><span className="legend-note"><Link2 size={12} /> line labels are relationship types</span></div></div><EntityInspector entity={selected} data={data} onFollow={onFollow} onPin={onPin} onCopy={onCopy} /></div></section>;
}

function useGraphPositions(entities: Entity[], relations: Relationship[], rootId?: string, saved: CaseFile['positions'] = {}) {
  return useMemo(() => {
    const levels = new Map<string, number>();
    if (rootId) levels.set(rootId, 0);
    const queue = rootId ? [rootId] : entities.slice(0, 1).map((e) => e.id);
    if (queue[0] && !levels.has(queue[0])) levels.set(queue[0], 0);
    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      for (const relation of relations) {
        const next = relation.from === id ? relation.to : relation.to === id ? relation.from : undefined;
        if (next && !levels.has(next)) { levels.set(next, Math.min(3, (levels.get(id) ?? 0) + 1)); queue.push(next); }
      }
    }
    const rows = new Map<number, Entity[]>();
    for (const entity of entities) { const level = levels.get(entity.id) ?? 2; rows.set(level, [...(rows.get(level) ?? []), entity]); }
    const result: Record<string, { x: number; y: number }> = {};
    for (const [level, row] of rows) { const x = 125 + Math.min(level, 3) * 275; row.forEach((entity, index) => { const y = 130 + index * 105 - Math.max(0, row.length - 1) * 52; result[entity.id] = saved[entity.id] ?? { x, y: Math.max(60, Math.min(535, y)) }; }); }
    return result;
  }, [entities, relations, rootId, saved]);
}

function EntityInspector({ entity, data, onFollow, onPin, onCopy }: { entity?: Entity; data: ReturnType<typeof useCaseData>; onFollow: (entity: Entity) => void; onPin: (id: string) => void; onCopy: (value: string) => void }) {
  if (!entity) return <div className="inspector-card empty-inspector"><DogMascot state="idle" /><span className="eyebrow">SELECT AN ENTITY</span><h3>Follow a documented trail.</h3><p>Choose a node to inspect its evidence, source, and available next step.</p></div>;
  const connections = data.relationships.filter((relation) => relation.from === entity.id || relation.to === entity.id);
  const findings = data.findings.filter((finding) => finding.entityIds.includes(entity.id)).slice(-6).reverse();
  const isPinned = data.caseFile.pins.includes(entity.id);
  return <aside className="inspector-card"><div className="inspector-top"><span className={`entity-badge badge-${entity.kind}`}>{kindLabels[entity.kind]}</span><button className={`pin-button ${isPinned ? 'pinned' : ''}`} title={isPinned ? 'Unpin entity' : 'Pin entity'} onClick={() => onPin(entity.id)}>★</button></div><h2>{entity.label}</h2><div className="mono-value">{entity.value}<button onClick={() => onCopy(entity.value)} aria-label="Copy entity identifier"><Copy size={14} /></button></div><div className="inspector-stats"><span><strong>{connections.length}</strong> connections</span><span><strong>{findings.length}</strong> findings</span><span><strong>{entity.verified ? 'Verified' : 'Candidate'}</strong> status</span></div>{entity.target.kind === 'address' || entity.target.kind === 'transaction' ? <button className="primary-button full" onClick={() => onFollow(entity)}><Radar size={16} /> FOLLOW THE SCENT <ChevronRight size={15} /></button> : <button className="secondary-button full" onClick={() => onFollow(entity)}><Search size={15} /> Investigate reference</button>}<div className="inspector-section"><div className="section-title"><span>Evidence attached</span><span className="section-count">{findings.length}</span></div>{findings.length ? findings.map((finding) => <FindingRow finding={finding} key={finding.id} />) : <div className="muted-box">No evidence is attached to this entity in the loaded pages.</div>}</div>{entity.target.kind === 'address' && <a className="explorer-link" href={`https://solscan.io/account/${entity.value}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open on Solscan</a>}</aside>;
}

function FindingRow({ finding, compact = false }: { finding: Finding; compact?: boolean }) {
  return <div className={`finding-row ${compact ? 'compact' : ''}`}><div className="finding-mark"><span className={`strength-dot ${finding.source.strength}`} /></div><div><strong>{finding.title}</strong>{!compact && <p>{finding.description}</p>}<small>{finding.source.provider} · {date(finding.source.at)}</small></div></div>;
}

function SceneHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="scene-heading"><div><div className="eyebrow lime">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions}</div>;
}

function WalletScene({ data, onSelect, onFollow, onCopy, onNavigate }: { data: ReturnType<typeof useCaseData>; onSelect: (id: string) => void; onFollow: (entity: Entity) => void; onCopy: (value: string) => void; onNavigate: (scene: Scene) => void }) {
  const snapshot = data.fallback;
  const wallet = snapshot?.root.kind === 'wallet' || snapshot?.root.kind === 'unknown' ? snapshot.root : undefined;
  const transfers = data.transfers.filter((transfer) => wallet && (transfer.from === wallet.id || transfer.to === wallet.id)).slice(-20).reverse();
  const fundingSources = [...new Set(transfers.filter((transfer) => transfer.to === wallet?.id).map((transfer) => transfer.from))].map((id) => data.entities.find((entity) => entity.id === id)).filter(Boolean) as Entity[];
  const counterparties = [...new Set(transfers.flatMap((transfer) => [transfer.from, transfer.to]).filter((id) => id !== wallet?.id))].map((id) => data.entities.find((entity) => entity.id === id)).filter(Boolean) as Entity[];
  const previousTokens = [...new Map(data.relationships.filter((relation) => relation.type === 'initialization' && relation.from === wallet?.id).map((relation) => [relation.to, data.entities.find((entity) => entity.id === relation.to)])).values()].filter(Boolean) as Entity[];
  return <section className="scene"><SceneHeading eyebrow="03 / ACCOUNT EVIDENCE" title="Wallet autopsy" description="Inspect the current account state, funding sources, and parsed recent activity. An observed transfer is not a claim about ultimate source or ownership." actions={<button className="secondary-button compact" onClick={() => onNavigate('trail')}><GitBranch size={14} /> Open money trail</button>} />{wallet ? <><div className="identity-banner"><div className="entity-avatar wallet-avatar">W</div><div className="identity-main"><span className="eyebrow">INVESTIGATED ACCOUNT</span><h2>{wallet.label}</h2><div className="mono-value large">{wallet.value}<button onClick={() => onCopy(wallet.value)} aria-label="Copy wallet address"><Copy size={14} /></button></div></div><div className="identity-actions"><span className="verified-chip"><BadgeCheck size={14} /> RPC identified</span><a className="icon-button" href={`https://solscan.io/account/${wallet.value}`} target="_blank" rel="noreferrer" aria-label="Open wallet in explorer"><ExternalLink size={16} /></a></div></div><div className="metric-grid"><Metric label="SOL balance" value={snapshot!.balance ?? 'Unavailable'} icon={<WalletCards size={16} />} accent="lime" /><Metric label="Parsed transfers" value={`${transfers.length}`} icon={<ArrowLeftRight size={16} />} accent="amber" /><Metric label="Token holdings" value={`${snapshot!.holdings?.length ?? 0}`} icon={<Database size={16} />} accent="blue" /><Metric label="Coverage" value={snapshot!.coverage.startsWith('0') ? 'Recent page' : 'Bounded'} icon={<Activity size={16} />} accent="violet" /></div><div className="two-column"><div className="panel-card"><PanelTitle icon={<Activity size={16} />} title="Recent movement" action={<span className="panel-count">{transfers.length} parsed</span>} />{transfers.length ? <div className="transfer-list">{transfers.map((transfer) => <TransferRow key={transfer.id} transfer={transfer} entities={data.entities} onSelect={onSelect} />)}</div> : <EmptyState compact icon={<ArrowLeftRight size={22} />} title="No parsed transfers" description="The connected RPC returned no successful, parseable transfer on the loaded page." />}</div><div className="panel-card"><PanelTitle icon={<Send size={16} />} title="Funding sources" action={<span className="panel-count">{fundingSources.length}</span>} />{fundingSources.length ? <div className="counterparty-list">{fundingSources.map((entity) => <button key={entity.id} className="counterparty" onClick={() => { onSelect(entity.id); onFollow(entity); }}><div className={`mini-entity entity-${entity.kind}`}>W</div><div><strong>{short(entity.label, 18)}</strong><span>{kindLabels[entity.kind]} · incoming SOL</span></div><ChevronRight size={15} /></button>)}</div> : <EmptyState compact icon={<Send size={22} />} title="No observed funding source" description="No incoming native transfer was parsed for this loaded history page." />}</div></div><div className="two-column"><div className="panel-card"><PanelTitle icon={<Fingerprint size={16} />} title="Known counterparties" action={<span className="panel-count">{counterparties.length}</span>} />{counterparties.length ? <div className="counterparty-list">{counterparties.map((entity) => <button key={entity.id} className="counterparty" onClick={() => { onSelect(entity.id); onFollow(entity); }}><div className={`mini-entity entity-${entity.kind}`}>{entity.kind === 'wallet' ? 'W' : entity.kind === 'token' ? 'T' : '↗'}</div><div><strong>{short(entity.label, 18)}</strong><span>{kindLabels[entity.kind]} · {entity.verified ? 'on-chain' : 'unresolved'}</span></div><ChevronRight size={15} /></button>)}</div> : <EmptyState compact icon={<Network size={22} />} title="No counterparties yet" description="Follow the wallet after more recent history is available." />}</div><div className="panel-card"><PanelTitle icon={<History size={16} />} title="Deployer history" action={<span className="panel-count">{previousTokens.length} tokens</span>} />{previousTokens.length ? <div className="counterparty-list">{previousTokens.map((entity) => <button key={entity.id} className="counterparty" onClick={() => { onSelect(entity.id); onFollow(entity); }}><div className="mini-entity entity-token">T</div><div><strong>{short(entity.label, 18)}</strong><span>Mint initialized by this wallet</span></div><ChevronRight size={15} /></button>)}</div> : <div className="muted-box">No mint initialization was observed in the loaded history page.</div>}</div></div><div className="coverage-note"><AlertTriangle size={15} /><div><strong>Coverage boundary</strong><span>{snapshot!.coverage} Previous tokens use observed mint-initialization signatures; archival history and beneficial-owner attribution are outside this read-only adapter.</span></div></div></> : <EmptyState icon={<WalletCards size={30} />} title="Choose a wallet investigation" description="Paste a Solana address in the Sniff Lab, then return here for account evidence." action="Open Sniff Lab" onAction={() => onNavigate('lab')} />}</section>;
}

function Metric({ label, value, icon, accent }: { label: string; value: string; icon: ReactNode; accent: string }) { return <div className={`metric-card metric-${accent}`}><div className="metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong></div>; }
function PanelTitle({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) { return <div className="panel-title"><div>{icon}<strong>{title}</strong></div>{action}</div>; }

function TransferRow({ transfer, entities, onSelect }: { transfer: Transfer; entities: Entity[]; onSelect: (id: string) => void }) {
  const from = entities.find((entity) => entity.id === transfer.from); const to = entities.find((entity) => entity.id === transfer.to);
  return <button className="transfer-row" onClick={() => onSelect(transfer.id)}><div className={`transfer-direction ${from?.kind === 'wallet' ? 'outgoing' : 'incoming'}`}>{from?.kind === 'wallet' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}</div><div className="transfer-parties"><strong>{short(from?.label ?? transfer.from, 10)} <span>→</span> {short(to?.label ?? transfer.to, 10)}</strong><span>{transfer.asset} · {date(transfer.timestamp)}</span></div><div className="transfer-amount">{units(transfer.raw, transfer.decimals)}<small>{transfer.asset}</small></div></button>;
}

function TokenScene({ data, onSelect, onFollow, onCopy }: { data: ReturnType<typeof useCaseData>; onSelect: (id: string) => void; onFollow: (entity: Entity) => void; onCopy: (value: string) => void }) {
  const snapshot = data.fallback;
  const token = snapshot?.token;
  const root = snapshot?.root.kind === 'token' ? snapshot.root : data.entities.find((entity) => entity.id === snapshot?.root.id && entity.kind === 'token');
  const holderRows = token?.holders ?? [];
  const authorities = data.relationships.filter((relation) => relation.type === 'authority' && relation.from === root?.id).map((relation) => data.entities.find((entity) => entity.id === relation.to)).filter(Boolean) as Entity[];
  const pools = data.relationships.filter((relation) => relation.type === 'pool' && relation.from === root?.id).map((relation) => data.entities.find((entity) => entity.id === relation.to)).filter(Boolean) as Entity[];
  const deployers = data.relationships.filter((relation) => relation.type === 'initialization' && relation.to === root?.id).map((relation) => data.entities.find((entity) => entity.id === relation.from)).filter((entity): entity is Entity => Boolean(entity));
  const previousTokens = [...new Map(deployers.flatMap((deployer) => data.relationships.filter((relation) => relation.type === 'initialization' && relation.from === deployer.id && relation.to !== root?.id).map((relation) => [relation.to, data.entities.find((entity) => entity.id === relation.to)]))).values()].filter(Boolean) as Entity[];
  const whaleRows = holderRows.filter((holder) => holder.percent >= 5).map((holder) => {
    const account = data.entities.find((entity) => entity.value === holder.address);
    const owner = holder.owner ? data.entities.find((entity) => entity.value === holder.owner) : undefined;
    const entity = owner ?? account;
    const movements = data.transfers.filter((transfer) => transfer.mint === root?.value && entity && (transfer.from === entity.id || transfer.to === entity.id)).length;
    return { holder, entity, movements };
  });
  return <section className="scene"><SceneHeading eyebrow="04 / ASSET EVIDENCE" title="Token crime scene" description="Market metadata, deployer history, holder concentration, and largest token accounts are shown with their source and limits." actions={<button className="secondary-button compact" onClick={() => root && onFollow(root)} disabled={!root}><RefreshCw size={14} /> Refresh sources</button>} />{root && token ? <><div className="identity-banner token-banner"><div className="entity-avatar token-avatar">T</div><div className="identity-main"><span className="eyebrow">TOKEN MINT</span><h2>{token.name || root.label}</h2><div className="mono-value large">{root.value}<button onClick={() => onCopy(root.value)} aria-label="Copy token mint"><Copy size={14} /></button></div><span className="token-symbol">{token.symbol ? `$${token.symbol}` : 'Symbol unavailable'} · {token.decimals ?? '—'} decimals</span></div><div className="identity-actions"><span className="verified-chip"><BadgeCheck size={14} /> Mint resolved</span><a className="icon-button" href={`https://solscan.io/token/${root.value}`} target="_blank" rel="noreferrer" aria-label="Open token in explorer"><ExternalLink size={16} /></a></div></div><div className="metric-grid token-metrics"><Metric label="Market price" value={token.price ? `$${token.price}` : 'Unavailable'} icon={<BarChart3 size={16} />} accent="lime" /><Metric label="Liquidity" value={token.liquidity !== undefined ? money(token.liquidity) : 'Unavailable'} icon={<Activity size={16} />} accent="amber" /><Metric label="24h volume" value={token.volume !== undefined ? money(token.volume) : 'Unavailable'} icon={<ArrowLeftRight size={16} />} accent="blue" /><Metric label="Top 10 accounts" value={token.top10 !== null && token.top10 !== undefined ? `${token.top10.toFixed(2)}%` : 'Unavailable'} icon={<BarChart3 size={16} />} accent="violet" /></div><div className="token-columns"><div className="panel-card"><PanelTitle icon={<BarChart3 size={16} />} title="Largest token accounts" action={<span className="panel-count">{holderRows.length} returned</span>} />{holderRows.length ? <div className="holder-list">{holderRows.map((holder, index) => { const account = data.entities.find((item) => item.value === holder.address); const owner = holder.owner ? data.entities.find((item) => item.value === holder.owner) : undefined; const entity = owner ?? account; return <button className="holder-row" key={holder.address} onClick={() => entity && (onSelect(entity.id), onFollow(entity))}><span className="holder-rank">{String(index + 1).padStart(2, '0')}</span><div className="holder-info"><strong>{short(entity?.label ?? holder.owner ?? holder.address, 16)}</strong><div className="holder-bar"><span style={{ width: `${Math.min(100, holder.percent)}%` }} /></div></div><span className="holder-percent">{holder.percent.toFixed(2)}%</span><ChevronRight size={14} /></button>; })}</div> : <EmptyState compact icon={<BarChart3 size={22} />} title="Holder data unavailable" description="The mint account may be unavailable or the provider returned no largest-account rows." />}<div className="panel-footnote"><AlertTriangle size={13} /> Wallet owners come from token-account metadata; they are not confirmed beneficial owners. Top 50 and unique-owner concentration are unavailable.</div></div><div className="side-stack"><div className="panel-card"><PanelTitle icon={<AlertTriangle size={16} />} title="Whale activity" action={<span className="panel-count">{whaleRows.length} over 5%</span>} />{whaleRows.length ? <div className="counterparty-list">{whaleRows.map(({ holder, entity, movements }) => <button className="counterparty" key={holder.address} onClick={() => entity && (onSelect(entity.id), onFollow(entity))}><div className="mini-entity entity-wallet">W</div><div><strong>{short(entity?.label ?? holder.owner ?? holder.address, 18)}</strong><span>{holder.percent.toFixed(2)}% concentration · {movements} loaded movement{movements === 1 ? '' : 's'}</span></div><ChevronRight size={15} /></button>)}</div> : <div className="muted-box">No returned holder crosses the 5% review threshold.</div>}<div className="panel-footnote"><AlertTriangle size={13} /> Whale flags describe concentration in the returned largest accounts, not intent or beneficial ownership.</div></div><div className="panel-card"><PanelTitle icon={<History size={16} />} title="Deployer history" action={<span className="panel-count">{previousTokens.length} previous tokens</span>} />{deployers.length ? <div className="counterparty-list">{deployers.map((entity) => <button className="counterparty" key={entity.id} onClick={() => { onSelect(entity.id); onFollow(entity); }}><div className="mini-entity entity-wallet">W</div><div><strong>{short(entity.label, 18)}</strong><span>Observed mint initializer · follow wallet</span></div><ChevronRight size={15} /></button>)}{previousTokens.length > 0 && <div className="muted-box">Previous tokens already loaded: {previousTokens.map((entity) => entity.label).join(', ')}</div>}</div> : <div className="muted-box">No mint-initializing signer was found in the loaded token history. Load the token history before treating a wallet as a deployer.</div>}</div><div className="panel-card"><PanelTitle icon={<KeyRound size={16} />} title="Authority permissions" />{authorities.length ? authorities.map((entity) => <button className="authority-row" key={entity.id} onClick={() => onFollow(entity)}><span className="authority-icon"><KeyRound size={14} /></span><div><strong>{short(entity.label, 14)}</strong><span>Current authority · on-chain</span></div><ChevronRight size={14} /></button>) : <div className="muted-box">Mint and freeze authority are revoked or unavailable.</div>}</div><div className="panel-card"><PanelTitle icon={<Database size={16} />} title="Liquidity pools" action={<span className="panel-count">{pools.length}</span>} />{pools.length ? pools.map((entity) => <button className="authority-row" key={entity.id} onClick={() => onFollow(entity)}><span className="authority-icon pool-icon">LP</span><div><strong>{short(entity.label, 18)}</strong><span>DEX Screener metadata</span></div></button>) : <div className="muted-box">No pool relationship returned.</div>}</div></div></div></> : <EmptyState icon={<Fingerprint size={30} />} title="Choose a token mint" description="Paste a Solana token address in the Sniff Lab. Account type is verified through RPC before token evidence is shown." action="Open Sniff Lab" onAction={() => useApp.getState().navigate('lab')} />}</section>;
}

function TrailScene({ data, onSelect, onFollow, onNavigate }: { data: ReturnType<typeof useCaseData>; onSelect: (id: string) => void; onFollow: (entity: Entity) => void; onNavigate: (scene: Scene) => void }) {
  const [direction, setDirection] = useState<'all' | 'incoming' | 'outgoing'>('all'); const [verified, setVerified] = useState(false);
  const transfers = data.transfers.filter((transfer) => direction === 'all' || (direction === 'incoming' ? transfer.to === data.selected : transfer.from === data.selected)).filter((transfer) => !verified || transfer.source.strength === 'onchain');
  return <section className="scene"><SceneHeading eyebrow="05 / TRACE A TRANSFER" title="Money trail" description="Follow only documented transfer edges from the loaded pages. Expansion stays bounded so the browser does not infer an unbounded graph." actions={<div className="trail-status"><span className="status-dot online" /> trace paused</div>} />{data.transfers.length ? <><div className="trail-controls"><div className="segmented"><button className={direction === 'all' ? 'active' : ''} onClick={() => setDirection('all')}><ArrowLeftRight size={14} /> All transfers</button><button className={direction === 'incoming' ? 'active' : ''} onClick={() => setDirection('incoming')}><ArrowDownLeft size={14} /> Follow incoming</button><button className={direction === 'outgoing' ? 'active' : ''} onClick={() => setDirection('outgoing')}><ArrowUpRight size={14} /> Follow outgoing</button></div><label className="check-filter"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /> <BadgeCheck size={14} /> On-chain only</label><button className="secondary-button compact" onClick={() => data.selectedEntity && onFollow(data.selectedEntity)} disabled={!data.selectedEntity}><Play size={14} /> Expand one hop</button><button className="secondary-button compact" onClick={() => onNavigate('map')}><Network size={14} /> See map</button></div><div className="trail-board"><div className="trail-rail" />{transfers.slice(0, 40).map((transfer, index) => { const from = data.entities.find((entity) => entity.id === transfer.from); const to = data.entities.find((entity) => entity.id === transfer.to); return <button className="trail-event" key={transfer.id} onClick={() => onSelect(transfer.id)}><div className="trail-time"><span>{date(transfer.timestamp).split(',')[0]}</span><small>{date(transfer.timestamp).split(',').slice(1).join(',')}</small></div><div className="trail-node"><span className="trail-pulse" style={{ animationDelay: `${index * 0.18}s` }} /><span /></div><div className="trail-card"><div className="trail-card-top"><span className="evidence-chip"><BadgeCheck size={12} /> {transfer.source.strength === 'onchain' ? 'Verified transfer' : transfer.source.strength}</span><span className="mono-value">{short(transfer.signature, 8)}</span></div><strong>{short(from?.label ?? transfer.from, 14)} <ChevronRight size={14} /> {short(to?.label ?? transfer.to, 14)}</strong><span className="trail-amount">{units(transfer.raw, transfer.decimals)} <small>{transfer.asset}</small></span></div></button>; })}</div>{transfers.length > 40 && <div className="coverage-note"><TimerReset size={15} /><div><strong>Stopping limit reached</strong><span>Showing the first 40 loaded transfer edges. Expand one page at a time from the source entity.</span></div></div>}</> : <EmptyState icon={<GitBranch size={30} />} title="No traceable transfer edges" description="Run a wallet or transaction investigation first. The trail only uses parsed transfer evidence, never generated paths." action="Open Sniff Lab" onAction={() => onNavigate('lab')} />}</section>;
}

function SocialScene({ data, onFollow, onNavigate }: { data: ReturnType<typeof useCaseData>; onFollow: (entity: Entity) => void; onNavigate: (scene: Scene) => void }) {
  const links = data.entities.filter((entity) => entity.kind === 'website' || entity.kind === 'social'); const rows = links.map((entity) => ({ entity, relations: data.relationships.filter((relation) => relation.to === entity.id || relation.from === entity.id) }));
  return <section className="scene"><SceneHeading eyebrow="06 / PUBLIC METADATA" title="Social footprint" description="Compare advertised domains and profiles from supported public metadata. A shared link is an overlap, not proof of common control." actions={<button className="secondary-button compact" onClick={() => onNavigate('lab')}><Search size={14} /> Investigate a URL</button>} /><div className="social-disclaimer"><div className="disclaimer-icon"><Globe2 size={19} /></div><div><strong>Browser access is intentionally limited</strong><span>Direct websites and X pages may block CORS or require authentication. SNIFF only reports indexed metadata or HTML that the browser can actually read.</span></div><span className="evidence-chip metadata">Metadata only</span></div>{rows.length ? <div className="social-grid">{rows.map(({ entity, relations }) => <div className="social-card" key={entity.id}><div className="social-card-head"><div className={`social-icon ${entity.kind}`}>{entity.kind === 'social' ? '𝕏' : '↗'}</div><div><span className="entity-badge badge-metadata">{kindLabels[entity.kind]}</span><h3>{entity.label}</h3></div></div><div className="mono-value">{entity.value}</div><div className="social-card-foot"><span><Link2 size={13} /> {relations.length} observed reference{relations.length === 1 ? '' : 's'}</span><button className="text-button" onClick={() => onFollow(entity)}>Inspect <ChevronRight size={14} /></button></div></div>)}</div> : <EmptyState icon={<Globe2 size={30} />} title="No public links in this case" description="Investigate a token mint, website, or X profile to search supported metadata sources." action="Open Sniff Lab" onAction={() => onNavigate('lab')} />}</section>;
}

function SharedEvidencePanel({ data, onSelect }: { data: ReturnType<typeof useCaseData>; onSelect: (id: string) => void }) {
  if (!data.analysis.shared.length) return null;
  return <div className="shared-panel panel-card"><PanelTitle icon={<ShieldAlert size={16} />} title="Suspicious wallet relationships" action={<span className="evidence-chip heuristic">Review signals</span>} /><p className="shared-intro">These wallets, domains, pools, or accounts were observed in more than one token snapshot. Repeated presence is a lead for review, not proof of common control or misconduct.</p><div className="shared-grid">{data.analysis.shared.map((group) => <button className="shared-row" key={group.key} onClick={() => onSelect(group.entities[0] ?? group.projects[0] ?? '')}><span className={`shared-signal ${group.kind === 'wallet' ? 'shared-wallet' : ''}`}>{group.kind === 'wallet' ? <WalletCards size={14} /> : <Link2 size={14} />}</span><div><strong>{group.label}</strong><span>{group.kind === 'wallet' ? 'Shared wallet · investigate relationship' : kindLabels[group.kind]} · {group.projects.length} projects · {group.findingIds.length} supporting observations</span></div><ChevronRight size={15} /></button>)}</div></div>;
}

function OcrScene({ onRun }: { onRun: (value: string) => void }) {
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState(''); const [status, setStatus] = useState('idle'); const [text, setText] = useState(''); const [candidates, setCandidates] = useState<ReturnType<typeof extractCandidates>>([]); const picker = useRef<HTMLInputElement>(null);
  const runOcr = async (image: File) => { setStatus('reading'); try { const { createWorker } = await import('tesseract.js'); const worker = await createWorker('eng'); let value = ''; try { const result = await worker.recognize(image); value = result.data.text.trim(); } finally { await worker.terminate(); } const next = extractCandidates(value); setText(value); setCandidates(next); setStatus('done'); const chain = next.filter((candidate) => candidate.kind === 'address' || candidate.kind === 'transaction'); const autoTarget = chain.length === 1 ? chain[0] : next.length === 1 ? next[0] : undefined; if (autoTarget) onRun(autoTarget.value); } catch { setStatus('error'); } };
  const choose = (image: File) => { setFile(image); setPreview(URL.createObjectURL(image)); setText(''); setCandidates([]); void runOcr(image); };
  useEffect(() => { const handler = (event: Event) => { const image = (event as CustomEvent<File>).detail; if (image) choose(image); }; window.addEventListener('sniff:screenshot', handler); return () => window.removeEventListener('sniff:screenshot', handler); }, []);
  return <section className="scene"><SceneHeading eyebrow="07 / LOCAL IMAGE PROCESSING" title="Screenshot forensics" description="OCR runs in this browser. A single clear chain identifier is investigated automatically; ambiguous candidates stay available for review." actions={<span className="local-chip"><LockKeyhole size={13} /> image stays local</span>} /><div className="ocr-layout"><div className="ocr-dropzone" onClick={() => picker.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const image = event.dataTransfer.files[0]; if (image?.type.startsWith('image/')) choose(image); }} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && picker.current?.click()}>{preview ? <img src={preview} alt="Uploaded investigation screenshot" /> : <><div className="upload-ring"><Upload size={24} /></div><strong>Drop a screenshot here</strong><span>or choose a local image · PNG, JPG, WEBP</span></>}</div><input ref={picker} type="file" hidden accept="image/*" aria-label="OCR image" onChange={(event) => event.target.files?.[0] && choose(event.target.files[0])} /><div className="ocr-results panel-card"><div className="panel-title"><div><BrainCircuit size={16} /><strong>Extracted candidates</strong></div>{status === 'reading' && <LoaderCircle size={15} className="spin" />}</div>{!file && <div className="ocr-empty"><FileImage size={26} /><span>Upload an image to begin local extraction.</span></div>}{status === 'reading' && <div className="ocr-reading"><LoaderCircle size={25} className="spin" /><strong>Reading pixels locally…</strong><span>No image is uploaded to a server.</span></div>}{status === 'error' && <div className="ocr-error"><AlertTriangle size={17} /> OCR worker could not start. Try a smaller image.</div>}{status === 'done' && <><div className="ocr-confidence"><span className="status-dot online" /> OCR complete · review every candidate before searching</div><textarea value={text} onChange={(event) => { setText(event.target.value); setCandidates(extractCandidates(event.target.value)); }} aria-label="Corrected OCR text" /><div className="candidate-list">{candidates.length ? candidates.map((candidate) => <button key={candidate.value} className="candidate-chip" onClick={() => onRun(candidate.value)}><Hash size={13} />{short(candidate.value, 22)}<ChevronRight size={14} /></button>) : <span className="muted-box">No recognizable address, URL, handle, or symbol was found. Correct the text above or paste an identifier into the Sniff Lab.</span>}</div></>}</div></div><div className="coverage-note"><ShieldAlert size={15} /><div><strong>OCR is not evidence</strong><span>Addresses can be misread by OCR. SNIFF validates Solana formats and still asks the provider to identify the account type.</span></div></div></section>;
}

function EvidenceScene({ data, onSelect, onCopy, onImport }: { data: ReturnType<typeof useCaseData>; onSelect: (id: string) => void; onCopy: (value: string) => void; onImport: () => void }) {
  const [strength, setStrength] = useState<Strength | 'all'>('all'); const [note, setNote] = useState(''); const snapshotCount = data.caseFile.snapshots.length; const findings = data.findings.filter((finding) => strength === 'all' || finding.source.strength === strength).slice().reverse();
  return <section className="scene"><SceneHeading eyebrow="08 / LOCAL CASE FILE" title="Evidence board" description="Machine-derived observations and your local case notes stay together in a portable JSON file." actions={<div className="heading-actions"><button className="secondary-button compact" onClick={onImport}><Upload size={14} /> Import</button><button className="primary-button compact" onClick={() => exportCase(data.caseFile)} disabled={!snapshotCount}><Download size={14} /> Export JSON</button></div>} /><div className="evidence-summary"><div><span className="eyebrow">CASE FILE</span><h2>{data.caseFile.name}</h2><span>Updated {date(data.caseFile.updatedAt)} · {snapshotCount} source page{snapshotCount === 1 ? '' : 's'}</span></div><div className="evidence-counts"><span><strong>{data.findings.length}</strong><small>findings</small></span><span><strong>{data.relationships.length}</strong><small>edges</small></span><span><strong>{data.caseFile.pins.length}</strong><small>pinned</small></span></div></div><div className="evidence-toolbar"><div className="filter-pills"><button className={strength === 'all' ? 'active' : ''} onClick={() => setStrength('all')}>All <span>{data.findings.length}</span></button>{(['onchain', 'metadata', 'heuristic', 'insufficient'] as Strength[]).map((item) => <button key={item} className={strength === item ? 'active' : ''} onClick={() => setStrength(item)}><span className={`strength-dot ${item}`} />{strengths[item]}</button>)}</div><button className="secondary-button compact" onClick={() => window.print()}><FileJson size={14} /> Print report</button></div><div className="evidence-layout"><div className="finding-board">{findings.length ? findings.map((finding) => <button className="evidence-card" key={finding.id} onClick={() => onSelect(finding.entityIds[0] ?? '')}><div className="evidence-card-top"><span className={`evidence-chip ${finding.source.strength}`}><span className={`strength-dot ${finding.source.strength}`} />{strengths[finding.source.strength]}</span><span>{date(finding.source.at)}</span></div><h3>{finding.title}</h3><p>{finding.description}</p><div className="evidence-card-foot"><span>{finding.source.provider}</span><span><ExternalLink size={12} /> Source</span></div></button>) : <EmptyState icon={<LayoutGrid size={30} />} title="Your board is empty" description="Run a real investigation to collect timestamped findings from supported public sources." />}</div><aside className="notes-card panel-card"><PanelTitle icon={<BookOpen size={16} />} title="Case notes" /><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Write an analyst note for this case…" /><button className="secondary-button full" onClick={() => { useApp.getState().note('case', note, 'Analyst note'); setNote(''); }} disabled={!note.trim()}><Plus size={15} /> Add note</button><div className="note-list">{Object.entries(data.caseFile.notes).map(([id, value]) => <div className="note-entry" key={id}><span>{value.group}</span><p>{value.text}</p></div>)}</div></aside></div><div className="coverage-note"><LockKeyhole size={15} /><div><strong>Portable by design</strong><span>Exports contain the observed data and timestamps in this browser. Reopen files to review; re-investigate entities to refresh live sources.</span></div></div></section>;
}

function HistoryModal({ history, onClose, onOpen, onImport }: { history: CaseFile[]; onClose: () => void; onOpen: (file: CaseFile) => void; onImport: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal-card"><div className="modal-head"><div><span className="eyebrow">LOCAL INDEX</span><h2>Recent investigations</h2></div><button className="icon-button" onClick={onClose} aria-label="Close history"><X size={18} /></button></div>{history.length ? <div className="history-list">{history.map((file) => <button key={file.id} className="history-row" onClick={() => onOpen(file)}><div className="history-mark"><History size={16} /></div><div><strong>{file.name}</strong><span>{file.snapshots.length} source page{file.snapshots.length === 1 ? '' : 's'} · {date(file.updatedAt)}</span></div><ChevronRight size={16} /></button>)}</div> : <EmptyState compact icon={<History size={24} />} title="No saved cases" description="Once a source page is loaded, it is saved in this browser." />}<div className="modal-foot"><button className="secondary-button" onClick={onImport}><Upload size={15} /> Import JSON</button><span><LockKeyhole size={12} /> IndexedDB · this browser only</span></div></div></div>;
}

function WalletModal({ status, walletName, address, error, onClose, onConnect, onDisconnect, onInvestigate, onCopy }: { status: 'idle' | 'connecting' | 'connected' | 'error'; walletName?: SupportedWalletName; address: string; error: string; onClose: () => void; onConnect: (walletName: SupportedWalletName) => void; onDisconnect: () => void; onInvestigate: () => void; onCopy: (value: string) => void }) {
  const connected = status === 'connected' && Boolean(address);
  const connecting = status === 'connecting';
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !connecting && onClose()}><div className="modal-card wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title"><div className="modal-head"><div><span className="eyebrow">READ-ONLY CONNECTION</span><h2 id="wallet-modal-title">Connect wallet</h2></div><button className="icon-button" onClick={onClose} aria-label="Close wallet connection"><X size={18} /></button></div>{connected ? <div className="wallet-connected-view"><div className="wallet-connected-card"><div className={`wallet-option-mark ${walletName?.toLowerCase()}`} aria-hidden="true">{walletName?.slice(0, 1)}</div><div><span className="eyebrow">{walletName?.toUpperCase()}</span><strong>Connected</strong><code>{walletShort(address)}</code></div><span className="status-dot online" /></div><div className="wallet-modal-actions"><button className="primary-button" onClick={onInvestigate}><Radar size={15} /> Investigate wallet</button><button className="secondary-button" aria-label="Copy address" onClick={() => onCopy(address)}><Copy size={15} /> Copy Address</button><button className="danger-button" onClick={onDisconnect}><XCircle size={15} /> Disconnect</button></div><div className="wallet-security-note"><LockKeyhole size={14} /><span>Connection permission only. SNIFF never requests signatures, seed phrases, private keys, or transfers.</span></div></div> : <><p className="wallet-modal-intro">Choose a browser extension. SNIFF requests only the public Solana address and leaves the wallet provider in control.</p><div className="wallet-options">{supportedWalletNames.map((name) => <button key={name} className="wallet-option" disabled={connecting} onClick={() => onConnect(name)}><span className={`wallet-option-mark ${name.toLowerCase()}`} aria-hidden="true">{name.slice(0, 1)}</span><span><strong>{name}</strong><small>{connecting && walletName === name ? 'Waiting for approval…' : 'Browser extension'}</small></span><ChevronRight size={16} /></button>)}</div>{error && <div className="wallet-error" role="alert"><AlertTriangle size={16} /><div><strong>{error}</strong>{error === 'Phantom wallet extension not detected.' && <a href="https://phantom.com/download" target="_blank" rel="noreferrer">Install Phantom</a>}{error === 'Solflare wallet extension not detected.' && <a href="https://solflare.com/download" target="_blank" rel="noreferrer">Install Solflare</a>}</div></div>}<div className="wallet-security-note"><LockKeyhole size={14} /><span>No signatures or transactions are requested.</span></div></>}</div></div>;
}

function CommandPalette({ onClose, onNavigate, onRun, onExport, onReset, onHistory }: { onClose: () => void; onNavigate: (scene: Scene) => void; onRun: (value: string) => void; onExport: () => void; onReset: () => void; onHistory: () => void }) {
  const [query, setQuery] = useState(''); const commands = [{ label: 'Investigate Wallet', hint: 'paste an address', icon: WalletCards, action: () => onNavigate('lab') }, { label: 'Investigate Token', hint: 'paste a mint', icon: Fingerprint, action: () => onNavigate('lab') }, { label: 'Follow the Scent', hint: 'open the graph', icon: Radar, action: () => onNavigate('map') }, { label: 'Compare Projects', hint: 'review shared evidence', icon: ArrowLeftRight, action: () => onNavigate('social') }, { label: 'Open Sniff Lab', hint: 'new investigation', icon: Radar, action: () => onNavigate('lab') }, { label: 'Open Scent Map', hint: 'relationship graph', icon: Network, action: () => onNavigate('map') }, { label: 'Open Evidence Board', hint: 'saved findings', icon: LayoutGrid, action: () => onNavigate('evidence') }, { label: 'Open Screenshot Forensics', hint: 'local OCR', icon: FileImage, action: () => onNavigate('ocr') }, { label: 'Open History', hint: 'saved locally', icon: History, action: onHistory }, { label: 'Reset Investigation', hint: 'start a fresh case', icon: TimerReset, action: onReset }, { label: 'Export evidence JSON', hint: 'download case', icon: Download, action: onExport }].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  return <div className="modal-backdrop command-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="command-card"><div className="command-search"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jump to a scene or action…" /><kbd>ESC</kbd></div><div className="command-list">{commands.map((command) => { const Icon = command.icon; return <button key={command.label} onClick={command.action}><span className="command-icon"><Icon size={17} /></span><span><strong>{command.label}</strong><small>{command.hint}</small></span><ChevronRight size={15} /></button>; })}{query.length > 24 && <button onClick={() => onRun(query)}><span className="command-icon"><Search size={17} /></span><span><strong>Investigate “{short(query, 30)}”</strong><small>Use this value in the Sniff Lab</small></span><ChevronRight size={15} /></button>}{!commands.length && !query && <div className="muted-box">No commands match this search.</div>}</div><div className="command-foot"><span><kbd>⌘ K</kbd> open palette</span><span><kbd>↵</kbd> select</span></div></div></div>;
}

function DogMascot({ state, compact = false }: { state: 'idle' | 'sniffing' | 'complete' | 'alert'; compact?: boolean }) {
  return <div className={`dog-mascot dog-${state} ${compact ? 'dog-compact' : ''}`} aria-label={`SNIFF mascot ${state}`}><div className="dog-ears"><span /><span /></div><div className="dog-head"><div className="dog-eye left" /><div className="dog-eye right" /><div className="dog-muzzle"><span className="dog-nose" /></div></div><div className="dog-body"><span className="dog-badge">S</span></div>{state === 'sniffing' && <div className="scent-puffs"><i /><i /><i /></div>}</div>;
}

function EmptyState({ icon, title, description, action, onAction, compact = false }: { icon: ReactNode; title: string; description: string; action?: string; onAction?: () => void; compact?: boolean }) { return <div className={`empty-state ${compact ? 'compact' : ''}`}><div className="empty-icon">{icon}</div><strong>{title}</strong><span>{description}</span>{action && onAction && <button className="secondary-button compact" onClick={onAction}>{action}<ChevronRight size={14} /></button>}</div>; }
function money(value: number) { return value >= 1000000 ? `$${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `$${(value / 1000).toFixed(1)}K` : `$${value.toFixed(0)}`; }
function walletShort(address: string) { return address.length > 10 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address; }

export default App;
