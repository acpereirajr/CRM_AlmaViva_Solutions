import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const configurado = Boolean(url && anon);
export const sb = configurado ? createClient(url, anon) : (null as any);

export type Perfil = { user_id: string; nome: string; email?: string; gerente: string | null; papel: 'gerente' | 'diretor' | 'admin' };

// ---- mapeamento banco (snake_case) <-> app (camelCase) ----
export function oppFromDb(r: any) {
  return {
    id: String(r.numero), numero: Number(r.numero), gerente: r.gerente, cliente: r.cliente, clienteId: r.cliente_id,
    status: r.status, titulo: r.titulo, area: r.area, revenda: r.revenda, software: r.software, parceiro: r.parceiro,
    cadastro: r.cadastro, fechamento: r.fechamento, probabilidade: r.probabilidade ?? 0,
    valorTotal: Number(r.valor_total) || 0, valorServico: Number(r.valor_servico) || 0, valorSoftware: Number(r.valor_software) || 0,
    faturamentoServico: Number(r.faturamento_servico) || 0, softwareAno: Number(r.software_ano) || 0,
    descServico: r.desc_servico, descProduto: r.desc_produto, observacoes: r.observacoes, origem: r.origem,
  };
}
export function oppToDb(o: any, userId?: string) {
  const r: any = {
    gerente: o.gerente, cliente: o.cliente, cliente_id: o.clienteId, status: o.status, titulo: o.titulo, area: o.area,
    software: o.software, parceiro: o.parceiro ?? null, cadastro: o.cadastro || null, fechamento: o.fechamento || null,
    probabilidade: o.probabilidade, valor_total: o.valorTotal, valor_servico: o.valorServico, valor_software: o.valorSoftware,
    faturamento_servico: o.faturamentoServico, software_ano: o.softwareAno, observacoes: o.observacoes ?? null,
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
  aoVivo(fn: (tabela: string) => void) {
    return sb.channel('crm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => fn('oportunidades'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => fn('clientes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'running_previsto' }, () => fn('running_previsto'))
      .subscribe();
  },
};
