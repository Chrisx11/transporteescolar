"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

/** Gira ao lado do texto de um <Link> enquanto a página nova carrega (coloque dentro do Link). */
export function CarregandoLink() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="ml-1.5 inline size-3.5 animate-spin align-[-2px]" aria-label="Carregando" /> : null;
}
