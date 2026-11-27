import "server-only";
import webpush from "web-push";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Notificações no celular (Web Push). O banco grava o aviso em `notificacoes`
 * e chama /api/push/enviar; aqui os pendentes viram notificação em cada
 * celular inscrito (`push_inscricoes`). As chaves VAPID ficam no banco
 * (`config_privada`, só o servidor lê) e são criadas no primeiro uso.
 */

type Chaves = { publica: string; privada: string };
let chavesEmMemoria: Chaves | null = null;

export async function chavesVapid(): Promise<Chaves> {
  if (chavesEmMemoria) return chavesEmMemoria;
  const admin = criarClienteAdmin();
  const ler = async () => {
    const { data } = await admin.from("config_privada").select("chave, valor").in("chave", ["vapid_publica", "vapid_privada"]);
    const m = new Map((data ?? []).map((l) => [l.chave as string, l.valor as string]));
    const publica = m.get("vapid_publica");
    const privada = m.get("vapid_privada");
    return publica && privada ? { publica, privada } : null;
  };
  let chaves = await ler();
  if (!chaves) {
    const novas = webpush.generateVAPIDKeys();
    // Se dois pedidos criarem ao mesmo tempo, fica o par que chegou primeiro.
    await admin.from("config_privada").upsert(
      [
        { chave: "vapid_publica", valor: novas.publicKey },
        { chave: "vapid_privada", valor: novas.privateKey },
      ],
      { onConflict: "chave", ignoreDuplicates: true },
    );
    chaves = await ler();
  }
  if (!chaves) throw new Error("Não foi possível preparar as chaves de notificação.");
  chavesEmMemoria = chaves;
  return chaves;
}

/** Confere o segredo que o banco manda ao chamar o envio. */
export async function segredoConfere(recebido: string | null): Promise<boolean> {
  if (!recebido) return false;
  const { data } = await criarClienteAdmin().from("config_privada").select("valor").eq("chave", "push_segredo").maybeSingle();
  const esperado = data?.valor as string | undefined;
  if (!esperado || esperado.length !== recebido.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}

type Pendente = {
  id: number;
  usuario_id: string;
  evento: string;
  titulo: string;
  conteudo: string | null;
  referencia: Record<string, unknown> | null;
  perfil: string;
};

/** Para onde a notificação leva ao ser tocada, e qual substitui a anterior (tag). */
function destino(n: Pendente): { url: string; tag: string } {
  const ref = n.referencia ?? {};
  if (n.perfil === "motorista") return { url: "/app/motorista", tag: `${n.evento}-${ref.viagem_dia_id ?? n.id}` };
  switch (n.evento) {
    case "onibus_no_ponto":
      return { url: "/app", tag: `ponto-${ref.viagem_dia_id ?? n.id}` };
    case "lembrete_reserva":
      return { url: "/app", tag: `lembrete-${ref.data ?? ""}-${ref.sentido ?? ""}` };
    case "onibus_atribuido":
    case "onibus_alterado":
      return { url: "/app", tag: `onibus-${ref.viagem_dia_id ?? n.id}` };
    case "matricula_vencendo":
    case "matricula_vencida":
      return { url: "/app/avisos", tag: "matricula" };
    default:
      return { url: n.evento.startsWith("volta_2030") ? "/app" : "/app/avisos", tag: `${n.evento}-${n.id}` };
  }
}

/** Envia os avisos pendentes. Retorna quantos chegaram a pelo menos um celular. */
export async function enviarPendentes(): Promise<{ avisos: number; entregues: number }> {
  const admin = criarClienteAdmin();
  const { data, error } = await admin.rpc("pegar_notificacoes_push", { p_limite: 300 });
  if (error) throw error;
  const lote = (data ?? []) as Pendente[];
  if (lote.length === 0) return { avisos: 0, entregues: 0 };

  const { publica, privada } = await chavesVapid();
  webpush.setVapidDetails(process.env.NEXT_PUBLIC_APP_URL || "https://transporteescolar-phi.vercel.app", publica, privada);

  const usuarios = [...new Set(lote.map((n) => n.usuario_id))];
  const { data: inscricoes } = await admin
    .from("push_inscricoes")
    .select("id, usuario_id, endpoint, p256dh, auth")
    .in("usuario_id", usuarios);
  const porUsuario = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
  for (const i of inscricoes ?? []) porUsuario.set(i.usuario_id, [...(porUsuario.get(i.usuario_id) ?? []), i]);

  const vencidas = new Set<string>();
  const usadas = new Set<string>();
  const falharam: number[] = [];
  let entregues = 0;

  await Promise.all(
    lote.map(async (n) => {
      const alvos = porUsuario.get(n.usuario_id) ?? [];
      const { url, tag } = destino(n);
      const corpo = JSON.stringify({ titulo: n.titulo, corpo: n.conteudo ?? "", url, tag });
      let ok = false;
      await Promise.all(
        alvos.map(async (alvo) => {
          if (vencidas.has(alvo.id)) return;
          try {
            await webpush.sendNotification({ endpoint: alvo.endpoint, keys: { p256dh: alvo.p256dh, auth: alvo.auth } }, corpo, {
              TTL: 60 * 60 * 6,
              urgency: n.evento === "onibus_no_ponto" ? "high" : "normal",
            });
            ok = true;
            usadas.add(alvo.id);
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            // 404/410: o celular cancelou ou reinstalou; a inscrição não vale mais.
            if (status === 404 || status === 410) vencidas.add(alvo.id);
          }
        }),
      );
      if (ok) entregues++;
      else falharam.push(n.id);
    }),
  );

  if (vencidas.size) await admin.from("push_inscricoes").delete().in("id", [...vencidas]);
  if (usadas.size) await admin.from("push_inscricoes").update({ ultimo_envio_em: new Date().toISOString() }).in("id", [...usadas]);
  // Sem celular inscrito (ou todos falharam): o aviso fica só em Avisos, dentro do app.
  if (falharam.length) await admin.from("notificacoes").update({ status: "falhou" }).in("id", falharam);
  return { avisos: lote.length, entregues };
}
