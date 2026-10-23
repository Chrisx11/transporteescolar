import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Inbox,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/** Junta classes do Tailwind resolvendo conflitos (a última vence). */
export function cx(...c: ClassValue[]) {
  return twMerge(clsx(c));
}

// ---------------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------------
const BOTAO = {
  primario:
    "bg-azul-600 text-white shadow-sm shadow-azul-600/20 hover:bg-azul-700 active:bg-azul-800 disabled:bg-slate-300 disabled:shadow-none",
  secundario:
    "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 shadow-sm hover:bg-slate-50 hover:ring-slate-300 disabled:text-slate-400",
  perigo: "bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:text-red-300",
  fantasma: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  link: "text-azul-700 hover:text-azul-800 hover:underline underline-offset-4 px-0 py-0 h-auto",
};

const BASE_BOTAO =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-azul-200 disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0";

export type VarianteBotao = keyof typeof BOTAO;

export function Botao({
  variante = "primario",
  className,
  ...props
}: ComponentProps<"button"> & { variante?: VarianteBotao }) {
  return <button className={cx(BASE_BOTAO, BOTAO[variante], className)} {...props} />;
}

export function BotaoLink({
  variante = "primario",
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: VarianteBotao }) {
  return <Link className={cx(BASE_BOTAO, BOTAO[variante], className)} {...props} />;
}

/** Link de texto com ícone, usado nas ações das tabelas. */
export function LinkAcao({ icone: Icone, children, ...props }: ComponentProps<typeof Link> & { icone?: LucideIcon }) {
  return (
    <Link
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-azul-700 transition-colors hover:bg-azul-50"
      {...props}
    >
      {Icone && <Icone className="size-3.5" />}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Campos de formulário
// ---------------------------------------------------------------------------
export function Campo({
  rotulo,
  ajuda,
  children,
  className,
}: {
  rotulo: string;
  ajuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium text-slate-700">{rotulo}</span>
      {children}
      {ajuda && <span className="text-xs leading-snug text-slate-500">{ajuda}</span>}
    </label>
  );
}

const ENTRADA =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base text-slate-900 shadow-sm shadow-slate-900/[0.02] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-azul-500 focus:ring-4 focus:ring-azul-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm";

export function Entrada({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cx(ENTRADA, type === "file" && "h-auto py-1.5 pl-1.5 text-sm", className)}
      {...props}
    />
  );
}

export function Selecao({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className={cx("relative", className)}>
      <select className={cx(ENTRADA, "appearance-none pr-9")} {...props} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function AreaTexto({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(ENTRADA, "h-auto min-h-20 py-2.5", className)} rows={3} {...props} />;
}

export function Caixa({ name, defaultChecked, children }: { name: string; defaultChecked?: boolean; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 cursor-pointer rounded border-slate-300 accent-azul-600"
      />
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------
export function Cartao({
  titulo,
  icone: Icone,
  descricao,
  acoes,
  children,
  className,
}: {
  titulo?: ReactNode;
  icone?: LucideIcon;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-2xl border border-slate-200/80 bg-white p-5 shadow-suave sm:p-6", className)}>
      {(titulo || acoes) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {Icone && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-azul-50 text-azul-600">
                <Icone className="size-[18px]" />
              </span>
            )}
            <div>
              {titulo && <h2 className="text-[15px] font-semibold leading-9 text-slate-900">{titulo}</h2>}
              {descricao && <p className="-mt-1.5 text-xs text-slate-500">{descricao}</p>}
            </div>
          </div>
          {acoes}
        </div>
      )}
      {children}
    </section>
  );
}

export function Titulo({
  children,
  descricao,
  acoes,
  icone: Icone,
}: {
  children: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  icone?: LucideIcon;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        {Icone && (
          <span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-azul-500 to-azul-700 text-white shadow-lg shadow-azul-600/25 sm:flex">
            <Icone className="size-6" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{children}</h1>
          {descricao && <p className="mt-1 max-w-2xl text-sm text-slate-500">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-suave">
      <div className="overflow-x-auto">
        <table className="tabela w-full text-left text-sm">{children}</table>
      </div>
    </div>
  );
}

const SELO = {
  verde: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 [--ponto:var(--color-emerald-500)]",
  amarelo: "bg-amber-50 text-amber-700 ring-amber-600/20 [--ponto:var(--color-amber-500)]",
  vermelho: "bg-red-50 text-red-700 ring-red-600/15 [--ponto:var(--color-red-500)]",
  cinza: "bg-slate-100 text-slate-600 ring-slate-500/15 [--ponto:var(--color-slate-400)]",
  azul: "bg-azul-50 text-azul-700 ring-azul-600/15 [--ponto:var(--color-azul-500)]",
};

export function Selo({ cor = "cinza", children }: { cor?: keyof typeof SELO; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        SELO[cor],
      )}
    >
      <span className="size-1.5 rounded-full bg-[var(--ponto)]" />
      {children}
    </span>
  );
}

const AVISO = {
  info: { cor: "border-azul-200 bg-azul-50/70 text-azul-900", icone: Info, corIcone: "text-azul-600" },
  erro: { cor: "border-red-200 bg-red-50/70 text-red-900", icone: XCircle, corIcone: "text-red-600" },
  ok: { cor: "border-emerald-200 bg-emerald-50/70 text-emerald-900", icone: CheckCircle2, corIcone: "text-emerald-600" },
  alerta: { cor: "border-amber-200 bg-amber-50/70 text-amber-900", icone: AlertTriangle, corIcone: "text-amber-600" },
};

export function Aviso({ tipo = "info", children }: { tipo?: keyof typeof AVISO; children: ReactNode }) {
  const { cor, icone: Icone, corIcone } = AVISO[tipo];
  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className={cx("flex animate-surgir items-start gap-3 rounded-xl border px-4 py-3 text-sm", cor)}
    >
      <Icone className={cx("mt-0.5 size-4 shrink-0", corIcone)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Vazio({ children, icone: Icone = Inbox }: { children: ReactNode; icone?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icone className="size-6" />
      </span>
      <p className="max-w-sm text-sm text-slate-500">{children}</p>
    </div>
  );
}

const COR_ESTAT = {
  azul: "from-azul-500 to-azul-700 shadow-azul-600/25",
  verde: "from-emerald-400 to-emerald-600 shadow-emerald-600/25",
  amarelo: "from-amber-400 to-orange-500 shadow-orange-500/25",
  roxo: "from-violet-500 to-purple-700 shadow-purple-600/25",
  ciano: "from-cyan-400 to-sky-600 shadow-sky-600/25",
  rosa: "from-pink-500 to-rose-600 shadow-rose-600/25",
};

/** Cartão de número (painel inicial). */
export function Estatistica({
  rotulo,
  valor,
  icone: Icone,
  cor = "azul",
  detalhe,
}: {
  rotulo: string;
  valor: ReactNode;
  icone: LucideIcon;
  cor?: keyof typeof COR_ESTAT;
  detalhe?: ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-suave transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevada">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{rotulo}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{valor}</p>
          {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
        </div>
        <span
          className={cx(
            "flex size-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform duration-200 group-hover:scale-110",
            COR_ESTAT[cor],
          )}
        >
          <Icone className="size-5" />
        </span>
      </div>
    </div>
  );
}

/** Avatar com iniciais do nome. */
export function Avatar({ nome, className }: { nome: string; className?: string }) {
  const partes = nome.trim().split(/\s+/);
  const iniciais = (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "");
  return (
    <span
      className={cx(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-azul-400 to-azul-700 text-xs font-bold uppercase text-white",
        className,
      )}
    >
      {iniciais}
    </span>
  );
}

/** Marca do sistema (ônibus em quadrado com gradiente). */
export function Marca({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-destaque-400 to-destaque-500 text-azul-950 shadow-lg shadow-amber-500/30",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="size-[58%]">
        <path d="M8 6v6" />
        <path d="M15 6v6" />
        <path d="M2 12h19.6" />
        <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
        <circle cx="7" cy="18" r="2" />
        <path d="M9 18h5" />
        <circle cx="16" cy="18" r="2" />
      </svg>
    </span>
  );
}
