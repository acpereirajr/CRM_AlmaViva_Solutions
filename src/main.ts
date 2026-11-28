import './styles.css';
import { api, configurado } from './supabase';
import { iniciarApp } from './app';

const $ = (s: string) => document.querySelector(s) as HTMLElement & { value: string };
const login = $('#login'), app = $('#app');

function mostrarLogin(msg = '') {
  app.hidden = true; login.hidden = false; $('#lErr').textContent = msg;
}

let iniciado = false;
async function aoEntrar(userId: string) {
  if (iniciado) return;
  const perfil = await api.perfil(userId).catch(() => null);
  if (!perfil) { await api.sair(); mostrarLogin('Seu usuário ainda não tem perfil no CRM. Peça para a administração cadastrar.'); return; }
  if (perfil.ativo === false) { await api.sair(); mostrarLogin('Seu acesso ao CRM está bloqueado. Fale com a administração.'); return; }
  iniciado = true; login.hidden = true; app.hidden = false;
  iniciarApp(perfil, userId);
}

async function boot() {
  if (!configurado) { mostrarLogin('O app não está configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'); return; }
  const s = await api.sessao();
  if (s) await aoEntrar(s.user.id); else mostrarLogin();
  api.aoMudarSessao(sess => { if (sess) aoEntrar(sess.user.id); else if (iniciado) location.reload(); });

  $('#loginF').addEventListener('submit', async e => {
    e.preventDefault(); $('#lErr').textContent = '';
    const email = $('#lEmail').value.trim(), senha = $('#lSenha').value;
    if (!senha) { $('#lErr').textContent = 'Digite a senha ou use o link de acesso por e-mail.'; return; }
    try { await api.entrar(email, senha); } catch (err: any) { $('#lErr').textContent = 'E-mail ou senha incorretos.'; }
  });
  $('#lMagico').addEventListener('click', async () => {
    const email = $('#lEmail').value.trim();
    if (!email) { $('#lErr').textContent = 'Digite o seu e-mail primeiro.'; return; }
    try { await api.linkMagico(email); $('#lErr').textContent = 'Enviamos um link de acesso para o seu e-mail.'; }
    catch (err: any) { $('#lErr').textContent = 'Não foi possível enviar o link: ' + err.message; }
  });
  $('#btnSair').addEventListener('click', () => api.sair());
}
boot();
