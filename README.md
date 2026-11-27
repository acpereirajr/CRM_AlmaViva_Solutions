# CRM AlmaViva Solutions

CRM da área Comercial. Os gerentes cadastram oportunidades e clientes, e a diretoria acompanha um painel completo de meta, faturamento e pipeline. O painel segue o padrão do dashboard "Viva 360".

- **Front-end:** Vite + TypeScript, publicado no Vercel como site estático.
- **Banco, login e permissões:** Supabase (Postgres + Auth + Row Level Security).
- **Carga inicial:** script que lê as planilhas `FATURAMENTOS_2026.xlsx` (aba Consolidado) e o export de oportunidades.

## Acessos

Cada usuário tem um **tipo** (Administrador, Diretor, Gerente ou outro criado na tela). O tipo define:

- **Carteira que enxerga:** só a própria (o painel fica travado no gerente vinculado), os gerentes das suas áreas, ou todos.
- **Permissões:** quais telas vê (Painel, Oportunidades, Clientes, Faturamento, Configurações) e o que pode fazer (cadastrar e editar oportunidades, editar clientes, alterar o Running previsto).

No cadastro de cada usuário dá para abrir **exceções**: outra carteira, ou uma permissão liberada ou bloqueada só para ele. Tudo isso fica em *Configurações > Usuários e acessos*, que só quem tem a permissão Configurações vê. O Administrador nunca perde o acesso às Configurações.

Padrão: o gerente vê só a própria carteira; o diretor escolhe uma ou várias áreas e um ou vários gerentes; o administrador vê tudo. A lista de oportunidades segue a seleção do painel. As regras valem no banco (RLS): mesmo quem chamar a API direto só lê e grava o que o seu acesso permite.

## Relatórios e Reunião de forecast

- **Categoria de forecast:** cada oportunidade aberta é **Commit** (o gerente garante), **Best case** (pode entrar) ou **Pipeline**. Sem escolha do gerente, vale a sugestão pela probabilidade (Commit a partir de 90%, Best case a partir de 70%). Etapa ganha = **Fechado**.
- **Cobertura de pipeline:** pipeline aberto do período ÷ o que falta da meta (meta − realizado nas notas). Verde a partir do alvo (3x), amarelo a partir de 2/3 dele, vermelho abaixo.
- **Selos de risco:** data vencida, adiada 2 vezes ou mais, sem atualização há 30 dias, parada na etapa (60 dias e acima de 1,5 × a média da etapa) e valor alto (R$ 1 milhão no ano) sem próximo passo nem ação aberta. Todos os limites ficam em *Configurações > Forecast e riscos*. O banco conta os adiamentos e a data de entrada na etapa por gatilho.
- **Foto semanal do pipeline:** toda segunda às 6h o banco grava o pipeline inteiro (pg_cron); se o agendamento não estiver ativo, a foto é tirada no primeiro acesso da semana. As fotos alimentam a cascata "o que mudou" e a pauta da reunião.
- **Relatórios:** por gerente, diretor ou área, no ano ou num quarter: indicadores (meta, realizado, Commit, Realizado + Commit, Best case, pipeline aberto, cobertura, oportunidades em risco), gráfico de previsão × meta (em R$ ou % da meta), previsão por quarter, pipeline por etapa (valor e ponderado), tabela de cobertura, cobertura por quarter, cascata "o que mudou" contra a foto da semana passada, de 4 semanas ou a primeira, e a lista de oportunidades em risco. Exporta a tabela e as oportunidades em CSV (abre no Excel).
- **Reunião de forecast:** pauta automática (top negócios do quarter, riscos, o que mudou, ações pendentes, com botão para copiar), indicadores do gerente, gráficos 2D (padrão) ou 3D, oportunidades com categoria e selos, e o registro de **ações** por oportunidade e por gerente.
- O diretor de cada gerente é definido em *Configurações > Gerentes de negócios*. Hoje: Cassiano (Antonio C Pereira, Marcelo Costa, Orlando Junior, Bruno Cardoso, Juliana C Ferreira), Hussem (Reginaldo C Oliveira, Bruna Hausemer, Marcus Rondon, Jefferson M Santos) e Adriano (Daniele Freire). Cassiano e Hussem também podem ter oportunidades próprias.
- Permissões: `ver_relatorios`, `ver_reuniao` e `registrar_acoes`. Por padrão, gerentes veem Relatórios (só a própria carteira) mas não a Reunião.

## Configurações (aba do app)

Só quem tem a permissão Configurações vê e altera esta aba (por padrão, só o Administrador).

- **Etapas das oportunidades:** nome, ordem, tipo (Em aberto, Ganha, Perdida), probabilidade padrão e se está ativa. "Em aberto" entra no forecast, a única etapa "Ganha" entra no pipeline ganho. Uma etapa em uso não pode ser renomeada nem excluída, só desativada.
- **Gerentes de negócios:** e-mail, área, território, meta do ano e situação. Gerentes inativos saem da seleção do painel e dos formulários.
- **Metas:** período e meta de cada gerente para o ano escolhido no painel.
- **Forecast e riscos:** cobertura alvo, probabilidades da categoria sugerida e limites dos selos de risco.
- **Listas de opções:** valores de cada campo de seleção (área de negócio, fabricante, parceiro, tipo de revenda, segmento do cliente, área e território do gerente). Opções desativadas somem dos formulários, mas continuam nos registros antigos.

## Regras de cálculo (iguais às do dashboard anterior)

- **Realizado:** soma do `VALOR R$ FATURADO` da aba Consolidado, exceto notas canceladas. Inclui lançamentos sem status.
- **Forecast previsto:** oportunidades em aberto (Qualificação, Orçamento, Proposta, Forecast, Negociação) com fechamento no ano. O valor considerado é *Faturamento Serviço + Software Ano*.
- **Pipeline ganho:** oportunidades "Encerrada - Ganha" com fechamento no ano, pelo mesmo valor.
- **Running previsto:** valor digitado no painel para cada seleção de gerentes e ano.
- **Projeção combinada:** realizado + forecast + running.

## Como colocar no ar

1. **Supabase.** Crie um projeto em [supabase.com](https://supabase.com), na região São Paulo. Em *SQL Editor*, rode os arquivos de `supabase/migrations/` na ordem do nome: `20261126000000_schema.sql`, `20261126010000_configuracoes.sql`, `20261126020000_acessos.sql`, `20261127000000_reuniao_forecast.sql` e `20261127010000_forecast.sql`.
2. **Variáveis.** Copie `.env.example` para `.env` e preencha com os dados de *Project Settings > API*. A chave `service_role` só é usada pelo script de importação. Não a coloque no Vercel.
3. **Carga inicial.** Rode na sua máquina, com as planilhas na pasta:
   ```bash
   npm install
   npm run importar -- --faturamento FATURAMENTOS_2026.xlsx --oportunidades exporta_opp_AC.xlsx --metas scripts/metas-2026.json
   ```
   Rode de novo sempre que houver uma planilha de faturamento nova. O faturamento é substituído. As oportunidades são atualizadas pelo número, e os clientes cadastrados no CRM são preservados.
4. **Primeiro administrador.** Entre no app uma vez com o seu e-mail (link de acesso). Depois, no SQL Editor, crie o seu perfil:
   ```sql
   insert into perfis (user_id, nome, email, gerente, papel)
   select id, 'Seu nome', email, 'Antonio C Pereira', 'admin'
   from auth.users where email = 'seu-email@...';
   ```
   Os demais usuários você cadastra no próprio app, em *Configurações > Usuários e acessos*. A pessoa entra com o e-mail cadastrado e o acesso é liberado no primeiro login. Quem entrar sem cadastro não vê nada.
5. **Vercel.** Importe este repositório em [vercel.com](https://vercel.com). Defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e faça o deploy. Em seguida, no Supabase, coloque a URL do Vercel em *Authentication > URL Configuration*, para o link de acesso por e-mail funcionar.

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # checa tipos e gera dist/
```

## Estrutura

- `index.html`: telas (login, painel, oportunidades, clientes, faturamento).
- `src/main.ts`: login e inicialização.
- `src/app.ts`: cálculos, gráficos e telas.
- `src/supabase.ts`: acesso ao banco e conversão entre os nomes do banco e os do app.
- `supabase/migrations/`: tabelas, permissões (RLS), histórico de mudanças de etapa, tabelas de configuração (etapas, gerentes, opções) e acessos (tipos de usuário, perfis e convites).
- `scripts/importar-planilhas.mjs`: carga das planilhas.

## Próximos passos

- "O que mudou desde a última atualização", usando a tabela `oportunidades_historico`, que já registra cada mudança de etapa.
- Separar `src/app.ts`, que veio do protótipo, em módulos tipados por tela.
