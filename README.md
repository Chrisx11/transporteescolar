# Transporte Universitário de Italva/RJ

Sistema de logística do transporte universitário (reservas, embarque por QR code e frequência).
A especificação completa está em [CLAUDE.md](CLAUDE.md).

**Fase atual: 1. Base e cadastros**

## Como rodar

1. Crie um projeto em [supabase.com](https://supabase.com) (região São Paulo, se disponível).
2. Copie `.env.example` para `.env.local` e preencha com os dados de *Project Settings → API*.
3. Aplique as migrações no banco:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-PROJETO
   npm run db:push
   ```
4. Crie o primeiro administrador. A senha provisória aparece na tela:
   ```bash
   npm run criar-admin -- 52998224725 "Nome do Administrador" email@exemplo.com
   ```
5. Rode o app com `npm run dev` e abra http://localhost:3000.
6. Em *Authentication → URL Configuration* do Supabase, coloque o endereço do app em **Site URL** e
   `https://SEU-DOMINIO/auth/callback` em **Redirect URLs**. Sem isso, o link de recuperação de senha não funciona.

## Testes

```bash
npm test
```

- `src/lib/*.test.ts`: validação de CPF, cálculo de prazos em America/Sao_Paulo (cenários 2 e 3) e senhas.
- `supabase/tests/banco.test.ts`: aplica todas as migrações num Postgres em memória (PGlite) e confere:
  - os dados iniciais;
  - os gatilhos de escala e de grade;
  - a RLS por perfil;
  - o Storage;
  - a auditoria.

## Estrutura

| Pasta | O que tem |
|---|---|
| `supabase/migrations/` | Tabelas, enums, funções, RLS, auditoria, buckets e dados iniciais |
| `src/app/(auth)/` | Login, troca de senha, recuperação e termo de uso |
| `src/app/api/auth/login/` | Login por CPF (feito no servidor) |
| `src/app/painel/` | Telas de computador das secretarias e do Admin |
| `src/app/app/` | Telas de celular do aluno e do motorista |
| `src/app/embarque/[token]/` | Destino do QR code do ônibus (validação na Fase 3) |
| `src/lib/device/` | Câmera, localização e notificações atrás de interfaces (para o Capacitor no futuro) |
| `src/lib/usuarios.ts` | Criação de logins e senhas provisórias |
| `public/sw.js` | Service worker do PWA |
