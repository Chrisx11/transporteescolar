# Sistema de Logística do Transporte Universitário de Italva/RJ

> **Como usar este documento:** cole-o inteiro no início da conversa com o Claude (ou salve como `CLAUDE.md` na raiz do projeto). Ele descreve o sistema completo, mas a construção deve seguir as **fases da seção 14**, uma de cada vez.

---

## 0. Instruções para quem vai programar

Você vai construir o sistema descrito abaixo. Antes de escrever código:

1. Leia o documento inteiro.
2. Proponha o **modelo de dados** (tabelas, relacionamentos, enums) e o **plano da Fase 1**, e espere a minha aprovação.
3. Trabalhe **uma fase por vez**. Ao fim de cada fase, mostre o que foi feito, como testar e o que ficou pendente.
4. Se alguma regra estiver ambígua ou em conflito, **pergunte antes de assumir**.
5. Toda a interface deve estar em **português do Brasil**, com linguagem simples (os usuários não são técnicos).
6. Todo horário do sistema é **America/Sao_Paulo**. Nunca use o fuso do servidor para regras de prazo.

---

## 1. Contexto

A Prefeitura de Italva/RJ oferece transporte gratuito para os universitários do município que estudam em **Campos dos Goytacazes** e **Itaperuna**, em várias instituições e nos turnos manhã, tarde e noite.

Hoje a organização é manual. O objetivo é um sistema que faça a logística **quase automática** todos os dias:

- A **Secretaria de Educação (SEMEDUC)** cadastra instituições e alunos e define a grade semanal de cada aluno.
- A **Secretaria de Transportes (SEMTRANSP)** cadastra frota, motoristas, pontos e viagens, e acompanha a operação.
- O **aluno** reserva as viagens do dia (dentro dos prazos) e confirma o embarque lendo um **QR code fixo no ônibus**.
- O **motorista** vê no celular a lista de quem vai embarcar na ida e, ao encerrar a ida, a lista de quem volta com ele.

**Volume aproximado:** 600 alunos cadastrados (nem todos usam todos os dias), 10 ônibus, 10 motoristas.

---

## 2. Stack e requisitos técnicos

| Item | Escolha |
|---|---|
| Framework | **Next.js** (App Router) + **TypeScript** |
| Banco, autenticação e arquivos | **Supabase** (PostgreSQL, Auth, Storage, Row Level Security) |
| Hospedagem | **Vercel** |
| Tarefas agendadas | **Supabase pg_cron** (ou Edge Functions agendadas). Algumas rotinas precisam rodar a cada poucos minutos |
| Estilo | Tailwind CSS, layout **mobile-first** |
| Formato do app | **PWA instalável** (manifest, service worker, ícones) |
| Notificações | **WhatsApp** (API paga) + **Web Push** |

**Requisitos de arquitetura:**

- **Preparado para lojas:** no futuro o app será publicado na Play Store e na App Store (provavelmente empacotando com **Capacitor**). Por isso:
  - Toda regra de negócio fica no servidor (route handlers / funções do banco), nunca só no front-end.
  - Câmera, geolocalização e notificações devem ficar atrás de uma camada própria (ex.: `lib/device/`), para trocar a implementação web pela nativa sem reescrever as telas.
- **Notificações atrás de uma interface** (`NotificationService`) com dois canais: `whatsapp` e `push`. O provedor de WhatsApp deve ser trocável (ex.: WhatsApp Business Cloud API da Meta ou um provedor intermediário). Mensagens de WhatsApp usam templates aprovados.
- **Datas e horários:** usar `timestamptz` no banco e calcular prazos sempre em America/Sao_Paulo.
- **Auditoria:** toda criação, alteração ou exclusão feita por secretaria ou motorista fica registrada (quem, quando, o quê, valor anterior e novo).
- **Exportação:** relatórios exportáveis para Excel (.xlsx).
- Variáveis sensíveis (chaves de API) apenas em variáveis de ambiente.

---

## 3. Perfis de acesso

| Perfil | Onde usa | Resumo |
|---|---|---|
| **Aluno** | Celular | Reserva viagens da sua grade, lê o QR, vê histórico |
| **Motorista** | Celular | Listas de embarque da ida e da volta, libera a volta 20:30 |
| **SEMEDUC** | Computador | Instituições, alunos, grade semanal, frequência |
| **SEMTRANSP** | Computador | Frota, motoristas, pontos, viagens, escala, painel do dia |
| **Admin** | Computador | Gerencia usuários das secretarias e parâmetros do sistema |

- **Login:** CPF + senha para todos os perfis.
- **Primeiro acesso:** senha provisória gerada pela secretaria; troca obrigatória no primeiro login.
- **Recuperação de senha:** pelo e-mail cadastrado.
- O CPF é o **identificador único** do aluno (validar dígitos verificadores; não permitir duplicidade).
- Permissões garantidas por **Row Level Security** no Supabase: aluno só vê os próprios dados; motorista só vê as viagens atribuídas a ele.
- Como o Supabase Auth usa e-mail, implemente o login por CPF buscando no servidor o usuário vinculado ao CPF (ou outra solução segura que você propuser).

---

## 4. Conceitos centrais

| Conceito | Significado |
|---|---|
| **Viagem modelo** | Uma linha da grade geral: cidade, sentido (ida/volta), horário de saída, regra de prazo, dias da semana |
| **Viagem do dia** | Ocorrência concreta de uma viagem modelo numa data. Gerada automaticamente |
| **Grade semanal do aluno** | Para cada dia da semana, qual ida e qual volta o aluno pode reservar. Definida pela SEMEDUC |
| **Reserva** | O aluno reserva **um trecho** (uma viagem do dia). Ida e volta são reservas separadas |
| **Escala** | Quais ônibus e motoristas fazem cada viagem do dia |
| **Alocação** | Em qual ônibus da viagem cada aluno reservado vai embarcar |
| **Embarque** | Registro de que o aluno entrou no ônibus (por QR ou manual) |
| **Ponto** | Local de embarque/desembarque cadastrado pela SEMTRANSP |

---

## 5. Grade geral de viagens (dados iniciais)

Cadastrar estas viagens modelo como dados iniciais (seed). A SEMTRANSP poderá alterá-las depois pela tela.

### Campos dos Goytacazes

| Viagem | Sentido | Saída | Prazo de reserva e cancelamento |
|---|---|---|---|
| Ida manhã | Ida | 05:30 | 19:00 do **dia anterior** |
| Ida tarde | Ida | 11:00 | 08:00 do mesmo dia |
| Ida noite | Ida | 16:30 | 15:00 do mesmo dia |
| Volta 12:00 | Volta | 12:00 | 10:00 do mesmo dia |
| Volta tarde | Volta | 18:15 | 15:00 do mesmo dia |
| Volta noite | Volta | 22:00 | 15:00 do mesmo dia |

### Itaperuna

| Viagem | Sentido | Saída | Prazo de reserva e cancelamento |
|---|---|---|---|
| Ida manhã | Ida | 06:00 | 19:00 do **dia anterior** |
| Ida tarde | Ida | 11:00 | 08:00 do mesmo dia |
| Ida noite | Ida | 17:00 | 15:00 do mesmo dia |
| Volta tarde | Volta | 18:20 | 15:00 do mesmo dia |
| **Volta 20:30** | Volta | 20:30 | **Condicional**, liberada pelo motorista (seção 9) |
| Volta noite | Volta | 22:00 | 15:00 do mesmo dia |

**Campos de cada viagem modelo:** cidade, nome, sentido, horário de saída, tipo de prazo (`dia_anterior` ou `mesmo_dia`) + hora do prazo, dias da semana em que opera, se é **condicional**, se **bloqueia reserva ao lotar**, km estimado (para relatórios), ativa/inativa.

> Observação operacional: o ônibus da ida da manhã retorna vazio a Italva. Esse deslocamento não aparece para reserva, mas deve poder ser registrado na escala (para cálculo de km).

---

## 6. Regras de negócio

### Reservas

- **RN01** – O aluno só vê e reserva as viagens previstas na **sua grade semanal para aquele dia**. Viagens fora da grade não aparecem.
- **RN02** – Ida e volta são **reservas independentes**. O aluno pode reservar só a ida, só a volta ou as duas.
- **RN03** – A reserva **abre às 00:00 do dia anterior** à viagem (parâmetro configurável) e **fecha no prazo da viagem**.
- **RN04** – O **prazo de cancelamento é o mesmo prazo de reserva**. Depois do prazo, o botão de reservar/cancelar fica inativo.
- **RN05** – **Idas nunca bloqueiam por falta de vaga.** O botão de reservar de uma ida só fica inativo quando o prazo acaba. Se as reservas passarem da capacidade dos ônibus escalados, o painel da SEMTRANSP mostra alerta de excesso.
- **RN06** – A capacidade de uma viagem do dia é a **soma das capacidades dos ônibus escalados** para ela.
- **RN07** – Para voltas, o bloqueio por lotação segue o campo **"bloqueia reserva ao lotar"** da viagem modelo (padrão: **não bloqueia**, apenas alerta). A volta 20:30 tem regra própria (seção 9).
- **RN08** – Dia sem operação (feriado, recesso, dia sem aula da instituição do aluno no calendário) não permite reserva.
- **RN09** – Aluno com cadastro **inativo, pendente ou com matrícula vencida** não pode reservar.

### Escala e alocação

- **RN10** – A SEMTRANSP mantém uma **escala modelo semanal** (qual ônibus e qual motorista fazem cada viagem em cada dia da semana). Ao gerar as viagens do dia, a escala modelo é copiada e pode ser ajustada no dia (troca de ônibus, de motorista, ônibus extra).
- **RN11** – Um mesmo ônibus/motorista pode fazer várias viagens no dia (ex.: ida noite 16:30 para Campos e depois a volta tarde 18:15). O sistema deve impedir conflito de horário evidente (mesmo ônibus em duas viagens que se sobrepõem).
- **RN12** – Quando o prazo de uma viagem fecha, o sistema **aloca automaticamente** cada aluno reservado em um dos ônibus da viagem (respeitando capacidade e agrupando por ponto de embarque quando possível) e avisa o aluno: **"Seu ônibus: prefixo X"**. A SEMTRANSP pode mover alunos manualmente.

### Embarque, faltas e "não retornou"

- **RN13** – Presença é confirmada pela leitura do **QR code fixo do ônibus** (seção 8) ou, em último caso, **manualmente pelo motorista**, com motivo obrigatório (ex.: aluno sem celular, sem bateria).
- **RN14** – Ao encerrar a viagem, quem tinha reserva e **não embarcou**:
  - na **ida** → **falta**;
  - na **volta**, tendo **embarcado na ida do mesmo dia** → **"não retornou"** (sem penalidade; serve de alerta);
  - na **volta**, sem ter embarcado em ida no dia → **falta**.
- **RN15** – **Faltas são apenas registradas.** Não há bloqueio automático; advertências são feitas verbalmente pela secretaria. A SEMEDUC pode registrar uma anotação no histórico do aluno (ex.: "advertido verbalmente em dd/mm").
- **RN16** – A SEMTRANSP pode marcar uma viagem do dia como **"com ocorrência"** (pane, atraso grave, cancelamento). Isso **anula as faltas** daquela viagem e notifica os alunos reservados.
- **RN17** – O aluno pode enviar **justificativa de falta** com anexo (ex.: atestado). A SEMEDUC aprova (falta vira "justificada") ou recusa.
- **RN18** – Viagem não encerrada pelo motorista é **encerrada automaticamente** algumas horas após a saída (parâmetro configurável), e as faltas são lançadas.

### Exceções

- **RN19** – O aluno pode pedir uma **exceção de grade para uma data específica** (ex.: prova em outro turno): escolhe a data, a ida e/ou volta desejada e o motivo. A SEMEDUC aprova ou recusa. Aprovada, a exceção substitui a grade **só naquela data**.

---

## 7. Funcionalidades por perfil

### 7.1 SEMEDUC (computador)

**Instituições**
- Nome, cidade (Campos ou Itaperuna), endereço.
- **Calendário letivo**: início e fim do semestre, feriados, recessos e dias sem aula.

**Alunos** (cadastro único por CPF)
- Dados: nome, CPF, data de nascimento, WhatsApp, e-mail, endereço/bairro, **foto**.
- **Vínculos acadêmicos**: uma ou mais instituições, cada uma com curso, período e turno (informativo, usado nos relatórios e no calendário).
- **Comprovante de matrícula** (PDF/imagem, armazenado no Supabase Storage) com **data de validade**.
- **Pontos padrão** (seção 7.5): ponto de embarque da ida em Italva e ponto da volta em cada cidade que o aluno frequenta.
- **Grade semanal individual**: para cada dia (segunda a sábado), a viagem de ida e a viagem de volta permitidas (ou nenhuma). Opcionalmente, ponto diferente do padrão naquele dia e a instituição relacionada (para aplicar o calendário).
- Situação: `pendente`, `ativo`, `inativo`.
- Gerar senha provisória e reenviar acesso.

**Pré-cadastro e recadastramento**
- O aluno pode fazer o **pré-cadastro** pelo app (dados, foto, comprovante, horário de aulas em anexo). Fica `pendente`.
- A SEMEDUC confere, monta a grade e **aprova** (vira `ativo`) ou **devolve** com motivo.
- Perto do vencimento da matrícula, o sistema avisa o aluno; vencida, o aluno não reserva até renovar.

**Frequência**
- Analisar justificativas de falta e pedidos de exceção.
- Ver histórico de cada aluno (reservas, embarques, faltas, "não retornou", anotações).

**Relatórios** (filtros por período, instituição, curso, turno; exportação .xlsx)
- Alunos ativos por instituição/curso/turno.
- Faltas por aluno (ranking) e "não retornou".
- Matrículas vencendo.
- Uso real × grade (alunos com grade que nunca reservam).

### 7.2 SEMTRANSP (computador)

**Cadastros**
- **Ônibus**: prefixo, placa, capacidade, situação (ativo / em manutenção), vencimento de vistoria e licenciamento. Cada ônibus tem um **QR code** gerado pelo sistema, com tela para **imprimir o adesivo**.
- **Motoristas**: nome, CPF, telefone, CNH (categoria e validade).
- **Pontos** (seção 7.5).
- **Viagens modelo** (seção 5), editáveis.
- **Escala modelo semanal**.
- **Parâmetros**: janela de validade do QR, distância máxima, horário de abertura de reservas, auto-encerramento etc. (podem ficar no Admin).

**Painel do dia** (atualização em tempo real)
- Cada viagem do dia: prazo (aberto/fechado), reservas × capacidade, alerta de excesso, ônibus e motorista escalados, status (`agendada`, `prazo_fechado`, `em_andamento`, `ida_encerrada`, `encerrada`, `cancelada`, `com_ocorrencia`), embarcados × reservados.
- Ajustar escala do dia, adicionar ônibus extra, mover alunos entre ônibus.
- Marcar viagem com ocorrência ou cancelar (notifica alunos).
- Ver alunos com "não retornou".

**Relatórios** (exportação .xlsx)
- Ocupação média por viagem e por dia da semana.
- Previsão de lotação: soma das grades de todos os alunos por viagem e dia da semana.
- Km estimado rodado (viagens realizadas × km da viagem modelo, incluindo deslocamentos vazios).
- Alertas de vencimento: CNH, vistoria, licenciamento.

### 7.3 Aluno (celular)

- **Tela inicial "Hoje"** (e "Amanhã", quando a reserva já estiver aberta): mostra apenas a ida e a volta da grade dele para o dia, cada uma com horário de saída, prazo e botão **Reservar / Cancelar** (ativo só dentro do prazo).
- Depois do prazo: mostra **"Seu ônibus: prefixo X"** e o ponto de embarque.
- **Ler QR**: abre a câmera (ou o aluno lê com a câmera do celular, que abre o link do app).
- **Volta 20:30**: botão aparece só quando liberada (seção 9).
- Histórico de reservas, embarques, faltas e "não retornou".
- Enviar justificativa de falta e pedir exceção de data.
- Pré-cadastro / recadastramento e atualização de dados.

### 7.4 Motorista (celular, o mais simples possível)

- Ao entrar, vê **as viagens do dia atribuídas a ele**.
- **Iniciar ida** → lista dos alunos que vão embarcar, **ordenada por ponto**, com foto, nome e ponto. Quem já leu o QR aparece marcado. Contador "18 de 32 embarcados".
- Botão para **marcar presença manual** (com motivo).
- **Encerrar ida** → a tela troca para a **lista da volta** daquele ônibus.
- **Encerrar volta** → fecha a viagem e o sistema lança faltas / "não retornou".
- Em Itaperuna, à noite: botão **"Liberar volta 20:30"** (seção 9).
- Enquanto a viagem está em andamento, o app envia a **localização do celular do motorista** (usada para validar o QR).
- **Funcionar com sinal fraco**: a lista fica salva no aparelho; presenças manuais feitas sem internet entram numa fila e sincronizam quando o sinal voltar.

### 7.5 Pontos de embarque

- A SEMTRANSP cadastra pontos com: nome, cidade (Italva, Campos, Itaperuna), endereço, coordenadas (opcional) e **ordem na rota**.
- Pontos em **Italva** = embarque das idas e desembarque das voltas.
- Pontos em **Campos/Itaperuna** = desembarque das idas e embarque das voltas (normalmente nas instituições).
- No cadastro do aluno ficam os **pontos padrão** (um em Italva e um por cidade de destino). A grade semanal pode sobrescrever o ponto num dia específico.
- As listas do motorista são ordenadas pela ordem dos pontos na rota.

---

## 8. QR code e validação do embarque

- Cada **ônibus** tem um QR **fixo** (adesivo dentro do veículo). O conteúdo é um link do app com um **token do ônibus** (ex.: `https://<dominio>/embarque/<token>`), não o ID interno.
- Ao ler, o app (com o aluno logado) valida **tudo** abaixo:
  1. O aluno tem **reserva** numa viagem do dia que está **atribuída àquele ônibus**.
  2. A leitura está dentro da **janela de horário** da viagem (padrão: de 60 min antes até 30 min depois da saída; configurável).
  3. O celular do aluno está a **até X metros** da última localização enviada pelo motorista daquele ônibus (padrão: 200 m; configurável). Se não houver localização recente do motorista, aceitar e marcar o embarque como "sem verificação de localização".
- Se o aluno ler o QR de **outro ônibus da mesma viagem** e houver lugar: aceitar, mover a alocação e registrar a troca.
- Mensagens de erro claras: "Você não tem reserva nesta viagem", "Seu ônibus é o prefixo X", "Fora do horário de embarque".
- A localização do aluno é usada **somente no momento da leitura** e não é armazenada além do necessário para o registro do embarque.

---

## 9. Volta 20:30 de Itaperuna (viagem condicional)

Viagem **esporádica**: só acontece se um motorista liberar e as vagas forem preenchidas.

1. **Liberação pelo motorista:** um motorista que está em Itaperuna à noite toca em "Liberar volta 20:30", escolhe **qual ônibus** fará a viagem e define a **quantidade mínima de vagas** a preencher.
   - O app mostra uma sugestão: "50 reservados para as 22:00, o ônibus que fica tem 40 lugares → mínimo sugerido: 10".
   - **Só um motorista pode liberar por noite.** Depois de liberada, aparece como "já liberada" para os demais.
2. **Reserva:** o botão "Reservar volta 20:30" aparece **somente após a liberação** e **somente para alunos com reserva na volta 22:00 de Itaperuna naquele dia**.
   - Enquanto a 20:30 não confirma, o aluno **mantém a vaga das 22:00**.
3. **Quantidade atingida:**
   - Todos os reservados recebem **confirmação** (push + WhatsApp).
   - O botão **some** para os demais, que voltam às 22:00.
   - As reservas das 22:00 desses alunos são liberadas automaticamente.
   - O motorista recebe a lista; como os alunos já estão no ponto, **o ônibus sai assim que todos embarcarem**, mesmo antes das 20:30.
4. **Não atingiu até 20:30:** a viagem é cancelada, os reservados recebem aviso de que **não haverá ônibus nesse horário** e continuam na volta das 22:00, **sem falta**.
5. Quem foi confirmado na 20:30 e não embarcou segue a RN14 normalmente.

---

## 10. Rotinas automáticas

| Rotina | Frequência | O que faz |
|---|---|---|
| Gerar viagens do dia | Diária (madrugada) | Cria as viagens dos próximos dias a partir das viagens modelo, escala modelo e calendário |
| Fechar prazos | A cada 5 min | Viagens com prazo vencido → `prazo_fechado`, roda a alocação e avisa "Seu ônibus: prefixo X" |
| Cancelar 20:30 não preenchida | 20:30 | Cancela, avisa e mantém todos na 22:00 |
| Auto-encerrar viagens | A cada 30 min | Encerra viagens esquecidas e lança faltas |
| Vencimento de matrícula | Diária | Avisa quem vence em 15 dias e inativa as vencidas |
| Vencimentos da frota | Diária | Alerta CNH, vistoria e licenciamento próximos do vencimento |

---

## 11. Notificações (WhatsApp + push)

| Evento | Para quem |
|---|---|
| Lembrete antes do prazo de reserva (opcional, configurável) | Aluno com a viagem na grade e sem reserva |
| "Seu ônibus: prefixo X" após fechar o prazo | Aluno reservado |
| Viagem cancelada ou com ocorrência | Alunos reservados |
| Volta 20:30 confirmada / cancelada | Alunos que reservaram a 20:30 |
| Cadastro aprovado / devolvido | Aluno |
| Exceção ou justificativa aprovada / recusada | Aluno |
| Matrícula vencendo | Aluno |
| Excesso de reservas numa viagem | SEMTRANSP |

- Todas as mensagens enviadas ficam registradas (destinatário, canal, status de entrega).
- O aluno pode desativar lembretes, mas não avisos operacionais (cancelamento, ônibus atribuído).
- Lembrar: no iPhone, notificações push de PWA só funcionam com o app instalado na tela inicial. Por isso o WhatsApp é o canal principal.

---

## 12. Modelo de dados (ponto de partida)

Tabelas sugeridas. Ajuste e proponha melhorias antes de implementar.

- `usuarios` (id, cpf, nome, email, telefone, perfil, ativo, troca_senha_obrigatoria)
- `instituicoes` (id, nome, cidade, endereco)
- `calendario` (id, instituicao_id nullable, data, tipo: feriado/recesso/sem_aula, descricao) — `instituicao_id` nulo = vale para todos
- `semestres` (id, instituicao_id, inicio, fim)
- `alunos` (usuario_id, data_nascimento, foto_url, endereco, situacao, matricula_validade, comprovante_url, ponto_ida_padrao_id)
- `aluno_vinculos` (id, aluno_id, instituicao_id, curso, periodo, turno)
- `aluno_pontos_volta` (aluno_id, cidade, ponto_id)
- `grade_semanal` (id, aluno_id, dia_semana, viagem_ida_modelo_id nullable, viagem_volta_modelo_id nullable, ponto_ida_id nullable, ponto_volta_id nullable, instituicao_id nullable)
- `excecoes` (id, aluno_id, data, viagem_ida_modelo_id, viagem_volta_modelo_id, motivo, status, analisado_por, analisado_em)
- `pontos` (id, nome, cidade, endereco, lat, lng, ordem, ativo)
- `onibus` (id, prefixo, placa, capacidade, situacao, qr_token, vistoria_validade, licenciamento_validade)
- `motoristas` (usuario_id, cnh_categoria, cnh_validade)
- `viagens_modelo` (id, cidade, nome, sentido, hora_saida, prazo_tipo, prazo_hora, dias_semana, condicional, bloqueia_ao_lotar, km_estimado, ativa)
- `escala_modelo` (id, viagem_modelo_id, dia_semana, onibus_id, motorista_id)
- `viagens_dia` (id, viagem_modelo_id, data, saida_em, prazo_em, status, ocorrencia_descricao)
- `viagem_dia_onibus` (id, viagem_dia_id, onibus_id, motorista_id, iniciada_em, ida_encerrada_em, encerrada_em)
- `liberacoes_2030` (id, viagem_dia_id, motorista_id, onibus_id, vagas_minimas, status, liberada_em)
- `reservas` (id, aluno_id, viagem_dia_id, viagem_dia_onibus_id nullable, ponto_id, status: ativa/cancelada/aguardando_confirmacao/confirmada, criada_em, cancelada_em)
- `embarques` (id, reserva_id, tipo: qr/manual, motivo_manual, lat, lng, verificado_localizacao, registrado_em, registrado_por)
- `frequencia` (id, reserva_id, aluno_id, resultado: presente/falta/nao_retornou/justificada/anulada)
- `justificativas` (id, frequencia_id, anexo_url, motivo, status, analisado_por)
- `anotacoes_aluno` (id, aluno_id, texto, autor_id, criado_em)
- `localizacao_motorista` (viagem_dia_onibus_id, lat, lng, registrado_em) — manter só a última posição
- `notificacoes` (id, usuario_id, canal, evento, conteudo, status, enviado_em)
- `parametros` (chave, valor)
- `auditoria` (id, usuario_id, tabela, registro_id, acao, antes, depois, criado_em)

---

## 13. Segurança e LGPD

- No primeiro acesso, o aluno aceita um **termo de uso e privacidade** (registrar data e versão aceita).
- Coleta mínima: CPF, foto e localização apenas para as finalidades descritas.
- Localização do aluno: apenas no momento da leitura do QR. Localização do motorista: apenas durante a viagem em andamento.
- Fotos e comprovantes em bucket privado, com acesso por URL assinada.
- RLS em todas as tabelas; nenhuma chave de serviço no front-end.
- Senhas nunca trafegam nem ficam salvas em texto puro.

---

## 14. Fases de entrega

Construa uma fase por vez e só avance com a minha aprovação.

1. **Base e cadastros:** projeto, autenticação por CPF, perfis, layout (computador para secretarias, celular para aluno e motorista), PWA básica. Cadastros da SEMTRANSP (ônibus com QR, motoristas, pontos, viagens modelo com o seed da seção 5, escala modelo) e da SEMEDUC (instituições, calendário, alunos, vínculos, pontos padrão, grade semanal).
2. **Reservas e operação do dia:** geração das viagens do dia, tela "Hoje" do aluno com reserva/cancelamento e prazos, fechamento de prazos, alocação automática, painel do dia da SEMTRANSP.
3. **Embarque:** leitura do QR com as validações, app do motorista (listas de ida e volta, presença manual, envio de localização, modo offline), encerramento de viagens, faltas e "não retornou", viagem com ocorrência.
4. **Volta 20:30 de Itaperuna** (seção 9).
5. **Notificações** (WhatsApp + push), **pré-cadastro do aluno**, **exceções de data** e **justificativas de falta**.
6. **Relatórios e gestão:** relatórios das duas secretarias com exportação .xlsx, km estimado, alertas de vencimento, auditoria consultável.

---

## 15. Cenários de teste obrigatórios

1. Aluno tenta reservar uma viagem que não está na grade dele naquele dia → não aparece.
2. Aluno reserva a ida manhã de Campos às 18:59 do dia anterior → aceita; às 19:01 → botão inativo.
3. Aluno cancela a volta tarde às 14:59 → aceita; às 15:01 → não permite.
4. 45 reservas numa ida com um ônibus de 40 lugares → reserva continua liberada e o painel mostra alerta de excesso.
5. Prazo fecha, viagem com dois ônibus → alunos alocados e avisados do prefixo.
6. Aluno lê o QR do ônibus certo, no horário, perto do ônibus → embarque registrado.
7. Aluno lê a foto do QR em casa → recusado pela distância.
8. Aluno embarcou na ida e não leu o QR na volta → "não retornou", não falta.
9. Aluno reservou a ida e não embarcou → falta.
10. Viagem marcada com ocorrência → faltas anuladas e alunos avisados.
11. Volta 20:30: motorista libera com mínimo 10, dez alunos reservam → confirmação, botão some, reservas das 22:00 deles liberadas.
12. Volta 20:30: só 6 reservam até 20:30 → cancelada, alunos continuam na 22:00, sem falta.
13. Segundo motorista tenta liberar a 20:30 já liberada → bloqueado.
14. Feriado no calendário → nenhuma reserva possível naquele dia.
15. Exceção aprovada para uma data → aluno vê a viagem da exceção só naquela data.
16. Motorista sem sinal marca presença manual → sincroniza quando a internet volta.
17. Aluno com matrícula vencida → não consegue reservar e vê aviso para renovar.

---

## 16. Decisões aprovadas (23/10/2026)

1. **Ida e volta são trechos separados.** Cada viagem modelo gera uma viagem do dia própria. No app do motorista, os trechos dele aparecem em ordem de horário; "Encerrar ida" abre o próximo trecho de volta daquele ônibus. O status `ida_encerrada` não existe.
2. **E-mail opcional.** Quem não tem e-mail recebe um e-mail interno `<cpf>@login.italva.invalid` só para o Supabase Auth; a recuperação de senha nesse caso é pela secretaria (nova senha provisória).
3. **Supabase na nuvem** (não há Docker na máquina). Migrações em `supabase/migrations`, aplicadas com `supabase db push`.
4. **Viagens do seed operam de segunda a sábado** (editável).
5. **Um perfil por CPF.**
6. **Um comprovante de matrícula por aluno.**
7. Dia da semana = `smallint` ISO (1 = segunda … 7 = domingo).

## 17. Decisões aprovadas da Fase 2 (23/10/2026)

1. **Matrícula** é válida se `matricula_validade >= data da viagem` (sem validade cadastrada = não reserva).
2. **Feriado/recesso geral**: as viagens do dia **não são geradas**.
3. Mudanças em viagem modelo/escala modelo valem **só para dias ainda não gerados**. Dias já gerados: ajuste no painel do dia, com botão "Reaplicar escala modelo" enquanto o prazo estiver aberto. As viagens do dia guardam cópia dos horários.
4. **Aluno sem ponto** definido pode reservar; o painel mostra alerta.
5. **Semestre**: se o dia da grade tem instituição e ela tem semestres cadastrados, a data precisa estar dentro de um deles.
6. **Excesso** na alocação: distribui entre os ônibus e alerta; a SEMTRANSP põe ônibus extra e realoca.
7. **Avisos** na Fase 2 só ficam gravados (`notificacoes`, status pendente) e aparecem no app; envio por WhatsApp/push na Fase 5.
8. Rotinas no **pg_cron**: gerar viagens (00:05 SP, 2 dias à frente) e fechar prazos (a cada 5 min). O prazo vale no segundo exato (conferido na função `reservar`).
9. Testes usam `agora()`: igual a `now()`, exceto quando `app.ambiente = 'teste'`, que permite fixar `app.agora`.
10. A volta 20:30 (condicional) não é gerada até a Fase 4.
