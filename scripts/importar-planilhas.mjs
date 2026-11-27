#!/usr/bin/env node
// Importa as planilhas do Comercial para o Supabase.
//
// Uso:
//   npm run importar -- --faturamento FATURAMENTOS_2026.xlsx --oportunidades exporta_opp_AC.xlsx [--metas metas.json]
//
// - Faturamento: lê só a aba "Consolidado". Substitui todos os lançamentos (exceto cancelados e sem valor).
// - Oportunidades: lê a primeira aba do export. Insere ou atualiza pelo "Nro Opp".
// - Clientes: criados a partir das oportunidades e do faturamento (não apaga os cadastrados no CRM).
// - Metas: arquivo JSON { "ano": 2026, "inicio": "2026-01-01", "fim": "2027-12-31", "valores": { "Gerente": 80000000 } }.
//
// Precisa de VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env (a chave service role ignora o RLS:
// use só na sua máquina, nunca no app nem no Vercel).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
  return acc;
}, []));

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// Nomes de gerente no faturamento -> nome usado nas oportunidades e metas
const GERENTES = {
  'Daniele Helena Freire dos Santos Narciso': 'Daniele Freire',
  'Antonio Carlos Pereira Junior': 'Antonio C Pereira',
  'Marcelo Marques Costa': 'Marcelo Costa',
  'Gelson Hirotsugu Yama': 'Gelson Yama',
  'Juliana Cristina': 'Juliana C Ferreira',
  'Marcos Rondon': 'Marcus Rondon',
  'Reginaldo Cardoso': 'Reginaldo C Oliveira',
  'Jefferson Bizari': 'Jefferson M Santos',
  'Bruno Baranda': 'Bruno Cardoso',
  '-': 'Sem gerente',
  'PARCERIAS': 'Parcerias',
};
// Sigla do cliente no faturamento -> nome do cliente nas oportunidades
const CLIENTES = {
  'PRODESP': 'PRODESP', 'Prodesp': 'PRODESP', 'SMSUB': 'SMSUB - Subprefeituras de SP', 'PRODAM': 'PRODAM - SP',
  'RNP': 'Rede Nacional de Ensino e Pesquisa - Rnp', 'SABESP': 'SABESP - Companhia de Saneamento Básico do Estado de SP',
  'ALESP': 'ALESP', 'PORTO SEGURO': 'Porto Seguro', 'INFRAERO': 'INFRAERO', 'ARTESP': 'ARTESP', 'EMBRAPA': 'Embrapa',
  'COPA ENERGIA': 'Copa Energia', 'IMA': 'IMA - Informática de Municípios Associados', 'SOCICAM': 'SOCICAM',
  'CALOI': 'Caloi Norte S/A (Nações)', 'LBV': 'LBV', 'TIBÉRIO': 'Tibério Construções e Incorporações S/A',
  'BANCO BS2': 'BANCO BS2 S.A', 'BANCO PAULISTA': 'Banco Paulista', 'SURA': 'Sura', 'FCC': 'FCC',
  'SIM PAUL': 'Sim paul corretora de câmbio e valores mobiliários', 'ALMAWAVE GCP': 'Almawave do Brasil Informática Ltda.',
  'ALMAWAVE WORSPACE': 'Almawave do Brasil Informática Ltda.', 'CONSTELLATION': 'Constellation S.A.',
  'GUABIFIOS': 'Guabifios Produtos Têxteis Ltda', 'Guabifios': 'Guabifios Produtos Têxteis Ltda',
  'IOCHPE MAXION': 'Iochpe Maxion S.A.', 'FLAGSHIP': 'FLAGSHIP INSTITUICAO DE PAGAMENTOS LTDA',
  'Elfa': 'ELFA', 'Red Hat': 'RED HAT', 'Liferay ou Parcerias?': 'PARCERIAS',
};

const slug = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const txt = v => { const s = String(v ?? '').replace(/ /g, ' ').trim(); return ['', '-', '--', 'nan', 'NaN'].includes(s) ? '' : s; };
const brl = v => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  const n = Number(s); return Number.isFinite(n) ? n : 0;
};
const toDate = v => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; }
  const m = String(v ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
const pctNum = v => typeof v === 'number' ? Math.round(v <= 1 ? v * 100 : v) : (Number(String(v ?? '').replace('%', '').trim()) || 0);
const canonCliente = c => { c = txt(c); if (c === 'IMA') return CLIENTES.IMA; return CLIENTES[c] || c; };
const canonGerente = g => { g = txt(g) || '-'; return GERENTES[g] || GERENTES[Object.keys(GERENTES).find(k => k.toLowerCase() === g.toLowerCase())] || g; };

async function inChunks(rows, size, fn) { for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size), i); }
function check({ error }, what) { if (error) { console.error(`Erro em ${what}:`, error.message); process.exit(1); } }

const clientes = new Map(); // id -> registro
function addCliente(nome, gerente, extra = {}) {
  const id = slug(nome); if (!id) return id;
  const c = clientes.get(id) || { id, nome, gerente: '', segmento: '', siglas_faturamento: [], origem: 'carga-inicial', _g: {} };
  if (gerente) c._g[gerente] = (c._g[gerente] || 0) + 1;
  if (extra.sigla && !c.siglas_faturamento.includes(extra.sigla)) c.siglas_faturamento.push(extra.sigla);
  if (extra.segmento && !c.segmento) c.segmento = extra.segmento;
  clientes.set(id, c); return id;
}

let opps = [], fat = [];

if (args.oportunidades) {
  const wb = XLSX.readFile(args.oportunidades, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  for (const r of rows) {
    if (!r['Nro Opp']) continue;
    const cliente = canonCliente(r['Cliente']);
    const cliente_id = addCliente(cliente, txt(r['Gerente']));
    opps.push({
      numero: Number(r['Nro Opp']), gerente: txt(r['Gerente']), cliente, cliente_id, status: txt(r['Status']),
      titulo: txt(r['Oportunidade']), area: txt(r['Area de Negócio']), revenda: txt(r['Revenda']) || null,
      software: txt(r['Software']) || null, parceiro: txt(r['Parceiro']) || null,
      cadastro: toDate(r['Dt.Cadastro']), fechamento: toDate(r['Fechamento']),
      probabilidade: pctNum(r['% Evolução']),
      valor_total: brl(r['Valor Total']), valor_servico: brl(r['Valor serviço']), faturamento_servico: brl(r['Faturamento Serviço']),
      valor_software: brl(r['Valor de Software']), software_ano: brl(r['Software Ano']),
      desc_servico: txt(r['Descrição do Serviço']), desc_produto: txt(r['Descrição do Produto']), origem: 'carga-inicial',
    });
  }
  console.log(`Oportunidades lidas: ${opps.length}`);
}

if (args.faturamento) {
  const wb = XLSX.readFile(args.faturamento, { cellDates: true });
  const ws = wb.Sheets['Consolidado'];
  if (!ws) { console.error('A planilha de faturamento não tem a aba "Consolidado".'); process.exit(1); }
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const carga = new Date().toISOString();
  for (const r of rows) {
    const status = txt(r['Status NF']);
    const valor = Number(r['VALOR R$ FATURADO']) || 0;
    if (status.toLowerCase() === 'cancelada' || !valor) continue;
    const mesRaw = r['MÊS EMISSÃO DA NOTA']; const mes = (toDate(mesRaw) || '').slice(0, 7);
    if (!mes) continue;
    const sigla = txt(r['CLIENTE']); const cliente = canonCliente(sigla); const gerente = canonGerente(r['GERENTE DA CONTA']);
    const terr = txt(r['TERRITÓRIO']);
    const segmento = ['PRODESP', 'PUBLICO', 'RJ', 'DF'].includes(terr) ? 'Público' : terr === 'PRIVADO' ? 'Privado' : terr === 'PARCERIAS' ? 'Parcerias' : '';
    const cliente_id = addCliente(cliente, gerente, { sigla, segmento });
    fat.push({ mes, gerente, cliente, cliente_id, projeto: txt(r['PROJETO']), tipo: txt(r['TIPO']), tecnologia: txt(r['TECNOLOGIA']),
      bu: txt(r['BU']), territorio: terr, contrato: txt(r['CONTRATO']), nf: txt(r['NF saída']).replace(/\.0$/, ''),
      status: status === 'Emitida' ? 'Emitida' : 'Sem status', valor: Math.round(valor * 100) / 100, carga });
  }
  console.log(`Lançamentos de faturamento lidos: ${fat.length} (R$ ${fat.reduce((s, x) => s + x.valor, 0).toLocaleString('pt-BR')})`);
}

// Clientes: gerente = o mais frequente; não sobrescreve cadastro feito no CRM
if (clientes.size) {
  const { data: existentes } = await sb.from('clientes').select('id, origem');
  const doCrm = new Set((existentes || []).filter(c => c.origem === 'crm').map(c => c.id));
  const rows = [...clientes.values()].filter(c => !doCrm.has(c.id)).map(({ _g, ...c }) => ({
    ...c, gerente: Object.entries(_g).sort((a, b) => b[1] - a[1])[0]?.[0] || '' }));
  await inChunks(rows, 500, async part => check(await sb.from('clientes').upsert(part), 'clientes'));
  console.log(`Clientes gravados: ${rows.length}`);
}
if (opps.length) {
  await inChunks(opps, 500, async part => check(await sb.from('oportunidades').upsert(part, { onConflict: 'numero' }), 'oportunidades'));
  // novas oportunidades do CRM continuam a numeração depois da maior importada (mínimo 7000)
  check(await sb.rpc('ajustar_numeracao'), 'numeração');
  console.log(`Oportunidades gravadas: ${opps.length}`);
}
if (fat.length) {
  check(await sb.from('faturamento').delete().gte('id', 0), 'limpeza do faturamento');
  await inChunks(fat, 1000, async part => check(await sb.from('faturamento').insert(part), 'faturamento'));
  console.log(`Faturamento gravado: ${fat.length} lançamentos`);
}
if (args.metas) {
  const m = JSON.parse(fs.readFileSync(args.metas, 'utf8'));
  const rows = Object.entries(m.valores).map(([gerente, valor]) => ({ gerente, ano: m.ano, valor, inicio: m.inicio || null, fim: m.fim || null }));
  check(await sb.from('metas').upsert(rows), 'metas');
  console.log(`Metas gravadas: ${rows.length}`);
}
console.log('Importação concluída.');
