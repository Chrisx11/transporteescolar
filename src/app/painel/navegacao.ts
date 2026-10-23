import {
  Bus,
  CalendarDays,
  CalendarRange,
  GraduationCap,
  LayoutDashboard,
  MapPin,
  Route,
  School,
  SlidersHorizontal,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Perfil } from "@/lib/rotulos";

export type ItemMenu = { href: string; rotulo: string; icone: LucideIcon };
export type GrupoMenu = { titulo: string; perfis: Perfil[]; itens: ItemMenu[] };

export const INICIO: ItemMenu = { href: "/painel", rotulo: "Início", icone: LayoutDashboard };

export const MENU: GrupoMenu[] = [
  {
    titulo: "Transportes",
    perfis: ["semtransp", "admin"],
    itens: [
      { href: "/painel/onibus", rotulo: "Ônibus", icone: Bus },
      { href: "/painel/motoristas", rotulo: "Motoristas", icone: UserCog },
      { href: "/painel/pontos", rotulo: "Pontos", icone: MapPin },
      { href: "/painel/viagens", rotulo: "Viagens modelo", icone: Route },
      { href: "/painel/escala", rotulo: "Escala semanal", icone: CalendarRange },
    ],
  },
  {
    titulo: "Educação",
    perfis: ["semeduc", "admin"],
    itens: [
      { href: "/painel/alunos", rotulo: "Alunos", icone: GraduationCap },
      { href: "/painel/instituicoes", rotulo: "Instituições", icone: School },
      { href: "/painel/calendario", rotulo: "Feriados e recessos", icone: CalendarDays },
    ],
  },
  {
    titulo: "Administração",
    perfis: ["admin"],
    itens: [
      { href: "/painel/usuarios", rotulo: "Usuários", icone: UsersRound },
      { href: "/painel/parametros", rotulo: "Parâmetros", icone: SlidersHorizontal },
    ],
  },
];

/** Nomes dos trechos da URL usados na trilha (breadcrumb). */
const ROTULOS: Record<string, string> = {
  painel: "Início",
  onibus: "Ônibus",
  adesivo: "Adesivo do QR",
  motoristas: "Motoristas",
  pontos: "Pontos",
  viagens: "Viagens modelo",
  escala: "Escala semanal",
  alunos: "Alunos",
  novo: "Novo aluno",
  instituicoes: "Instituições",
  calendario: "Feriados e recessos",
  usuarios: "Usuários",
  parametros: "Parâmetros",
};

/** Monta a trilha a partir do caminho: /painel/alunos/<id> → Início › Alunos › Detalhes. */
export function trilha(caminho: string): { href: string; rotulo: string }[] {
  const partes = caminho.split("/").filter(Boolean);
  const ehId = (p: string) => /^[0-9a-f-]{20,}$/i.test(p);
  return partes
    .map((p, i) => ({ p, i, href: "/" + partes.slice(0, i + 1).join("/") }))
    // Um id no meio do caminho (ex.: /onibus/<id>/adesivo) não tem página própria.
    .filter(({ p, i }) => !(ehId(p) && i < partes.length - 1))
    .map(({ p, href }) => ({ href, rotulo: ROTULOS[p] ?? (ehId(p) ? "Detalhes" : p) }));
}

export const COOKIE_MENU = "menu_recolhido";
