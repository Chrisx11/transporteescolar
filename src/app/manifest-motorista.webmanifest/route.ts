import { respostaManifesto } from "@/lib/manifestos";

export const dynamic = "force-static";

export function GET() {
  return respostaManifesto("motorista");
}
