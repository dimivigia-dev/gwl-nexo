"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Processor from "./processor";
import ContractsManager from "./contracts-manager";
import ResultsArchive from "./results-archive";
import type { ModuleId } from "../lib/document-engine";

type View = "dashboard" | "library" | "contracts" | "archive" | "support" | "processor";

const automations: Array<{ id: ModuleId; code: string; title: string; category: string; description: string; inputs: string; output: string; tone: string }> = [
  { id: "va", code: "VA", title: "Vale-Alimentação", category: "Benefícios", description: "Une nota fiscal, nota de débito e relatório pelo valor exato do benefício, conferindo pedido e contrato.", inputs: "3 grupos de PDFs", output: "PDFs + relatório XLSX", tone: "blue" },
  { id: "fgts", code: "FG", title: "Fechamento FGTS", category: "Fiscal e trabalhista", description: "Relaciona demonstrativos, guias e comprovantes de cada contrato e monta o fechamento completo.", inputs: "3 grupos de PDFs", output: "PDFs + relatório XLSX", tone: "green" },
  { id: "cc", code: "CP", title: "Contracheque + Comprovante", category: "Folha de pagamento", description: "Identifica colaboradores e combina comprovantes e contracheques em um arquivo organizado.", inputs: "2 grupos de PDFs", output: "PDF consolidado + XLSX", tone: "purple" },
];

export default function Home({ initialPortal = "gateway", userName = "GWL", signOutHref = "/" }: { initialPortal?: "gateway" | "gwl"; userName?: string; signOutHref?: string }) {
  const [view, setView] = useState<View>("dashboard");
  const [activeTool, setActiveTool] = useState<ModuleId>("va");
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category,setCategory]=useState("Todas");
  const filtered = useMemo(() => automations.filter((item) => (category==="Todas"||item.id===({Financeiro:"va",RH:"cc",Fiscal:"fgts"} as Record<string,string>)[category]) && `${item.title} ${item.category} ${item.description}`.toLowerCase().includes(query.toLowerCase())), [query,category]);

  function navigate(next: View) { setView(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openTool(id: ModuleId) { setActiveTool(id); navigate("processor"); }

  if (initialPortal === "gateway") return <NexoGateway />;

  return <main className="platform-shell">
    <aside className={`platform-sidebar ${menuOpen ? "is-open" : ""}`}>
      <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">×</button>
      <div className="platform-brand"><img src="/gwl-logo.jpg" alt="Logotipo GWL" /><div><strong>GWL Flow</strong><span>Central de Automações</span></div></div>
      <Link className="back-to-nexo" href="/"><span>←</span><div><strong>GWL NEXO</strong><small>Voltar ao portal central</small></div></Link>

      <div className="nav-label">ESPAÇO DE TRABALHO</div>
      <nav className="platform-nav" aria-label="Navegação principal">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => navigate("dashboard")}><span>⌂</span><div>Visão geral<small>Painel principal</small></div></button>
        <button className={view === "library" ? "active" : ""} onClick={() => navigate("library")}><span>▦</span><div>Automações<small>Biblioteca de scripts</small></div><b>3</b></button>
        <button className={view === "processor" ? "active" : ""} onClick={() => navigate("processor")}><span>ϟ</span><div>Processamento<small>Área de execução</small></div></button>
        <button className={view === "archive" ? "active" : ""} onClick={() => navigate("archive")}><span>▣</span><div>Resultados<small>Arquivo permanente</small></div></button>
        <button className={view === "contracts" ? "active" : ""} onClick={() => navigate("contracts")}><span>☷</span><div>Contratos<small>Gestão da equipe</small></div></button>
      </nav>

      <div className="nav-label nav-label-bottom">INFORMAÇÕES</div>
      <nav className="platform-nav secondary-nav">
        <button className={view === "support" ? "active" : ""} onClick={() => navigate("support")}><span>?</span><div>Ajuda e segurança<small>Orientações de uso</small></div></button>
      </nav>

      <div className="sidebar-spacer" />
      <button className="flow-help-link" onClick={()=>navigate("support")}>Como preparar seus documentos <span>→</span></button>
      <div className="sidebar-footer"><div className="mini-avatar gwlito-avatar"><img src="/gwlito-flow.webp" alt="" /></div><div><strong>GWL Microempresa</strong><span>Ambiente corporativo</span></div><i>●</i></div>
    </aside>

    <section className="platform-main">
      <header className="platform-topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">☰</button>
        <div className="breadcrumb"><span>GWL Flow</span><b>/</b><strong>{view === "dashboard" ? "Visão geral" : view === "library" ? "Automações" : view === "processor" ? "Processamento" : view === "archive" ? "Arquivo de Resultados" : view === "contracts" ? "Contratos" : "Ajuda e segurança"}</strong></div>
        <div className="topbar-actions"><span className="online"><i /> Acesso protegido</span><button title="Ajuda" onClick={() => navigate("support")}>?</button><div className="signed-user"><span>{userName}</span><a href={signOutHref}>Sair</a></div><div className="top-avatar">GWL</div></div>
      </header>

      <div className="platform-content">
        {view === "dashboard" && <Dashboard onLibrary={() => navigate("library")} onOpen={openTool} />}
        {view === "library" && <Library items={filtered} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onOpen={openTool} />}
        {view === "processor" && <ProcessingHub active={activeTool} setActive={setActiveTool} onBack={() => navigate("library")} />}
        {view === "archive" && <ResultsArchive />}
        {view === "contracts" && <ContractsManager />}
        {view === "support" && <Support />}
      </div>
    </section>
  </main>;
}

function NexoGateway() {
  return <main className="nexo-gateway">
    <header className="nexo-header">
      <div className="nexo-brand"><img src="/gwl-nexo-logo.svg" alt="GWL NEXO" /></div>
      <div className="nexo-status">GWL Systems · Espaço de trabalho</div>
    </header>

    <section className="nexo-intro nexo-gwlito-intro">
      <div className="nexo-intro-copy">
        <span>GWL NEXO 2.0</span>
        <h1>Seu trabalho,<br /> <em>bem conectado.</em></h1>
        <p>Escolha o ambiente para continuar sua rotina.</p>
      </div>
      <aside className="nexo-gwlito-host" aria-label="GWLito, mascote oficial da GWL">
        <div className="nexo-gwlito-message"><strong>Olá, eu sou o GWLito.</strong><span>Seu guia no GWL NEXO</span></div>
        <img src="/gwlito-flow.webp" alt="GWLito, mascote oficial da GWL" />
        <i aria-hidden="true" />
      </aside>
    </section>

    <section className="nexo-options" aria-label="Escolha um sistema">
      <a className="nexo-option gwl-option" href="/gwl">
        <div className="option-visual">
          <div className="flow-orbit orbit-one" />
          <div className="flow-orbit orbit-two" />
          <img src="/gwl-logo.jpg" alt="Logotipo GWL" />
        </div>
        <div className="option-content">
          <div className="option-topline"><span>AUTOMAÇÃO DOCUMENTAL</span><i>Login obrigatório</i></div>
          <h2>GWL Flow</h2>
          <p>Área administrativa para processamento de contracheques, comprovantes, FGTS e vale-alimentação.</p>
          <div className="option-features"><span>03 automações</span><span>Gestão de contratos</span><span>Resultados</span></div>
          <strong>Acessar GWL Flow <b>→</b></strong>
        </div>
      </a>

      <a className="nexo-option ponto-option" href="/ponto-dimivig/index.html">
        <div className="option-visual">
          <div className="nexo-brand-plate">
            <img className="nexo-portal-mark" src="/dimivig-mark.svg" alt="Símbolo oficial do Ponto DIMIVIG" />
            <span>DIMIVIG</span>
            <small>PONTO DIGITAL</small>
          </div>
        </div>
        <div className="option-content">
          <div className="option-topline"><span>GESTÃO DE JORNADA</span><i>Login obrigatório</i></div>
          <h2>Ponto Dimivig</h2>
          <p>Controle de ponto eletrônico, equipes, escalas, postos de serviço e rotinas operacionais.</p>
          <div className="option-features"><span>Colaborador</span><span>Fiscal</span><span>Administrativo</span></div>
          <strong>Acessar Ponto Dimivig <b>→</b></strong>
        </div>
      </a>

      <a className="nexo-option planner-option" href="/planner">
        <div className="option-visual planner-visual">
          <img className="planner-card-logo" src="/gwl-planner-logo.png" alt="GWL Planner" />
        </div>
        <div className="option-content">
          <div className="option-topline"><span>PRODUTIVIDADE CONECTADA</span><i>Login obrigatório</i></div>
          <h2>GWL Planner</h2>
          <p>Comunicação, calendário, documentos, tarefas, lousas, notícias, pesquisa de produtos e atalhos em um só lugar.</p>
          <div className="option-features"><span>Messenger</span><span>Tarefas</span><span>Workspace</span></div>
          <strong>Acessar GWL Planner <b>→</b></strong>
        </div>
      </a>
    </section>

    <footer className="nexo-footer">
      <div><span>GWL NEXO 2.0</span><small>Ambiente integrado • Acesso seguro • Operação centralizada</small></div>
      <Link className="about-footer-button" href="/sobre-nos">Sobre nós <span>→</span></Link>
    </footer>
  </main>;
}

function Dashboard({ onLibrary, onOpen }: { onLibrary: () => void; onOpen: (id: ModuleId) => void }) {
  return <>
    <section className="welcome-banner">
      <div className="welcome-copy"><span className="section-kicker">OPERAÇÃO INTERNA GWL</span><h1>Seus documentos.<br /><em>Uma rotina mais simples.</em></h1><p>Acesso restrito para executar, conferir, arquivar e acompanhar as rotinas documentais da equipe.</p><div className="welcome-actions"><button className="btn-primary" onClick={onLibrary}>Abrir automações <span>→</span></button><button className="btn-secondary" onClick={() => onOpen("va")}>Novo processamento</button></div></div>
      <div className="workflow-stage" aria-hidden="true">
        <div className="gwlito-chip"><i /> GWLito em operação</div>
        <img className="gwlito-hero" src="/gwlito-flow.webp" alt="" />
        <div className="workflow-card"><div className="workflow-top"><span>FLUXO AUTOMATIZADO</span><i>Ativo</i></div><div className="workflow-row"><b className="file-symbol pdf">PDF</b><div><strong>Documentos de entrada</strong><small>Leitura e identificação</small></div><span>✓</span></div><div className="workflow-line"><i /><b>Processando</b><i /></div><div className="workflow-row output"><b className="file-symbol zip">OK</b><div><strong>Conferência integrada</strong><small>PDFs visíveis + relatório Excel</small></div><span>✓</span></div></div>
      </div>
    </section>

    <section className="metric-grid"><article><span className="metric-icon blue">▦</span><div><small>AUTOMAÇÕES DISPONÍVEIS</small><strong>03</strong><p>Rotinas prontas para uso</p></div></article><article><span className="metric-icon green">✓</span><div><small>STATUS DA PLATAFORMA</small><strong className="metric-word">Operacional</strong><p>Todos os módulos disponíveis</p></div></article><article><span className="metric-icon purple">⌁</span><div><small>PROCESSAMENTO</small><strong className="metric-word">Local</strong><p>Arquivos não ficam armazenados</p></div></article></section>

    <section className="dashboard-section"><div className="section-title"><div><span className="section-kicker">ACESSO RÁPIDO</span><h2>Automações em destaque</h2><p>Escolha uma rotina para iniciar o processamento.</p></div><button onClick={onLibrary}>Abrir biblioteca completa →</button></div><div className="compact-tools">{automations.map((item) => <AutomationCard key={item.id} item={item} onOpen={onOpen} compact />)}</div></section>

    <section className="dashboard-bottom"><article className="how-card"><div className="section-title"><div><span className="section-kicker">FLUXO SIMPLES</span><h2>Como funciona</h2></div></div><div className="horizontal-steps"><div><b>1</b><span><strong>Escolha</strong><small>Selecione a automação adequada.</small></span></div><i>→</i><div><b>2</b><span><strong>Adicione</strong><small>Envie os grupos de documentos.</small></span></div><i>→</i><div><b>3</b><span><strong>Confira</strong><small>Veja PDFs e o Excel no site.</small></span></div><i>→</i><div><b>4</b><span><strong>Aprove</strong><small>Salve e organize nas pastas.</small></span></div></div></article><article className="privacy-panel"><span>◇</span><div><small>PRIVACIDADE GWL</small><strong>Os documentos de entrada permanecem no navegador.</strong><p>Somente PDFs finais e relatórios escolhidos por vocês são armazenados em Resultados.</p></div></article></section>
  </>;
}

function Library({ items, query, setQuery, category, setCategory, onOpen }: { category:string;setCategory:(v:string)=>void; items: typeof automations; query: string; setQuery: (v: string) => void; onOpen: (id: ModuleId) => void }) {
  return <><section className="page-heading"><div><span className="section-kicker">BIBLIOTECA DE SCRIPTS</span><h1>Automações</h1><p>Ferramentas organizadas por finalidade, prontas para executar as rotinas da GWL.</p></div><div className="catalog-count"><strong>{automations.length}</strong><span>módulos ativos</span></div></section>
    <section className="catalog-toolbar"><label><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar por nome, categoria ou finalidade..." /></label><div>{["Todas","Financeiro","RH","Fiscal"].map(c=><button key={c} aria-pressed={category===c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div></section>
    <section className="catalog-section"><div className="catalog-header"><div><h2>Ferramentas disponíveis</h2><p>{items.length} resultado(s) encontrado(s)</p></div><span><strong>Rotinas documentais</strong></span></div><div className="catalog-grid">{items.map((item) => <AutomationCard key={item.id} item={item} onOpen={onOpen} />)}{!items.length&&<p className="flow-empty">Nenhuma automação encontrada. Tente outro termo ou selecione Todas.</p>}</div></section>
  </>;
}

function AutomationCard({ item, onOpen, compact = false }: { item: typeof automations[number]; onOpen: (id: ModuleId) => void; compact?: boolean }) {
  return <article className={`automation-card ${item.tone} ${compact ? "compact" : ""}`}><div className="automation-card-top"><div className="automation-icon">{item.code}</div><span className="status-pill"><i /> Disponível</span></div><span className="category-pill">{item.category}</span><h3>{item.title}</h3><p>{item.description}</p>{!compact && <div className="automation-meta"><div><small>ENTRADA</small><strong>{item.inputs}</strong></div><div><small>SAÍDA</small><strong>{item.output}</strong></div></div>}<button onClick={() => onOpen(item.id)}>Abrir automação <span>→</span></button></article>;
}

function ProcessingHub({ active, setActive, onBack }: { active: ModuleId; setActive: (id: ModuleId) => void; onBack: () => void }) {
  const selected = automations.find((item) => item.id === active)!;
  return <><section className="page-heading process-heading"><div><button className="back-link" onClick={onBack}>← Voltar para automações</button><span className="section-kicker">CENTRAL DE PROCESSAMENTO</span><h1>{selected.title}</h1><p>Adicione os documentos solicitados abaixo e acompanhe cada etapa.</p></div><div className="process-status"><i /> Módulo disponível</div></section>
    <div className="process-layout"><aside className="module-switcher"><span>SELECIONE O MÓDULO</span>{automations.map((item) => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><b className={item.tone}>{item.code}</b><div><strong>{item.title}</strong><small>{item.category}</small></div><i>›</i></button>)}<div className="switcher-info"><span>i</span><p>Trocar de módulo limpa os arquivos selecionados na tela atual.</p></div></aside><section className="processor-wrapper" key={active}><Processor module={active} onClose={onBack} /></section></div>
  </>;
}

function Support() { return <><section className="page-heading"><div><span className="section-kicker">CENTRAL DE AJUDA</span><h1>Uso seguro e organizado</h1><p>Orientações para obter o melhor resultado em cada processamento.</p></div></section><section className="support-grid"><article><span>01</span><h3>Prepare os arquivos</h3><p>Use documentos em PDF com texto pesquisável. PDFs apenas digitalizados podem exigir OCR antes do envio.</p></article><article><span>02</span><h3>Separe por categoria</h3><p>Adicione cada tipo de documento no campo correspondente para evitar associações incorretas.</p></article><article><span>03</span><h3>Confira antes de salvar</h3><p>Use “Visualizar e conferir” para abrir os PDFs e o relatório Excel dentro do site. Pendências aparecem destacadas no relatório.</p></article><article><span>04</span><h3>Confirme os contratos</h3><p>O sistema marca automaticamente apenas identificações de alta confiança. Revise a lista antes de concluir a competência.</p></article></section><section className="support-banner"><div><span>✓</span><div><small>DICA DO GWLITO</small><strong>Ambiente preparado para uso corporativo</strong><p>Revise os documentos antes de salvar. Assim, cada resultado permanece confiável e organizado.</p></div></div><div className="support-mascot" aria-hidden="true"><img src="/gwlito-flow.webp" alt="" /><b>GWLito</b></div></section></> }
