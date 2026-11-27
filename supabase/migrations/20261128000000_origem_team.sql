-- CRM AlmaViva Solutions: origem da oportunidade e team members (especialistas)
-- Rode depois de 20261127020000_anexos_envios.sql.

-- Origem: Gerente de Conta pede qual gerente indicou e Diretor pede qual diretor indicou; as demais não pedem nada
alter table public.opcoes add column if not exists detalhe text;
-- Campos extras de um item (Configurações > Team members: tipo, especialidade ou função, e-mail)
alter table public.opcoes add column if not exists dados jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.opcoes add constraint opcoes_detalhe_chk check (detalhe in ('gerente','diretor'));
exception when duplicate_object then null; end $$;

-- Oportunidade: origem (lista 'origem'), o detalhe da origem e os team members (lista 'team')
-- (a coluna "origem" que já existe indica de onde veio o registro: crm ou carga inicial)
alter table public.oportunidades
  add column if not exists origem_oportunidade text,
  add column if not exists origem_detalhe      text,
  add column if not exists team_members        text[] not null default '{}';
create index if not exists oportunidades_origem_opp_idx on public.oportunidades (origem_oportunidade);
create index if not exists oportunidades_team_idx on public.oportunidades using gin (team_members);

-- Origens iniciais (pedido da área Comercial em 27/11/2026). Configurações > Listas de opções altera.
insert into public.opcoes (lista, valor, ordem, detalhe) values
  ('origem', 'Fabricante', 1, null),
  ('origem', 'Edital Publicado', 2, null),
  ('origem', 'Gerente de Conta', 3, 'gerente'),
  ('origem', 'Diretor', 4, 'diretor'),
  ('origem', 'Evento X', 5, null),
  ('origem', 'Evento Y', 6, null)
on conflict do nothing;
-- Team members (lista 'team'): começa vazia; especialistas e outros são cadastrados em Configurações > Team members.
