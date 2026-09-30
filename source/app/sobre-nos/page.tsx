import type { Metadata } from "next";
import Link from "next/link";
import "./sobre-nos.css";

export const metadata: Metadata = {
  title: "Sobre nós | GWL NEXO",
  description: "Conheça a GWL e os criadores Gustavo, Wert e Lucas.",
};

const creators = [
  {
    name: "Gustavo",
    initials: "GU",
    tone: "cyan",
    text: "Ajuda a transformar necessidades reais em ideias claras, mantendo os projetos conectados ao que as pessoas precisam no dia a dia.",
    qualities: ["Visão de produto", "Organização", "Evolução"],
  },
  {
    name: "Wert",
    initials: "WE",
    tone: "violet",
    text: "Contribui com pensamento analítico e cuidado técnico para que cada solução tenha uma estrutura sólida, prática e confiável.",
    qualities: ["Tecnologia", "Estratégia", "Qualidade"],
  },
  {
    name: "Lucas",
    initials: "LU",
    tone: "orange",
    text: "Participa da criação e do aperfeiçoamento das experiências, buscando soluções simples, bonitas e fáceis de utilizar.",
    qualities: ["Criatividade", "Experiência", "Detalhes"],
  },
];

export default function AboutPage() {
  return <main className="about-page">
    <header className="about-nav">
      <Link href="/" className="about-brand"><img src="/gwl-nexo-logo.svg" alt="GWL NEXO" /></Link>
      <Link href="/" className="about-back"><span>←</span> Voltar ao portal</Link>
    </header>

    <section className="about-hero">
      <div className="about-eyebrow"><i /> SOBRE A GWL</div>
      <h1>Três criadores.<br /><em>Uma visão compartilhada.</em></h1>
      <p>A GWL nasceu da união de Gustavo, Wert e Lucas para transformar rotinas, desafios e ideias em soluções digitais úteis, profissionais e próximas de quem realmente utiliza a tecnologia.</p>
      <div className="about-signature" aria-label="Criadores da GWL">
        <span>G</span><span>W</span><span>L</span><strong>Gustavo · Wert · Lucas</strong>
      </div>
    </section>

    <section className="about-story" aria-labelledby="nossa-historia">
      <div>
        <small>NOSSA HISTÓRIA</small>
        <h2 id="nossa-historia">Tecnologia construída a partir da realidade</h2>
      </div>
      <div className="story-copy">
        <p>A GWL desenvolve ferramentas para tornar processos complexos mais claros, rápidos e organizados. Os projetos começam pela observação de problemas reais e evoluem com planejamento, desenvolvimento e melhoria contínua.</p>
        <p>O GWL NEXO representa essa forma de trabalhar: ambientes diferentes reunidos em uma experiência central, segura e preparada para crescer junto com as necessidades da operação.</p>
      </div>
    </section>

    <section className="creator-section" aria-labelledby="criadores-title">
      <header>
        <small>QUEM CONSTRÓI</small>
        <h2 id="criadores-title">Conheça os criadores</h2>
        <p>Três perspectivas trabalhando juntas em cada projeto.</p>
      </header>
      <div className="creator-grid">
        {creators.map((creator, index) => <article className={`creator-card ${creator.tone}`} key={creator.name}>
          <div className="creator-number">0{index + 1}</div>
          <div className="creator-avatar">{creator.initials}</div>
          <span>COCRIADOR DA GWL</span>
          <h3>{creator.name}</h3>
          <p>{creator.text}</p>
          <footer>{creator.qualities.map(item => <i key={item}>{item}</i>)}</footer>
        </article>)}
      </div>
    </section>

    <section className="about-principles" aria-labelledby="principios-title">
      <div className="principles-title">
        <small>COMO TRABALHAMOS</small>
        <h2 id="principios-title">O que orienta a GWL</h2>
      </div>
      <div className="principles-list">
        <article><b>01</b><div><strong>Problemas reais primeiro</strong><p>Cada solução parte de uma necessidade concreta e deve facilitar o trabalho de quem a utiliza.</p></div></article>
        <article><b>02</b><div><strong>Construção em conjunto</strong><p>Ideias, tecnologia e experiência se conectam para chegar a resultados mais completos.</p></div></article>
        <article><b>03</b><div><strong>Melhoria contínua</strong><p>Os sistemas evoluem com aprendizado, retorno dos usuários e atenção permanente aos detalhes.</p></div></article>
      </div>
    </section>

    <footer className="about-page-footer">
      <img src="/gwl-nexo-logo.svg" alt="GWL NEXO" />
      <p>Desenvolvido por <strong>Gustavo, Wert e Lucas.</strong></p>
      <Link href="/">Acessar o GWL NEXO <span>→</span></Link>
    </footer>
  </main>;
}
