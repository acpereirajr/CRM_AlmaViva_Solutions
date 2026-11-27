-- CRM AlmaViva Solutions: categoria de forecast, cobertura, selos de risco e foto semanal do pipeline
-- Rode depois de 20261127000000_reuniao_forecast.sql.

-- ---------------------------------------------------------------------------
-- Diretores comerciais (informados pela área Comercial em 27/11/2026)
-- Cassiano e Hussem são diretores que também podem ter oportunidades próprias,
-- por isso entram como gerentes ligados a si mesmos.
-- ---------------------------------------------------------------------------
insert into public.opcoes (lista, valor, ordem) values
  ('diretor', 'Cassiano', 1), ('diretor', 'Hussem', 2), ('diretor', 'Adriano', 3)
on conflict do nothing;

insert into public.gerentes (nome, area, territorio) values ('Cassiano Bonani', null, null), ('Hussem', null, null)
on conflict (nome) do nothing;

update public.gerentes set diretor = 'Cassiano'
  where nome in ('Antonio C Pereira','Marcelo Costa','Orlando Junior','Bruno Cardoso','Juliana C Ferreira','Cassiano Bonani') and diretor is null;
update public.gerentes set diretor = 'Hussem'
  where nome in ('Reginaldo C Oliveira','Bruna Hausemer','Marcus Rondon','Jefferson M Santos','Hussem') and diretor is null;
update public.gerentes set diretor = 'Adriano' where nome = 'Daniele Freire' and diretor is null;
-- desligados: continuam donos das oportunidades antigas, mas saem dos seletores
update public.gerentes set ativo = false where nome in ('Gelson Yama','Mauro Sousa Lima','Washington Jose de Lyra Junior');

-- ---------------------------------------------------------------------------
-- Oportunidade: categoria de forecast, próximo passo e histórico para os selos de risco
-- ---------------------------------------------------------------------------
alter table public.oportunidades
  add column if not exists categoria          text check (categoria in ('Commit','Best case','Pipeline')),  -- null = sugerida pela probabilidade
  add column if not exists proximo_passo      text,
  add column if not exists proximo_passo_data date,
  add column if not exists adiamentos         int not null default 0,       -- vezes que o fechamento foi empurrado
  add column if not exists etapa_desde        timestamptz not null default now();

create or replace function public.oportunidade_risco() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.etapa_desde := coalesce(new.etapa_desde, now());
    new.adiamentos := coalesce(new.adiamentos, 0);
    return new;
  end if;
  -- valores calculados aqui; o que vier do app é ignorado
  new.etapa_desde := case when new.status is distinct from old.status then now() else old.etapa_desde end;
  new.adiamentos := coalesce(old.adiamentos, 0)
    + case when old.fechamento is not null and new.fechamento > old.fechamento then 1 else 0 end;
  return new;
end $$;

drop trigger if exists oportunidades_risco_trg on public.oportunidades;
create trigger oportunidades_risco_trg
  before insert or update on public.oportunidades
  for each row execute function public.oportunidade_risco();

-- ---------------------------------------------------------------------------
-- Limites configuráveis (Configurações > Forecast e riscos)
-- ---------------------------------------------------------------------------
create table if not exists public.parametros (
  chave          text primary key,
  valor          jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
insert into public.parametros (chave, valor) values ('forecast', jsonb_build_object(
  'coberturaAlvo', 3, 'commitProb', 90, 'bestProb', 70, 'diasSemAtualizacao', 30,
  'adiamentosMax', 2, 'diasEtapa', 60, 'fatorMedia', 1.5, 'valorAlto', 1000000))
on conflict (chave) do nothing;

alter table public.parametros enable row level security;
drop policy if exists parametros_ler on public.parametros;
create policy parametros_ler on public.parametros for select to authenticated using (true);
drop policy if exists parametros_admin on public.parametros;
create policy parametros_admin on public.parametros for all to authenticated
  using (public.pode('configurar')) with check (public.pode('configurar'));

-- ---------------------------------------------------------------------------
-- Foto semanal do pipeline (base do "o que mudou")
-- ---------------------------------------------------------------------------
create table if not exists public.fotos_pipeline (
  semana    text primary key,               -- ex.: 2026-W48
  data      date not null,
  criado_em timestamptz not null default now()
);
create table if not exists public.fotos_pipeline_itens (
  semana        text not null references public.fotos_pipeline(semana) on delete cascade,
  numero        bigint not null,
  gerente       text not null,
  status        text not null,
  categoria     text,                        -- Commit, Best case, Pipeline (já com a sugestão), Fechado ou null
  valor         numeric not null default 0,  -- valor no ano (serviço + software no ano)
  fechamento    date,
  probabilidade int,
  primary key (semana, numero)
);
create index if not exists fotos_itens_gerente_idx on public.fotos_pipeline_itens (gerente);

alter table public.fotos_pipeline enable row level security;
alter table public.fotos_pipeline_itens enable row level security;
drop policy if exists fotos_ler on public.fotos_pipeline;
create policy fotos_ler on public.fotos_pipeline for select to authenticated using (true);
drop policy if exists fotos_itens_ler on public.fotos_pipeline_itens;
create policy fotos_itens_ler on public.fotos_pipeline_itens for select to authenticated using (public.ve_gerente(gerente));
-- ninguém grava direto: só a função abaixo

-- Tira a foto da semana se ainda não existir. Idempotente; roda pelo agendamento e também
-- quando alguém abre o app numa semana sem foto.
create or replace function public.tirar_foto_pipeline() returns text
language plpgsql security definer set search_path = public as $$
declare
  sem text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY-"W"IW');
  p   jsonb;
begin
  if exists (select 1 from fotos_pipeline where semana = sem) then return sem; end if;
  if not exists (select 1 from oportunidades) then return null; end if;   -- antes da carga inicial
  select valor into p from parametros where chave = 'forecast';
  insert into fotos_pipeline (semana, data) values (sem, (now() at time zone 'America/Sao_Paulo')::date)
    on conflict do nothing;
  if not found then return sem; end if;
  insert into fotos_pipeline_itens (semana, numero, gerente, status, categoria, valor, fechamento, probabilidade)
  select sem, o.numero, o.gerente, o.status,
         case when e.tipo = 'ganha' then 'Fechado'
              when e.tipo <> 'aberta' then null
              when o.categoria is not null then o.categoria
              when coalesce(o.probabilidade, 0) >= coalesce((p->>'commitProb')::numeric, 90) then 'Commit'
              when coalesce(o.probabilidade, 0) >= coalesce((p->>'bestProb')::numeric, 70) then 'Best case'
              else 'Pipeline' end,
         o.faturamento_servico + o.software_ano, o.fechamento, o.probabilidade
    from oportunidades o left join etapas e on e.nome = o.status;
  return sem;
end $$;
revoke all on function public.tirar_foto_pipeline() from public;
grant execute on function public.tirar_foto_pipeline() to authenticated;

-- Agendamento: toda segunda às 6h (horário de Brasília = 9h UTC). No Supabase, o pg_cron
-- vem disponível; se não estiver, a foto é tirada no primeiro acesso da semana.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('foto-semanal-pipeline', '0 9 * * 1', 'select public.tirar_foto_pipeline()');
exception when others then
  raise notice 'pg_cron indisponível (%); a foto semanal será tirada no primeiro acesso de cada semana.', sqlerrm;
end $$;

select public.tirar_foto_pipeline();

do $$ begin
  begin alter publication supabase_realtime add table public.parametros; exception when others then null; end;
  begin alter publication supabase_realtime add table public.fotos_pipeline; exception when others then null; end;
end $$;
