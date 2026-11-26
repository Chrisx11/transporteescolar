import "server-only";

/**
 * Envio de e-mail pelo Resend (resend.com). Configuração (variáveis de ambiente):
 *   RESEND_API_KEY  – chave da conta no Resend (obrigatória para enviar);
 *   EMAIL_REMETENTE – ex.: "Transporte Italva <transporte@italva.rj.gov.br>"
 *                     (o domínio precisa estar verificado no Resend).
 * Sem domínio verificado, o Resend só entrega no e-mail do dono da conta.
 */

export type Email = { para: string; assunto: string; html: string; texto: string };
export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

const SEM_CONFIGURACAO = "O envio de e-mail ainda não foi configurado (falta a chave do Resend nas configurações do site).";

export function emailConfigurado(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function remetente() {
  return process.env.EMAIL_REMETENTE || "Transporte Italva <onboarding@resend.dev>";
}

/** Envia vários e-mails (até 100 por chamada) e devolve o resultado de cada um, na mesma ordem. */
export async function enviarEmails(emails: Email[]): Promise<ResultadoEnvio[]> {
  if (!emailConfigurado()) return emails.map(() => ({ ok: false, erro: SEM_CONFIGURACAO }));
  const resultados: ResultadoEnvio[] = [];
  for (let i = 0; i < emails.length; i += 100) {
    const lote = emails.slice(i, i + 100);
    try {
      const r = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(lote.map((e) => ({ from: remetente(), to: [e.para], subject: e.assunto, html: e.html, text: e.texto }))),
      });
      if (r.ok) {
        resultados.push(...lote.map(() => ({ ok: true as const })));
      } else {
        const corpo = (await r.json().catch(() => ({}))) as { message?: string };
        const erro = `Resend recusou (${r.status}): ${corpo.message ?? "erro desconhecido"}`;
        resultados.push(...lote.map(() => ({ ok: false as const, erro })));
      }
    } catch {
      resultados.push(...lote.map(() => ({ ok: false as const, erro: "Sem conexão com o serviço de e-mail." })));
    }
  }
  return resultados;
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** E-mail com o link individual para completar o pedido de passe. */
export function emailCompletarPedido(nome: string, para: string, link: string, dias: number): Email {
  const primeiro = nome.split(" ")[0];
  const texto =
    `Olá, ${primeiro}!\n\n` +
    `A Prefeitura de Italva está passando o transporte universitário para um sistema novo. ` +
    `Para manter seu passe, complete seu pedido neste link (ele é só seu e vale por ${dias} dias):\n\n${link}\n\n` +
    `Você vai precisar do número do CPF e de fotos ou PDFs do documento com CPF, do comprovante de matrícula 2026 ` +
    `e do comprovante de residência.\n\n` +
    `Seus dados serão usados somente para o cadastro e a organização do transporte universitário.\n\n` +
    `Secretaria Municipal de Educação de Italva`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;color:#2563eb;font-weight:bold">PREFEITURA DE ITALVA</p>
<h1 style="margin:0 0 16px;font-size:22px">Olá, ${escapar(primeiro)}!</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">O transporte universitário está passando para um sistema novo. Para manter seu passe, complete seu pedido pelo botão abaixo. O link é só seu e vale por ${dias} dias.</p>
<p style="margin:24px 0;text-align:center"><a href="${escapar(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:12px;font-size:16px">Completar meu pedido</a></p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5">Tenha em mãos:</p>
<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6">
<li>o número do seu CPF;</li>
<li>foto ou PDF do documento com CPF (CPF, RG ou CNH);</li>
<li>comprovante de matrícula 2026;</li>
<li>comprovante de residência (luz, água, telefone ou internet).</li>
</ul>
<p style="margin:0 0 16px;font-size:12px;color:#64748b;line-height:1.5">Se o botão não abrir, copie este endereço no navegador:<br>${escapar(link)}</p>
<p style="margin:0;font-size:12px;color:#64748b">Seus dados serão usados somente para o cadastro e a organização do transporte universitário.<br>Secretaria Municipal de Educação de Italva</p>
</td></tr></table></td></tr></table></body></html>`;
  return { para, assunto: "Complete seu pedido de passe do transporte universitário", html, texto };
}
