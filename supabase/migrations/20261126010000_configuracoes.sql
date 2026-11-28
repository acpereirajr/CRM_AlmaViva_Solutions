-- CRM AlmaViva Solutions: tabelas de configuração (etapas, gerentes de negócios e listas de opções)
-- Rode depois de 20261126000000_schema.sql.

-- ---------------------------------------------------------------------------
-- Etapas das oportunidades (antes fixas no código e num CHECK do banco)
-- ---------------------------------------------------------------------------
create table if not exists public.etapas (
  nome          text primary key,
  ordem         int  not null default 0,
  tipo          text not null check (tipo in ('aberta','ganha','perdida')),
  probabilidade int  not null default 0 check (probabilidade between 0 and 100),
  ativa         boolean not null default true,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
-- Só uma etapa pode ser "ganha": é ela que alimenta o pipeline ganho.
create unique index if not exists etapas_uma_ganha on public.etapas (tipo) where tipo = 'ganha';

insert into public.etapas (nome, ordem, tipo, probabilidade) values
  ('Qualificação', 1, 'aberta', 10),
  ('Orçamento', 2, 'aberta', 30),
  ('Proposta', 3, 'aberta', 50),
  ('Forecast', 4, 'aberta', 70),
  ('Negociação', 5, 'aberta', 90),
  ('Encerrada - Ganha', 6, 'ganha', 100),
  ('Encerrada - Perdida', 7, 'perdida', 0),
  ('Encerrada - Abandonada', 8, 'perdida', 0),
  ('Encerrada - Encerrada pelo Sistema', 9, 'perdida', 0)
on conflict (nome) do nothing;

-- A etapa da oportunidade passa a apontar para a tabela de etapas.
alter table public.oportunidades drop constraint if exists oportunidades_status_check;
alter table public.oportunidades drop constraint if exists oportunidades_status_fk;
alter table public.oportunidades add constraint oportunidades_status_fk
  foreign key (status) references public.etapas(nome) on update cascade;

-- ---------------------------------------------------------------------------
-- Gerentes de negócios: área, território e situação. A meta fica em public.metas.
-- ---------------------------------------------------------------------------
create table if not exists public.gerentes (
  nome           text primary key,  -- igual ao usado em oportunidades, faturamento, metas e perfis.gerente
  email          text,
  area           text,              -- ex.: Público, Privado, Parcerias
  territorio     text,              -- ex.: PRODESP, PUBLICO, PRIVADO, RJ, DF
  ativo          boolean not null default true,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

insert into public.gerentes (nome, area, territorio) values
  ('Antonio C Pereira', 'Público', 'PUBLICO'),
  ('Bruna Hausemer', null, null),
  ('Bruno Cardoso', 'Público', 'PUBLICO'),
  ('Cassiano Bonani', null, null),
  ('Daniele Freire', 'Público', 'PRODESP'),
  ('Gelson Yama', 'Público', 'PUBLICO'),
  ('Jefferson M Santos', 'Público', 'DF'),
  ('Juliana C Ferreira', 'Privado', 'PRIVADO'),
  ('Marcelo Costa', 'Público', 'PUBLICO'),
  ('Marcus Rondon', 'Público', 'RJ'),
  ('Mauro Sousa Lima', 'Privado', 'PRIVADO'),
  ('Orlando Junior', null, null),
  ('Reginaldo C Oliveira', 'Público', 'PUBLICO'),
  ('Washington Jose de Lyra Junior', 'Público', 'DF')
on conflict (nome) do nothing;


-- ---------------------------------------------------------------------------
-- Listas de opções dos campos de seleção (fabricante, parceiro, área, revenda,
-- segmento do cliente, área e território do gerente). Editadas em Configurações.
-- ---------------------------------------------------------------------------
create table if not exists public.opcoes (
  lista  text not null,   -- area | fabricante | parceiro | revenda | segmento | area_gerente | territorio
  valor  text not null,
  ordem  int  not null default 0,
  ativo  boolean not null default true,
  primary key (lista, valor)
);

insert into public.opcoes (lista, valor, ordem) values
  ('area', 'Revenda', 1),
  ('area', 'Consultoria', 2),
  ('area', 'Desenvolvimento de Soluções', 3),
  ('area', 'Serviços de Infra-estrutura de TI', 4),
  ('fabricante', 'Google', 1),
  ('fabricante', 'IBM', 2),
  ('fabricante', 'Red Hat', 3),
  ('fabricante', 'Liferay', 4),
  ('fabricante', 'HCL', 5),
  ('fabricante', 'Delphix', 6),
  ('fabricante', 'Perforce', 7),
  ('fabricante', 'InterSystems', 8),
  ('fabricante', 'Oracle', 9),
  ('fabricante', 'AWS', 10),
  ('fabricante', 'ISS/iSSI', 11),
  ('parceiro', 'Google', 1),
  ('parceiro', 'IBM', 2),
  ('parceiro', 'RedHat', 3),
  ('parceiro', 'Liferay', 4),
  ('parceiro', 'HCL', 5),
  ('parceiro', 'Delphix/Perforce', 6),
  ('parceiro', 'ISS/iSSI', 7),
  ('parceiro', 'InterSystems', 8),
  ('parceiro', 'Oracle', 9),
  ('parceiro', 'AWS', 10),
  ('revenda', 'Software', 1),
  ('revenda', 'Hardware', 2),
  ('segmento', 'Público', 1),
  ('segmento', 'Privado', 2),
  ('segmento', 'Parcerias', 3),
  ('area_gerente', 'Público', 1),
  ('area_gerente', 'Privado', 2),
  ('area_gerente', 'Parcerias', 3),
  ('territorio', 'PRODESP', 1),
  ('territorio', 'PUBLICO', 2),
  ('territorio', 'PRIVADO', 3),
  ('territorio', 'RJ', 4),
  ('territorio', 'DF', 5),
  ('territorio', 'PARCERIAS', 6)
on conflict (lista, valor) do nothing;

-- ---------------------------------------------------------------------------
-- Segurança: todos leem; só admin altera (metas já seguem a mesma regra)
-- ---------------------------------------------------------------------------
alter table public.etapas   enable row level security;
alter table public.gerentes enable row level security;
alter table public.opcoes   enable row level security;

drop policy if exists etapas_ler on public.etapas;
create policy etapas_ler on public.etapas for select to authenticated using (true);
drop policy if exists etapas_admin on public.etapas;
create policy etapas_admin on public.etapas for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');

drop policy if exists gerentes_ler on public.gerentes;
create policy gerentes_ler on public.gerentes for select to authenticated using (true);
drop policy if exists gerentes_admin on public.gerentes;
create policy gerentes_admin on public.gerentes for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');

drop policy if exists opcoes_ler on public.opcoes;
create policy opcoes_ler on public.opcoes for select to authenticated using (true);
drop policy if exists opcoes_admin on public.opcoes;
create policy opcoes_admin on public.opcoes for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');

do $$ begin
  begin alter publication supabase_realtime add table public.etapas; exception when others then null; end;
  begin alter publication supabase_realtime add table public.gerentes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.metas; exception when others then null; end;
  begin alter publication supabase_realtime add table public.opcoes; exception when others then null; end;
end $$;
