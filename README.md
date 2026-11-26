# CRM AlmaViva Solutions

CRM da área Comercial. Os gerentes cadastram oportunidades e clientes, e a diretoria acompanha um painel completo de meta, faturamento e pipeline. O painel segue o padrão do dashboard "Viva 360".

- **Front-end:** Vite + TypeScript, publicado no Vercel como site estático.
- **Banco, login e permissões:** Supabase (Postgres + Auth + Row Level Security).
- **Carga inicial:** script que lê as planilhas `FATURAMENTOS_2026.xlsx` (aba Consolidado) e o export de oportunidades.

## O que cada perfil vê

| Perfil | Oportunidades e clientes | Faturamento | Painel |
|---|---|---|---|
| `gerente` | só a própria carteira (lê e edita) | só o próprio | travado no próprio nome |
| `diretor` | todas (lê e edita) | todo | escolhe qualquer combinação de gerentes |
| `admin` | todas, e pode apagar | todo | idem, e gerencia perfis e metas |

As regras ficam no banco (RLS). Mesmo quem chamar a API direto não vê a carteira de outro gerente.

## Regras de cálculo (iguais às do dashboard anterior)

- **Realizado:** soma do `VALOR R$ FATURADO` da aba Consolidado, exceto notas canceladas. Inclui lançamentos sem status.
- **Forecast previsto:** oportunidades em aberto (Qualificação, Orçamento, Proposta, Forecast, Negociação) com fechamento no ano. O valor considerado é *Faturamento Serviço + Software Ano*.
- **Pipeline ganho:** oportunidades "Encerrada - Ganha" com fechamento no ano, pelo mesmo valor.
- **Running previsto:** valor digitado no painel para cada seleção de gerentes e ano.
- **Projeção combinada:** realizado + forecast + running.

## Como colocar no ar

1. **Supabase.** Crie um projeto em [supabase.com](https://supabase.com), na região São Paulo. Em *SQL Editor*, rode o arquivo `supabase/migrations/20261126000000_schema.sql`.
2. **Variáveis.** Copie `.env.example` para `.env` e preencha com os dados de *Project Settings > API*. A chave `service_role` só é usada pelo script de importação. Não a coloque no Vercel.
3. **Carga inicial.** Rode na sua máquina, com as planilhas na pasta:
   ```bash
   npm install
   npm run importar -- --faturamento FATURAMENTOS_2026.xlsx --oportunidades exporta_opp_AC.xlsx --metas scripts/metas-2026.json
   ```
   Rode de novo sempre que houver uma planilha de faturamento nova. O faturamento é substituído. As oportunidades são atualizadas pelo número, e os clientes cadastrados no CRM são preservados.
4. **Usuários.** Em *Authentication > Users*, convide cada pessoa por e-mail. Depois crie o perfil de cada uma no SQL Editor:
   ```sql
   insert into perfis (user_id, nome, email, gerente, papel)
   select id, 'Antonio Carlos Pereira Junior', email, 'Antonio C Pereira', 'admin'
   from auth.users where email = 'email@almaviva...';
   ```
   O campo `gerente` precisa ser igual ao nome usado nas oportunidades e metas, por exemplo `Daniele Freire` ou `Marcus Rondon`.
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
- `supabase/migrations/`: tabelas, permissões (RLS) e histórico de mudanças de etapa.
- `scripts/importar-planilhas.mjs`: carga das planilhas.

## Próximos passos

- Tela de administração de usuários e metas, hoje feita pelo painel do Supabase.
- "O que mudou desde a última atualização", usando a tabela `oportunidades_historico`, que já registra cada mudança de etapa.
- Separar `src/app.ts`, que veio do protótipo, em módulos tipados por tela.
