import MessagePreview from './MessagePreview.jsx';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Database, Download, FileText, HardDrive, History, Image, LayoutGrid, Loader2, MessageCircle, MoreHorizontal, Palette, Play, Plus, QrCode, RefreshCw, Search, Send, ShieldCheck, Square, Timer, Trash2, TrendingUp, Upload, Users, X, Zap } from 'lucide-react';
import { baseTokens, presets, validHex, loadTheme } from './themes.js';
import { estimateRemaining, formatDuration } from '../shared/estimate.js';
import './styles.css';
import './whatsapp.css';
const n = value => Number(value || 0).toLocaleString('pt-BR');
const date = value => value ? new Date(value).toLocaleString('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short'
}) : '—';
const seconds = value => value == null ? '—' : `${(value / 1000).toLocaleString('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2
})}s`;
const statusNames = {
  running: 'Em andamento',
  completed: 'Concluída',
  stopped: 'Parada',
  failed: 'Falhou',
  interrupted: 'Interrompida',
  pending: 'Pendente',
  cancelled: 'Não enviado',
  success: 'Aceito',
  error: 'Erro',
  invalid: 'Inválido',
  unknown: 'Não confirmada',
  delivered: 'Entregue',
  read: 'Lida'
};
function Status({
  value
}) {
  return <span className={`status-badge status-${value}`}>{statusNames[value] || value}</span>;
}
function IconButton({
  label,
  children,
  ...props
}) {
  return <button type="button" className="icon-button" aria-label={label} title={label} {...props}>{children}</button>;
}
async function api(url, body, method = 'POST', signal) {
  const response = await fetch(url, {
    method,
    signal,
    headers: body === undefined ? {} : {
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
  return result;
}
function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
function Connection({
  state,
  online,
  busy,
  onAction,
  onDisconnect
}) {
  return <section className="card connection-card"><div className="section-head"><h2>Sua conexão</h2><span className={`connection-indicator ${online && state.status === 'Conectado' ? 'connected' : ''}`}><span />{online ? state.status || 'Conectando…' : 'Servidor offline'}</span></div>
    <div className={`connection-visual ${state.qr && online ? 'has-qr' : ''}`}>{online && state.qr ? <img src={state.qr} alt="QR Code para conectar sua conta do WhatsApp" /> : <><div className="connection-orbit"><MessageCircle size={37} /><span /></div><strong>{!online ? 'Servidor desconectado' : state.status === 'Conectado' ? 'Tudo pronto para enviar.' : 'Conecte seu WhatsApp.'}</strong><p>{state.connectionIssue || (!online ? 'Abra o programa pelo atalho WhatsApp.' : state.status === 'Conectado' ? 'Sua sessão está salva neste computador.' : 'O QR Code aparecerá aqui assim que estiver disponível.')}</p></>}</div>
    {state.qr && online && <p className="qr-help">No celular: <strong>Aparelhos conectados → Conectar um aparelho</strong>.</p>}
    <div className="connection-actions">{state.status !== 'Conectado' && <button className="secondary-button" disabled={busy || !online} onClick={() => onAction('/api/connect')}><RefreshCw size={13} /> Reconectar</button>}<button className="text-button" disabled={busy || !online} onClick={onDisconnect}>Desconectar / limpar sessão</button></div>
    <div className="local-note"><ShieldCheck size={13} /> Sessão local · sem navegador automatizado</div>
  </section>;
}
function RunProgress({
  state,
  online,
  onStop,
  busy
}) {
  const now = useClock();
  const remaining = estimateRemaining(state, now);
  const hasTiming = !!state.startedAt;
  return <section className="card run-card"><div className="section-head"><h2>Fila de envios</h2><span className="outline-badge">{state.running ? 'Ao vivo' : 'Aguardando'}</span></div><div className="run-count"><strong>{n(state.processed)}<span> / {n(state.total)}</span></strong><span>{state.total ? Math.round(state.processed / state.total * 100) : 0}%</span></div><progress value={state.processed || 0} max={state.total || 1} /><div className="result-counters"><div><strong className="positive">{n(state.success)}</strong><small>Aceitos</small></div><div><strong>{n(state.invalid)}</strong><small>Inválidos</small></div><div><strong className="negative">{n(state.errors)}</strong><small>Erros</small></div></div><div className="timing-rows"><div><span><Clock3 size={13} /> Decorrido</span><strong>{hasTiming ? formatDuration((state.finishedAt || now) - state.startedAt) : '—'}</strong></div><div><span><Timer size={13} /> Restante estimado</span><strong>{!online ? '—' : state.running ? `≈ ${formatDuration(remaining)}` : '—'}</strong></div><div><span>Conclusão prevista</span><strong>{online && state.running ? new Date(now + remaining).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
          }) : '—'}</strong></div></div><p className="delay-status">{!online ? 'Conexão com o servidor perdida.' : state.nextAt ? `Próximo contato em ${Math.max(0, Math.ceil((state.nextAt - now) / 1000))}s` : state.running ? 'Processando contato…' : 'Sua próxima campanha começa aqui.'}</p>{state.running && <button className="stop-button" disabled={busy || !online} onClick={onStop}><Square size={13} /> Parar disparos</button>}<p className="hint">A previsão se ajusta ao ritmo real. Parar impede próximos envios; uma mensagem em trânsito pode concluir.</p></section>;
}
const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function AnalyticsChart({
  rows,
  metric
}) {
  const id = useId().replaceAll(':', '');
  const timing = metric === 'time';
  const values = rows.map(r => timing ? r.avg_send_ms : r.sent);
  const max = Math.max(1, ...values.filter(v => v != null));
  const hasData = values.some(v => v > 0);
  const width = 640,
    height = 156,
    padding = 15,
    step = (width - 2 * padding) / Math.max(1, rows.length - 1);
  let segment = false;
  const line = values.map((v, i) => {
    if (v == null) {
      segment = false;
      return '';
    }
    const command = segment ? 'L' : 'M';
    segment = true;
    return `${command}${padding + i * step} ${height - 10 - v / max * (height - 25)}`;
  }).join(' ');
  return <div className="analytics-chart"><div className="axis-labels"><span>{timing ? seconds(max) : n(max)}</span><span>{timing ? seconds(max / 2) : n(Math.round(max / 2))}</span><span>{timing ? '0s' : '0'}</span></div><div className="analytics-plot"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={timing ? 'Média de tempo de processamento por mês' : 'Quantidade de envios aceitos por período'} preserveAspectRatio="none"><defs><linearGradient id={id} x1="0" y1="1" x2="0" y2="0"><stop stopColor="var(--accent-start)" /><stop offset="1" stopColor="var(--accent-end)" /></linearGradient></defs>{[18, 80, 146].map(y => <line key={y} x1="0" x2={width} y1={y} y2={y} stroke="var(--border-subtle)" strokeDasharray="4 6" />)}{timing ? <><path d={line} fill="none" stroke={`url(#${id})`} strokeWidth="3" vectorEffect="non-scaling-stroke" />{values.map((v, i) => v != null && <circle key={i} cx={padding + i * step} cy={height - 10 - v / max * (height - 25)} r="4" fill="var(--accent-end)"><title>{rows[i].label}: {seconds(v)}</title></circle>)}</> : values.map((v, i) => <rect key={i} x={i * width / rows.length + width / rows.length * .22} y={height - 10 - v / max * (height - 25)} width={width / rows.length * .56} height={v / max * (height - 25)} rx="5" fill={`url(#${id})`}><title>{rows[i].label}: {n(v)} aceitos</title></rect>)}</svg><div className="analytics-labels">{rows.map(r => <span key={r.label}>{r.label}</span>)}</div>{!hasData && <div className="chart-empty"><TrendingUp size={23} /><span>Seu histórico vai aparecer aqui.</span><small>Nenhum envio registrado neste período.</small></div>}</div></div>;
}
function CampaignTable({
  items,
  onDetail,
  onNew
}) {
  return items.length ? <div className="table-scroll"><table><thead><tr><th>Campanha</th><th>Status</th><th>Progresso</th><th>Aceitos</th><th>Tempo médio</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{items.map(c => <tr key={c.id}><td><button className="campaign-name" onClick={() => onDetail(c.id)}><span className="tiny-icon"><Send size={15} /></span><span><strong>{c.name}</strong><small>{date(c.started_at)}</small></span></button></td><td><Status value={c.status} /></td><td className="number">{n(c.processed)}/{n(c.total)}</td><td className="positive number">{n(c.success)}</td><td className="number">{seconds(c.avg_send_ms)}</td><td><IconButton label={`Detalhes de ${c.name}`} onClick={() => onDetail(c.id)}><ArrowUpRight size={15} /></IconButton></td></tr>)}</tbody></table></div> : <div className="empty"><div className="empty-icon"><Send size={25} /></div><h3>O próximo movimento é seu.</h3><p>As campanhas iniciadas a partir de agora ficarão salvas aqui.</p><button className="gradient-button fit-button" onClick={onNew}>Criar meu primeiro disparo <Plus size={14} /></button></div>;
}
function Dashboard({
  stats,
  year,
  setYear,
  state,
  online,
  busy,
  onAction,
  onDisconnect,
  onDetail,
  onNew
}) {
  const [volume, setVolume] = useState('month');
  const monthly = (stats.monthly || []).map((r, i) => ({
    ...r,
    label: monthLabels[i]
  }));
  const annual = stats.annual?.length ? stats.annual.map(r => ({
    ...r,
    label: String(r.year)
  })) : [{
    label: String(year),
    sent: 0
  }];
  const yearOptions = [...new Set([new Date().getFullYear(), year, ...(stats.annual || []).map(r => r.year)])].sort((a, b) => b - a);
  return <><div className="metric-grid"><section className="card metric-card"><div className="metric-label">Mensagens aceitas <span className="tiny-icon"><MessageCircle size={15} /></span></div><div className="metric-value">{n(stats.sent)}<span className="soft-badge"><Check size={11} /> Histórico local</span></div><p>Envios aceitos pelo WhatsApp, sem garantir leitura.</p></section><section className="card metric-card"><div className="metric-label">Tempo médio por envio <span className="tiny-icon"><Timer size={15} /></span></div><div className="metric-value">{seconds(stats.avg_send_ms)}</div><p>Consulta + envio dos aceitos. Sem incluir pausas.</p></section><section className="card metric-card"><div className="metric-label">Campanhas registradas <span className="tiny-icon"><History size={15} /></span></div><div className="metric-value">{n(stats.campaigns)}</div><p>{n(stats.delivered)} entregas confirmadas · {n(stats.errors)} erros</p></section></div><div className="dashboard-grid"><div className="dashboard-main"><section className="card statistics"><div className="section-head"><div><h2>Tempo médio por envio</h2><p>Média mensal · somente envios aceitos</p></div><select className="pill-select" aria-label="Ano dos gráficos" value={year} onChange={e => setYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y}>{y}</option>)}</select></div><div className="chart-summary"><strong>{seconds(stats.avg_send_ms)}</strong><span className="chart-legend"><i /> Processamento</span></div><AnalyticsChart rows={monthly} metric="time" /></section><section className="card statistics"><div className="section-head"><div><h2>Mensagens ao longo do tempo</h2><p>Contagem por mês ou ano · horário de Brasília</p></div><div className="period-filter">{[['month', 'Mensal'], ['year', 'Anual']].map(([id, label]) => <button key={id} className={volume === id ? 'active' : ''} onClick={() => setVolume(id)}>{label}</button>)}</div></div><div className="chart-summary"><strong>{n((volume === 'month' ? monthly : annual).reduce((sum, r) => sum + r.sent, 0))} <small>aceitas</small></strong><span className="chart-legend"><i /> Volume de envios</span></div><AnalyticsChart rows={volume === 'month' ? monthly : annual} metric="count" /></section><section className="card asset-card"><div className="section-head"><div><h2>Seus últimos disparos</h2><p>O histórico que acompanha cada movimento.</p></div><button className="text-button" onClick={() => onAction('history')}>Ver todos <ArrowUpRight size={14} /></button></div><CampaignTable items={stats.recent || []} onDetail={onDetail} onNew={onNew} /></section></div><aside className="dashboard-aside"><Connection {...{
          state,
          online,
          busy,
          onDisconnect
        }} onAction={onAction} />{state.running ? <RunProgress {...{
          state,
          online,
          busy
        }} onStop={() => onAction('/api/stop')} /> : <section className="promo-card"><div className="promo-top"><span className="pro-badge">100% LOCAL</span><HardDrive size={18} /></div><div className="orb-art"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orb-core"><Database size={30} /></div><span className="orb-dot" /></div><h2>Seu histórico.<br />No seu controle.</h2><p>Campanhas salvas no seu computador.<br />Consulte, exporte e acompanhe.</p><button onClick={() => onAction('history')}>Gerenciar banco local <ArrowRight size={15} /></button></section>}<div className="insight-note"><ShieldCheck size={18} /><p>Uma sessão. Uma instância.<br /><span>Mais clareza em cada envio.</span></p></div></aside></div></>;
}
function Composer({
  form,
  setForm,
  state,
  online,
  busy,
  onAction,
  onDisconnect,
  logs,
  setLogs
}) {
  const [estimate, setEstimate] = useState(null),
    [estimateError, setEstimateError] = useState('');
  const fileRef = useRef(null),
    messageRef = useRef(null),
    logRef = useRef(null);
  const change = (key, value) => setForm(f => ({
    ...f,
    [key]: value
  }));
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api('/api/estimate', {
        contacts: form.contacts,
        min: Number(form.min),
        max: Number(form.max)
      }, 'POST', controller.signal).then(value => {
        setEstimate(value);
        setEstimateError('');
      }).catch(error => {
        if (error.name !== 'AbortError') {
          setEstimate(null);
          setEstimateError(error.message);
        }
      });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.contacts, form.min, form.max]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);
  async function importFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 1500000) {
      setEstimateError('Importe arquivos de até 1,5 MB.');
      return;
    }
    try {
      const text = await file.text();
      if (!state.running) change('contacts', text);
    } catch {
      setEstimateError('Não foi possível ler o arquivo. Salve como UTF-8.');
    }
  }
  function insertVariable(value) {
    change('message', form.message + value);
    messageRef.current?.focus();
  }
  const preview = estimate?.sample ? form.message.replace(/\{\{\s*(nome|var([1-9]\d*))\s*\}\}/gi, (_, key, index) => estimate.sample.vars[key.toLowerCase() === 'nome' ? 0 : Number(index) - 1] ?? '') : form.message;
  return <div className="dashboard-grid"><div className="dashboard-main"><form className="card compose-card" onSubmit={e => {
        e.preventDefault();
        onAction('/api/start', {
          ...form,
          min: Number(form.min),
          max: Number(form.max)
        });
      }}><div className="section-head"><div><div className="eyebrow">SEU PRÓXIMO MOVIMENTO</div><h2>Uma mensagem. Muitas conexões.</h2><p>Prepare sua campanha com um toque pessoal.</p></div><span className="tiny-icon"><Send size={17} /></span></div><fieldset disabled={busy || state.running}><label htmlFor="campaignName">Nome da campanha <span className="optional">Opcional</span></label><input id="campaignName" maxLength={100} value={form.name} onChange={e => change('name', e.target.value)} placeholder="Ex.: Novidades de novembro" /><div className="field-heading"><label htmlFor="contacts">Seus contatos</label><button type="button" className="text-button" onClick={() => fileRef.current?.click()}><Upload size={13} /> Importar CSV / TXT</button><input ref={fileRef} type="file" accept=".csv,.txt" onChange={importFile} hidden /></div><textarea id="contacts" required rows={6} spellCheck={false} value={form.contacts} onChange={e => change('contacts', e.target.value)} placeholder={'5511999999999;João;Plano Pro;R$ 99\n5521988888888;Maria;Plano Básico;R$ 49'} /><div className="input-caption"><span>Número;nome;outras variáveis · uma linha por contato, sem cabeçalho.</span><strong>{estimate ? n(estimate.count) : '—'} contatos</strong></div><label htmlFor="message">Sua mensagem</label><textarea id="message" ref={messageRef} required maxLength={4000} rows={5} value={form.message} onChange={e => change('message', e.target.value)} placeholder="Olá, {{nome}}! Seu {{var2}} está disponível por {{var3}}." /><div className="variable-row"><span>Personalize:</span>{['{{nome}}', '{{var1}}', '{{var2}}', '{{var3}}'].map(value => <button key={value} type="button" onClick={() => insertVariable(value)}>{value}</button>)}<small>{form.message.length}/4000</small></div><label htmlFor="imageUrl">Imagem ou Google Drive <span className="optional">Opcional</span></label><div className="input-with-icon"><Image size={16} /><input id="imageUrl" type="url" value={form.imageUrl} onChange={e => change('imageUrl', e.target.value)} placeholder="Cole o link direto da imagem ou do Google Drive" /></div><p className="hint">PNG, JPG ou WebP, até 10 MB. No Drive, compartilhe como “Qualquer pessoa com o link”.</p><div className="delay-fields"><div><label htmlFor="min">Intervalo mínimo <span className="optional">Segundos</span></label><input id="min" type="number" min="1" max="3600" step="0.1" required value={form.min} onChange={e => change('min', e.target.value)} /></div><div><label htmlFor="max">Intervalo máximo <span className="optional">Segundos</span></label><input id="max" type="number" min="1" max="3600" step="0.1" required value={form.max} onChange={e => change('max', e.target.value)} /></div></div></fieldset><div className="estimate-box"><Timer size={20} /><div><strong>{estimateError ? estimateError : estimate?.count ? `≈ ${formatDuration(estimate.averageMs)} em pausas para ${n(estimate.count)} contatos` : 'Adicione contatos para estimar a duração.'}</strong><p>{estimate?.count ? `Pausas entre ${formatDuration(estimate.minimumMs)} e ${formatDuration(estimate.maximumMs)}. Consultas, envios e imagem acrescentam tempo.` : 'O tempo restante será ajustado pelo ritmo real durante os envios.'}</p></div></div><div className="compose-actions"><button className="gradient-button fit-button" disabled={busy || !online || state.running || state.status !== 'Conectado'}>{busy ? <Loader2 className="spin" size={15} /> : <Play size={14} />} Iniciar disparos</button>{state.running && <button type="button" className="stop-button" disabled={busy || !online} onClick={() => onAction('/api/stop')}><Square size={13} /> Parar disparos</button>}<span><ShieldCheck size={12} /> Envie apenas a contatos que autorizaram.</span></div></form><MessagePreview text={preview} sample={estimate?.sample} imageUrl={form.imageUrl} /><section className="card"><div className="section-head"><div><h2>Atividade em tempo real</h2><p>Os últimos 500 registros · histórico de logs salvo localmente</p></div><button className="text-button" onClick={() => setLogs([])}>Limpar tela</button></div><div className="activity-log" role="log" aria-live="polite" ref={logRef}>{logs.length ? logs.map((entry, i) => <div key={i} className={`log-${entry.level}`}><time>{new Date(entry.time).toLocaleTimeString('pt-BR')}</time><span>{entry.message}</span></div>) : <p>Os próximos eventos aparecerão aqui.</p>}</div></section></div><aside className="dashboard-aside"><Connection {...{
        state,
        online,
        busy,
        onDisconnect
      }} onAction={onAction} /><RunProgress {...{
        state,
        online,
        busy
      }} onStop={() => onAction('/api/stop')} /></aside></div>;
}
function HistoryPage({
  revision,
  search,
  onDetail,
  onNew,
  notify
}) {
  const [data, setData] = useState({
      items: [],
      total: 0,
      page: 1,
      pages: 1
    }),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [error, setError] = useState('');
  useEffect(() => setPage(1), [search, status]);
  useEffect(() => {
    const controller = new AbortController();
    api(`/api/campaigns?search=${encodeURIComponent(search)}&status=${status}&page=${page}`, undefined, 'GET', controller.signal).then(value => {
      setData(value);
      setError('');
    }).catch(e => {
      if (e.name !== 'AbortError') setError(e.message);
    });
    return () => controller.abort();
  }, [revision, search, status, page]);
  return <><div className="history-banner"><span className="tiny-icon"><Database size={21} /></span><div><strong>Seu banco de dados. No seu computador.</strong><p>SQLite em data/whatsapp.sqlite · sessão do WhatsApp separada do histórico.</p></div><a href="/api/database/export" className="secondary-button" download><Download size={14} /> Exportar registros JSON</a></div><section className="card asset-card"><div className="section-head"><div><h2>Histórico de campanhas</h2><p>{n(data.total)} campanhas encontradas · busque pelo nome na barra superior</p></div><select className="pill-select" aria-label="Filtrar status das campanhas" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option>{['running', 'completed', 'stopped', 'failed', 'interrupted'].map(value => <option key={value} value={value}>{statusNames[value]}</option>)}</select></div>{error ? <div className="empty negative">{error}</div> : <CampaignTable items={data.items} onDetail={onDetail} onNew={onNew} />}<div className="pagination"><span>Página {data.page} de {data.pages}</span><IconButton label="Página anterior" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></IconButton><IconButton label="Próxima página" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></IconButton></div></section><div className="storage-notes"><div><ShieldCheck size={18} /><strong>Sua privacidade importa.</strong><p>Os registros contêm contatos e mensagens. Não compartilhe as pastas data e auth.</p></div><div><RefreshCw size={18} /><strong>Sem retomadas inesperadas.</strong><p>Se o programa for encerrado, a campanha é marcada como interrompida. Nada é retomado sozinho.</p></div><div><FileText size={18} /><strong>Resultados com contexto.</strong><p>“Aceito” é o resultado do envio. Entrega e leitura só são confirmadas quando há recibo do WhatsApp.</p></div></div></>;
}
function ThemeEditor({
  theme,
  setTheme,
  storageError
}) {
  const [drafts, setDrafts] = useState({});
  useEffect(() => setDrafts({}), [theme.id]);
  function edit(key, value) {
    setDrafts(d => ({
      ...d,
      [key]: value
    }));
    if (validHex(value)) setTheme(t => ({
      id: 'custom',
      tokens: {
        ...t.tokens,
        [key]: value.toUpperCase()
      }
    }));
  }
  return <div className="theme-page"><section className="card"><div className="section-head"><div><div className="eyebrow">01 / SUA IDENTIDADE</div><h2>Encontre o seu tom.</h2><p>Uma nova atmosfera para as suas conexões.</p></div><span className="outline-badge"><Palette size={13} />{theme.id === 'custom' ? 'Personalizado' : presets.find(p => p.id === theme.id)?.name}</span></div><div className="preset-grid">{presets.map(p => <button key={p.id} className={`preset ${theme.id === p.id ? 'is-active' : ''}`} aria-pressed={theme.id === p.id} onClick={() => setTheme({
          id: p.id,
          tokens: {
            ...p.tokens
          }
        })} style={{
          '--preview-bg': p.tokens['--bg-primary'],
          '--preview-surface': p.tokens['--bg-surface'],
          '--preview-start': p.tokens['--accent-start'],
          '--preview-end': p.tokens['--accent-end']
        }}><div className="preset-art">{theme.id === p.id && <span className="preset-active">Ativo</span>}<div className="mini-side" /><div className="mini-content"><div className="mini-bar" /><div className="mini-cards"><span /><span /></div><svg viewBox="0 0 150 50"><path d="M0 43 Q20 48 34 28 T67 30 T102 15 T150 3" fill="none" stroke="var(--preview-start)" strokeWidth="3" /></svg></div></div><div className="preset-label"><strong>{p.name}</strong><span className="preset-check">{theme.id === p.id && <Check size={12} />}</span></div><p>{p.detail}</p><div className="preset-dots"><i /><i /><i /></div></button>)}</div></section><div className="editor-grid"><section className="card"><div className="eyebrow">02 / DO SEU JEITO</div><h2>Seu espaço. Suas cores.</h2><p>Altere uma cor e veja toda a interface reagir.</p><div className="color-list">{[['--bg-primary', 'Fundo principal'], ['--bg-surface', 'Superfície dos cards'], ['--accent-start', 'Cor primária'], ['--accent-end', 'Cor secundária'], ['--text-primary', 'Texto principal']].map(([key, label]) => <div className="color-row" key={key}><label htmlFor={key}>{label}</label><div className="color-control"><input id={key} type="color" value={theme.tokens[key]} onChange={e => edit(key, e.target.value)} /><input aria-label={`${label} em HEX`} maxLength={7} value={drafts[key] ?? theme.tokens[key]} spellCheck={false} aria-invalid={!!drafts[key] && !validHex(drafts[key])} onChange={e => edit(key, e.target.value)} onBlur={() => setDrafts(d => ({
                ...d,
                [key]: theme.tokens[key]
              }))} /></div></div>)}</div><p className="hint">Use #RRGGBB. Escolha combinações com contraste confortável.</p></section><section className="card preview-card"><div className="eyebrow">03 / EM TEMPO REAL</div><div className="section-head"><h2>Uma prévia da sua marca</h2><span className="live-dot">Ao vivo</span></div><div className="live-preview"><div className="section-head"><span>Campanha de exemplo</span><Send size={17} /></div><strong className="preview-value">Sua mensagem.</strong><span className="soft-badge"><Check size={12} /> Pronta para conectar</span><svg viewBox="0 0 300 100" aria-label="Prévia ilustrativa do gráfico"><defs><linearGradient id="themePreview"><stop stopColor="var(--accent-start)" /><stop offset="1" stopColor="var(--accent-end)" /></linearGradient></defs><path d="M0 85 Q20 75 40 78 T80 54 T120 62 T160 35 T200 43 T240 20 T300 4" fill="none" stroke="url(#themePreview)" strokeWidth="3" /></svg><button className="gradient-button" onClick={() => setTheme({
            id: 'purple',
            tokens: {
              ...baseTokens
            }
          })}>Restaurar Padrão <RefreshCw size={14} /></button></div><p className="save-note"><Check size={13} />{storageError ? 'Tema aplicado, mas o navegador não permitiu salvar.' : 'Tema salvo automaticamente neste navegador.'}</p></section></div></div>;
}
function App() {
  const [page, setPage] = useState('dashboard'),
    [state, setState] = useState({}),
    [online, setOnline] = useState(false),
    [logs, setLogs] = useState([]),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(''),
    [modal, setModal] = useState(null),
    [detail, setDetail] = useState(null),
    [detailPage, setDetailPage] = useState(1),
    [search, setSearch] = useState(''),
    [year, setYear] = useState(new Date().getFullYear()),
    [stats, setStats] = useState({}),
    [statsError, setStatsError] = useState(''),
    [revision, setRevision] = useState(0);
  const [theme, setTheme] = useState(() => {
      try {
        return loadTheme(window.localStorage);
      } catch {
        return {
          id: 'purple',
          tokens: {
            ...baseTokens
          }
        };
      }
    }),
    [storageError, setStorageError] = useState(false);
  const [form, setForm] = useState({
    name: '',
    contacts: '',
    message: '',
    imageUrl: '',
    min: 5,
    max: 10
  });
  const dialogRef = useRef(null),
    focusRef = useRef(null),
    toastTimer = useRef(null);
  const notify = message => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5000);
  };
  useEffect(() => {
    const socket = io();
    let timer;
    socket.on('connect', () => {
      setOnline(true);
      setRevision(v => v + 1);
    });
    socket.on('disconnect', () => setOnline(false));
    socket.on('state', setState);
    socket.on('history', setLogs);
    socket.on('log', entry => setLogs(items => [...items, entry].slice(-500)));
    socket.on('metrics-changed', () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRevision(v => v + 1), 300);
    });
    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api(`/api/stats?year=${year}`, undefined, 'GET', controller.signal).then(value => {
      setStats(value);
      setStatsError('');
    }).catch(error => {
      if (error.name !== 'AbortError') setStatsError(error.message);
    });
    return () => controller.abort();
  }, [year, revision]);
  useEffect(() => {
    for (const [key, value] of Object.entries(theme.tokens)) document.documentElement.style.setProperty(key, value);
    const bg = theme.tokens['--bg-primary'];
    const luminance = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16)).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    document.documentElement.dataset.theme = luminance > 150 ? 'light' : 'dark';
    try {
      localStorage.setItem('whatsapp-theme', JSON.stringify(theme));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [theme]);
  useEffect(() => {
    if (modal) {
      focusRef.current = document.activeElement;
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
      focusRef.current?.focus();
    }
  }, [modal]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  async function action(url, body) {
    if (url === 'history') {
      setPage('history');
      return;
    }
    setBusy(true);
    try {
      await api(url, body || {});
      setRevision(v => v + 1);
      if (url === '/api/start') notify('Campanha iniciada e salva no histórico local.');
      if (url === '/api/stop') notify('Parada solicitada. Nenhum próximo envio será iniciado.');
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function openDetail(id) {
    setDetailPage(1);
    try {
      const value = await api(`/api/campaigns/${id}`, undefined, 'GET');
      setDetail(value);
      setModal('detail');
    } catch (error) {
      notify(error.message);
    }
  }
  async function deleteCampaign() {
    setBusy(true);
    try {
      await api(`/api/campaigns/${detail.id}`, undefined, 'DELETE');
      setModal(null);
      setRevision(v => v + 1);
      notify('Campanha excluída do histórico local.');
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }
  const newCampaign = () => setPage('send');
  const onDisconnect = () => setModal('disconnect');
  const labels = {
    dashboard: ['Visão geral', 'Cada envio, uma nova conexão.', 'Acompanhe seus disparos com clareza, do início ao próximo movimento.'],
    send: ['Campanhas', 'Sua mensagem vai mais longe.', 'Personalize, envie e acompanhe cada contato em tempo real.'],
    history: ['Histórico & Banco local', 'O histórico das suas conexões.', 'Resultados, tempos e campanhas salvos aqui, no seu computador.'],
    themes: ['Aparência & Temas', 'Uma interface com a sua cara.', 'Escolha uma atmosfera. Ajuste os detalhes. Faça deste espaço o seu.']
  };
  return <div className="app-shell"><aside className="sidebar"><button className="wa-brand" aria-label="WhatsApp Local — Dashboard" onClick={() => setPage('dashboard')}><MessageCircle size={27} /></button><nav aria-label="Navegação principal">{[['dashboard', LayoutGrid, 'Dashboard'], ['send', Send, 'Novo disparo'], ['history', Database, 'Histórico & Banco local'], ['themes', Palette, 'Aparência & Temas']].map(([id, Icon, label]) => <button key={id} className={`nav-button ${page === id ? 'active' : ''}`} aria-label={label} title={label} aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}><Icon size={21} /></button>)}</nav><div className="sidebar-bottom"><IconButton label="Sobre o programa" onClick={() => setModal('help')}><ShieldCheck size={19} /></IconButton><div className="sidebar-avatar">WL</div></div></aside><div className="main-shell"><header className="topbar"><button className="wa-wordmark" onClick={() => setPage('dashboard')}>WhatsApp<span>LOCAL</span></button><label className="search-box"><Search size={16} /><input aria-label="Buscar campanhas" placeholder="Buscar uma campanha…" value={search} onChange={e => {
            setSearch(e.target.value);
            setPage('history');
          }} /></label><div className="header-actions"><span className="device-label"><HardDrive size={14} /> Neste computador</span><button className={`header-status ${online && state.status === 'Conectado' ? 'connected' : ''}`} onClick={() => setPage('send')}><span />{online ? state.status || 'Conectando' : 'Servidor offline'}</button></div></header><main><div className="page-heading"><div><div className="breadcrumb">Workspace <ChevronRight size={12} />{labels[page][0]}</div><h1>{labels[page][1]}</h1><p>{labels[page][2]}</p></div><div className="heading-tools">{page !== 'send' && <button className="gradient-button fit-button" onClick={newCampaign}><Plus size={14} /> Novo disparo</button>}</div></div>{statsError && <div className="error-banner" role="alert">Não foi possível carregar o histórico: {statsError}<button onClick={() => setRevision(v => v + 1)}>Tentar novamente</button></div>}{page === 'dashboard' ? <Dashboard {...{
          stats,
          year,
          setYear,
          state,
          online,
          busy,
          onDisconnect
        }} onAction={action} onDetail={openDetail} onNew={newCampaign} /> : page === 'send' ? <Composer {...{
          form,
          setForm,
          state,
          online,
          busy,
          onDisconnect,
          logs,
          setLogs
        }} onAction={action} /> : page === 'history' ? <HistoryPage {...{
          revision,
          search,
          notify
        }} onDetail={openDetail} onNew={newCampaign} /> : <ThemeEditor {...{
          theme,
          setTheme,
          storageError
        }} />}<footer><span>WhatsApp Local · Cada conexão importa.</span><span><span className="system-dot" /> Dados reais deste computador <span className="footer-separator">/</span>{new Date().toLocaleDateString('pt-BR')}</span></footer></main></div><div className={`toast ${toast ? 'visible' : ''}`} role="status"><Check size={15} />{toast}</div><dialog ref={dialogRef} className={`modal ${modal === 'detail' ? 'detail-modal' : ''}`} aria-label="Detalhes e confirmações" onCancel={() => setModal(null)} onClick={e => {
      if (e.target === e.currentTarget) setModal(null);
    }}><div className="modal-inner"><IconButton label="Fechar" onClick={() => setModal(null)}><X size={19} /></IconButton>{modal === 'disconnect' ? <><span className="modal-symbol"><QrCode size={27} /></span><h2>Desconectar esta sessão?</h2><p>Isso cancela a fila, apaga as credenciais locais e gera um novo QR Code. O histórico de campanhas permanece salvo.</p><button className="stop-button" disabled={busy} onClick={() => {
            setModal(null);
            action('/api/disconnect');
          }}>Desconectar e limpar sessão</button></> : modal === 'delete' ? <><span className="modal-symbol"><Trash2 size={27} /></span><h2>Excluir esta campanha?</h2><p>“{detail?.name}” e os resultados de seus contatos serão removidos do banco local. Exporte o CSV antes se precisar guardar uma cópia. Mensagens já enviadas não são apagadas do WhatsApp.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal('detail')}>Voltar</button><button className="stop-button" disabled={busy} onClick={deleteCampaign}>Excluir campanha</button></div></> : modal === 'detail' && detail ? <><div className="eyebrow">HISTÓRICO LOCAL</div><h2>{detail.name}</h2><div className="detail-meta"><Status value={detail.status} /><span>{date(detail.started_at)}</span><span>{n(detail.total)} contatos</span></div>{detail.error && <p className="negative">{detail.error}</p>}<div className="detail-summary"><div><small>Aceitos</small><strong className="positive">{n(detail.success)}</strong></div><div><small>Inválidos</small><strong>{n(detail.invalid)}</strong></div><div><small>Erros</small><strong className="negative">{n(detail.errors)}</strong></div><div><small>Média por envio</small><strong>{seconds(detail.avg_send_ms)}</strong></div></div><div className="detail-message">{detail.message}</div>{detail.image_url && <p className="hint"><Image size={12} /> Campanha com imagem anexada</p>}<div className="table-scroll"><table><thead><tr><th>Contato</th><th>Resultado</th><th>Tempo</th><th>Entrega</th><th>Detalhes</th></tr></thead><tbody>{detail.recipients.slice((detailPage - 1) * 25, detailPage * 25).map(r => <tr key={r.position}><td><strong>{r.name || 'Sem nome'}</strong><small className="block subtle mt-1">{r.number}</small></td><td><Status value={r.status} /></td><td>{r.updated_at ? seconds(r.duration_ms) : '—'}</td><td>{statusNames[r.delivery]}</td><td className="recipient-detail" title={r.error || r.message_id || ''}>{r.error || r.message_id || '—'}</td></tr>)}</tbody></table></div><div className="pagination"><span>Página {detailPage} de {Math.max(1, Math.ceil(detail.recipients.length / 25))}</span><IconButton label="Contatos anteriores" disabled={detailPage === 1} onClick={() => setDetailPage(p => p - 1)}><ChevronLeft size={15} /></IconButton><IconButton label="Próximos contatos" disabled={detailPage * 25 >= detail.recipients.length} onClick={() => setDetailPage(p => p + 1)}><ChevronRight size={15} /></IconButton></div><div className="modal-actions"><a href={`/api/campaigns/${detail.id}/export`} className="secondary-button" download><Download size={13} /> Exportar CSV</a><button className="secondary-button" onClick={() => openDetail(detail.id)}><RefreshCw size={13} /> Atualizar</button><button className="text-button negative" disabled={detail.status === 'running'} onClick={() => setModal('delete')}><Trash2 size={13} /> Excluir campanha</button></div></> : <><span className="modal-symbol"><MessageCircle size={29} /></span><h2>Conexões com mais clareza.</h2><p>WhatsApp Local usa Baileys, uma biblioteca não oficial. O banco guarda as campanhas iniciadas após esta atualização; os gráficos não inventam envios anteriores.</p><p>Intervalos não garantem evitar bloqueios. “Aceito” não confirma entrega ou leitura. Preserve o servidor ligado para atender pedidos de recuperação.</p><button className="gradient-button" onClick={() => setModal(null)}>Entendi <Check size={15} /></button></>}</div></dialog></div>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
