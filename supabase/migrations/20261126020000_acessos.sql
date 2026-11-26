-- CRM AlmaViva Solutions: acessos configuráveis por tipo de usuário e por usuário
-- Rode depois de 20261126010000_configuracoes.sql.
--
-- Cada usuário tem um tipo (papel). O tipo define a carteira que ele enxerga (escopo) e as permissões.
-- No perfil do usuário dá para abrir exceções: outra carteira e permissões liberadas ou bloqueadas.
-- As regras abaixo valem no banco: mesmo quem chamar a API direto só lê e grava o que o seu acesso permite.

-- ---------------------------------------------------------------------------
-- Tipos de usuário
-- ---------------------------------------------------------------------------
create table if not exists public.papeis (
  papel      text primary key,
  nome       text not null,
  escopo     text not null default 'proprio' check (escopo in ('proprio','area','todos')),
  permissoes jsonb not null default '{}'
);

insert into public.papeis (papel, nome, escopo, permissoes) values
  ('admin', 'Administrador', 'todos', '{"ver_painel":true,"ver_oportunidades":true,"ver_clientes":true,"ver_faturamento":true,"configurar":true,"criar_oportunidades":true,"editar_oportunidades":true,"editar_clientes":true,"editar_running":true}'),
  ('diretor', 'Diretor', 'todos', '{"ver_painel":true,"ver_oportunidades":true,"ver_clientes":true,"ver_faturamento":true,"configurar":false,"criar_oportunidades":true,"editar_oportunidades":true,"editar_clientes":true,"editar_running":true}'),
  ('gerente', 'Gerente', 'proprio', '{"ver_painel":true,"ver_oportunidades":true,"ver_clientes":true,"ver_faturamento":true,"configurar":false,"criar_oportunidades":true,"editar_oportunidades":true,"editar_clientes":true,"editar_running":true}')
on conflict (papel) do nothing;

-- ---------------------------------------------------------------------------
-- Perfis: tipo passa a vir da tabela papeis; exceções por usuário
-- ---------------------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis drop constraint if exists perfis_papel_fk;
alter table public.perfis add constraint perfis_papel_fk foreign key (papel) references public.papeis(papel) on update cascade;
alter table public.perfis add column if not exists areas      text[] not null default '{}';
alter table public.perfis add column if not exists permissoes jsonb  not null default '{}';  -- exceções: {"editar_running": false}
alter table public.perfis add column if not exists escopo     text check (escopo in ('proprio','area','todos'));  -- null = igual ao tipo
alter table public.perfis add column if not exists ativo      boolean not null default true;

-- Usuários cadastrados na tela que ainda não entraram no app. No primeiro login o convite vira perfil.
create table if not exists public.convites (
  email      text primary key,   -- sempre em minúsculas
  nome       text not null,
  papel      text not null references public.papeis(papel) on update cascade,
  gerente    text,
  areas      text[] not null default '{}',
  permissoes jsonb  not null default '{}',
  escopo     text check (escopo in ('proprio','area','todos')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Funções de acesso
-- ---------------------------------------------------------------------------
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as
$$ select papel from public.perfis where user_id = auth.uid() and ativo $$;

create or replace function public.meu_gerente() returns text
language sql stable security definer set search_path = public as
$$ select gerente from public.perfis where user_id = auth.uid() and ativo $$;

create or replace function public.pode(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when not p.ativo then false
      when perm = 'configurar' and p.papel = 'admin' then true   -- o administrador nunca fica trancado fora
      when p.permissoes ? perm then (p.permissoes ->> perm)::boolean
      else coalesce((t.permissoes ->> perm)::boolean, false)
    end
    from public.perfis p left join public.papeis t on t.papel = p.papel
    where p.user_id = auth.uid()), false)
$$;

create or replace function public.meu_escopo() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when not p.ativo then 'nenhum' else coalesce(p.escopo, t.escopo, 'proprio') end
    from public.perfis p left join public.papeis t on t.papel = p.papel
    where p.user_id = auth.uid()), 'nenhum')
$$;

create or replace function public.minhas_areas() returns text[]
language sql stable security definer set search_path = public as
$$ select coalesce((select areas from public.perfis where user_id = auth.uid()), '{}') $$;

create or replace function public.ve_tudo() returns boolean
language sql stable security definer set search_path = public as
$$ select public.meu_escopo() = 'todos' $$;

-- O usuário enxerga a carteira deste gerente?
create or replace function public.ve_gerente(g text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.meu_escopo()
    when 'todos' then true
    when 'area' then g = public.meu_gerente()
                  or exists (select 1 from public.gerentes x where x.nome = g and x.area = any(public.minhas_areas()))
    when 'proprio' then g = public.meu_gerente()
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- Convite vira perfil no primeiro login (ou na hora, se a pessoa já tem conta)
-- ---------------------------------------------------------------------------
create or replace function public.aplicar_convite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (user_id, nome, email, gerente, papel, areas, permissoes, escopo, ativo)
  select new.id, c.nome, new.email, c.gerente, c.papel, c.areas, c.permissoes, c.escopo, c.ativo
  from public.convites c where c.email = lower(new.email)
  on conflict (user_id) do nothing;
  delete from public.convites where email = lower(new.email);
  return new;
end $$;

drop trigger if exists aplicar_convite_trg on auth.users;
create trigger aplicar_convite_trg after insert on auth.users
  for each row execute function public.aplicar_convite();

create or replace function public.convite_conta_existente() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  new.email := lower(new.email);
  select id into uid from auth.users where lower(email) = new.email limit 1;
  if uid is not null then
    insert into public.perfis (user_id, nome, email, gerente, papel, areas, permissoes, escopo, ativo)
    values (uid, new.nome, new.email, new.gerente, new.papel, new.areas, new.permissoes, new.escopo, new.ativo)
    on conflict (user_id) do update set nome = excluded.nome, gerente = excluded.gerente, papel = excluded.papel,
      areas = excluded.areas, permissoes = excluded.permissoes, escopo = excluded.escopo, ativo = excluded.ativo;
    return null;   -- a conta já existe: grava direto no perfil e não guarda o convite
  end if;
  return new;
end $$;

drop trigger if exists convite_conta_existente_trg on public.convites;
create trigger convite_conta_existente_trg before insert or update on public.convites
  for each row execute function public.convite_conta_existente();

-- ---------------------------------------------------------------------------
-- Regras (RLS) refeitas com as permissões configuráveis
-- ---------------------------------------------------------------------------
alter table public.papeis   enable row level security;
alter table public.convites enable row level security;

drop policy if exists papeis_ler on public.papeis;
create policy papeis_ler on public.papeis for select to authenticated using (true);
drop policy if exists papeis_admin on public.papeis;
create policy papeis_admin on public.papeis for all to authenticated
  using (public.pode('configurar')) with check (public.pode('configurar'));

drop policy if exists convites_admin on public.convites;
create policy convites_admin on public.convites for all to authenticated
  using (public.pode('configurar')) with check (public.pode('configurar'));

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (user_id = auth.uid() or public.pode('configurar') or public.ve_tudo());
drop policy if exists perfis_admin on public.perfis;
create policy perfis_admin on public.perfis for all to authenticated
  using (public.pode('configurar')) with check (public.pode('configurar'));

drop policy if exists clientes_inserir on public.clientes;
create policy clientes_inserir on public.clientes for insert to authenticated with check (public.pode('editar_clientes'));
drop policy if exists clientes_editar on public.clientes;
create policy clientes_editar on public.clientes for update to authenticated
  using (public.pode('editar_clientes') and (public.ve_gerente(gerente) or gerente is null or gerente = ''));
drop policy if exists clientes_apagar on public.clientes;
create policy clientes_apagar on public.clientes for delete to authenticated using (public.pode('configurar'));

drop policy if exists opps_ler on public.oportunidades;
create policy opps_ler on public.oportunidades for select to authenticated using (public.ve_gerente(gerente));
drop policy if exists opps_inserir on public.oportunidades;
create policy opps_inserir on public.oportunidades for insert to authenticated
  with check (public.pode('criar_oportunidades') and public.ve_gerente(gerente));
drop policy if exists opps_editar on public.oportunidades;
create policy opps_editar on public.oportunidades for update to authenticated
  using (public.pode('editar_oportunidades') and public.ve_gerente(gerente))
  with check (public.pode('editar_oportunidades') and public.ve_gerente(gerente));
drop policy if exists opps_apagar on public.oportunidades;
create policy opps_apagar on public.oportunidades for delete to authenticated using (public.pode('configurar'));

drop policy if exists hist_ler on public.oportunidades_historico;
create policy hist_ler on public.oportunidades_historico for select to authenticated
  using (exists (select 1 from public.oportunidades o where o.numero = oportunidades_historico.numero and public.ve_gerente(o.gerente)));

drop policy if exists fat_ler on public.faturamento;
create policy fat_ler on public.faturamento for select to authenticated using (public.ve_gerente(gerente));

drop policy if exists running_gravar on public.running_previsto;
create policy running_gravar on public.running_previsto for all to authenticated
  using (public.pode('editar_running') and (public.ve_tudo() or not exists (
    select 1 from unnest(string_to_array(split_part(chave, '@', 1), '|')) g where not public.ve_gerente(g))))
  with check (public.pode('editar_running') and (public.ve_tudo() or not exists (
    select 1 from unnest(string_to_array(split_part(chave, '@', 1), '|')) g where not public.ve_gerente(g))));

drop policy if exists metas_admin on public.metas;
create policy metas_admin on public.metas for all to authenticated
  using (public.pode('configurar')) with check (public.pode('configurar'));
drop policy if exists etapas_admin on public.etapas;
create policy etapas_admin on public.etapas for all to authenticated
  using (public.pode('configurar')) with check (public.pode('configurar'));
drop policy if exists gerentes_admin on public.gerentes;
create policy gerentes_admin on public.gerentes for all to authenticated
  using (public.pode('configurar')) with check (public.pode('configurar'));
drop policy if exists opcoes_admin on public.opcoes;
create policy opcoes_admin on public.opcoes for all to authenticated
  using (public.pode('configurar')) with check (public.pode('configurar'));

do $$ begin
  begin alter publication supabase_realtime add table public.papeis; exception when others then null; end;
end $$;
