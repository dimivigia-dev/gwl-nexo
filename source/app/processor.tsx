"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildReportFile,
  editPdf,
  GeneratedFile,
  insertPdfPage,
  ModuleId,
  pdfPageCount,
  processDocuments,
  rebuildPackage,
  ReceiptCandidate,
} from "../lib/document-engine";

const configs: Record<
  ModuleId,
  {
    title: string;
    subtitle: string;
    groups: Array<{ id: string; label: string; help: string }>;
  }
> = {
  va: {
    title: "Vale-Alimentação",
    subtitle:
      "Associa pelo valor exato do benefício e confere pedido e contrato. Ordem: Nota Fiscal → Nota de Débito → Relatório.",
    groups: [
      {
        id: "nfse",
        label: "Notas fiscais",
        help: "Adicione as notas fiscais completas, incluindo todas as páginas.",
      },
      {
        id: "debito",
        label: "Notas de débito",
        help: "Adicione as notas de débito com o valor do benefício/total.",
      },
      {
        id: "relatorio",
        label: "Relatórios",
        help: "Adicione os relatórios com valor do benefício, pedido e contrato. Use um documento por PDF, com todas as suas páginas.",
      },
    ],
  },
  fgts: {
    title: "FGTS",
    subtitle:
      "Relaciona contratos e gera os PDFs na ordem Demonstrativo, Guia e Comprovante.",
    groups: [
      {
        id: "demonstrativo",
        label: "Demonstrativos",
        help: "Selecione os demonstrativos de cada contrato.",
      },
      {
        id: "guia",
        label: "Guias do FGTS",
        help: "Adicione as guias correspondentes.",
      },
      {
        id: "comprovante",
        label: "Comprovantes",
        help: "Pode ser um PDF consolidado com várias páginas.",
      },
    ],
  },
  cc: {
    title: "Contracheque + Comprovante",
    subtitle:
      "Localiza os colaboradores e organiza cada contracheque primeiro, seguido do respectivo comprovante.",
    groups: [
      {
        id: "contracheque",
        label: "Contracheques",
        help: "Selecione PDFs individuais ou consolidados.",
      },
      {
        id: "comprovante",
        label: "Comprovantes",
        help: "Selecione PDFs individuais ou consolidados.",
      },
    ],
  },
};

export default function Processor({
  module,
  onClose,
}: {
  module: ModuleId;
  onClose: () => void;
}) {
  const config = configs[module];
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    name: string;
    url: string;
    blob: Blob;
    total: number;
    pending: number;
    report: string[];
    reportRows: Array<Record<string, string>>;
    contractHints: string[];
    generatedFiles: GeneratedFile[];
    receiptCandidates: ReceiptCandidate[];
  } | null>(null);
  const [error, setError] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const ready = useMemo(
    () => config.groups.every((g) => (files[g.id]?.length || 0) > 0),
    [config, files],
  );
  const addFiles = (groupId: string, list: FileList | null) => {
    const incoming = Array.from(list || []).filter(
      (file) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"),
    );
    setFiles((old) => {
      const combined = [...(old[groupId] || []), ...incoming];
      const unique = combined.filter(
        (file, index) =>
          combined.findIndex(
            (other) =>
              `${other.webkitRelativePath || other.name}:${other.size}:${other.lastModified}` ===
              `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`,
          ) === index,
      );
      return { ...old, [groupId]: unique };
    });
  };
  const run = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    setSaved(false);
    setProgress(18);
    try {
      const timer = window.setInterval(
        () => setProgress((p) => Math.min(88, p + 7)),
        450,
      );
      const out = await processDocuments(module, files);
      window.clearInterval(timer);
      setProgress(100);
      setResult({ ...out, blob: out.blob, url: URL.createObjectURL(out.blob) });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível processar os documentos.",
      );
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="processor-panel">
      <div className="processor-head">
        <div>
          <span>ÁREA DE PROCESSAMENTO</span>
          <h2>{config.title}</h2>
          <p>{config.subtitle}</p>
        </div>
        <button onClick={onClose} aria-label="Fechar processamento">
          ×
        </button>
      </div>
      <div className="upload-grid">
        {config.groups.map((group, index) =>
          module === "cc" && group.id === "contracheque" ? (
            <div
              className={`upload-box folder-enabled ${files[group.id]?.length ? "has-files" : ""}`}
              key={group.id}
            >
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span className="upload-icon">⇧</span>
              <strong>{group.label}</strong>
              <small>
                Adicione PDFs avulsos ou uma pasta completa com subpastas.
              </small>
              <div className="upload-options">
                <label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    onChange={(e) => addFiles(group.id, e.target.files)}
                  />
                  <span>Selecionar PDFs</span>
                </label>
                <label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    {...({
                      webkitdirectory: "",
                      directory: "",
                    } as React.InputHTMLAttributes<HTMLInputElement>)}
                    onChange={(e) => addFiles(group.id, e.target.files)}
                  />
                  <span>Selecionar pasta</span>
                </label>
              </div>
              <em>
                {files[group.id]?.length
                  ? `${files[group.id].length} PDF(s) carregado(s)`
                  : "Nenhum contracheque selecionado"}
              </em>
            </div>
          ) : (
            <label
              className={`upload-box ${files[group.id]?.length ? "has-files" : ""}`}
              key={group.id}
            >
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={(e) =>
                  setFiles((old) => ({
                    ...old,
                    [group.id]: Array.from(e.target.files || []),
                  }))
                }
              />
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span className="upload-icon">⇧</span>
              <strong>{group.label}</strong>
              <small>{group.help}</small>
              <em>
                {files[group.id]?.length
                  ? `${files[group.id].length} arquivo(s) selecionado(s)`
                  : "Clique para selecionar PDFs"}
              </em>
            </label>
          ),
        )}
      </div>
      <div className="local-note">
        <span>🔒</span>
        <p>
          <strong>Processamento no próprio navegador</strong> — os documentos
          não ficam armazenados no portal.
        </p>
      </div>
      {busy && (
        <div className="progress-area">
          <div>
            <span>Organizando documentos...</span>
            <b>{progress}%</b>
          </div>
          <i>
            <span style={{ width: `${progress}%` }} />
          </i>
          <small>
            Arquivos maiores ou digitalizados podem levar alguns minutos.
          </small>
        </div>
      )}
      {error && (
        <div className="error-message">
          <strong>Não foi possível concluir.</strong>
          <span>{error}</span>
        </div>
      )}
      {result && (
        <div className="result-area">
          <div className="success-check">✓</div>
          <div>
            <strong>Processamento concluído</strong>
            <p>
              {result.total} PDF(s) gerado(s), {result.pending} pendência(s) e
              relatório Excel pronto. Revise tudo dentro do site antes de
              salvar.
            </p>
          </div>
          <div className="result-buttons">
            <button onClick={() => setShowReview(true)}>
              Visualizar e conferir
            </button>
            <a href={result.url} download={result.name}>
              Baixar pacote ↓
            </a>
            <button
              className={saved ? "saved" : ""}
              onClick={() => setShowSave(true)}
            >
              {saved ? "✓ Resultados salvos" : "Salvar PDFs + Excel"}
            </button>
          </div>
        </div>
      )}
      <div className="processor-actions">
        <button
          className="secondary-button"
          onClick={() => {
            setFiles({});
            setResult(null);
            setProgress(0);
            setSaved(false);
          }}
        >
          Limpar
        </button>
        <button
          className="primary-button"
          disabled={!ready || busy}
          onClick={run}
        >
          {busy ? "Processando..." : "Processar documentos"}
        </button>
      </div>
      {showSave && result && (
        <SaveResultModal
          module={module}
          file={result}
          busy={saveBusy}
          setBusy={setSaveBusy}
          close={() => setShowSave(false)}
          saved={() => {
            setSaved(true);
            setShowSave(false);
          }}
          setError={setError}
        />
      )}
      {showReview && result && (
        <ProcessReviewModal
          module={module}
          files={result.generatedFiles}
          rows={result.reportRows}
          candidates={result.receiptCandidates}
          close={() => setShowReview(false)}
          onFilesChange={async (changedFiles, changedRows) => {
            const reportFile = buildReportFile(
              module,
              changedRows,
              result.report,
            );
            const generatedFiles = [
              ...changedFiles.filter(
                (f) => f.contentType === "application/pdf",
              ),
              reportFile,
            ];
            const blob = await rebuildPackage(
              module,
              generatedFiles,
              changedRows,
              result.report,
            );
            URL.revokeObjectURL(result.url);
            setResult({
              ...result,
              generatedFiles,
              reportRows: changedRows,
              pending: changedRows.filter((r) =>
                String(r.Status).startsWith("Pendente"),
              ).length,
              blob,
              url: URL.createObjectURL(blob),
            });
            setSaved(false);
          }}
        />
      )}
    </div>
  );
}

type ContractOption = { id: number; name: string; responsible: string };
const normalizeMatch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
const contractIgnored = new Set([
  "CONTRATO",
  "UNIDADE",
  "EMPRESA",
  "SERVICO",
  "SERVICOS",
  "VIGILANCIA",
  "SEGURANCA",
  "LTDA",
  "EIRELI",
  "DE",
  "DA",
  "DO",
  "DAS",
  "DOS",
  "E",
]);
const contractAliases: Record<string, string[]> = {
  UFG: ["UNIVERSIDADE FEDERAL DE GOIAS"],
  HEMO: ["HEMOCENTRO"],
  TST: ["TRIBUNAL SUPERIOR DO TRABALHO"],
  TRT: ["TRIBUNAL REGIONAL DO TRABALHO"],
  OAB: ["ORDEM DOS ADVOGADOS DO BRASIL"],
  SEDUC: ["SECRETARIA DE ESTADO DA EDUCACAO"],
  UFCAT: ["UNIVERSIDADE FEDERAL DE CATALAO"],
  UNIRV: ["UNIVERSIDADE DE RIO VERDE"],
  HGG: ["HOSPITAL ESTADUAL DR ALBERTO RASSI"],
};
const contractWords = (v: string) =>
  normalizeMatch(v)
    .split(" ")
    .filter((x) => x.length > 1 && !contractIgnored.has(x));
function contractScore(name: string, hints: string[]) {
  const target = normalizeMatch(name),
    tw = contractWords(name);
  if (!tw.length) return 0;
  let best = 0;
  for (const raw of hints) {
    const base = normalizeMatch(raw);
    const baseWords = contractWords(base);
    const expanded = normalizeMatch(
      [base, ...baseWords.flatMap((w) => contractAliases[w] || [])].join(" "),
    );
    const ew = contractWords(expanded);
    if (tw.length === 1) {
      const only = tw[0];
      if (ew.includes(only)) best = Math.max(best, 1);
      continue;
    }
    if (` ${expanded} `.includes(` ${target} `)) best = Math.max(best, 1);
    const acronym = tw
      .filter((x) => x.length > 2)
      .map((x) => x[0])
      .join("");
    if (acronym.length >= 3 && ew.includes(acronym))
      best = Math.max(best, 0.96);
    const hits = tw.filter((x) =>
      ew.some(
        (y) =>
          x === y ||
          (x.length >= 5 && y.startsWith(x)) ||
          (y.length >= 5 && x.startsWith(y)),
      ),
    );
    const coverage = hits.length / tw.length;
    if (coverage === 1 && hits.length >= 2) best = Math.max(best, 0.92);
    else if (coverage >= 0.75 && hits.length >= 2) best = Math.max(best, 0.84);
  }
  return best;
}
function detectsContract(name: string, hints: string[]) {
  return contractScore(name, hints) >= 0.84;
}

function SaveResultModal({
  module,
  file,
  busy,
  setBusy,
  close,
  saved,
  setError,
}: {
  module: ModuleId;
  file: {
    name: string;
    blob: Blob;
    contractHints: string[];
    generatedFiles: GeneratedFile[];
  };
  busy: boolean;
  setBusy: (v: boolean) => void;
  close: () => void;
  saved: () => void;
  setError: (v: string) => void;
}) {
  const now = new Date();
  const initial = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(initial);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [actor, setActor] = useState("Gustavo");
  const [markDone, setMarkDone] = useState(true);
  const [query, setQuery] = useState("");
  const [uploadId] = useState(() => crypto.randomUUID());
  const [savedIndexes, setSavedIndexes] = useState<number[]>([]);
  const [failedIndexes, setFailedIndexes] = useState<number[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  useEffect(() => {
    fetch(`/api/contracts?month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        const list: ContractOption[] = d.contracts || [];
        setContracts(list);
        setSelected(
          list
            .filter((c) => detectsContract(c.name, file.contractHints))
            .map((c) => c.id),
        );
      })
      .catch(() => {
        setContracts([]);
        setSelected([]);
      });
  }, [month, file.contractHints]);
  const visible = contracts.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );
  const toggle = (id: number) =>
    setSelected((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
    );
  async function uploadOne(index: number) {
    const generated = file.generatedFiles[index];
    const isPdf = generated.contentType === "application/pdf";
    const matchedIds = isPdf
      ? contracts
          .filter((c) =>
            detectsContract(c.name, [
              generated.name,
              generated.contractHint || "",
            ]),
          )
          .map((c) => c.id)
      : [];
    const q = new URLSearchParams({
      contractIds: matchedIds.join(","),
      markContractIds: index === 0 ? selected.join(",") : "",
      module,
      month,
      actor,
      fileName: generated.name,
      markDone: markDone && index === 0 ? "1" : "0",
      uploadId,
      uploadIndex: String(index),
    });
    const r = await fetch(`/api/results?${q}`, {
      method: "POST",
      headers: { "content-type": generated.contentType },
      body: generated.blob,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `Falha ao salvar ${generated.name}`);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaveMessage("");
    try {
      if (!file.generatedFiles.length)
        throw new Error("Nenhum PDF final foi gerado.");
      let pending = (
        failedIndexes.length
          ? failedIndexes
          : file.generatedFiles.map((_, i) => i)
      ).filter((i) => !savedIndexes.includes(i));
      const completed = new Set(savedIndexes);
      let failures: number[] = [];
      for (let attempt = 0; attempt < 3 && pending.length; attempt++) {
        let cursor = 0;
        failures = [];
        const workers = Array.from(
          { length: Math.min(4, pending.length) },
          async () => {
            while (cursor < pending.length) {
              const index = pending[cursor++];
              try {
                await uploadOne(index);
                completed.add(index);
                setSavedIndexes(Array.from(completed));
              } catch {
                failures.push(index);
              }
            }
          },
        );
        await Promise.all(workers);
        pending = [...failures];
        if (pending.length && attempt < 2)
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * (attempt + 1)),
          );
      }
      setFailedIndexes(failures);
      if (!failures.length) {
        setSaveMessage(
          `${completed.size} de ${file.generatedFiles.length} PDFs salvos com sucesso.`,
        );
        window.setTimeout(saved, 500);
      } else {
        setSaveMessage(
          `${completed.size} de ${file.generatedFiles.length} PDFs salvos. ${failures.length} ainda precisam ser reenviados.`,
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível salvar os PDFs.",
      );
    } finally {
      setBusy(false);
    }
  }
  const remaining = file.generatedFiles.length - savedIndexes.length;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <form className="save-result-modal batch-modal" onSubmit={submit}>
        <header>
          <div>
            <span>RESULTADOS INDIVIDUAIS</span>
            <h2>Salvar PDFs e relatório</h2>
            <p>
              Os PDFs e o relatório Excel ficam separados e disponíveis para
              visualização no site. O envio confirma cada item antes de
              concluir.
            </p>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </header>
        <div className="saved-file-preview">
          <b>OK</b>
          <div>
            <strong>
              {file.generatedFiles.length} arquivo(s): PDF + Excel
            </strong>
            <small>{configs[module].title} · arquivos individuais</small>
          </div>
          <i>
            {busy
              ? `${savedIndexes.length}/${file.generatedFiles.length}`
              : "✓ Prontos"}
          </i>
        </div>
        {(busy || savedIndexes.length > 0) && (
          <div className="save-progress">
            <div>
              <span>
                {busy ? "Salvando resultados..." : "Progresso do salvamento"}
              </span>
              <b>
                {savedIndexes.length} de {file.generatedFiles.length}
              </b>
            </div>
            <i>
              <span
                style={{
                  width: `${file.generatedFiles.length ? (savedIndexes.length / file.generatedFiles.length) * 100 : 0}%`,
                }}
              />
            </i>
            {saveMessage && (
              <small className={failedIndexes.length ? "warning" : "success"}>
                {saveMessage}
              </small>
            )}
          </div>
        )}
        <div className="batch-fields">
          <label>
            Competência
            <input
              required
              type="month"
              value={month}
              disabled={busy || savedIndexes.length > 0}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <label>
            Salvo por
            <select
              value={actor}
              disabled={busy || savedIndexes.length > 0}
              onChange={(e) => setActor(e.target.value)}
            >
              <option>Gustavo</option>
              <option>Wert</option>
              <option>Lucas</option>
            </select>
          </label>
        </div>
        <section className="detected-contracts">
          <div className="detected-title">
            <div>
              <strong>Contratos identificados com alta confiança</strong>
              <small>
                <b>{selected.length}</b> selecionado(s) — coincidências fracas
                não são marcadas
              </small>
            </div>
            <label>
              <span>⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Localizar contrato..."
              />
            </label>
          </div>
          <div className="contract-check-list">
            {visible.length === 0 ? (
              <p>Nenhum contrato cadastrado encontrado.</p>
            ) : (
              visible.map((c) => (
                <label
                  key={c.id}
                  className={selected.includes(c.id) ? "checked" : ""}
                >
                  <input
                    type="checkbox"
                    disabled={busy || savedIndexes.length > 0}
                    checked={selected.includes(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <span>
                    <strong>{c.name}</strong>
                    <small>Responsável: {c.responsible}</small>
                  </span>
                  <i>{selected.includes(c.id) ? "✓" : ""}</i>
                </label>
              ))
            )}
          </div>
          <p className="detection-note">
            <span>✦</span>
            <b>Revisão obrigatória:</b> confira a seleção. Quando não houver
            evidência segura, o sistema deixa desmarcado em vez de adivinhar.
          </p>
        </section>
        <label
          className={`mark-done-check ${selected.length === 0 ? "disabled" : ""}`}
        >
          <input
            type="checkbox"
            checked={markDone && selected.length > 0}
            disabled={selected.length === 0 || busy || savedIndexes.length > 0}
            onChange={(e) => setMarkDone(e.target.checked)}
          />
          <span>
            <strong>
              Marcar {selected.length || "os"} contrato(s) como concluído(s)
            </strong>
            <small>
              Atualiza somente a etapa de {configs[module].title} nesta
              competência.
            </small>
          </span>
        </label>
        <footer>
          <button type="button" disabled={busy} onClick={close}>
            Cancelar
          </button>
          <button className="primary-button" disabled={busy || remaining === 0}>
            {busy
              ? `Salvando ${savedIndexes.length} de ${file.generatedFiles.length}...`
              : failedIndexes.length
                ? `Tentar novamente ${failedIndexes.length} arquivo(s)`
                : `Salvar ${remaining} arquivo(s) nos Resultados`}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ProcessReviewModal({
  module,
  files,
  rows,
  candidates,
  close,
  onFilesChange,
}: {
  module: ModuleId;
  files: GeneratedFile[];
  rows: Array<Record<string, string>>;
  candidates: ReceiptCandidate[];
  close: () => void;
  onFilesChange: (
    files: GeneratedFile[],
    rows: Array<Record<string, string>>,
  ) => Promise<void>;
}) {
  const pdfEntries = files
    .map((file, index) => ({ file, index }))
    .filter((x) => x.file.contentType === "application/pdf");
  const pdfs = pdfEntries.map((x) => x.file);
  const [tab, setTab] = useState<"pdf" | "report" | "correct">(
    module === "cc" && rows.some((r) => String(r.Status).startsWith("Pendente"))
      ? "correct"
      : pdfs.length
        ? "pdf"
        : "report",
  );
  const [selected, setSelected] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [urls, setUrls] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState(0);
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const [history, setHistory] = useState<
    Array<{ files: GeneratedFile[]; rows: Array<Record<string, string>> }>
  >([]);
  useEffect(() => {
    const next = pdfs.map((f) => URL.createObjectURL(f.blob));
    setUrls(next);
    return () => next.forEach(URL.revokeObjectURL);
  }, [files]);
  useEffect(() => {
    const file = pdfs[selected];
    if (!file) return;
    pdfPageCount(file.blob).then((count) => {
      setPages(count);
      setPage((old) => Math.min(old, count));
    });
  }, [files, selected]);
  async function apply(
    action: "rotate-left" | "rotate-right" | "delete" | "up" | "down",
  ) {
    const entry = pdfEntries[selected];
    if (!entry) return;
    setEditing(true);
    setEditMessage("");
    try {
      const blob = await editPdf(entry.file.blob, page - 1, action);
      const next = files.map((f, i) =>
        i === entry.index ? { ...f, blob } : f,
      );
      setHistory((h) => [...h, { files, rows }]);
      await onFilesChange(next, rows);
      const count = await pdfPageCount(blob);
      setPages(count);
      setPage(
        Math.max(
          1,
          Math.min(
            action === "down" ? page + 1 : action === "up" ? page - 1 : page,
            count,
          ),
        ),
      );
      setEditMessage("Alteração aplicada ao PDF e ao pacote final.");
    } catch (e) {
      setEditMessage(
        e instanceof Error ? e.message : "Não foi possível editar a página.",
      );
    } finally {
      setEditing(false);
    }
  }
  const pendingRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => String(row.Status).startsWith("Pendente"));
  const current =
    pendingRows[Math.min(selectedRow, Math.max(0, pendingRows.length - 1))];
  const norm = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  const filtered = candidates
    .filter(
      (c) =>
        !query ||
        norm(
          `${c.name} ${c.cpf} ${c.account} ${c.value} ${c.file.name} ${c.page + 1} ${c.text}`,
        ).includes(norm(query)),
    )
    .slice(0, 250);
  const candidate =
    filtered[Math.min(selectedCandidate, Math.max(0, filtered.length - 1))];
  const candidateUrl = useMemo(
    () => (candidate ? URL.createObjectURL(candidate.file) : ""),
    [candidate],
  );
  useEffect(
    () => () => {
      if (candidateUrl) URL.revokeObjectURL(candidateUrl);
    },
    [candidateUrl],
  );
  async function insertReceipt() {
    if (!current || !candidate) return;
    const outputName = current.row["Arquivo final"];
    const fileIndex = files.findIndex((f) => f.name === outputName);
    if (fileIndex < 0)
      return setEditMessage("PDF final da empresa não foi encontrado.");
    setEditing(true);
    setEditMessage("");
    try {
      const payrollPage = Number(current.row["Página do contracheque"]);
      const blob = await insertPdfPage(
        files[fileIndex].blob,
        payrollPage - 1,
        candidate.file,
        candidate.page,
      );
      const nextFiles = files.map((f, i) =>
        i === fileIndex ? { ...f, blob } : f,
      );
      const nextRows = rows.map((r, i) => {
        if (i === current.index)
          return {
            ...r,
            Comprovante: `${candidate.file.name} — pág. ${candidate.page + 1}`,
            Critério: "Selecionado manualmente",
            Confiança: "Revisado",
            Origem: "Correção manual",
            Status: "Finalizado",
          };
        if (
          r["Arquivo final"] === outputName &&
          Number(r["Página do contracheque"]) > payrollPage
        )
          return {
            ...r,
            "Página do contracheque": String(
              Number(r["Página do contracheque"]) + 1,
            ),
          };
        return r;
      });
      setHistory((h) => [...h, { files, rows }]);
      await onFilesChange(nextFiles, nextRows);
      setSelectedRow(
        Math.min(selectedRow, Math.max(0, pendingRows.length - 2)),
      );
      setEditMessage(
        "Comprovante inserido logo após o contracheque e relatório atualizado.",
      );
    } catch (e) {
      setEditMessage(
        e instanceof Error
          ? e.message
          : "Não foi possível inserir o comprovante.",
      );
    } finally {
      setEditing(false);
    }
  }
  async function markAbsent() {
    if (!current) return;
    const next = rows.map((r, i) =>
      i === current.index
        ? {
            ...r,
            Origem: "Revisão manual",
            Critério: "Ausência confirmada",
            Status: "Ausente confirmado",
          }
        : r,
    );
    setHistory((h) => [...h, { files, rows }]);
    await onFilesChange(files, next);
    setEditMessage("Ausência registrada no relatório.");
  }
  async function markNoReceipt() {
    if (!current) return;
    const next = rows.map((r, i) =>
      i === current.index
        ? {
            ...r,
            Comprovante: "Não existe comprovante",
            Origem: "Revisão manual",
            Critério: "Pagamento sem comprovante — valor zero ou não aplicável",
            Confiança: "Revisado",
            Status: "Não existe comprovante",
          }
        : r,
    );
    setHistory((h) => [...h, { files, rows }]);
    await onFilesChange(files, next);
    setEditMessage("Registrado: este pagamento não possui comprovante.");
  }
  async function undo() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setEditing(true);
    await onFilesChange(previous.files, previous.rows);
    setHistory((h) => h.slice(0, -1));
    setEditing(false);
    setEditMessage("Última correção desfeita.");
  }
  return (
    <div className="modal-backdrop">
      <div className="review-modal correction-modal">
        <header>
          <div>
            <span>CONFERÊNCIA E EDIÇÃO ANTES DE SALVAR</span>
            <h2>{configs[module].title}</h2>
            <p>
              Visualize, corrija páginas dos PDFs e confira o relatório sem
              baixar.
            </p>
          </div>
          <button onClick={close}>×</button>
        </header>
        <nav>
          {module === "cc" && (
            <button
              className={tab === "correct" ? "active" : ""}
              onClick={() => setTab("correct")}
            >
              Corrigir pendências ({pendingRows.length})
            </button>
          )}
          <button
            className={tab === "pdf" ? "active" : ""}
            onClick={() => setTab("pdf")}
          >
            PDFs ({pdfs.length})
          </button>
          <button
            className={tab === "report" ? "active" : ""}
            onClick={() => setTab("report")}
          >
            Relatório Excel ({rows.length} linhas)
          </button>
          {history.length > 0 && (
            <button className="undo-review" disabled={editing} onClick={undo}>
              ↶ Desfazer
            </button>
          )}
        </nav>
        {tab === "correct" ? (
          <div className="correction-workspace">
            <aside>
              <h3>Pendências</h3>
              {pendingRows.length ? (
                pendingRows.map(({ row }, i) => (
                  <button
                    className={i === selectedRow ? "active" : ""}
                    key={`${row.Empresa}-${row.Colaborador}-${i}`}
                    onClick={() => {
                      setSelectedRow(i);
                      setEditMessage("");
                    }}
                  >
                    <strong>{row.Colaborador}</strong>
                    <small>{row.Empresa}</small>
                    <span>CPF {row.CPF || "não identificado"}</span>
                  </button>
                ))
              ) : (
                <div className="all-correct">
                  ✓<strong>Tudo conferido</strong>
                  <span>Não há comprovantes pendentes.</span>
                </div>
              )}
            </aside>
            <section className="ready-preview">
              <div>
                <strong>Arquivo pronto</strong>
                <span>
                  {current?.row["Arquivo final"] || "Selecione uma pendência"}
                </span>
              </div>
              {current &&
                (() => {
                  const i = pdfs.findIndex(
                    (f) => f.name === current.row["Arquivo final"],
                  );
                  return i >= 0 && urls[i] ? (
                    <iframe
                      title="Arquivo pronto"
                      src={`${urls[i]}#page=${current.row["Página do contracheque"]}`}
                    />
                  ) : (
                    <p>Arquivo não localizado.</p>
                  );
                })()}
            </section>
            <section className="receipt-search">
              <div className="search-head">
                <strong>Localizar comprovante</strong>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedCandidate(0);
                  }}
                  placeholder="Nome, CPF, conta, valor ou página..."
                />
                <small>{filtered.length} página(s) encontrada(s)</small>
              </div>
              <div className="candidate-list">
                {filtered.slice(0, 40).map((c, i) => (
                  <button
                    className={i === selectedCandidate ? "active" : ""}
                    key={`${c.file.name}-${c.page}`}
                    onClick={() => setSelectedCandidate(i)}
                  >
                    <strong>{c.name || "Nome não extraído"}</strong>
                    <span>{c.cpf || c.account || c.value || c.file.name}</span>
                    <small>
                      {c.file.name} · pág. {c.page + 1}
                    </small>
                  </button>
                ))}
              </div>
              {candidateUrl && (
                <iframe
                  title="Comprovante selecionado"
                  src={`${candidateUrl}#page=${candidate.page + 1}`}
                />
              )}
              <div className="correction-actions">
                <button
                  disabled={!current || !candidate || editing}
                  onClick={insertReceipt}
                >
                  Inserir após contracheque
                </button>
                <button
                  className="secondary"
                  disabled={!current || editing}
                  onClick={markAbsent}
                >
                  Confirmar que está ausente
                </button>
                <button
                  className="no-receipt"
                  disabled={!current || editing}
                  onClick={markNoReceipt}
                >
                  Não existe comprovante
                </button>
              </div>
              {editMessage && (
                <p className="correction-message">{editMessage}</p>
              )}
            </section>
          </div>
        ) : tab === "pdf" ? (
          <div className="pdf-review">
            <aside>
              {pdfs.map((f, i) => (
                <button
                  className={selected === i ? "active" : ""}
                  key={f.name}
                  onClick={() => {
                    setSelected(i);
                    setPage(1);
                    setEditMessage("");
                  }}
                >
                  <b>PDF</b>
                  <span>{f.name}</span>
                </button>
              ))}
            </aside>
            <main>
              <div className="pdf-editor-bar">
                <span>
                  Página{" "}
                  <input
                    type="number"
                    min="1"
                    max={pages}
                    value={page}
                    onChange={(e) =>
                      setPage(
                        Math.max(
                          1,
                          Math.min(pages, Number(e.target.value) || 1),
                        ),
                      )
                    }
                  />{" "}
                  de {pages}
                </span>
                <button
                  disabled={editing || page <= 1}
                  onClick={() => apply("up")}
                >
                  ↑ Mover
                </button>
                <button
                  disabled={editing || page >= pages}
                  onClick={() => apply("down")}
                >
                  ↓ Mover
                </button>
                <button disabled={editing} onClick={() => apply("rotate-left")}>
                  ↶ Girar
                </button>
                <button
                  disabled={editing}
                  onClick={() => apply("rotate-right")}
                >
                  ↷ Girar
                </button>
                <button
                  className="danger"
                  disabled={editing || pages <= 1}
                  onClick={() => apply("delete")}
                >
                  Excluir página
                </button>
                {editMessage && <small>{editMessage}</small>}
              </div>
              {urls[selected] ? (
                <iframe
                  key={`${urls[selected]}-${page}`}
                  title={pdfs[selected]?.name || "PDF"}
                  src={`${urls[selected]}#page=${page}`}
                />
              ) : (
                <p>Nenhum PDF gerado.</p>
              )}
            </main>
          </div>
        ) : (
          <ReportTable rows={rows} />
        )}
        <footer>
          <button className="primary-button" onClick={close}>
            Conferência concluída
          </button>
        </footer>
      </div>
    </div>
  );
}

function ReportTable({ rows }: { rows: Array<Record<string, string>> }) {
  const columns = Object.keys(rows[0] || { Status: "" });
  return (
    <div className="report-view">
      <div className="report-summary">
        <strong>{rows.length} registro(s)</strong>
        <span>
          {rows.filter((r) => String(r.Status).startsWith("Pendente")).length}{" "}
          pendência(s)
        </span>
      </div>
      <div className="report-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={
                  String(row.Status).startsWith("Pendente") ? "pending" : ""
                }
              >
                {columns.map((c) => (
                  <td key={c}>{row[c]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
