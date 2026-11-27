import type { Metadata } from "next";

/** App do motorista: manifesto próprio (instala separado do app do aluno). */
export const metadata: Metadata = {
  manifest: "/manifest-motorista.webmanifest",
  appleWebApp: { capable: true, title: "Motorista Italva", statusBarStyle: "black-translucent" },
};

export default function LayoutMotorista({ children }: { children: React.ReactNode }) {
  return children;
}
