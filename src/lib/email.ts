import "server-only";

import nodemailer from "nodemailer";

/**
 * Envio de e-mail do sistema. Dois jeitos (variáveis de ambiente):
 *  1. Gmail (ou outro SMTP) — usado quando há SMTP_USUARIO e SMTP_SENHA:
 *       SMTP_USUARIO = italvasemtransp@gmail.com
 *       SMTP_SENHA   = senha de app do Google (16 letras; não é a senha da conta)
 *       SMTP_HOST / SMTP_PORTA (opcionais; padrão smtp.gmail.com / 465)
 *     O Gmail manda até ~500 e-mails por dia.
 *  2. Resend — RESEND_API_KEY (+ EMAIL_REMETENTE com domínio verificado).
 */

export type Email = { para: string; assunto: string; html: string; texto: string };
export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

const SEM_CONFIGURACAO = "O envio de e-mail ainda não foi configurado (faltam os dados do Gmail nas configurações do site).";

const usaSmtp = () => !!(process.env.SMTP_USUARIO && process.env.SMTP_SENHA);

export function emailConfigurado(): boolean {
  return usaSmtp() || !!process.env.RESEND_API_KEY;
}

/** Quantos e-mails mandar por clique (o Gmail é mais lento e tem limite diário menor). */
export function loteDeEnvio(): number {
  return usaSmtp() ? 40 : 100;
}

function remetente() {
  if (process.env.EMAIL_REMETENTE) return process.env.EMAIL_REMETENTE;
  return usaSmtp() ? `Transporte Italva <${process.env.SMTP_USUARIO}>` : "Transporte Italva <onboarding@resend.dev>";
}

async function enviarPorSmtp(emails: Email[]): Promise<ResultadoEnvio[]> {
  const porta = Number(process.env.SMTP_PORTA || 465);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: porta,
    secure: porta === 465,
    pool: true,
    maxConnections: 3,
    auth: { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_SENHA },
  });
  try {
    return await Promise.all(
      emails.map(async (e): Promise<ResultadoEnvio> => {
        try {
          await transporte.sendMail({ from: remetente(), to: e.para, subject: e.assunto, html: e.html, text: e.texto });
          return { ok: true };
        } catch (err) {
          const msg = (err as Error).message ?? "";
          if (/Invalid login|Username and Password not accepted|535/i.test(msg)) return { ok: false, erro: "O Gmail recusou o login (confira a senha de app)." };
          if (/limit|quota|550 5.4.5/i.test(msg)) return { ok: false, erro: "O Gmail atingiu o limite de envios do dia. Tente amanhã." };
          return { ok: false, erro: "Não foi possível enviar este e-mail." };
        }
      }),
    );
  } finally {
    transporte.close();
  }
}

async function enviarPorResend(emails: Email[]): Promise<ResultadoEnvio[]> {
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

/** Envia vários e-mails e devolve o resultado de cada um, na mesma ordem. */
export async function enviarEmails(emails: Email[]): Promise<ResultadoEnvio[]> {
  if (!emailConfigurado()) return emails.map(() => ({ ok: false, erro: SEM_CONFIGURACAO }));
  return usaSmtp() ? enviarPorSmtp(emails) : enviarPorResend(emails);
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

/** Moldura comum dos e-mails (cartão branco, título e rodapé da secretaria). */
function moldura(titulo: string, corpoHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;color:#2563eb;font-weight:bold">PREFEITURA DE ITALVA</p>
<h1 style="margin:0 0 16px;font-size:22px">${titulo}</h1>
${corpoHtml}
<p style="margin:24px 0 0;font-size:12px;color:#64748b">Secretaria Municipal de Educação de Italva · Transporte Universitário</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** Pedido de passe aprovado: como entrar no app pela primeira vez. */
export function emailCadastroAprovado(nome: string, para: string, site: string): Email {
  const primeiro = nome.split(" ")[0];
  const link = `${site}/primeiro-acesso`;
  const texto =
    `Olá, ${primeiro}!\n\nSeu pedido de passe do transporte universitário foi APROVADO.\n\n` +
    `Para entrar no app pela primeira vez, abra ${link} e informe o seu CPF e os 4 últimos números do seu telefone ` +
    `(ou a data de nascimento). A primeira senha é o próprio CPF (só os números); em seguida você cria uma senha nova.\n\n` +
    `Depois, instale o app no celular (${site}/instalar) e ative as notificações para saber o seu ônibus.\n\n` +
    `Secretaria Municipal de Educação de Italva`;
  const html = moldura(
    `Passe aprovado, ${escapar(primeiro)}! 🎉`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Seu pedido de passe do transporte universitário foi <strong>aprovado</strong>.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">No primeiro acesso, informe o seu CPF e os 4 últimos números do seu telefone (ou a data de nascimento). A primeira senha é o próprio CPF, só os números. Depois você cria uma senha nova.</p>
<p style="margin:24px 0;text-align:center"><a href="${escapar(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:12px;font-size:16px">Fazer o primeiro acesso</a></p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.5">Dica: instale o app no celular (<a href="${escapar(site)}/instalar">${escapar(site)}/instalar</a>) e ative as notificações para saber qual é o seu ônibus.</p>`,
  );
  return { para, assunto: "Seu passe do transporte universitário foi aprovado", html, texto };
}

/** Pedido de passe recusado, com o motivo e como pedir de novo. */
export function emailCadastroRecusado(nome: string, para: string, motivo: string, site: string): Email {
  const primeiro = nome.split(" ")[0];
  const link = `${site}/cadastro`;
  const texto =
    `Olá, ${primeiro}!\n\nSeu pedido de passe do transporte universitário não foi aprovado.\n\nMotivo: ${motivo}\n\n` +
    `Você pode corrigir e fazer um novo pedido em ${link}. Em caso de dúvida, procure a Secretaria de Educação.\n\n` +
    `Secretaria Municipal de Educação de Italva`;
  const html = moldura(
    `Olá, ${escapar(primeiro)}`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Seu pedido de passe do transporte universitário <strong>não foi aprovado</strong>.</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5;background:#fef2f2;border-radius:12px;padding:12px 14px;color:#991b1b"><strong>Motivo:</strong> ${escapar(motivo)}</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Você pode corrigir e fazer um novo pedido:</p>
<p style="margin:24px 0;text-align:center"><a href="${escapar(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:12px;font-size:16px">Fazer novo pedido</a></p>
<p style="margin:0;font-size:13px;color:#64748b">Em caso de dúvida, procure a Secretaria de Educação.</p>`,
  );
  return { para, assunto: "Seu pedido de passe precisa de correção", html, texto };
}
