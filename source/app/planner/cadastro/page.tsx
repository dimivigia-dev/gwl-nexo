import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../../chatgpt-auth";
import { PLATFORM_OWNER_EMAIL } from "../../ponto-auth";
import PlannerRegister from "./planner-register";
import "../planner.css";

export const dynamic = "force-dynamic";

export default async function PlannerRegisterPage() {
  const user = await getChatGPTUser();
  const allowOtherEmail = user?.email.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
  return <PlannerRegister
    verifiedEmail={user?.email || ""}
    verifiedName={user?.fullName || user?.displayName || ""}
    verificationPath={chatGPTSignInPath("/planner/cadastro")}
    changeEmailPath={chatGPTSignOutPath("/planner/cadastro")}
    allowOtherEmail={allowOtherEmail}
  />;
}
