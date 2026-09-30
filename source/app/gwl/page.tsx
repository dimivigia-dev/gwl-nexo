import Home from "../page";
import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function GWLFlowPage() {
  const user = await requireChatGPTUser("/gwl");
  if (user.email.trim().toLowerCase() !== "dimivigia@gmail.com") {
    return <main className="nexo-gateway"><section className="nexo-intro"><span>ACESSO ADMINISTRATIVO</span><h1>Área interna <em>GWL</em></h1><p>Esta conta não possui autorização para abrir o GWL Flow. Entre com o usuário administrativo da empresa.</p><p style={{ marginTop: 24 }}><a className="back-link" href={chatGPTSignOutPath("/gwl")}>Trocar de conta</a></p></section></main>;
  }
  return <Home initialPortal="gwl" userName={user.displayName} signOutHref={chatGPTSignOutPath("/")} />;
}
