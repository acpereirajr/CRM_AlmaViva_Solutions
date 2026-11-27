import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const configurado = Boolean(url && anon);
export const sb = configurado ? createClient(url, anon) : (null as any);

export type Perfil = { user_id: string; nome: string; email?: string; gerente: string | null; papel: string;
  areas?: string[]; permissoes?: Record<string, boolean>; escopo?: 'proprio' | 'area' | 'todos' | null; ativo?: boolean };

// ---- mapeamento banco (snake_case) <-> app (camelCase) ----
export function oppFromDb(r: any) {
  return {
    id: String(r.numero), numero: Number(r.numero), gerente: r.gerente, cliente: r.cliente, clienteId: r.cliente_id,
    status: r.status, titulo: r.titulo, area: r.area, revenda: r.revenda, software: r.software, parceiro: r.parceiro,
    cadastro: r.cadastro, fechamento: r.fechamento, probabilidade: r.probabilidade ?? 0,
    valorTotal: Number(r.valor_total) || 0, valorServico: Number(r.valor_servico) || 0, valorSoftware: Number(r.valor_software) || 0,
    faturamentoServico: Number(r.faturamento_servico) || 0, softwareAno: Number(r.software_ano) || 0,
    descServico: r.desc_servico, descProduto: r.desc_produto, observacoes: r.observacoes, origem: r.origem,
    origemOpp: r.origem_oportunidade || null, origemDet: r.origem_detalhe || null, team: r.team_members || [],
    categoria: r.categoria || null, proximoPasso: r.proximo_passo || '', proximoPassoData: r.proximo_passo_data || null,
    adiamentos: r.adiamentos || 0, etapaDesde: r.etapa_desde || null, atualizadoEm: r.atualizado_em || null,
  };
}
export function oppToDb(o: any, userId?: string) {
  const r: any = {
    gerente: o.gerente, cliente: o.cliente, cliente_id: o.clienteId, status: o.status, titulo: o.titulo, area: o.area,
    revenda: o.revenda ?? null, software: o.software, parceiro: o.parceiro ?? null, cadastro: o.cadastro || null, fechamento: o.fechamento || null,
    probabilidade: o.probabilidade, valor_total: o.valorTotal, valor_servico: o.valorServico, valor_software: o.valorSoftware,
    faturamento_servico: o.faturamentoServico, software_ano: o.softwareAno, observacoes: o.observacoes ?? null,
    // adiamentos e etapa_desde são calculados pelo banco (gatilho)
    origem_oportunidade: o.origemOpp || null, origem_detalhe: o.origemDet || null, team_members: o.team || [],
    categoria: o.categoria || null, proximo_passo: o.proximoPasso || null, proximo_passo_data: o.proximoPassoData || null,
    atualizado_em: new Date().toISOString(), atualizado_por: userId ?? null,
  };
  if (o.numero) r.numero = o.numero;
  return r;
}
export function cliFromDb(r: any) {
  return { id: r.id, nome: r.nome, gerente: r.gerente || '', segmento: r.segmento || '', cnpj: r.cnpj || '', contato: r.contato || '',
    siglasFaturamento: r.siglas_faturamento || [], origem: r.origem };
}
export function cliToDb(c: any, userId?: string) {
  return { id: c.id, nome: c.nome, gerente: c.gerente, segmento: c.segmento, cnpj: c.cnpj || null, contato: c.contato || null,
    siglas_faturamento: c.siglasFaturamento || [], origem: c.origem || 'crm', atualizado_em: new Date().toISOString(), atualizado_por: userId ?? null };
}
const fatFromDb = (r: any) => ({ mes: r.mes, gerente: r.gerente, cliente: r.cliente, clienteId: r.cliente_id, projeto: r.projeto || '',
  tipo: r.tipo || '', tecnologia: r.tecnologia || '', bu: r.bu || '', territorio: r.territorio || '', contrato: r.contrato || '',
  nf: r.nf || '', status: r.status || '', valor: Number(r.valor) || 0 });

async function todos(tabela: string, colunas = '*', ordem?: string) {
  const out: any[] = []; const passo = 1000;
  for (let de = 0; ; de += passo) {
    let q = sb.from(tabela).select(colunas).range(de, de + passo - 1);
    if (ordem) q = q.order(ordem);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < passo) break;
  }
  return out;
}

export const api = {
  async sessao(): Promise<Session | null> { const { data } = await sb.auth.getSession(); return data.session; },
  aoMudarSessao(fn: (s: Session | null) => void) { sb.auth.onAuthStateChange((_e: any, s: Session | null) => fn(s)); },
  async entrar(email: string, senha: string) { const { error } = await sb.auth.signInWithPassword({ email, password: senha }); if (error) throw error; },
  async linkMagico(email: string) { const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }); if (error) throw error; },
  async sair() { await sb.auth.signOut(); },
  async perfil(userId: string): Promise<Perfil | null> {
    const { data, error } = await sb.from('perfis').select('*').eq('user_id', userId).maybeSingle(); if (error) throw error; return data;
  },
  async oportunidades() { return (await todos('oportunidades', '*', 'numero')).map(oppFromDb); },
  async clientes() { return (await todos('clientes', '*', 'nome')).map(cliFromDb); },
  async faturamento() { return (await todos('faturamento', 'mes,gerente,cliente,cliente_id,projeto,tipo,tecnologia,bu,territorio,contrato,nf,status,valor', 'id')).map(fatFromDb); },
  async metas(ano: number) {
    const { data, error } = await sb.from('metas').select('gerente,valor').eq('ano', ano); if (error) throw error;
    return Object.fromEntries((data || []).map((m: any) => [m.gerente, Number(m.valor)]));
  },
  async running() {
    const { data, error } = await sb.from('running_previsto').select('chave,valor'); if (error) throw error;
    return Object.fromEntries((data || []).map((r: any) => [r.chave, Number(r.valor)]));
  },
  async salvarOpp(o: any, userId?: string) {
    const { data, error } = await sb.from('oportunidades').upsert(oppToDb(o, userId), { onConflict: 'numero' }).select().single();
    if (error) throw error; return oppFromDb(data);
  },
  async salvarCliente(c: any, userId?: string) {
    const { data, error } = await sb.from('clientes').upsert(cliToDb(c, userId)).select().single(); if (error) throw error; return cliFromDb(data);
  },
  async salvarRunning(chave: string, valor: number, userId?: string) {
    const { error } = await sb.from('running_previsto').upsert({ chave, valor, atualizado_em: new Date().toISOString(), atualizado_por: userId ?? null });
    if (error) throw error;
  },
  // ---- configurações (escrita só para admin, garantida pelo RLS) ----
  async etapas() {
    const { data, error } = await sb.from('etapas').select('*').order('ordem'); if (error) throw error;
    return (data || []).map((e: any) => ({ k: e.nome, p: e.probabilidade, tipo: e.tipo, ativa: e.ativa }));
  },
  async salvarEtapas(lista: { k: string; p: number; tipo: string; ativa: boolean }[], userId?: string) {
    const agora = new Date().toISOString();
    // a etapa "ganha" anterior vira provisória para não violar o índice de etapa ganha única durante a troca
    const rows = lista.map((e, i) => ({ nome: e.k, ordem: i + 1, tipo: e.tipo, probabilidade: e.p, ativa: e.ativa !== false, atualizado_em: agora, atualizado_por: userId ?? null }));
    const { data: atuais, error: e0 } = await sb.from('etapas').select('nome,tipo'); if (e0) throw e0;
    const ganhaNova = rows.find(r => r.tipo === 'ganha')?.nome;
    const ganhaAntiga = (atuais || []).find((r: any) => r.tipo === 'ganha')?.nome;
    if (ganhaAntiga && ganhaAntiga !== ganhaNova) {
      const { error } = await sb.from('etapas').update({ tipo: 'perdida' }).eq('nome', ganhaAntiga); if (error) throw error;
    }
    const { error: e1 } = await sb.from('etapas').upsert(rows); if (e1) throw e1;
    const sobra = (atuais || []).map((r: any) => r.nome).filter((n: string) => !rows.some(r => r.nome === n));
    if (sobra.length) { const { error } = await sb.from('etapas').delete().in('nome', sobra); if (error) throw error; }
  },
  // listas de opções dos campos de seleção: { fabricante: [{v, ativo}], ... }; null = usar o padrão do app
  async listas() {
    const { data, error } = await sb.from('opcoes').select('lista,valor,ativo,detalhe').order('lista').order('ordem'); if (error) throw error;
    if (!data?.length) return null;
    const out: Record<string, { v: string; ativo: boolean; det?: string }[]> = {};
    for (const r of data) (out[r.lista] ||= []).push({ v: r.valor, ativo: r.ativo, ...(r.detalhe ? { det: r.detalhe } : {}) });
    return out;
  },
  async salvarLista(lista: string, itens: { v: string; ativo?: boolean; det?: string }[]) {
    const rows = itens.map((i, n) => ({ lista, valor: i.v, ordem: n + 1, ativo: i.ativo !== false, detalhe: i.det || null }));
    if (rows.length) { const { error } = await sb.from('opcoes').upsert(rows); if (error) throw error; }
    let q = sb.from('opcoes').delete().eq('lista', lista);
    if (rows.length) q = q.not('valor', 'in', `(${rows.map(r => `"${r.valor.replace(/"/g, '\\"')}"`).join(',')})`);
    const { error } = await q; if (error) throw error;
  },
  // renomear uma opção nas oportunidades que a usam (campo simples ou lista de team members)
  async renomearOpcaoOpps(campo: string, de: string, para: string) {
    const col = ({ origemOpp: 'origem_oportunidade', software: 'software', revenda: 'revenda', team: 'team_members' } as Record<string, string>)[campo];
    if (!col) return;
    if (col !== 'team_members') { const { error } = await sb.from('oportunidades').update({ [col]: para }).eq(col, de); if (error) throw error; return; }
    const { data, error } = await sb.from('oportunidades').select('numero,team_members').contains('team_members', [de]); if (error) throw error;
    for (const r of data || []) {
      const t = (r.team_members as string[]).map(x => (x === de ? para : x));
      const { error: e } = await sb.from('oportunidades').update({ team_members: [...new Set(t)] }).eq('numero', r.numero); if (e) throw e;
    }
  },
  // ---- acessos ----
  async papeis() {
    const { data, error } = await sb.from('papeis').select('*'); if (error) throw error;
    if (!data?.length) return null;
    return Object.fromEntries(data.map((t: any) => [t.papel, { nome: t.nome, escopo: t.escopo, permissoes: t.permissoes || {} }]));
  },
  async salvarPapeis(P: Record<string, { nome: string; escopo: string; permissoes: Record<string, boolean> }>) {
    const rows = Object.entries(P).map(([papel, t]) => ({ papel, nome: t.nome, escopo: t.escopo, permissoes: t.permissoes }));
    const { error } = await sb.from('papeis').upsert(rows); if (error) throw error;
    const { data: atuais, error: e2 } = await sb.from('papeis').select('papel'); if (e2) throw e2;
    const sobra = (atuais || []).map((r: any) => r.papel).filter((k: string) => !P[k]);
    if (sobra.length) { const { error: e3 } = await sb.from('papeis').delete().in('papel', sobra); if (e3) throw e3; }
  },
  // perfis (quem já entrou) + convites (cadastrados que ainda não entraram)
  async usuarios() {
    const [{ data: ps, error: e1 }, { data: cs, error: e2 }] = await Promise.all([sb.from('perfis').select('*'), sb.from('convites').select('*')]);
    if (e1) throw e1; if (e2) throw e2;
    const base = (r: any) => ({ nome: r.nome, email: r.email, papel: r.papel, gerente: r.gerente, areas: r.areas || [], permissoes: r.permissoes || {}, escopo: r.escopo, ativo: r.ativo !== false });
    return [...(ps || []).map((r: any) => ({ id: r.user_id, user_id: r.user_id, ...base(r) })),
            ...(cs || []).map((r: any) => ({ id: 'convite:' + r.email, pendente: true, ...base(r) }))];
  },
  async salvarUsuario(u: any) {
    const d = { nome: u.nome, papel: u.papel, gerente: u.gerente || null, areas: u.areas || [], permissoes: u.permissoes || {}, escopo: u.escopo || null, ativo: u.ativo !== false };
    if (u.user_id) { const { error } = await sb.from('perfis').update(d).eq('user_id', u.user_id); if (error) throw error; return; }
    const email = String(u.email).trim().toLowerCase();
    const antigo = u.id && String(u.id).startsWith('convite:') ? String(u.id).slice(8) : null;
    if (antigo && antigo !== email) { const { error } = await sb.from('convites').delete().eq('email', antigo); if (error) throw error; }
    const { error } = await sb.from('convites').upsert({ email, ...d }); if (error) throw error;
  },
  // ---- ações da reunião de forecast ----
  async acoes() {
    return (await todos('acoes', '*', 'id')).map((r: any) => ({ id: r.id, tipo: r.tipo, numero: r.numero, gerente: r.gerente, texto: r.texto,
      responsavel: r.responsavel || '', prazo: r.prazo, status: r.status, criadoEm: r.criado_em, criadoPorNome: r.criado_por_nome || '' }));
  },
  async salvarAcao(a: any, userId?: string) {
    const r: any = { tipo: a.tipo, numero: a.numero ?? null, gerente: a.gerente, texto: a.texto, responsavel: a.responsavel || null,
      prazo: a.prazo || null, status: a.status, atualizado_em: new Date().toISOString() };
    if (a.id) { const { error } = await sb.from('acoes').update(r).eq('id', a.id); if (error) throw error; return; }
    const { error } = await sb.from('acoes').insert({ ...r, criado_por: userId ?? null, criado_por_nome: a.criadoPorNome || null }); if (error) throw error;
  },
  // ---- forecast: limites (categoria sugerida, cobertura, selos de risco) e fotos semanais do pipeline ----
  async parametros() {
    const { data, error } = await sb.from('parametros').select('valor').eq('chave', 'forecast').maybeSingle(); if (error) throw error;
    return data?.valor || null;
  },
  async salvarParametros(v: Record<string, number>, userId?: string) {
    const { error } = await sb.from('parametros').upsert({ chave: 'forecast', valor: v, atualizado_em: new Date().toISOString(), atualizado_por: userId ?? null });
    if (error) throw error;
  },
  async tirarFoto() { const { error } = await sb.rpc('tirar_foto_pipeline'); if (error) throw error; },
  // cabeçalhos de todas as fotos + itens só das que as comparações usam (semana passada, 4 semanas, primeira)
  async fotos(hoje: string) {
    const { data, error } = await sb.from('fotos_pipeline').select('semana,data').order('data'); if (error) throw error;
    const fs = (data || []).map((f: any) => ({ id: f.semana, data: f.data, itens: null as any }));
    const dias = (d: string) => Math.round((+new Date(hoje) - +new Date(d)) / 864e5);
    const ult = (min: number) => [...fs].reverse().find(f => dias(f.data) >= min);
    const quer = [...new Set([ult(6), ult(27), fs.find(f => dias(f.data) >= 1)].filter(Boolean).map((f: any) => f.id))];
    if (quer.length) {
      const out: any[] = []; const passo = 1000;
      for (let de = 0; ; de += passo) {
        const { data: it, error: e2 } = await sb.from('fotos_pipeline_itens').select('semana,numero,gerente,status,categoria,valor,fechamento,probabilidade')
          .in('semana', quer).order('semana').order('numero').range(de, de + passo - 1);
        if (e2) throw e2; out.push(...it); if (it.length < passo) break;
      }
      for (const f of fs) if (quer.includes(f.id)) f.itens = out.filter(i => i.semana === f.id)
        .map(i => [Number(i.numero), i.gerente, i.status, i.categoria, Number(i.valor) || 0, i.fechamento, i.probabilidade ?? 0]);
    }
    return fs;
  },
  // ---- anexos (Supabase Storage, bucket privado 'anexos', pasta = número da oportunidade) ----
  async anexos(numero: number) {
    const { data, error } = await sb.from('anexos').select('*').eq('numero', numero).order('criado_em'); if (error) throw error;
    return (data || []).map((a: any) => ({ id: a.id, numero: a.numero, nome: a.nome, caminho: a.caminho, tamanho: Number(a.tamanho) || 0, tipo: a.tipo,
      criadoEm: a.criado_em, porNome: a.criado_por_nome || '' }));
  },
  async anexar(numero: number, f: File, userId?: string, porNome?: string) {
    const limpo = f.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-120);
    const caminho = `${numero}/${crypto.randomUUID()}-${limpo}`;
    const up = await sb.storage.from('anexos').upload(caminho, f, { contentType: f.type || 'application/octet-stream', upsert: false });
    if (up.error) throw up.error;
    const { error } = await sb.from('anexos').insert({ numero, nome: f.name, caminho, tamanho: f.size, tipo: f.type || null, criado_por: userId ?? null, criado_por_nome: porNome || null });
    if (error) { await sb.storage.from('anexos').remove([caminho]); throw error; }
  },
  async urlAnexo(caminho: string) {
    const { data, error } = await sb.storage.from('anexos').createSignedUrl(caminho, 300); if (error) throw error; return data.signedUrl as string;
  },
  async removerAnexo(a: any) {
    const { error } = await sb.from('anexos').delete().eq('id', a.id); if (error) throw error;
    await sb.storage.from('anexos').remove([a.caminho]);
  },
  // ---- pré-vendas e envios ----
  async prevendas() {
    const { data, error } = await sb.from('prevendas').select('*').order('nome'); if (error) throw error;
    return (data || []).map((p: any) => ({ id: p.id, nome: p.nome, email: p.email, ativo: p.ativo }));
  },
  async salvarPrevendas(lista: { id?: any; nome: string; email: string; ativo?: boolean }[]) {
    for (const p of lista) {
      const d = { nome: p.nome, email: p.email, ativo: p.ativo !== false };
      const q = /^\d+$/.test(String(p.id ?? '')) ? sb.from('prevendas').update(d).eq('id', p.id) : sb.from('prevendas').insert(d);
      const { error } = await q; if (error) throw error;
    }
  },
  async envios(numero: number) {
    const { data, error } = await sb.from('envios').select('*').eq('numero', numero).order('enviado_em', { ascending: false }); if (error) throw error;
    return (data || []).map((e: any) => ({ id: e.id, numero: e.numero, prevendasId: e.prevendas_id, paraNome: e.para_nome, paraEmail: e.para_email, cc: e.cc,
      assunto: e.assunto, anexos: e.anexos || [], status: e.status, erro: e.erro, enviadoEm: e.enviado_em, porNome: e.enviado_por_nome || '' }));
  },
  // o e-mail sai pela função enviar-oportunidade (supabase/functions), que usa o provedor configurado nos segredos do projeto
  async enviarOportunidade(p: { numero: number; prevendasId: any; assunto: string; mensagem: string; anexoIds: string[] }) {
    const { data, error } = await sb.functions.invoke('enviar-oportunidade', { body: p });
    if (error) {
      let msg = error.message; try { const j = await (error as any).context?.json?.(); if (j?.erro) msg = j.erro; } catch { /* sem corpo */ }
      throw new Error(msg);
    }
    return data as { status: string; erro?: string };
  },
  async gerentes() {
    const { data, error } = await sb.from('gerentes').select('*').order('nome'); if (error) throw error;
    return data || [];
  },
  async salvarGerente(g: any, userId?: string) {
    const { error } = await sb.from('gerentes').upsert({ nome: g.nome, email: g.email || null, area: g.area || null, territorio: g.territorio || null, diretor: g.diretor || null,
      ativo: g.ativo !== false, atualizado_em: new Date().toISOString(), atualizado_por: userId ?? null });
    if (error) throw error;
  },
  async metasDetalhe(ano: number) {
    const { data, error } = await sb.from('metas').select('gerente,valor,inicio,fim').eq('ano', ano); if (error) throw error;
    const d = data || [];
    return { inicio: d[0]?.inicio || '', fim: d[0]?.fim || '', valores: Object.fromEntries(d.map((m: any) => [m.gerente, Number(m.valor)])) };
  },
  async salvarMetas(ano: number, inicio: string | null, fim: string | null, valores: Record<string, number>) {
    const rows = Object.entries(valores).filter(([, v]) => v > 0).map(([gerente, valor]) => ({ gerente, ano, valor, inicio, fim }));
    if (rows.length) { const { error } = await sb.from('metas').upsert(rows); if (error) throw error; }
    const manter = rows.map(r => r.gerente);
    let q = sb.from('metas').delete().eq('ano', ano);
    if (manter.length) q = q.not('gerente', 'in', `(${manter.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')})`);
    const { error } = await q; if (error) throw error;
  },
  aoVivo(fn: (tabela: string) => void) {
    return sb.channel('crm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => fn('oportunidades'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => fn('clientes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'running_previsto' }, () => fn('running_previsto'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etapas' }, () => fn('etapas'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gerentes' }, () => fn('gerentes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metas' }, () => fn('metas'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opcoes' }, () => fn('opcoes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parametros' }, () => fn('parametros'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fotos_pipeline' }, () => fn('fotos_pipeline'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'papeis' }, () => fn('papeis'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acoes' }, () => fn('acoes'))
      .subscribe();
  },
};
