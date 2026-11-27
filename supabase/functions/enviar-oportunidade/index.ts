// Função do Supabase (Deno) que envia uma oportunidade, com anexos, para alguém da pré-vendas.
// O autor recebe cópia no e-mail da própria conta. Cada tentativa fica registrada na tabela envios.
//
// Segredos (Supabase > Edge Functions > Secrets):
//   RESEND_API_KEY   chave da conta Resend (resend.com) com o domínio da Almaviva verificado
//   EMAIL_REMETENTE  ex.: "CRM Almaviva <crm@seudominio.com.br>" (precisa ser do domínio verificado)
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já vêm do próprio Supabase:
// a chave de serviço só existe aqui no servidor, nunca no app.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const LIMITE_ANEXOS = 35 * 1024 * 1024; // o provedor aceita até 40 MB por e-mail, já em base64

function base64(buf: ArrayBuffer) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resp(405, { erro: 'Método não permitido' });

  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const chave = Deno.env.get('RESEND_API_KEY'), remetente = Deno.env.get('EMAIL_REMETENTE');
  if (!chave || !remetente) return resp(500, { erro: 'O envio de e-mail ainda não foi configurado (faltam RESEND_API_KEY e EMAIL_REMETENTE).' });

  // cliente com o login de quem pediu: as regras de acesso (RLS) valem para tudo o que ele lê
  const usuario = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user?.email) return resp(401, { erro: 'Entre no CRM de novo.' });

  let p: { numero: number; prevendasId: number; assunto: string; mensagem: string; anexoIds: string[] };
  try { p = await req.json(); } catch { return resp(400, { erro: 'Pedido inválido.' }); }
  const assunto = String(p.assunto || '').trim().slice(0, 200), mensagem = String(p.mensagem || '').slice(0, 20000);
  if (!p.numero || !p.prevendasId || !assunto) return resp(400, { erro: 'Faltam dados do envio.' });

  const { data: podeEditar } = await usuario.rpc('pode', { perm: 'editar_oportunidades' });
  if (!podeEditar) return resp(403, { erro: 'Seu acesso não permite enviar oportunidades.' });
  const { data: opp } = await usuario.from('oportunidades').select('numero').eq('numero', p.numero).maybeSingle();
  if (!opp) return resp(404, { erro: 'Oportunidade não encontrada ou fora da sua carteira.' });
  const { data: pv } = await usuario.from('prevendas').select('id,nome,email,ativo').eq('id', p.prevendasId).maybeSingle();
  if (!pv || !pv.ativo) return resp(400, { erro: 'Pessoa de pré-vendas inválida ou inativa.' });
  const { data: perfil } = await usuario.from('perfis').select('nome').eq('user_id', user.id).maybeSingle();

  const ids = Array.isArray(p.anexoIds) ? p.anexoIds.slice(0, 20) : [];
  const { data: anexos } = ids.length
    ? await usuario.from('anexos').select('id,nome,caminho,tamanho').eq('numero', p.numero).in('id', ids)
    : { data: [] as any[] };
  const total = (anexos || []).reduce((s: number, a: any) => s + Number(a.tamanho || 0), 0);
  if (total > LIMITE_ANEXOS) return resp(400, { erro: 'Os anexos passam de 35 MB juntos. Envie menos arquivos.' });

  const arquivos = [];
  for (const a of anexos || []) {
    const { data: blob, error } = await usuario.storage.from('anexos').download(a.caminho);
    if (error || !blob) return resp(500, { erro: `Não foi possível ler o anexo ${a.nome}.` });
    arquivos.push({ filename: a.nome, content: base64(await blob.arrayBuffer()) });
  }

  let status = 'enviado', erro: string | null = null, provedorId: string | null = null;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remetente, to: [pv.email], cc: [user.email], reply_to: user.email, subject: assunto, text: mensagem, attachments: arquivos }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) provedorId = j.id ?? null; else { status = 'erro'; erro = j.message || `Provedor respondeu ${r.status}`; }
  } catch (e) { status = 'erro'; erro = String(e).slice(0, 300); }

  const admin = createClient(url, servico);
  await admin.from('envios').insert({
    numero: p.numero, prevendas_id: pv.id, para_nome: pv.nome, para_email: pv.email, cc: user.email, assunto, mensagem,
    anexos: (anexos || []).map((a: any) => a.nome), status, erro, provedor_id: provedorId,
    enviado_por: user.id, enviado_por_nome: perfil?.nome ?? user.email,
  });
  return resp(200, { status, erro });
});
