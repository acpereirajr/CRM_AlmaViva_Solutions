-- CRM AlmaViva Solutions: Relatórios e Reunião de forecast
-- Rode depois de 20261126020000_acessos.sql.

-- Diretor comercial de cada gerente (usado nos relatórios por diretor).
-- Os nomes dos diretores ficam na lista de opções 'diretor' (Configurações > Listas de opções).
alter table public.gerentes add column if not exists diretor text;

-- Permissões novas nos tipos padrão. Tipos criados na tela e exceções por usuário não mudam.
update public.papeis set permissoes = permissoes
  || jsonb_build_object('ver_relatorios', true)
  || jsonb_build_object('ver_reuniao', papel <> 'gerente')
  || jsonb_build_object('registrar_acoes', papel <> 'gerente')
where papel in ('admin','diretor','gerente') and not (permissoes ? 'ver_relatorios');

-- ---------------------------------------------------------------------------
-- Ações registradas na reunião de forecast (por oportunidade ou por gerente)
-- ---------------------------------------------------------------------------
create table if not exists public.acoes (
  id              bigint generated always as identity primary key,
  tipo            text not null check (tipo in ('opp','gerente')),
  numero          bigint references public.oportunidades(numero) on delete cascade,  -- tipo 'opp'
  gerente         text not null,
  texto           text not null,
  responsavel     text,
  prazo           date,
  status          text not null default 'aberta' check (status in ('aberta','concluida')),
  criado_em       timestamptz not null default now(),
  criado_por      uuid references auth.users(id),
  criado_por_nome text,
  atualizado_em   timestamptz not null default now(),
  check (tipo = 'gerente' or numero is not null)
);
create index if not exists acoes_gerente_idx on public.acoes (gerente);
create index if not exists acoes_numero_idx on public.acoes (numero);

alter table public.acoes enable row level security;
drop policy if exists acoes_ler on public.acoes;
create policy acoes_ler on public.acoes for select to authenticated
  using ((public.pode('ver_reuniao') or public.pode('registrar_acoes')) and public.ve_gerente(gerente));
drop policy if exists acoes_inserir on public.acoes;
create policy acoes_inserir on public.acoes for insert to authenticated
  with check (public.pode('registrar_acoes') and public.ve_gerente(gerente));
drop policy if exists acoes_editar on public.acoes;
create policy acoes_editar on public.acoes for update to authenticated
  using (public.pode('registrar_acoes') and public.ve_gerente(gerente))
  with check (public.pode('registrar_acoes') and public.ve_gerente(gerente));
drop policy if exists acoes_apagar on public.acoes;
create policy acoes_apagar on public.acoes for delete to authenticated
  using (public.pode('configurar') or criado_por = auth.uid());

do $$ begin
  begin alter publication supabase_realtime add table public.acoes; exception when others then null; end;
end $$;
