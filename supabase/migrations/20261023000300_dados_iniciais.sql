-- =====================================================================
-- Fase 1 — Dados iniciais: parâmetros e grade geral de viagens (seção 5)
-- km_estimado fica em branco: a SEMTRANSP preenche pela tela.
-- =====================================================================

insert into public.parametros (chave, valor, tipo, rotulo, descricao) values
  ('reserva_abertura_dias_antes', '1', 'numero', 'Abertura da reserva (dias antes)',
   'Quantos dias antes da viagem a reserva abre.'),
  ('reserva_abertura_hora', '"00:00"', 'hora', 'Abertura da reserva (horário)',
   'Horário em que a reserva abre no dia de abertura.'),
  ('qr_janela_antes_min', '60', 'numero', 'QR: minutos antes da saída',
   'A partir de quantos minutos antes da saída o QR é aceito.'),
  ('qr_janela_depois_min', '30', 'numero', 'QR: minutos depois da saída',
   'Até quantos minutos depois da saída o QR é aceito.'),
  ('qr_distancia_max_m', '200', 'numero', 'QR: distância máxima (metros)',
   'Distância máxima entre o celular do aluno e o do motorista.'),
  ('localizacao_motorista_validade_min', '10', 'numero', 'Localização do motorista válida por (min)',
   'Depois desse tempo sem atualização, o embarque é aceito sem verificar a localização.'),
  ('auto_encerrar_horas', '4', 'numero', 'Encerrar viagem automaticamente após (horas)',
   'Horas após a saída para encerrar viagens esquecidas e lançar as faltas.'),
  ('matricula_aviso_dias', '15', 'numero', 'Aviso de matrícula vencendo (dias)',
   'Quantos dias antes do vencimento o aluno é avisado.'),
  ('frota_aviso_dias', '30', 'numero', 'Aviso de vencimentos da frota (dias)',
   'Antecedência dos alertas de CNH, vistoria e licenciamento.'),
  ('lembrete_reserva_ativo', 'true', 'booleano', 'Enviar lembrete de reserva',
   'Lembra o aluno que tem a viagem na grade e ainda não reservou.'),
  ('lembrete_reserva_minutos_antes', '120', 'numero', 'Lembrete: minutos antes do prazo',
   'Com quanta antecedência do prazo o lembrete é enviado.'),
  ('termo_versao', '"1.0"', 'texto', 'Versão do termo de uso',
   'Ao mudar a versão, todos os alunos precisam aceitar o termo de novo.');

insert into public.viagens_modelo
  (cidade, nome, sentido, hora_saida, duracao_min, prazo_tipo, prazo_hora, condicional)
values
  -- Campos dos Goytacazes
  ('campos', 'Ida manhã',   'ida',   '05:30', 75, 'dia_anterior', '19:00', false),
  ('campos', 'Ida tarde',   'ida',   '11:00', 75, 'mesmo_dia',    '08:00', false),
  ('campos', 'Ida noite',   'ida',   '16:30', 75, 'mesmo_dia',    '15:00', false),
  ('campos', 'Volta 12:00', 'volta', '12:00', 75, 'mesmo_dia',    '10:00', false),
  ('campos', 'Volta tarde', 'volta', '18:15', 75, 'mesmo_dia',    '15:00', false),
  ('campos', 'Volta noite', 'volta', '22:00', 75, 'mesmo_dia',    '15:00', false),
  -- Itaperuna
  ('itaperuna', 'Ida manhã',   'ida',   '06:00', 60, 'dia_anterior', '19:00', false),
  ('itaperuna', 'Ida tarde',   'ida',   '11:00', 60, 'mesmo_dia',    '08:00', false),
  ('itaperuna', 'Ida noite',   'ida',   '17:00', 60, 'mesmo_dia',    '15:00', false),
  ('itaperuna', 'Volta tarde', 'volta', '18:20', 60, 'mesmo_dia',    '15:00', false),
  ('itaperuna', 'Volta 20:30', 'volta', '20:30', 60, null,           null,    true),
  ('itaperuna', 'Volta noite', 'volta', '22:00', 60, 'mesmo_dia',    '15:00', false),
  -- Deslocamentos vazios (não aparecem para reserva; só escala e km)
  ('campos',    'Retorno vazio da ida manhã', 'deslocamento_vazio', '06:50', 75, null, null, false),
  ('itaperuna', 'Retorno vazio da ida manhã', 'deslocamento_vazio', '07:05', 60, null, null, false);
