import { Bus, GraduationCap, Route, School, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Perfil } from "@/lib/rotulos";

/** Ícone e cor de cada perfil (telas de acesso e cabeçalhos). */
export const VISUAL_PERFIL: Record<Perfil, { icone: LucideIcon; gradiente: string; claro: string }> = {
  aluno: { icone: GraduationCap, gradiente: "from-azul-500 to-azul-700", claro: "bg-azul-50 text-azul-600" },
  motorista: { icone: Bus, gradiente: "from-amber-400 to-orange-500", claro: "bg-amber-50 text-amber-600" },
  semeduc: { icone: School, gradiente: "from-emerald-400 to-teal-600", claro: "bg-emerald-50 text-emerald-600" },
  semtransp: { icone: Route, gradiente: "from-violet-500 to-purple-700", claro: "bg-violet-50 text-violet-600" },
  admin: { icone: ShieldCheck, gradiente: "from-slate-600 to-slate-900", claro: "bg-slate-100 text-slate-700" },
};
