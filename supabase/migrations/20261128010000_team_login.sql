-- CRM AlmaViva Solutions: login dos team members (especialistas)
-- Rode depois de 20261128000000_origem_team.sql.
--
-- O team member entra no CRM e vê só as oportunidades em que foi marcado. Qualquer usuário ligado a um
-- team member também vê, além da própria carteira, as oportunidades em que foi marcado.

-- Nova carteira: 'marcadas'
alter table public.papeis  drop constraint if exists papeis_escopo_check;
alter table public.papeis  add  constraint papeis_escopo_check  check (escopo in ('proprio','area','todos','marcadas'));
alter table public.perfis  drop constraint if exists perfis_escopo_check;
alter table public.perfis  add  constraint perfis_escopo_check  check (escopo in ('proprio','area','todos','marcadas'));
alter table public.convites drop constraint if exists convites_escopo_check;
alter table public.convites add  constraint convites_escopo_check check (escopo in ('proprio','area','todos','marcadas'));

-- Vínculo do usuário com um nome da lista de team members
alter table public.perfis   add column if not exists team_member text;
alter table public.convites add column if not exists team_member text;

-- Tipo padrão: só vê Oportunidades, sem editar (Configurações > Usuários e acessos pode mudar)
insert into public.papeis (papel, nome, escopo, permissoes) values
  ('team', 'Team member', 'marcadas', '{"ver_oportunidades":true}')
on conflict (papel) do nothing;

create or replace function public.meu_team() returns text
language sql stable security definer set search_path = public as
$$ select team_member from public.perfis where user_id = auth.uid() and ativo $$;

-- A oportunidade (gerente + team members) está visível para o usuário?
create or replace function public.ve_opp(g text, t text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.ve_gerente(g) or coalesce(public.meu_team() = any(t), false)
$$;

create or replace function public.ve_oportunidade(n bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.ve_opp(gerente, team_members) from oportunidades where numero = n), false)
$$;

drop policy if exists opps_ler on public.oportunidades;
create policy opps_ler on public.oportunidades for select to authenticated using (public.ve_opp(gerente, team_members));
drop policy if exists opps_editar on public.oportunidades;
create policy opps_editar on public.oportunidades for update to authenticated
  using (public.pode('editar_oportunidades') and public.ve_opp(gerente, team_members))
  with check (public.pode('editar_oportunidades') and public.ve_opp(gerente, team_members));

drop policy if exists hist_ler on public.oportunidades_historico;
create policy hist_ler on public.oportunidades_historico for select to authenticated
  using (exists (select 1 from public.oportunidades o where o.numero = oportunidades_historico.numero and public.ve_opp(o.gerente, o.team_members)));

-- Convite leva o vínculo de team member para o perfil
create or replace function public.aplicar_convite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (user_id, nome, email, gerente, papel, areas, permissoes, escopo, ativo, team_member)
  select new.id, c.nome, new.email, c.gerente, c.papel, c.areas, c.permissoes, c.escopo, c.ativo, c.team_member
  from public.convites c where c.email = lower(new.email)
  on conflict (user_id) do nothing;
  delete from public.convites where email = lower(new.email);
  return new;
end $$;

create or replace function public.convite_conta_existente() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  new.email := lower(new.email);
  select id into uid from auth.users where lower(email) = new.email limit 1;
  if uid is not null then
    insert into public.perfis (user_id, nome, email, gerente, papel, areas, permissoes, escopo, ativo, team_member)
    values (uid, new.nome, new.email, new.gerente, new.papel, new.areas, new.permissoes, new.escopo, new.ativo, new.team_member)
    on conflict (user_id) do update set nome = excluded.nome, gerente = excluded.gerente, papel = excluded.papel,
      areas = excluded.areas, permissoes = excluded.permissoes, escopo = excluded.escopo, ativo = excluded.ativo,
      team_member = excluded.team_member;
    return null;
  end if;
  return new;
end $$;

-- Renomear um team member em Listas de opções também atualiza o vínculo dos usuários
create or replace function public.renomear_team_member(de text, para text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode('configurar') then raise exception 'sem permissão'; end if;
  update public.perfis set team_member = para where team_member = de;
  update public.convites set team_member = para where team_member = de;
end $$;
revoke all on function public.renomear_team_member(text, text) from public;
grant execute on function public.renomear_team_member(text, text) to authenticated;
