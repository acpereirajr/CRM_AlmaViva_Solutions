-- CRM AlmaViva Solutions: numeração das oportunidades, anexos, pré-vendas e envios por e-mail
-- Rode depois de 20261127010000_forecast.sql.

-- ---------------------------------------------------------------------------
-- Número da oportunidade: sequencial, único e nunca reaproveitado.
-- As da carga inicial mantêm o número do sistema antigo; as novas começam em 7000
-- ou logo depois do maior número existente, o que for maior.
-- ---------------------------------------------------------------------------
create or replace function public.ajustar_numeracao() returns bigint
language plpgsql security definer set search_path = public as $$
declare seq text := pg_get_serial_sequence('public.oportunidades', 'numero'); prox bigint; atual bigint;
begin
  -- nunca volta a sequência: um número já usado (mesmo de oportunidade apagada) não é reaproveitado
  execute format('select case when is_called then last_value + 1 else last_value end from %s', seq) into atual;
  select greatest(7000, coalesce(max(numero), 0) + 1, atual) into prox from oportunidades;
  perform setval(seq, prox, false);
  return prox;
end $$;
revoke all on function public.ajustar_numeracao() from public;
do $$ begin execute 'revoke all on function public.ajustar_numeracao() from anon, authenticated'; exception when others then null; end $$;
select public.ajustar_numeracao();

-- vê a oportunidade quem vê o gerente dela
create or replace function public.ve_oportunidade(n bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.ve_gerente(gerente) from oportunidades where numero = n), false)
$$;
create or replace function public.ve_oportunidade_txt(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when t ~ '^[0-9]{1,18}$' then public.ve_oportunidade(t::bigint) else false end
$$;

-- ---------------------------------------------------------------------------
-- Anexos (arquivo no Storage, bucket privado 'anexos', caminho <número>/<uuid>-<nome>)
-- ---------------------------------------------------------------------------
create table if not exists public.anexos (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint not null references public.oportunidades(numero) on delete cascade,
  nome            text not null,
  caminho         text not null unique,
  tamanho         bigint not null default 0,
  tipo            text,
  criado_em       timestamptz not null default now(),
  criado_por      uuid references auth.users(id),
  criado_por_nome text
);
create index if not exists anexos_numero_idx on public.anexos (numero);
alter table public.anexos enable row level security;
drop policy if exists anexos_ler on public.anexos;
create policy anexos_ler on public.anexos for select to authenticated using (public.ve_oportunidade(numero));
drop policy if exists anexos_inserir on public.anexos;
create policy anexos_inserir on public.anexos for insert to authenticated
  with check (public.pode('editar_oportunidades') and public.ve_oportunidade(numero) and caminho like numero::text || '/%');
drop policy if exists anexos_apagar on public.anexos;
create policy anexos_apagar on public.anexos for delete to authenticated
  using (public.ve_oportunidade(numero) and (public.pode('configurar') or criado_por = auth.uid()));

-- Bucket e regras do Storage (só existem no Supabase; em outro Postgres este bloco só avisa)
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit) values ('anexos', 'anexos', false, 52428800)
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
  execute $p$drop policy if exists anexos_storage_ler on storage.objects$p$;
  execute $p$create policy anexos_storage_ler on storage.objects for select to authenticated
    using (bucket_id = 'anexos' and public.ve_oportunidade_txt((storage.foldername(name))[1]))$p$;
  execute $p$drop policy if exists anexos_storage_inserir on storage.objects$p$;
  execute $p$create policy anexos_storage_inserir on storage.objects for insert to authenticated
    with check (bucket_id = 'anexos' and public.pode('editar_oportunidades') and public.ve_oportunidade_txt((storage.foldername(name))[1]))$p$;
  execute $p$drop policy if exists anexos_storage_apagar on storage.objects$p$;
  execute $p$create policy anexos_storage_apagar on storage.objects for delete to authenticated
    using (bucket_id = 'anexos' and public.ve_oportunidade_txt((storage.foldername(name))[1]) and (public.pode('configurar') or owner = auth.uid()))$p$;
exception when others then
  raise notice 'Storage indisponível (%); crie o bucket anexos no Supabase.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Pré-vendas: quem pode receber oportunidades por e-mail (Configurações > Pré-vendas)
-- ---------------------------------------------------------------------------
create table if not exists public.prevendas (
  id             bigint generated always as identity primary key,
  nome           text not null,
  email          text not null unique,
  ativo          boolean not null default true,
  atualizado_em  timestamptz not null default now()
);
alter table public.prevendas enable row level security;
drop policy if exists prevendas_ler on public.prevendas;
create policy prevendas_ler on public.prevendas for select to authenticated using (true);
drop policy if exists prevendas_admin on public.prevendas;
create policy prevendas_admin on public.prevendas for all to authenticated
  using (public.pode('configurar')) with check (public.pode('configurar'));

-- ---------------------------------------------------------------------------
-- Envios: histórico de cada e-mail mandado de dentro do CRM. Só a função
-- enviar-oportunidade grava (com a chave de serviço, no servidor).
-- ---------------------------------------------------------------------------
create table if not exists public.envios (
  id               bigint generated always as identity primary key,
  numero           bigint not null references public.oportunidades(numero) on delete cascade,
  prevendas_id     bigint references public.prevendas(id),
  para_nome        text not null,
  para_email       text not null,
  cc               text,
  assunto          text not null,
  mensagem         text,
  anexos           jsonb not null default '[]'::jsonb,   -- nomes dos arquivos enviados
  status           text not null check (status in ('enviado','erro')),
  erro             text,
  provedor_id      text,
  enviado_em       timestamptz not null default now(),
  enviado_por      uuid references auth.users(id),
  enviado_por_nome text
);
create index if not exists envios_numero_idx on public.envios (numero);
alter table public.envios enable row level security;
drop policy if exists envios_ler on public.envios;
create policy envios_ler on public.envios for select to authenticated using (public.ve_oportunidade(numero));

do $$ begin
  begin alter publication supabase_realtime add table public.prevendas; exception when others then null; end;
end $$;
