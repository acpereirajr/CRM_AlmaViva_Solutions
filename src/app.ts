// @ts-nocheck
// Lógica das telas (painel, oportunidades, clientes, faturamento, configurações).
// Portado do protótipo; ver README > Próximos passos para a migração a componentes tipados.
import { api, type Perfil } from './supabase';

export function iniciarApp(perfil: Perfil, userId: string){

/* ================= constantes ================= */
// Etapas padrão (as da base). A lista real vem da tabela etapas.
const ETAPAS_PADRAO=[
  {k:'Qualificação',p:10,tipo:'aberta'},{k:'Orçamento',p:30,tipo:'aberta'},{k:'Proposta',p:50,tipo:'aberta'},
  {k:'Forecast',p:70,tipo:'aberta'},{k:'Negociação',p:90,tipo:'aberta'},{k:'Encerrada - Ganha',p:100,tipo:'ganha'},
  {k:'Encerrada - Perdida',p:0,tipo:'perdida'},{k:'Encerrada - Abandonada',p:0,tipo:'perdida'},{k:'Encerrada - Encerrada pelo Sistema',p:0,tipo:'perdida'}].map(e=>({...e,ativa:true}));
let STATUS,ST,OPEN,WON,FUNNEL;
function aplicarEtapas(lista){
  STATUS=(lista&&lista.length?lista:ETAPAS_PADRAO).map(e=>({...e,open:e.tipo==='aberta'}));
  ST=Object.fromEntries(STATUS.map(s=>[s.k,s]));
  OPEN=new Set(STATUS.filter(s=>s.open).map(s=>s.k));
  WON=(STATUS.find(s=>s.tipo==='ganha')||{}).k||'Encerrada - Ganha';
  FUNNEL=[...OPEN,WON];
}
aplicarEtapas(null);
const TIPO_LBL={aberta:'Em aberto',ganha:'Ganha',perdida:'Perdida'};
// Listas de opções dos campos de seleção. A tela Configurações > Listas de opções edita os valores.
const LISTAS_DEF=[
  {id:'area',nome:'Área de negócio',onde:'Oportunidade',campo:o=>String(o.area||'').split(',').map(s=>s.trim())},
  {id:'fabricante',nome:'Fabricante',onde:'Oportunidade',campo:o=>[o.software],ren:'software'},
  {id:'parceiro',nome:'Parceiro',onde:'Oportunidade',campo:o=>String(o.parceiro||'').split(',').map(s=>s.trim())},
  {id:'revenda',nome:'Tipo de revenda',onde:'Oportunidade',campo:o=>[o.revenda],ren:'revenda'},
  {id:'origem',nome:'Origem da oportunidade',onde:'Oportunidade',campo:o=>[o.origemOpp],ren:'origemOpp',det:true},
  {id:'team',nome:'Team members (especialistas)',onde:'Oportunidade',campo:o=>o.team||[],ren:'team'},
  {id:'segmento',nome:'Segmento',onde:'Cliente',cli:c=>[c.segmento]},
  {id:'area_gerente',nome:'Área do gerente',onde:'Gerente de negócios',ger:g=>[g.area]},
  {id:'territorio',nome:'Território',onde:'Gerente de negócios',ger:g=>[g.territorio]},
  {id:'diretor',nome:'Diretor comercial',onde:'Gerente de negócios',ger:g=>[g.diretor]}];
const LISTAS_PADRAO={
  area:['Revenda','Consultoria','Desenvolvimento de Soluções','Serviços de Infra-estrutura de TI'],
  fabricante:['Google','IBM','Red Hat','Liferay','HCL','Delphix','Perforce','InterSystems','Oracle','AWS','ISS/iSSI'],
  parceiro:['Google','IBM','RedHat','Liferay','HCL','Delphix/Perforce','ISS/iSSI','InterSystems','Oracle','AWS'],
  revenda:['Software','Hardware'],
  segmento:['Público','Privado','Parcerias'],
  area_gerente:['Público','Privado','Parcerias'],
  territorio:['PRODESP','PUBLICO','PRIVADO','RJ','DF','PARCERIAS'],
  diretor:[],
  team:[],
  origem:[{v:'Fabricante'},{v:'Edital Publicado'},{v:'Gerente de Conta',det:'gerente'},{v:'Diretor',det:'diretor'},{v:'Evento X'},{v:'Evento Y'}]};
const listaItens=id=>(S.listas&&S.listas[id])||LISTAS_PADRAO[id].map(v=>typeof v==='string'?{v,ativo:true}:{ativo:true,...v});
// Origem da oportunidade: algumas origens pedem um detalhe (qual gerente, qual diretor...). Configurável em Listas de opções.
const DET_ORIGEM={'':'Nada',gerente:'Qual gerente',diretor:'Qual diretor',fabricante:'Qual fabricante',texto:'Texto livre'};
const origemDet=v=>(listaItens('origem').find(i=>i.v===v)||{}).det||'';
const origemTxt=o=>o.origemOpp?o.origemOpp+(o.origemDet?' · '+o.origemDet:''):'';
function detOpcoes(t,atual){const a=t==='gerente'?gerForm():t==='diretor'?uniq([...opcoes('diretor'),...S.gerCad.map(g=>g.diretor).filter(Boolean)]):t==='fabricante'?opcoes('fabricante'):[];
  return atual&&!a.includes(atual)?[...a,atual]:a;}
// opções ativas da lista, mantendo o valor atual do registro mesmo que inativo ou fora da lista
const opcoes=(id,atual)=>{const a=listaItens(id).filter(i=>i.ativo!==false).map(i=>i.v);return atual&&!a.includes(atual)?[...a,atual]:a;};
const MES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESL=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const HIDE_GER=new Set(['Sem gerente','Parcerias']);
const TODAY=new Date(); const TODAY_ISO=TODAY.toISOString().slice(0,10);

const S:any={acoes:[],anexos:[],envios:[],prevendas:[],rel:{per:'ano',dim:'ger',base:'semana',esc:'pct',det:null},reu:{ger:'',modo:(()=>{try{return localStorage.getItem('crm-reu-modo')==='3d'?'3d':'2d';}catch(e){return '2d';}})()},fotos:[],param:null,papeis:null,usuarios:[],areas:new Set(),listas:null,opps:[],clientes:[],fat:[],metas:{},metasDoc:{},gerCad:[],cfg:'etapas',running:{},readOnly:false,loaded:{o:false,c:false},
  sel:new Set(),ano:'2026',p:{cli:'',fab:'',area:'',res:'gp'},sim:{pct:60,ex:false},evFab:'',
  f:{q:'',per:'',ger:'',cli:'',tec:'',tip:'',bu:'',ter:'',st:'',page:0}};

/* ================= acessos ================= */
// Permissões de cada tipo de usuário. Configurações > Usuários e acessos edita os tipos e as exceções por usuário.
const PERMS=[
  {k:'ver_painel',l:'Ver o Painel',g:'Telas'},{k:'ver_oportunidades',l:'Ver Oportunidades',g:'Telas'},
  {k:'ver_clientes',l:'Ver Clientes',g:'Telas'},{k:'ver_faturamento',l:'Ver Faturamento',g:'Telas'},
  {k:'ver_relatorios',l:'Ver Relatórios',g:'Telas'},{k:'ver_reuniao',l:'Ver Reunião de forecast',g:'Telas'},
  {k:'configurar',l:'Acessar Configurações (tudo, inclusive usuários)',g:'Telas'},
  {k:'criar_oportunidades',l:'Cadastrar oportunidades',g:'Ações'},{k:'editar_oportunidades',l:'Editar oportunidades',g:'Ações'},
  {k:'editar_clientes',l:'Cadastrar e editar clientes',g:'Ações'},{k:'editar_running',l:'Alterar o Running previsto',g:'Ações'},
  {k:'registrar_acoes',l:'Registrar ações na Reunião de forecast',g:'Ações'}];
const ESCOPOS={proprio:'Só a própria carteira',area:'Gerentes das suas áreas',todos:'Todos os gerentes'};
const TUDO=Object.fromEntries(PERMS.map(x=>[x.k,true]));
const PAPEIS_PADRAO={
  admin:{nome:'Administrador',escopo:'todos',permissoes:{...TUDO}},
  diretor:{nome:'Diretor',escopo:'todos',permissoes:{...TUDO,configurar:false}},
  gerente:{nome:'Gerente',escopo:'proprio',permissoes:{...TUDO,configurar:false,ver_reuniao:false,registrar_acoes:false}}};
const TODAS_VIEWS=['painel','oportunidades','clientes','faturamento','relatorios','reuniao','config'];
let VIEWS=[...TODAS_VIEWS], ACESSO={escopo:'todos',permissoes:{...TUDO},gerente:null,areas:[]}, GER_FIXO=null, ADMIN=false;
const pode=k=>!!ACESSO.permissoes[k];
const papeisAtuais=()=>S.papeis||PAPEIS_PADRAO;
function calcAcesso(u){
  const t=papeisAtuais()[u.papel]||{escopo:'proprio',permissoes:{}};
  const perm={}; PERMS.forEach(x=>{const o=(u.permissoes||{})[x.k];perm[x.k]=(o===true||o===false)?o:(x.k in (t.permissoes||{}))?!!t.permissoes[x.k]:!!((PAPEIS_PADRAO[u.papel]||{permissoes:{}}).permissoes[x.k]);});
  if(u.papel==='admin')perm.configurar=true; // o administrador nunca fica trancado fora das Configurações
  if(u.ativo===false)PERMS.forEach(x=>{perm[x.k]=false;});
  return {escopo:u.escopo||t.escopo||'proprio',permissoes:perm,gerente:u.gerente||null,areas:u.areas||[]};
}
function aplicarAcesso(){
  ACESSO=calcAcesso(usuarioAtual());
  GER_FIXO=ACESSO.escopo==='proprio'?(ACESSO.gerente||'(sem gerente vinculado)'):null;
  ADMIN=pode('configurar');
  if(GER_FIXO){S.sel=new Set([GER_FIXO]);S.areas.clear();}
  VIEWS=TODAS_VIEWS.filter(v=>pode(v==='config'?'configurar':'ver_'+v));
  document.querySelectorAll('#nav a').forEach(a=>{a.hidden=!VIEWS.includes(a.getAttribute('href').slice(1));});
  $('#btnNovaOpp').hidden=!pode('criar_oportunidades'); $('#btnNovoCli').hidden=!pode('editar_clientes');
}
const visivel=g=>ACESSO.escopo==='todos'||g===ACESSO.gerente||(ACESSO.escopo==='area'&&ACESSO.areas.includes(areaDe(g)));
const usuarioAtual=()=>({...perfil,id:perfil.user_id});
/* ================= utilidades ================= */
const $=(s:string):any=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sum=(a,f)=>a.reduce((s,x)=>s+(Number(f(x))||0),0);
const nf=(v,d=0)=>(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const brl=v=>'R$ '+nf(v);
function M(v){v=Number(v)||0;const a=Math.abs(v),s=v<0?'-':'';
  if(a>=1e9)return s+'R$ '+nf(a/1e9,2)+' bi'; if(a>=1e6)return s+'R$ '+nf(a/1e6,2)+' M'; if(a>=1e3)return s+'R$ '+nf(a/1e3,0)+' K'; return s+'R$ '+nf(a);}
function Ms(v){v=Number(v)||0;const a=Math.abs(v); if(a>=1e9)return nf(v/1e9,1)+' bi'; if(a>=1e6)return nf(v/1e6,a>=1e8?0:a>=1e7?1:2)+' M'; if(a>=1e3)return nf(v/1e3,0)+' K'; return nf(v);}
const pct=(a,b,d=1)=>b?nf(a/b*100,d)+'%':'—';
const fmtD=d=>d?d.split('-').reverse().join('/'):'';
const mesAno=d=>d?MES[+d.slice(5,7)-1].toLowerCase()+'. de '+d.slice(0,4):'';
const slug=s=>String(s).normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
const vAno=o=>(Number(o.faturamentoServico)||0)+(Number(o.softwareAno)||0);
const fab=o=>o.software||o.parceiro||'Não informado';
const quarter=d=>Math.floor((+d.slice(5,7)-1)/3);
const toast=m=>{const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2600);};
const tagSt=s=>`<span class="tag ${s===WON?'win':(ST[s]?ST[s].tipo==='perdida':s&&s.startsWith('Encerrada'))?'lost':''}">${esc(s)}</span>`;
const opts=(list,sel,all)=>(all!==undefined?`<option value="">${esc(all)}</option>`:'')+list.map(v=>`<option ${v===sel?'selected':''}>${esc(v)}</option>`).join('');
const uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'pt'));

/* ================= recortes ================= */
const inativos=()=>new Set(S.gerCad.filter(g=>g.ativo===false).map(g=>g.nome));
function gerentesTodosSemFiltro(){return uniq([...S.gerCad.map(g=>g.nome),...Object.keys(S.metas),...S.opps.map(o=>o.gerente),...S.fat.map(r=>r.gerente)]).filter(g=>!HIDE_GER.has(g));}
function gerentesTodos(){return gerentesTodosSemFiltro().filter(visivel);}
function gerentes(){const off=inativos();return gerentesTodos().filter(g=>!off.has(g));}
const areaDe=g=>(S.gerCad.find(x=>x.nome===g)||{}).area||'Sem área';
const inSel=g=>visivel(g)&&(!S.sel.size||S.sel.has(g))&&(!S.areas.size||S.areas.has(areaDe(g)));
const filtrando=()=>S.sel.size>0||S.areas.size>0;
// gerentes que compõem a visão atual (gerentes e áreas escolhidos no painel)
const gerSel=()=>uniq([...gerentesTodosSemFiltro(),...Object.keys(S.metas)]).filter(inSel);
function areasTodas(){const a=opcoes('area_gerente');const usadas=uniq(gerentesTodos().map(areaDe));return [...a.filter(x=>usadas.includes(x)),...usadas.filter(x=>!a.includes(x))];}
function selOpps(){return S.opps.filter(o=>inSel(o.gerente));}
function selFat(){return S.fat.filter(r=>inSel(r.gerente));}
function metaSel(){const k=filtrando()?gerSel():Object.keys(S.metas).filter(visivel);return sum(k,g=>S.metas[g]||0);}
function runKey(){return (filtrando()?gerSel().sort().join('|'):'todos')+'@'+S.ano;}
function runningVal(){const r=S.running[runKey()];return r?Number(r)||0:0;}
function base(){
  const Y=S.ano, opps=selOpps(), fat=selFat().filter(r=>r.mes.startsWith(Y));
  const fcOpps=opps.filter(o=>OPEN.has(o.status)&&(o.fechamento||'').startsWith(Y));
  const wonOpps=opps.filter(o=>o.status===WON&&(o.fechamento||'').startsWith(Y));
  const real=sum(fat,r=>r.valor), fc=sum(fcOpps,vAno), won=sum(wonOpps,vAno), meta=metaSel(), run=runningVal();
  return {Y,opps,fat,fcOpps,wonOpps,real,fc,won,meta,run,proj:real+fc+run};
}

/* ================= gráficos ================= */
function ring(size,stroke,frac,c1,c2,big,small,id){
  const r=(size-stroke)/2, C=2*Math.PI*r, f=Math.max(0,Math.min(1,frac));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(big+' '+small)}">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="rgba(5,20,50,.55)" stroke="rgba(255,255,255,.12)" stroke-width="${stroke}"/>
  <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${C*f} ${C}" transform="rotate(-90 ${size/2} ${size/2})"/>
  <text x="50%" y="${size/2+4}" text-anchor="middle" style="font-size:${size*.2}px;font-weight:900">${esc(big)}</text>
  <text x="50%" y="${size/2+size*.16}" text-anchor="middle" style="font-size:${Math.max(10,size*.055)}px;font-weight:800;letter-spacing:.12em;fill:#cfe0f7">${esc(small)}</text></svg>`;
}
function smallRing(v){const s=84,st=9,r=(s-st)/2,C=2*Math.PI*r,f=Math.max(0,Math.min(1,v/100));
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="Confiança ${v}"><circle cx="${s/2}" cy="${s/2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${st}"/><circle cx="${s/2}" cy="${s/2}" r="${r}" fill="none" stroke="var(--c1)" stroke-width="${st}" stroke-linecap="round" stroke-dasharray="${C*f} ${C}" transform="rotate(-90 ${s/2} ${s/2})"/><text x="50%" y="${s/2+8}" text-anchor="middle" style="font-size:24px;font-weight:900;fill:var(--fg)">${v}</text></svg>`;}
function hbars(el,items,max){max=max||Math.max(1,...items.map(i=>i.v));
  el.innerHTML=items.length?items.map(i=>`<div class="hbar"><span class="n" title="${esc(i.l)}">${esc(i.l)}</span><span class="t"><i style="width:${Math.max(1.5,i.v/max*100)}%"></i></span><b>${esc(i.t||M(i.v))}</b></div>`).join(''):'<p class="note">Sem dados para a seleção.</p>';}
function vbars(el,items,o={}){
  const n=items.length||1, W=Math.max(640,n*58),H=o.h||250,pl=44,pr=10,pt=24,pb=28, series=o.series||[{k:'v',c:'var(--c1)'}];
  const tot=i=>sum(series,s=>i[s.k]||0); const max=Math.max(1,...items.map(tot))*1.08; const bw=(W-pl-pr)/n;
  const y=v=>pt+(H-pt-pb)*(1-v/max);
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.label||'')}">`;
  for(let k=0;k<=4;k++){const v=max/1.08*k/4,yy=y(v);s+=`<line x1="${pl}" x2="${W-pr}" y1="${yy}" y2="${yy}" stroke="var(--line)"/><text x="${pl-6}" y="${yy+3}" text-anchor="end">${esc(k?Ms(v):'R$ 0')}</text>`;}
  items.forEach((it,i)=>{const x=pl+i*bw+bw*.2,w=bw*.6;let acc=0;
    series.forEach(se=>{const v=it[se.k]||0;if(!v)return;const y0=y(acc),y1=y(acc+v);s+=`<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(0,y0-y1)}" rx="3" fill="${se.c}"><title>${esc(it.l)}: ${esc(brl(v))}</title></rect>`;acc+=v;});
    if(acc)s+=`<text class="lab" x="${x+w/2}" y="${y(acc)-6}" text-anchor="middle">${esc(Ms(acc).replace(' ','').toLowerCase())}</text>`;
    s+=`<text x="${x+w/2}" y="${H-9}" text-anchor="middle">${esc(it.l)}</text>`;});
  if(o.line){const lm=Math.max(1,...items.map(i=>i[o.line]||0));const ly=v=>pt+(H-pt-pb)*(1-v/lm*.92);
    const pts=items.map((it,i)=>[pl+i*bw+bw/2,ly(it[o.line]||0)]);
    s+=`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="var(--purple)" stroke-width="2.5"/>`;
    pts.forEach((p,i)=>{s+=`<circle cx="${p[0]}" cy="${p[1]}" r="9" fill="var(--surface)" stroke="var(--purple)" stroke-width="2"/><text x="${p[0]}" y="${p[1]+3.5}" text-anchor="middle" style="font-size:9.5px;font-weight:800;fill:var(--purple)">${items[i][o.line]||0}</text>`;});}
  el.innerHTML=s+'</svg>';
}
function donut(el,items){
  const tot=sum(items,i=>i.v); if(!tot){el.innerHTML='<p class="note">Sem dados.</p>';return;}
  const pal=['var(--c1)','#6aa5f0','var(--c2)','var(--purple)','var(--navy-2)','var(--meta)','#8fa3bf','var(--c3)'];
  const top=items.slice(0,7); const rest=tot-sum(top,i=>i.v); if(rest>0)top.push({l:'Outras',v:rest});
  const R=70,r=44,cx=80,cy=80;let a=-Math.PI/2,s=`<svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Mix de tecnologias">`;
  top.forEach((it,i)=>{const da=it.v/tot*Math.PI*2;const a2=a+da;const lg=da>Math.PI?1:0;
    const p=(ang,rad)=>[cx+rad*Math.cos(ang),cy+rad*Math.sin(ang)];const [x1,y1]=p(a,R),[x2,y2]=p(a2-0.0001,R),[x3,y3]=p(a2-0.0001,r),[x4,y4]=p(a,r);
    s+=`<path d="M${x1},${y1} A${R},${R} 0 ${lg} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${lg} 0 ${x4},${y4}Z" fill="${pal[i%pal.length]}" stroke="var(--surface)" stroke-width="1.5"><title>${esc(it.l)}</title></path>`;a=a2;});
  s+=`<text x="80" y="80" text-anchor="middle" style="font-size:22px;font-weight:900;fill:var(--fg)">${items.length}</text><text x="80" y="96" text-anchor="middle">tecnologias</text></svg>`;
  el.innerHTML=`<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div style="flex:none">${s}</div><div style="flex:1;min-width:200px;display:grid;gap:6px">${top.map((it,i)=>`<div style="display:flex;gap:8px;align-items:center;font-size:12.5px"><i style="width:10px;height:10px;border-radius:3px;background:${pal[i%pal.length]};flex:none"></i><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.l)}</span><b class="num">${pct(it.v,tot)}</b></div>`).join('')}</div></div>`;
}

/* ================= painel ================= */
function renderGerSel(){
  renderAreaSel();
  if(GER_FIXO){$('#msGer').innerHTML=`<button type="button" disabled><span>${esc(GER_FIXO)}</span><span class="cnt">1</span></button>`;$('#gerHint').textContent='Você vê a sua carteira.';return;}
  const all=gerentes().filter(g=>!S.areas.size||S.areas.has(areaDe(g))); const n=S.sel.size;
  const lbl=!n?'Todos os gerentes':n===1?[...S.sel][0]:`${n} gerentes`;
  const box=$('#msGer'); const open=box.querySelector('.ms-pop')&&!box.querySelector('.ms-pop').hidden;
  box.innerHTML=`<button type="button" aria-haspopup="true" aria-expanded="${open}"><span>${esc(lbl)}</span><span class="cnt">${n||all.length}</span></button>
    <div class="ms-pop" ${open?'':'hidden'}>${all.map(g=>`<label><input type="checkbox" value="${esc(g)}" ${S.sel.has(g)?'checked':''}>${esc(g)}${S.metas[g]?` <span class="note">· meta ${esc(M(S.metas[g]))}</span>`:''}</label>`).join('')}</div>`;
  const k=gerSel().filter(g=>!HIDE_GER.has(g)).length;
  $('#gerHint').textContent=`${k} gerente${k===1?'':'s'} compõe${k===1?'':'m'} os números atuais.`;
}
function renderAreaSel(){
  const f=$('#fAreaBox'); if(GER_FIXO){f.hidden=true;return;} f.hidden=false;
  const all=areasTodas(),n=S.areas.size,box=$('#msArea');const open=box.querySelector('.ms-pop')&&!box.querySelector('.ms-pop').hidden;
  const lbl=!n?'Todas as áreas':n===1?[...S.areas][0]:`${n} áreas`;
  box.innerHTML=`<button type="button" aria-haspopup="true" aria-expanded="${open}"><span>${esc(lbl)}</span><span class="cnt">${n||all.length}</span></button>
    <div class="ms-pop" ${open?'':'hidden'}>${all.map(a=>`<label><input type="checkbox" value="${esc(a)}" ${S.areas.has(a)?'checked':''}>${esc(a)} <span class="note">· ${gerentes().filter(g=>areaDe(g)===a).length} gerentes</span></label>`).join('')}</div>`;
}
$('#msArea').addEventListener('change',e=>{if(GER_FIXO)return;const v=e.target.value;if(e.target.checked)S.areas.add(v);else S.areas.delete(v);
  [...S.sel].forEach(g=>{if(S.areas.size&&!S.areas.has(areaDe(g)))S.sel.delete(g);});renderAll();});
document.addEventListener('click',e=>{['#msGer','#msArea'].forEach(id=>{const box=$(id);
  if(box.contains(e.target)){ if(e.target.closest('button')){const p=box.querySelector('.ms-pop');if(!p)return;p.hidden=!p.hidden;box.querySelector('button').setAttribute('aria-expanded',!p.hidden);} return;}
  const p=box.querySelector('.ms-pop'); if(p&&!p.hidden){p.hidden=true;}});
});
$('#msGer').addEventListener('change',e=>{if(GER_FIXO)return;const v=e.target.value;if(e.target.checked)S.sel.add(v);else S.sel.delete(v);renderAll();});

function renderHero(b){
  const gsv=filtrando()?gerSel():[];const one=gsv.length===1?gsv[0]:null;
  $('#hName').textContent=one||(S.areas.size&&!S.sel.size?[...S.areas].join(', '):filtrando()?`${gsv.length} gerentes selecionados`:'Comercial Almaviva');
  $('#hLead').textContent=one?'Faturamento, pipeline e desempenho individual':'Faturamento, pipeline e desempenho da equipe comercial';
  $('#hPill').textContent=`Ano de ${b.Y} · Meta ${b.meta?M(b.meta):'não definida'}`;
  $('#hReal').textContent=M(b.real);$('#hFc').textContent=M(b.fc);$('#hProj').textContent=M(b.proj);
  const big=Math.min(220,Math.max(160,window.innerWidth*.14));
  $('#hRings').innerHTML=ring(big*.78,14,b.meta?b.real/b.meta:0,'#3d8bff','#63c8ff',b.meta?Ms(b.meta).replace(' ',' '):'—','META ANUAL','g1')+
    ring(big,16,b.meta?b.proj/b.meta:0,'#63c8ff','#9ee6ff',b.meta?pct(b.proj,b.meta):'—','DA META COBERTA','g2');
  const d=b.proj-b.meta; $('#hCap').textContent=b.meta?(d>=0?`Projeção acima da meta em ${M(d)}`:`Projeção abaixo da meta em ${M(-d)}`):'Selecione gerentes com meta para ver a cobertura';
}

function renderMeta(b){
  $('#covTag').textContent=b.meta?`${pct(b.proj,b.meta)} da meta no cenário integral`:'Sem meta para a seleção';
  const w=v=>`style="--w:${Math.max(4,Math.min(100,b.meta?v/b.meta*100:0))}%"`;
  $('#metaCards').innerHTML=`
   <div class="kpi" ${w(b.meta)}><span class="l">Meta anual</span><span class="v num">${esc(M(b.meta))}</span><span class="s">objetivo comercial de ${b.Y}</span></div>
   <div class="kpi" ${w(b.real)}><span class="l">Realizado</span><span class="v num">${esc(M(b.real))}</span><span class="s">${pct(b.real,b.meta)} da meta</span></div>
   <div class="kpi" ${w(b.fc)}><span class="l">Forecast previsto</span><span class="v num">${esc(M(b.fc))}</span><span class="s">${b.fcOpps.length} oportunidades com fechamento em ${b.Y} · ${pct(b.fc,b.meta,0)} da meta</span></div>
   <div class="kpi" ${w(b.run)}><span class="l">Running previsto</span>
     <div style="display:flex;gap:6px;align-items:center"><b style="color:var(--c1)">R$</b><input id="runIn" inputmode="decimal" value="${esc(nf(b.run,2))}" aria-label="Running previsto em reais"></div>
     <span class="s" id="runMsg">${S.running[runKey()]!=null?'valor salvo para esta seleção':'receita recorrente esperada até o fim do ano'}</span>
     <button class="blue" id="runBtn" style="padding:6px 10px" ${S.readOnly||!pode('editar_running')?'disabled':''}>Aplicar à projeção</button></div>
   <div class="kpi" ${w(b.proj)}><span class="l">Projeção combinada</span><span class="v num">${esc(M(b.proj))}</span><span class="s">${b.meta?(b.proj>=b.meta?'superaria em '+M(b.proj-b.meta):'faltariam '+M(b.meta-b.proj)):'realizado + forecast + running'}</span></div>`;
  $('#runBtn').addEventListener('click',saveRunning);
}
async function saveRunning(){
  if(!pode('editar_running'))return;
  const raw=$('#runIn').value.replace(/\./g,'').replace(',','.').replace(/[^\d.]/g,''); const v=Math.max(0,Number(raw)||0);
  try{ const key=runKey(); const next={...S.running,[key]:v}; await api.salvarRunning(key,v,userId); S.running=next; renderAll(); toast('Running previsto aplicado à projeção'); }
  catch(e){ $('#runMsg').textContent=semPermissao(e)?'Você não tem permissão para alterar este valor.':'Não foi possível salvar agora.'; }
}

function renderInsights(b){
  const gap=Math.max(0,b.meta-b.real); const need=b.fc?(b.meta-b.real-b.run)/b.fc:0;
  const byM=Array(12).fill(0); b.fcOpps.forEach(o=>byM[+o.fechamento.slice(5,7)-1]+=vAno(o)); const pk=byM.indexOf(Math.max(...byM));
  const wonCli={}; b.wonOpps.forEach(o=>wonCli[o.cliente]=(wonCli[o.cliente]||0)+vAno(o)); const wc=Object.entries(wonCli).sort((a,c)=>c[1]-a[1])[0];
  const tec={}; b.fat.forEach(r=>{if(r.tecnologia)tec[r.tecnologia]=(tec[r.tecnologia]||0)+r.valor;}); const tc=Object.entries(tec).sort((a,c)=>c[1]-a[1])[0];
  const cards=[
    [b.meta?`Gap atual de ${M(gap)}`:'Sem meta definida', b.meta?`O faturamento realizado cobre ${pct(b.real,b.meta)} da meta anual de ${M(b.meta)}.`:'Cadastre a meta dos gerentes selecionados.'],
    [b.meta?(need<=0?'Meta coberta sem depender do forecast':`Conversão necessária: ${nf(Math.min(need*100,999),1)}%`):'Conversão necessária', need<=0?'Realizado e Running já cobrem a meta.':`Com 100% do forecast previsto, o cenário fecha em ${M(b.real+b.fc+b.run)}.`],
    [b.fc?`${pct(byM[pk],b.fc)} do futuro em ${MESL[pk]}`:'Sem forecast no ano', b.fc?`${M(byM[pk])} das previsões estão concentrados nesse mês.`:'Não há oportunidades em aberto com fechamento no ano.'],
    [wc?`Ganhos em ${wc[0]}`:'Sem ganhos no ano', wc?`${pct(wc[1],b.won)} do valor ganho está no principal cliente. Os ganhos não são somados ao realizado.`:'Nenhuma oportunidade ganha com fechamento no ano.'],
    [tc?`${tc[0]} lidera o faturamento`:'Sem faturamento', tc?`${M(tc[1])} faturados, ${pct(tc[1],b.real)} do realizado da seleção.`:'Nenhum lançamento no recorte.'],
  ];
  $('#insights').innerHTML=cards.map(([t,p])=>`<div class="insight"><b>${esc(t)}</b><p>${esc(p)}</p></div>`).join('');
}

function renderGerBars(b){
  const gs=(filtrando()?gerSel():gerentes());
  const rows=gs.map(g=>({g,real:sum(b.fat.filter(r=>r.gerente===g),r=>r.valor),fc:sum(b.fcOpps.filter(o=>o.gerente===g),vAno),meta:S.metas[g]||0}));
  const r1=rows.filter(r=>r.real).sort((a,c)=>c.real-a.real);
  hbars($('#barReal'),r1.map(r=>({l:r.g,v:r.real})));
  const r2=rows.filter(r=>r.real+r.fc||r.meta).sort((a,c)=>(c.real+c.fc)-(a.real+a.fc));
  hbars($('#barPot'),r2.map(r=>({l:r.g,v:r.real+r.fc,t:M(r.real+r.fc)+(r.meta?` · ${pct(r.real+r.fc,r.meta,0)} da meta`:'')})));
}

function renderTraj(b){
  const curQ=b.Y===String(TODAY.getFullYear())?quarter(TODAY_ISO):(b.Y<String(TODAY.getFullYear())?3:-1);
  const realQ=[0,1,2,3].map(q=>sum(b.fat.filter(r=>quarter(r.mes+'-01')===q),r=>r.valor));
  const fcQ=[0,0,0,0]; b.fcOpps.forEach(o=>{let q=quarter(o.fechamento); if(q<Math.max(curQ,0))q=Math.max(curQ,0); fcQ[q]+=vAno(o);});
  const cumR=[],cumP=[],metaC=[];let ar=0,ap=0;
  for(let q=0;q<4;q++){ar+=realQ[q];cumR.push(ar);metaC.push(b.meta*(q+1)/4);
    if(q<curQ){ap=ar;} else {ap=(q===curQ||curQ<0&&q===0?ar:ap)+fcQ[q]+(q>curQ&&curQ>=0?realQ[q]:0); if(q===3)ap+=b.run;}
    cumP.push(q<curQ?ar:ap);}
  // projeção acumulada coerente: a partir do trimestre corrente soma forecast
  let run=0; for(let q=0;q<4;q++){ if(q<curQ) cumP[q]=cumR[q]; else { run=(q===Math.max(curQ,0)?cumR[q]:cumP[q-1])+fcQ[q]+(q===3?b.run:0); cumP[q]=run; } }
  const W=1100,H=320,pl=64,pr=96,pt=26,pb=34; const max=Math.max(1,...metaC,...cumP)*1.12;
  const x=q=>pl+(W-pl-pr)*q/3, y=v=>pt+(H-pt-pb)*(1-v/max);
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Trajetória de atingimento">`;
  for(let k=0;k<=4;k++){const v=max/1.12*k/4;s+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl-8}" y="${y(v)+3}" text-anchor="end">${esc(k?Ms(v):'R$ 0')}</text>`;}
  const s0=Math.max(curQ,0); const realLine=[0,1,2,3].map(q=>[x(q),y(q<=s0?cumR[q]:cumR[s0])]);
  const band=[...[0,1,2,3].filter(q=>q>=s0).map(q=>[x(q),y(cumP[q])]),...[3,2,1,0].filter(q=>q>=s0).map(q=>[x(q),y(q<=s0?cumR[q]:cumR[s0])])];
  if(band.length>2)s+=`<polygon points="${band.map(p=>p.join(',')).join(' ')}" fill="var(--green)" opacity=".22"/>`;
  s+=`<polyline points="${realLine.filter((_,q)=>q>=s0).map(p=>p.join(',')).join(' ')}" fill="none" stroke="var(--c2)" stroke-width="2"/>`;
  if(b.meta)s+=`<polyline points="${metaC.map((v,q)=>x(q)+','+y(v)).join(' ')}" fill="none" stroke="var(--c3)" stroke-width="2.5" stroke-dasharray="7 6"/>`+metaC.map((v,q)=>`<circle cx="${x(q)}" cy="${y(v)}" r="4" fill="var(--c3)"/>`).join('');
  s+=`<polyline points="${cumP.map((v,q)=>x(q)+','+y(v)).join(' ')}" fill="none" stroke="var(--green)" stroke-width="3.5"/>`+cumP.map((v,q)=>`<circle cx="${x(q)}" cy="${y(v)}" r="5" fill="var(--green)" stroke="var(--surface)" stroke-width="2"/>`).join('');
  s+=`<text class="lab" x="${x(3)+10}" y="${y(cumP[3])+4}" style="fill:var(--green)">${esc(M(cumP[3]))}</text>`;
  if(b.meta)s+=`<text class="lab" x="${x(3)+10}" y="${y(metaC[3])+(Math.abs(y(metaC[3])-y(cumP[3]))<14?16:4)}" style="fill:var(--c3)">${esc(M(b.meta))}</text>`;
  ['Q1','Q2','Q3','Q4'].forEach((l,q)=>s+=`<text x="${x(q)}" y="${H-10}" text-anchor="middle" style="font-weight:800;fill:var(--fg)">${l}</text>`);
  $('#chTraj').innerHTML=s+'</svg>';
  const dep=b.proj?(b.fc)/b.proj:0; const qd=fcQ.indexOf(Math.max(...fcQ));
  $('#trajCards').innerHTML=`
    <div class="mini" style="--c:var(--green)"><span class="l">Cobertura projetada</span><span class="v">${b.meta?pct(b.proj,b.meta):'—'}</span><span class="s">${b.meta?(b.proj>=b.meta?M(b.proj-b.meta)+' no cenário acima da meta':M(b.meta-b.proj)+' abaixo da meta no cenário'):'sem meta na seleção'}</span></div>
    <div class="mini" style="--c:var(--purple)"><span class="l">Dependência da carteira</span><span class="v">${pct(b.fc,b.proj)}</span><span class="s">${esc(M(b.fc))} vêm do Forecast previsto · ${esc(M(b.run))} de Running previsto entra no fechamento anual</span></div>
    <div class="mini" style="--c:var(--c1)"><span class="l">Trimestre decisivo</span><span class="v">${b.fc?'Q'+(qd+1):'—'}</span><span class="s">${b.fc?esc(M(fcQ[qd]))+' do Forecast previsto fecha neste trimestre':'sem forecast no ano'}</span></div>`;
  $('#trajFoot').textContent=`Q4: ${M(cumP[3])}${b.meta?' · '+pct(cumP[3],b.meta)+' da meta':''}`;
}

function pipeFiltered(b){
  const p=S.p; return b.opps.filter(o=>{
    const okSt=p.res==='g'?o.status===WON:p.res==='p'?OPEN.has(o.status):FUNNEL.includes(o.status);
    return okSt&&(o.fechamento||'').startsWith(b.Y)&&(!p.cli||o.cliente===p.cli)&&(!p.fab||fab(o)===p.fab)&&(!p.area||(o.area||'').includes(p.area));});
}
function renderPipeline(b){
  const all=b.opps.filter(o=>FUNNEL.includes(o.status)&&(o.fechamento||'').startsWith(b.Y));
  $('#pCli').innerHTML=opts(uniq(all.map(o=>o.cliente)),S.p.cli,'Todos os clientes');
  $('#pFab').innerHTML=opts(uniq(all.map(fab)),S.p.fab,'Todos os fabricantes');
  $('#pArea').innerHTML=opts(opcoes('area',S.p.area),S.p.area,'Todas as áreas');
  $('#pRes').value=S.p.res;
  const L=pipeFiltered(b); const won=L.filter(o=>o.status===WON), fc=L.filter(o=>OPEN.has(o.status));
  const wv=sum(won,vAno), fv=sum(fc,vAno), tot=wv+fv, saldo=b.meta-tot;
  $('#pInfo').textContent=`${L.length} de ${all.length} oportunidades · ${M(tot)} · fechamento em ${b.Y}`;
  $('#pKpis').innerHTML=`
   <div class="kpi lb"><span class="l">Pipeline ganho</span><span class="v num">${esc(M(wv))}</span><span class="s">${won.length} oportunidades ganhas</span></div>
   <div class="kpi lb"><span class="l">Forecast previsto</span><span class="v num">${esc(M(fv))}</span><span class="s">${fc.length} oportunidades com fechamento em ${b.Y}</span></div>
   <div class="kpi lb"><span class="l">Carteira total</span><span class="v num">${esc(M(tot))}</span><span class="s">ganhos + previsões</span></div>
   <div class="kpi lb ${saldo>0?'bad':''}"><span class="l">Saldo para a meta</span><span class="v num ${saldo>0?'bad':''}">${b.meta?esc(M(Math.max(0,saldo))):'—'}</span><span class="s">${b.meta?(saldo>0?'faltam para a meta, além de ganhos + previsões':'meta coberta por ganhos + previsões'):'sem meta na seleção'}</span></div>`;
  $('#funTag').textContent=`${L.length} oportunidades · ${M(tot)}`;
  const cols=['#1f74f0','#2f7fe6','#3c86d9','#4a8dc6','#3f9a9a','#2fae7f'];
  $('#funnel').innerHTML=FUNNEL.map((st,i)=>{const a=L.filter(o=>o.status===st),v=sum(a,vAno);
    return `<div class="fstep" style="margin-inline:${i*3.2}%;background:linear-gradient(90deg,${cols[i]},color-mix(in srgb,${cols[i]} 70%,#9fd8ff))"><span class="k">${i+1}</span><span class="nm">${esc(st)}</span><span class="vv">${esc(M(v))}</span><span class="cc">${a.length} oportunidade${a.length===1?'':'s'}<br>${pct(v,tot)} do valor</span></div>`;}).join('');
}

function renderRisk(b){
  const top=Math.max(b.meta,b.proj)*1.06||1; const w=v=>Math.max(0,v/top*100);
  $('#bullet').innerHTML=`<div style="display:flex;justify-content:space-between" class="note"><span>R$ 0</span><span>${esc(M(top/1.06))}</span></div>
    <div style="position:relative;height:30px;border-radius:8px;background:var(--surface-3);overflow:hidden;margin:6px 0 4px;display:flex">
      <i style="width:${w(b.real)}%;background:var(--c1)"></i><i style="width:${w(b.fc)}%;background:var(--c2)"></i><i style="width:${w(b.run)}%;background:var(--c3)"></i>
      ${b.meta?`<span style="position:absolute;top:-2px;bottom:-2px;left:calc(${w(b.meta)}% - 1px);width:3px;background:var(--meta)" title="Meta"></span>`:''}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:12px">
      ${[['Resultado',b.real],['Forecast previsto',b.fc],['Running previsto',b.run],['Projeção combinada',b.proj]].map(([l,v])=>`<div class="insight"><span class="note" style="font-weight:800;text-transform:uppercase;font-size:10.5px;letter-spacing:.08em">${l}</span><b class="num" style="margin:2px 0 0">${esc(M(v))}</b></div>`).join('')}
      <div class="insight"><span class="note" style="font-weight:800;text-transform:uppercase;font-size:10.5px;letter-spacing:.08em">Cobertura</span><b class="num" style="margin:2px 0 0">${b.meta?pct(b.proj,b.meta):'—'}</b></div></div>
    <div class="legend" style="margin-top:10px"><span><i style="background:var(--c1)"></i>Resultado</span><span><i style="background:var(--c2)"></i>Forecast previsto</span><span><i style="background:var(--c3)"></i>Running previsto</span><span><i style="background:var(--meta)"></i>Meta</span></div>`;
  // waterfall
  const W=620,H=260,pt=26,pb=34,max=Math.max(b.meta,b.proj,1)*1.12,y=v=>pt+(H-pt-pb)*(1-v/max),bw=W/5;
  const steps=[['Resultado',0,b.real,'var(--c1)'],['Pipeline',b.real,b.real+b.fc,'var(--c2)'],['Running',b.real+b.fc,b.proj,'var(--c3)'],['Projeção',0,b.proj,'var(--navy)']];
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Waterfall da meta">`;
  steps.forEach(([l,a,c,col],i)=>{const x=i*bw+bw*.18,w=bw*.64;s+=`<rect x="${x}" y="${y(c)}" width="${w}" height="${Math.max(1,y(a)-y(c))}" rx="4" fill="${col}"/><text class="lab" x="${x+w/2}" y="${y(c)-7}" text-anchor="middle">${esc(Ms(c-a))}</text><text x="${x+w/2}" y="${H-10}" text-anchor="middle" style="font-weight:700">${l}</text>`;
    if(i<2)s+=`<line x1="${x+w}" x2="${x+bw}" y1="${y(c)}" y2="${y(c)}" stroke="var(--muted)" stroke-dasharray="3 3"/>`;});
  {const x=4*bw+bw*.18,w=bw*.64;s+=`<rect x="${x}" y="${y(b.meta)}" width="${w}" height="${Math.max(1,y(0)-y(b.meta))}" rx="4" fill="none" stroke="var(--meta)" stroke-width="2" stroke-dasharray="6 4"/><text class="lab" x="${x+w/2}" y="${y(b.meta)-7}" text-anchor="middle">${esc(b.meta?Ms(b.meta):'—')}</text><text x="${x+w/2}" y="${H-10}" text-anchor="middle" style="font-weight:700">Meta</text>`;}
  $('#waterfall').innerHTML=s+'</svg>';
  // heatmap
  const L=b.opps.filter(o=>FUNNEL.includes(o.status)&&(o.fechamento||'').startsWith(b.Y));
  const sts=[...FUNNEL].filter(st=>L.some(o=>o.status===st)).sort((a,c)=>sum(L.filter(o=>o.status===c),vAno)-sum(L.filter(o=>o.status===a),vAno));
  const cell=(st,q)=>sum(L.filter(o=>(!st||o.status===st)&&(q<0||quarter(o.fechamento)===q)),vAno);
  const mx=Math.max(1,...sts.flatMap(st=>[0,1,2,3].map(q=>cell(st,q))));
  const bg=v=>v?`background:color-mix(in srgb,var(--c1) ${Math.round(12+v/mx*78)}%,var(--surface));color:${v/mx>.55?'#fff':'var(--fg)'}`:'';
  $('#heat').innerHTML=`<thead><tr>${['Etapa','Q1','Q2','Q3','Q4','Total'].map(h=>`<th><div>${h}</div></th>`).join('')}</tr></thead><tbody>`+
    sts.map(st=>`<tr><td><div>${esc(st)}</div></td>${[0,1,2,3].map(q=>{const v=cell(st,q);return `<td><div style="${bg(v)}">${v?esc(Ms(v)):'—'}</div></td>`;}).join('')}<td><div>${esc(Ms(cell(st,-1)))}</div></td></tr>`).join('')+
    `<tr><td><div>Total</div></td>${[0,1,2,3].map(q=>`<td><div>${cell(null,q)?esc(Ms(cell(null,q))):'—'}</div></td>`).join('')}<td><div>${esc(Ms(cell(null,-1)))}</div></td></tr></tbody>`;
}

const runFor=g=>Number(S.running[(S.sel.size===1&&S.sel.has(g)?g:'§')+'@'+S.ano]||S.running[g+'@'+S.ano])||0;
function scoreOpp(o,maxV){
  const days=Math.round((new Date(o.fechamento)-TODAY)/864e5);
  const vS=Math.log10(1+vAno(o))/Math.log10(1+maxV); const tS=days<0?0.5:Math.max(0,1-days/120); const pS=(o.probabilidade||0)/100;
  return {s:Math.round(40*vS+35*tS+25*pS),days};
}
function renderIntel(b){
  const today=TODAY_ISO; const venc=b.fcOpps.filter(o=>o.fechamento<today); const semData=selOpps().filter(o=>OPEN.has(o.status)&&!o.fechamento);
  const byCli={}; b.fcOpps.forEach(o=>byCli[o.cliente]=(byCli[o.cliente]||0)+vAno(o)); const cliTop=Object.entries(byCli).sort((a,c)=>c[1]-a[1]);
  const conc=b.fc&&cliTop.length?cliTop[0][1]/b.fc:0; const vencS=b.fc?sum(venc,vAno)/b.fc:0; const semS=b.fcOpps.length?semData.length/(b.fcOpps.length+semData.length):0;
  const curQ=quarter(today); const q4=b.fc?sum(b.fcOpps.filter(o=>quarter(o.fechamento)===3),vAno)/b.fc:0;
  const conf=Math.max(0,Math.min(100,Math.round(100-25*conc-40*vencS-30*semS)));
  // diagnóstico
  let t,p; if(!b.meta){t='Seleção sem meta cadastrada';p='Escolha gerentes com meta para ver a cobertura e o diagnóstico.';}
  else if(b.real>=b.meta){t='Meta já atingida pelo realizado';p=`O realizado de ${M(b.real)} supera a meta em ${M(b.real-b.meta)}. O forecast de ${M(b.fc)} é excedente.`;}
  else if(b.proj>=b.meta){t='Meta coberta no cenário atual';p=`A projeção combinada alcança ${pct(b.proj,b.meta)} da meta, com excedente de ${M(b.proj-b.meta)}${b.run?' e '+M(b.run)+' de Running previsto':''}. A principal atenção agora é proteger a conversão e os prazos.`;}
  else {t='Meta em risco no cenário atual';p=`Mesmo convertendo 100% do forecast, faltariam ${M(b.meta-b.proj)}. É preciso gerar novas oportunidades ou antecipar fechamentos.`;}
  $('#diagT').textContent=t;$('#diagP').textContent=p;
  $('#confRing').innerHTML=smallRing(conf);$('#confT').textContent=conf>=75?'Confiança alta':conf>=50?'Confiança média':'Confiança baixa';
  $('#confP').textContent=`Running ${M(b.run)} · ${venc.length} vencida(s) · ${semData.length} sem data · concentração de ${nf(conc*100,1)}%`;
  // alertas
  const al=[];
  if(venc.length)al.push(['crit','Oportunidades com fechamento vencido',`${venc.length} oportunidade(s) em aberto já passaram da data, somando ${M(sum(venc,vAno))}. Revise datas ou etapas.`]);
  if(conc>.5)al.push(['','Concentração por cliente',`${cliTop[0][0]} concentra ${nf(conc*100,1)}% do forecast (${M(cliTop[0][1])}).`]);
  if(q4>.7&&curQ<3)al.push(['','Dependência elevada do Q4',`${nf(q4*100,0)}% do forecast está previsto para o quarto trimestre.`]);
  if(q4>.7&&curQ===3)al.push(['','Forecast concentrado no trimestre atual',`${nf(q4*100,0)}% do forecast fecha até dezembro. O tempo para converter é curto.`]);
  if(semData.length)al.push(['','Oportunidades sem data de fechamento',`${semData.length} oportunidade(s) em aberto sem data prevista.`]);
  const gsM=(filtrando()?gerSel():Object.keys(S.metas).filter(visivel)).filter(g=>S.metas[g]);
  const risk=gsM.filter(g=>{const r=sum(b.fat.filter(x=>x.gerente===g),x=>x.valor),f=sum(b.fcOpps.filter(o=>o.gerente===g),vAno);return r+f+runFor(g)<S.metas[g];});
  if(risk.length)al.push(['crit','Gerentes abaixo da meta mesmo com 100% do forecast e Running',risk.join(', ')]);
  $('#alCount').textContent=al.length;
  $('#alerts').innerHTML=al.length?al.map(([c,ti,tx])=>`<div class="alert ${c}"><i></i><div><b>${esc(ti)}</b><span>${esc(tx)}</span></div></div>`).join(''):`<div class="alert ok"><i></i><div><b>Nenhum alerta</b><span>A seleção não tem riscos relevantes agora.</span></div></div>`;
  // recomendações
  $('#recs').innerHTML=gsM.length?gsM.map(g=>{const r=sum(b.fat.filter(x=>x.gerente===g),x=>x.valor),f=sum(b.fcOpps.filter(o=>o.gerente===g),vAno),m=S.metas[g];
    if(r>=m)return `<div class="rec ok"><span class="tag win">Meta atingida</span><b>${esc(g)}</b><p>Realizado de ${esc(M(r))} já cobre a meta de ${esc(M(m))}. Foque em antecipar o pipeline do próximo ano.</p></div>`;
    const rn=runFor(g);
    if(r+f+rn>=m)return `<div class="rec ok"><span class="tag win">No caminho</span><b>${esc(g)}</b><p>Com o forecast de ${esc(M(f))}${rn?' e Running de '+esc(M(rn)):''} a meta fica coberta. Proteja a conversão e as datas de fechamento.</p></div>`;
    return `<div class="rec"><span class="tag warn">● Atenção</span><b>${esc(g)}</b><p>Mesmo com 100% do forecast${rn?' e o Running previsto':''}, ainda faltariam ${esc(M(m-r-f-rn))}. Reforçar prospecção e revisar datas.</p></div>`;}).join(''):'<p class="note">Nenhum gerente com meta na seleção.</p>';
  // ranking
  const maxV=Math.max(1,...b.fcOpps.map(vAno)); const big=[...b.fcOpps.map(vAno)].sort((a,c)=>c-a)[Math.floor(b.fcOpps.length*.25)]||maxV;
  const R=b.fcOpps.map(o=>({o,...scoreOpp(o,maxV)})).sort((a,c)=>c.s-a.s).slice(0,10);
  $('#signals').innerHTML=[['Alertas críticos',al.filter(a=>a[0]==='crit').length],['Oportunidades priorizadas',R.length],['Dependência do forecast',pct(b.fc,b.proj)]].map(([l,v])=>`<div class="signal"><span>${l}</span><b>${v}</b></div>`).join('');
  $('#rank').innerHTML=`<thead><tr><th>#</th><th>Oportunidade</th><th>Gerente</th><th>Etapa</th><th>Motivo da prioridade</th><th class="r">Valor no ano</th><th>Score</th></tr></thead><tbody>`+
    (R.map((x,i)=>{const why=[x.days<0?`venceu há ${-x.days} dia${x.days===-1?'':'s'}`:x.days===0?'fecha hoje':`fecha em ${x.days} dia${x.days===1?'':'s'}`]; if(vAno(x.o)>=big&&vAno(x.o)>0)why.push('alto valor'); if((x.o.probabilidade||0)<=30)why.push('baixa maturidade');
      return `<tr class="click" data-opp="${esc(x.o.id)}"><td>${i+1}</td><td class="w"><b>${esc(x.o.numero)} · ${esc(x.o.cliente)}</b><br><span class="note">${esc(x.o.titulo)}</span></td><td>${esc(x.o.gerente)}</td><td>${tagSt(x.o.status)}</td><td>${esc(why.join(' · '))}</td><td class="r"><b>${esc(M(vAno(x.o)))}</b></td><td><span class="score">${x.s}</span></td></tr>`;}).join('')||'<tr><td colspan="7" class="note">Sem oportunidades em aberto no ano.</td></tr>')+'</tbody>';
}

function renderSim(b){
  const elig=S.sim.ex?b.fcOpps.filter(o=>o.fechamento>=TODAY_ISO):b.fcOpps; const ev=sum(elig,vAno);
  const proj=b.real+b.run+ev*S.sim.pct/100, saldo=proj-b.meta, need=ev?(b.meta-b.real-b.run)/ev:0;
  $('#simV').textContent=S.sim.pct+'%';$('#simR').value=S.sim.pct;
  document.querySelectorAll('#simPresets button').forEach(x=>x.setAttribute('aria-pressed',String(+x.dataset.p===S.sim.pct)));
  $('#simOut').innerHTML=`<div><span class="l">Projeção simulada</span><div class="v num">${esc(M(proj))}</div></div><div><span class="l">Cobertura da meta</span><div class="v num">${b.meta?pct(proj,b.meta):'—'}</div></div><div><span class="l">Saldo projetado</span><div class="v num" style="color:${saldo<0?'var(--bad)':'var(--good)'}">${b.meta?(saldo<0?'- ':'+ ')+esc(M(Math.abs(saldo))):'—'}</div></div>`;
  $('#simTxt').textContent=!b.meta?'Selecione gerentes com meta para simular.':saldo>=0?`Com ${S.sim.pct}% de conversão e ${M(b.run)} de Running, a meta fica coberta com folga de ${M(saldo)}.`:
    `Com ${S.sim.pct}% de conversão e ${M(b.run)} de Running, ainda faltariam ${M(-saldo)}. Para cobrir a meta seria necessário converter ${need>1?'mais de 100%':nf(need*100,1)+'%'} da base elegível.`;
}

function renderCal(b){
  const L=b.opps.filter(o=>(o.fechamento||'').startsWith(b.Y));
  vbars($('#cal'),MES.map((m,i)=>{const k=`${b.Y}-${String(i+1).padStart(2,'0')}`;return {l:m,g:sum(L.filter(o=>o.status===WON&&o.fechamento.startsWith(k)),vAno),p:sum(L.filter(o=>OPEN.has(o.status)&&o.fechamento.startsWith(k)),vAno)};}),
    {series:[{k:'g',c:'var(--c1)'},{k:'p',c:'var(--c2)'}],label:'Calendário do pipeline'});
  const byCli={}; b.fcOpps.forEach(o=>byCli[o.cliente]=(byCli[o.cliente]||0)+vAno(o)); const t=Object.entries(byCli).sort((a,c)=>c[1]-a[1]);
  hbars($('#fcCli'),t.slice(0,7).map(([l,v])=>({l,v})));
  $('#fcCliNote').textContent=t.length?`${t[0][0]} concentra ${pct(t[0][1],b.fc)} do forecast previsto.`:'';
}

function renderEvol(b){
  const fabs=uniq(b.opps.map(fab)); $('#evFab').innerHTML=opts(fabs,S.evFab,'Todos os fabricantes');
  const L=b.opps.filter(o=>o.cadastro&&(!S.evFab||fab(o)===S.evFab));
  const first=L.map(o=>o.cadastro.slice(0,7)).sort()[0]; const end=TODAY_ISO.slice(0,7); const months=[];
  if(first){let [y,m]=first.split('-').map(Number); while(`${y}-${String(m).padStart(2,'0')}`<=end){months.push(`${y}-${String(m).padStart(2,'0')}`);m++;if(m>12){m=1;y++;}}}
  const items=months.map(k=>{const a=L.filter(o=>o.cadastro.startsWith(k));return {l:MES[+k.slice(5)-1].toLowerCase()+'/'+k.slice(2,4),v:sum(a,o=>o.valorTotal),n:a.length};});
  $('#evKpis').innerHTML=[['Oportunidades criadas',nf(L.length)],['Valor da carteira',M(sum(L,o=>o.valorTotal))],['Ticket médio',L.length?M(sum(L,o=>o.valorTotal)/L.length):'—'],['Fabricantes',nf(uniq(L.map(fab)).length)]]
    .map(([l,v])=>`<div class="mini" style="--c:transparent"><span class="l">${l}</span><span class="v" style="font-size:20px">${esc(v)}</span></div>`).join('');
  vbars($('#chEv'),items,{line:'n',h:270,label:'Evolução por data de cadastro'});
}

function renderPainel(){
  renderGerSel(); const b=base();
  renderHero(b);renderMeta(b);renderInsights(b);renderGerBars(b);renderTraj(b);renderPipeline(b);renderRisk(b);renderIntel(b);renderSim(b);renderCal(b);renderEvol(b);
}

/* ================= oportunidades ================= */
function renderOpps(){
  const q=$('#qOpp').value.trim().toLowerCase(), st=$('#fStatus').value;
  const gsv=filtrando()?gerSel():[];
  $('#oppVisao').innerHTML=GER_FIXO?`Sua carteira: <b>${esc(GER_FIXO)}</b>`:!filtrando()?'Mostrando <b>todos os gerentes</b>. Para filtrar, escolha gerentes ou áreas no <a href="#painel">Painel</a>.':
    `Mostrando ${S.areas.size?`áreas <b>${esc([...S.areas].join(', '))}</b>, `:''}${gsv.length===1?'gerente':`${gsv.length} gerentes`} <b>${esc(gsv.length<=4?gsv.join(', '):gsv.slice(0,4).join(', ')+'…')}</b>. Escolha outros no <a href="#painel">Painel</a>.`;
  let a=S.opps.filter(o=>inSel(o.gerente)&&(st==='abertas'?OPEN.has(o.status):st==='ganhas'?o.status===WON:true));
  const tmv=$('#fTeam').value,tms=uniq([...opcoes('team'),...S.opps.flatMap(o=>o.team||[])]).sort((x,y)=>x.localeCompare(y,'pt'));
  $('#fTeam').innerHTML=opts(tms,tmv,'Todos os team members');$('#fTeam').hidden=!tms.length;if(tmv)a=a.filter(o=>(o.team||[]).includes(tmv));
  if(q)a=a.filter(o=>[o.cliente,o.titulo,o.numero,o.software,o.parceiro,o.gerente,o.origemOpp,...(o.team||[])].join(' ').toLowerCase().includes(q));
  a=[...a].sort((x,y)=>(x.fechamento||'9').localeCompare(y.fechamento||'9'));
  $('#oppCount').textContent=`${a.length} oportunidades · total ${M(sum(a,o=>o.valorTotal))} · no ano ${M(sum(a,vAno))}`;
  $('#tbOpp').innerHTML=`<thead><tr><th>Nº</th><th>Fechamento</th><th>Gerente</th><th>Cliente</th><th>Fabricante</th><th>Oportunidade</th><th>Área</th><th>Etapa</th><th class="r">Valor total</th><th class="r">Valor no ano</th><th class="r">Prob.</th></tr></thead><tbody>`+
    a.map(o=>`<tr class="click" data-opp="${esc(o.id)}"><td><b>${esc(o.numero)}</b></td><td>${esc(mesAno(o.fechamento))}</td><td>${esc(o.gerente)}</td><td class="w"><b>${esc(o.cliente)}</b></td><td>${esc(fab(o))}</td><td class="w">${esc(o.titulo)}${(o.team||[]).length?`<div class="note">Team: ${esc(o.team.join(', '))}</div>`:''}</td><td class="w">${esc(o.area||'')}</td><td>${tagSt(o.status)} ${catTag(o)}${(n=>n?` <span class="selo s-venc" title="${esc(riscos(o).map(r=>r.l).join(' · '))}">${n} risco${n>1?'s':''}</span>`:'')(riscos(o).length)}</td><td class="r"><b>${esc(brl(o.valorTotal))}</b></td><td class="r">${esc(brl(vAno(o)))}</td><td class="r">${esc(o.probabilidade)}%</td></tr>`).join('')+'</tbody>';
}

/* ================= clientes ================= */
function cliStats(id){const o=S.opps.filter(x=>x.clienteId===id);
  return {fat:sum(S.fat.filter(r=>r.clienteId===id),r=>r.valor),pip:sum(o.filter(x=>OPEN.has(x.status)),x=>x.valorTotal),n:o.length};}
function renderClientes(){
  const g=$('#fGerC').value,q=$('#qCli').value.trim().toLowerCase();
  let a=S.clientes.filter(c=>!g||c.gerente===g||S.opps.some(o=>o.clienteId===c.id&&o.gerente===g));
  if(q)a=a.filter(c=>c.nome.toLowerCase().includes(q)||(c.siglasFaturamento||[]).join(' ').toLowerCase().includes(q));
  const rows=a.map(c=>({c,...cliStats(c.id)})).sort((x,y)=>y.fat-x.fat||y.pip-x.pip||x.c.nome.localeCompare(y.c.nome,'pt'));
  $('#cliCount').textContent=`${rows.length} clientes`;
  $('#tbCli').innerHTML=`<thead><tr><th>Cliente</th><th>Gerente da conta</th><th>Segmento</th><th class="r">Faturado 2026</th><th class="r">Pipeline aberto</th><th class="r">Oportunidades</th></tr></thead><tbody>`+
    rows.map(r=>`<tr class="click" data-cli="${esc(r.c.id)}"><td class="w"><b>${esc(r.c.nome)}</b></td><td>${esc(r.c.gerente)}</td><td>${esc(r.c.segmento)}</td><td class="r">${esc(M(r.fat))}</td><td class="r">${esc(M(r.pip))}</td><td class="r">${r.n}</td></tr>`).join('')+'</tbody>';
}

/* ================= faturamento ================= */
function fRows(){const f=S.f,q=f.q.toLowerCase();
  return selFat().filter(r=>(!f.per||(f.per.startsWith('Q')?quarter(r.mes+'-01')===+f.per[1]-1:r.mes===f.per))&&(!f.ger||r.gerente===f.ger)&&(!f.cli||r.cliente===f.cli)&&(!f.tec||r.tecnologia===f.tec)&&(!f.tip||r.tipo===f.tip)&&(!f.bu||r.bu===f.bu)&&(!f.ter||r.territorio===f.ter)&&(!f.st||r.status===f.st)
    &&(!q||[r.cliente,r.projeto,r.contrato,r.nf].join(' ').toLowerCase().includes(q)));}
function renderFat(){
  const base=selFat(), f=S.f;
  const per=[['','Ano completo'],['Q1','1º trimestre'],['Q2','2º trimestre'],['Q3','3º trimestre'],['Q4','4º trimestre'],...MES.map((m,i)=>[`2026-${String(i+1).padStart(2,'0')}`,MESL[i]])];
  $('#fper').innerHTML=per.map(([v,l])=>`<option value="${v}" ${v===f.per?'selected':''}>${esc(l)}</option>`).join('');
  const sel=(id,key,list,all)=>{$(id).innerHTML=opts(list,f[key],all);};
  sel('#fger','ger',uniq(base.map(r=>r.gerente)),'Todos');sel('#fcli','cli',uniq(base.map(r=>r.cliente)),'Todos');sel('#ftec','tec',uniq(base.map(r=>r.tecnologia)),'Todas');
  sel('#ftip','tip',uniq(base.map(r=>r.tipo)),'Todos');sel('#fbu','bu',uniq(base.map(r=>r.bu)),'Todas');sel('#fter','ter',uniq(base.map(r=>r.territorio)),'Todos');sel('#fst','st',uniq(base.map(r=>r.status)),'Todos');
  $('#fq').value=f.q;
  const R=fRows(), tot=sum(R,r=>r.valor), em=R.filter(r=>r.status==='Emitida'), nfs=new Set(em.map(r=>r.nf).filter(Boolean));
  const clis=uniq(R.map(r=>r.cliente)), projs=uniq(R.map(r=>r.projeto));
  $('#fKpis').innerHTML=[['Faturamento',M(tot),`${nf(R.length)} lançamentos no recorte`,'var(--c1)'],['Notas emitidas',M(sum(em,r=>r.valor)),`${nf(nfs.size)} notas emitidas`,'var(--c1)'],['Ticket médio',R.length?M(tot/R.length):'—','considera lançamentos com valor','var(--c2)'],['Clientes ativos',nf(clis.length),'clientes com faturamento','var(--purple)'],['Projetos',nf(projs.length),'projetos no recorte','var(--navy)']]
    .map(([l,v,s,c])=>`<div class="kpi lb" style="border-left-color:${c}"><span class="l">${l}</span><span class="v num">${esc(v)}</span><span class="s">${esc(s)}</span></div>`).join('');
  vbars($('#fMes'),MES.map((m,i)=>({l:m,v:sum(R.filter(r=>r.mes===`2026-${String(i+1).padStart(2,'0')}`),r=>r.valor)})),{label:'Faturamento mensal'});
  const grp=k=>{const m={};R.forEach(r=>{const x=r[k]||'Não informado';m[x]=(m[x]||0)+r.valor;});return Object.entries(m).sort((a,c)=>c[1]-a[1]).map(([l,v])=>({l,v}));};
  const gc=grp('cliente'),gt=grp('tecnologia'),gb=grp('bu');
  hbars($('#fCliBars'),gc.slice(0,8));donut($('#fTec'),gt);hbars($('#fBu'),gb.slice(0,8));
  const byM=MES.map((m,i)=>sum(R.filter(r=>r.mes===`2026-${String(i+1).padStart(2,'0')}`),r=>r.valor)); const pk=byM.indexOf(Math.max(...byM));
  const pkR=R.filter(r=>r.mes===`2026-${String(pk+1).padStart(2,'0')}`); const semSt=sum(pkR.filter(r=>r.status!=='Emitida'),r=>r.valor);
  $('#fRead').innerHTML=[[`Concentração por cliente`,gc[0]?`${gc[0].l} representa ${pct(gc[0].v,tot)} do faturamento selecionado.`:'Sem lançamentos.'],
    ['Principal tecnologia',gt[0]?`${gt[0].l} soma ${M(gt[0].v)} no recorte.`:'Sem lançamentos.'],
    [`Pico em ${MES[pk]}`,tot?`${M(byM[pk])} no mês. ${pct(byM[pk]-semSt,byM[pk])} do valor está como emitido${semSt?`, e ${M(semSt)} está sem status preenchido`:''}.`:'Sem lançamentos.']]
    .map(([t,p])=>`<div class="insight"><b>${esc(t)}</b><p>${esc(p)}</p></div>`).join('');
  const PG=15, pages=Math.max(1,Math.ceil(R.length/PG)); f.page=Math.min(f.page,pages-1);
  const D=[...R].sort((a,c)=>c.mes.localeCompare(a.mes)||c.valor-a.valor).slice(f.page*PG,f.page*PG+PG);
  $('#fDetInfo').textContent=`${nf(R.length)} registros · ${brl(tot)}`;
  $('#fDet').innerHTML=`<thead><tr><th>Mês</th><th>Gerente</th><th>Cliente</th><th>Projeto</th><th>Tipo</th><th>Tecnologia</th><th>Contrato</th><th>NF</th><th>Status</th><th class="r">Valor faturado</th></tr></thead><tbody>`+
    D.map(r=>`<tr><td>${esc(MES[+r.mes.slice(5)-1]+'/'+r.mes.slice(2,4))}</td><td>${esc(r.gerente)}</td><td><b>${esc(r.cliente)}</b></td><td class="w">${esc(r.projeto)}</td><td>${esc(r.tipo)}</td><td class="w">${esc(r.tecnologia)}</td><td>${esc(r.contrato||'Não informado')}</td><td>${esc(r.nf||'Não informado')}</td><td><span class="tag ${r.status==='Emitida'?'win':''}">${esc(r.status)}</span></td><td class="r"><b>${esc(brl(r.valor))}</b></td></tr>`).join('')+'</tbody>';
  $('#fPgInfo').textContent=R.length?`${f.page*PG+1}–${Math.min(R.length,(f.page+1)*PG)} de ${nf(R.length)} lançamentos`:'Nenhum lançamento';
  $('#fPrev').disabled=f.page<=0;$('#fNext').disabled=f.page>=pages-1;
}
[['#fq','q','input'],['#fper','per'],['#fger','ger'],['#fcli','cli'],['#ftec','tec'],['#ftip','tip'],['#fbu','bu'],['#fter','ter'],['#fst','st']].forEach(([id,k,ev])=>$(id).addEventListener(ev||'change',e=>{S.f[k]=e.target.value;S.f.page=0;renderFat();}));
$('#fLimpar').addEventListener('click',()=>{S.f={q:'',per:'',ger:'',cli:'',tec:'',tip:'',bu:'',ter:'',st:'',page:0};renderFat();});
$('#fPrev').addEventListener('click',()=>{S.f.page--;renderFat();});$('#fNext').addEventListener('click',()=>{S.f.page++;renderFat();});

/* ================= configurações ================= */
function renderConfig(){
  document.querySelectorAll('#cfgTabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.cfg===S.cfg)));
  ['etapas','gerentes','metas','listas','forecast','prevendas','acessos'].forEach(k=>{$('#cfg-'+k).hidden=k!==S.cfg;});
  const ro=!ADMIN; ['#btnNovaEtapa','#btnNovoGer','#m_save'].forEach(s=>$(s).disabled=ro);
  ({etapas:renderEtapas,gerentes:renderGerCad,metas:renderMetasCfg,listas:renderListas,forecast:renderParamCfg,prevendas:renderPrevendas,acessos:renderAcessos})[S.cfg]();
}
$('#cfgTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.cfg=b.dataset.cfg;renderConfig();});
const usoEtapa=k=>S.opps.filter(o=>o.status===k).length;
function renderEtapas(){
  const ro=!ADMIN;
  $('#tbEtapas').innerHTML=`<thead><tr><th>Ordem</th><th>Etapa</th><th>Tipo</th><th class="r">Probabilidade padrão</th><th class="r">Oportunidades</th><th>Situação</th><th></th></tr></thead><tbody>${
    STATUS.map((s,i)=>`<tr><td><button class="ico" data-mv="${i}:-1" ${ro||i===0?'disabled':''} aria-label="Subir">↑</button> <button class="ico" data-mv="${i}:1" ${ro||i===STATUS.length-1?'disabled':''} aria-label="Descer">↓</button></td>
      <td class="w"><b>${esc(s.k)}</b></td><td>${tagSt(s.k).replace(esc(s.k),TIPO_LBL[s.tipo]||s.tipo)}</td><td class="r">${esc(s.p)}%</td><td class="r">${nf(usoEtapa(s.k))}</td>
      <td>${s.ativa===false?'<span class="tag off">Inativa</span>':'Ativa'}</td><td><button class="ico" data-et="${i}">Editar</button></td></tr>`).join('')}</tbody>`;
}
async function salvarEtapas(lista){
  await api.salvarEtapas(lista.map(({k,p,tipo,ativa})=>({k,p,tipo,ativa:ativa!==false})),userId);
  await recarregar('etapas');
}
$('#tbEtapas').addEventListener('click',async e=>{
  const mv=e.target.closest('[data-mv]'),ed=e.target.closest('[data-et]');
  if(mv&&ADMIN){const [i,d]=mv.dataset.mv.split(':').map(Number);const l=[...STATUS];[l[i],l[i+d]]=[l[i+d],l[i]];
    aplicarEtapas(l);renderEtapas();try{await salvarEtapas(l);}catch(err){toast('Não foi possível salvar a ordem.');}}
  if(ed)etapaForm(+ed.dataset.et);
});
$('#btnNovaEtapa').addEventListener('click',()=>etapaForm(-1));
function etapaForm(i){
  const isNew=i<0,e=isNew?{k:'',p:50,tipo:'aberta',ativa:true}:STATUS[i],uso=isNew?0:usoEtapa(e.k);
  openDrawer(`<div class="card-head" style="margin:0"><h2 style="font-size:22px">${isNew?'Nova etapa':'Editar etapa'}</h2><button class="ghost" data-close>Fechar</button></div>
    <form class="form" id="etF">
      <label class="full">Nome da etapa<input id="e_k" required value="${esc(e.k)}" ${uso?'readonly':''}></label>
      ${uso?`<div class="full note">${nf(uso)} oportunidade${uso>1?'s estão':' está'} nesta etapa, então o nome não pode mudar. Para tirá-la de uso, marque como inativa.</div>`:''}
      <label>Tipo<select id="e_tipo">${Object.entries(TIPO_LBL).map(([v,l])=>`<option value="${v}" ${v===e.tipo?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Probabilidade padrão (%)<input id="e_p" type="number" min="0" max="100" step="5" value="${esc(e.p)}"></label>
      <label class="full" style="display:flex;gap:8px;align-items:center;flex-direction:row"><input type="checkbox" id="e_ativa" ${e.ativa!==false?'checked':''} style="width:auto"> Ativa (aparece no formulário de oportunidade)</label>
      <div class="full err" id="e_err"></div>
      <div class="full actions">${!isNew&&!uso?'<button type="button" class="ghost" id="e_del">Excluir etapa</button>':''}<span style="flex:1"></span><button type="button" class="ghost" data-close>Cancelar</button><button class="blue" ${ADMIN?'':'disabled'}>${isNew?'Cadastrar':'Salvar'}</button></div>
    </form>`,()=>{
      $('#e_del')?.addEventListener('click',async()=>{const l=STATUS.filter((_,j)=>j!==i);
        if(!l.some(s=>s.tipo==='ganha')){$('#e_err').textContent='O funil precisa de uma etapa do tipo Ganha.';return;}
        try{await salvarEtapas(l);closeDrawer();toast('Etapa excluída');}catch(err){writeErr(err,'#e_err');}});
      $('#etF').addEventListener('submit',async ev=>{ev.preventDefault();if(!ADMIN)return;
        const k=$('#e_k').value.trim(),tipo=$('#e_tipo').value,p=Math.max(0,Math.min(100,+$('#e_p').value||0)),ativa=$('#e_ativa').checked;
        if(STATUS.some((s,j)=>j!==i&&s.k.toLowerCase()===k.toLowerCase())){$('#e_err').textContent='Já existe uma etapa com esse nome.';return;}
        if(tipo==='ganha'&&STATUS.some((s,j)=>j!==i&&s.tipo==='ganha')){$('#e_err').textContent='Só pode haver uma etapa do tipo Ganha. Mude a atual antes.';return;}
        const l=[...STATUS];const novo={k,p,tipo,ativa};
        if(isNew){const pos=tipo==='aberta'?l.filter(s=>s.tipo==='aberta').length:l.length;l.splice(pos,0,novo);}else l[i]=novo;
        if(!l.some(s=>s.tipo==='ganha')){$('#e_err').textContent='O funil precisa de uma etapa do tipo Ganha.';return;}
        try{await salvarEtapas(l);closeDrawer();toast(isNew?'Etapa cadastrada':'Etapa salva');}catch(err){writeErr(err,'#e_err');}});});
}
function gerInfo(nome){return S.gerCad.find(g=>g.nome===nome)||{nome,ativo:true,_novo:true};}
function renderGerCad(){
  const lista=gerentesTodos().map(gerInfo).sort((a,b)=>(a.ativo===false)-(b.ativo===false)||a.nome.localeCompare(b.nome,'pt'));
  const realY=g=>sum(S.fat.filter(r=>r.gerente===g&&r.mes.startsWith(S.ano)),r=>r.valor);
  $('#tbGer').innerHTML=`<thead><tr><th>Gerente</th><th>E-mail</th><th>Área</th><th>Território</th><th>Diretor</th><th class="r">Meta</th><th class="r">Realizado ${esc(S.ano)}</th><th class="r">Opps abertas</th><th>Situação</th><th></th></tr></thead><tbody>${
    lista.map(g=>`<tr><td class="w"><b>${esc(g.nome)}</b>${g._novo?' <span class="note">· ainda sem cadastro</span>':''}</td><td>${esc(g.email||'—')}</td><td>${esc(g.area||'—')}</td><td>${esc(g.territorio||'—')}</td><td>${esc(g.diretor||'—')}</td>
      <td class="r">${S.metas[g.nome]?esc(M(S.metas[g.nome])):'—'}</td><td class="r">${esc(M(realY(g.nome)))}</td><td class="r">${nf(S.opps.filter(o=>o.gerente===g.nome&&OPEN.has(o.status)).length)}</td>
      <td>${g.ativo===false?'<span class="tag off">Inativo</span>':'Ativo'}</td><td><button class="ico" data-ger="${esc(g.nome)}">Editar</button></td></tr>`).join('')}</tbody>`;
}
$('#tbGer').addEventListener('click',e=>{const b=e.target.closest('[data-ger]');if(b)gerCadForm(gerInfo(b.dataset.ger));});
$('#btnNovoGer').addEventListener('click',()=>gerCadForm(null));
function gerCadForm(g){
  const isNew=!g; g=g||{nome:'',ativo:true,_novo:true};
  const terrs=opcoes('territorio',g.territorio);
  const areas=opcoes('area_gerente',g.area);
  openDrawer(`<div class="card-head" style="margin:0"><h2 style="font-size:22px">${isNew?'Novo gerente de negócios':esc(g.nome)}</h2><button class="ghost" data-close>Fechar</button></div>
    <form class="form" id="gF">
      <label class="full">Nome (igual ao usado nas oportunidades)<input id="g_nome" required value="${esc(g.nome)}" ${isNew?'':'readonly'}></label>
      <label class="full">E-mail<input id="g_email" type="email" value="${esc(g.email||'')}" placeholder="nome@almaviva…"></label>
      <label>Área<select id="g_area">${opts(areas,g.area||'','')}</select></label>
      <label>Território<select id="g_terr">${opts(terrs,g.territorio||'','')}</select></label>
      <label class="full">Diretor comercial<select id="g_dir">${opts(opcoes('diretor',g.diretor),g.diretor||'','')}</select><span class="note">Os nomes dos diretores ficam em Configurações > Listas de opções > Diretor comercial.</span></label>
      <label>Meta ${esc(S.ano)} (R$)<input id="g_meta" type="number" min="0" step="100000" value="${esc(S.metas[g.nome]||0)}"></label>
      <label style="display:flex;gap:8px;align-items:center;flex-direction:row;align-self:end"><input type="checkbox" id="g_ativo" ${g.ativo!==false?'checked':''} style="width:auto"> Ativo</label>
      <div class="full note">A meta vale para o período cadastrado na aba Metas (${esc(fmtD(S.metasDoc.inicio)||'—')} a ${esc(fmtD(S.metasDoc.fim)||'—')}).</div>
      <div class="full err" id="g_err"></div>
      <div class="full actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="blue" ${ADMIN?'':'disabled'}>${isNew?'Cadastrar':'Salvar'}</button></div>
    </form>`,()=>{
      $('#gF').addEventListener('submit',async ev=>{ev.preventDefault();if(!ADMIN)return;
        const nome=$('#g_nome').value.trim(); if(!nome)return;
        if(isNew&&gerentesTodos().some(x=>x.toLowerCase()===nome.toLowerCase())&&S.gerCad.some(x=>x.nome.toLowerCase()===nome.toLowerCase())){$('#g_err').textContent='Esse gerente já está cadastrado.';return;}
        const data={nome,email:$('#g_email').value.trim(),area:$('#g_area').value.trim(),territorio:$('#g_terr').value.trim(),diretor:$('#g_dir').value||'',ativo:$('#g_ativo').checked};
        const meta=Math.max(0,+$('#g_meta').value||0); const valores={...S.metas};
        if(meta)valores[nome]=meta;else delete valores[nome];
        try{await api.salvarGerente(data,userId);
          if((S.metas[nome]||0)!==meta)await api.salvarMetas(+S.ano,S.metasDoc.inicio||null,S.metasDoc.fim||null,valores);
          await recarregar('gerentes');await recarregar('metas');
          closeDrawer();toast(isNew?'Gerente cadastrado':'Gerente salvo');}catch(err){writeErr(err,'#g_err');}});});
}
function renderMetasCfg(force){
  if(S.metaDirty&&!force)return; S.metaDirty=false;
  const d=S.metasDoc||{}; $('#m_ini').value=d.inicio||''; $('#m_fim').value=d.fim||'';
  $('#metaFonte').textContent=`Metas de ${S.ano} (troque o ano no painel para editar outro). Gerentes inativos não aparecem aqui.${ADMIN?'':' Só administradores podem alterar.'}`;
  const gs=uniq([...gerentes(),...Object.keys(S.metas)]).filter(g=>!inativos().has(g));
  const ro=!ADMIN;
  $('#tbMetas').innerHTML=`<thead><tr><th>Gerente</th><th>Área</th><th>Território</th><th class="r">Meta (R$)</th></tr></thead><tbody>${
    gs.map(g=>{const i=gerInfo(g);return `<tr><td class="w"><b>${esc(g)}</b></td><td>${esc(i.area||'—')}</td><td>${esc(i.territorio||'—')}</td><td class="r"><input class="mini" type="number" min="0" step="100000" data-meta="${esc(g)}" value="${esc(S.metas[g]||'')}" placeholder="0" ${ro?'disabled':''}></td></tr>`;}).join('')}</tbody>`;
  metaTot();
}
function metaTot(){$('#m_tot').textContent=brl(sum([...document.querySelectorAll('[data-meta]')],i=>+i.value||0));}
$('#metaF').addEventListener('input',()=>{S.metaDirty=true;metaTot();});
$('#m_reset').addEventListener('click',()=>renderMetasCfg(true));
$('#metaF').addEventListener('submit',async ev=>{ev.preventDefault();if(!ADMIN)return;
  const ini=$('#m_ini').value,fim=$('#m_fim').value;
  if(ini&&fim&&fim<ini){$('#m_err').textContent='O fim do período precisa ser depois do início.';return;}
  const valores={};document.querySelectorAll('[data-meta]').forEach(i=>{const v=+i.value||0;if(v)valores[i.dataset.meta]=v;});
  Object.entries(S.metas).forEach(([g,v])=>{if(inativos().has(g))valores[g]=v;});
  try{await api.salvarMetas(+S.ano,ini||null,fim||null,valores);S.metaDirty=false;await recarregar('metas');$('#m_err').textContent='';toast('Metas salvas');}
  catch(err){writeErr(err,'#m_err');}});


/* ---- listas de opções ---- */
function usoOpcao(def,v){
  if(def.campo)return S.opps.filter(o=>def.campo(o).includes(v)).length;
  if(def.cli)return S.clientes.filter(c=>def.cli(c).includes(v)).length;
  if(def.ger)return S.gerCad.filter(g=>def.ger(g).includes(v)).length;
  return 0;}
function renderListas(){
  const ro=!ADMIN;
  $('#listasGrid').innerHTML=LISTAS_DEF.map(def=>{const it=listaItens(def.id);
    return `<div class="card lista" data-lista="${def.id}"><div class="card-head" style="margin:0"><div><h3>${esc(def.nome)}</h3><div class="sub">${esc(def.onde)} · ${it.filter(i=>i.ativo!==false).length} ativas</div></div></div>
      <table><tbody>${it.map((i,n)=>{const u=usoOpcao(def,i.v);return `<tr><td class="w">${S.listaEd&&S.listaEd.id===def.id&&S.listaEd.n===n?`<form class="lista-ren" data-ren="${def.id}" data-n="${n}"><input value="${esc(i.v)}" required aria-label="Novo nome"><button class="blue">Salvar</button><button type="button" class="ghost" data-op="cancel">Cancelar</button></form>`:(i.ativo===false?`<span class="tag off">${esc(i.v)}</span>`:esc(i.v))}${def.det?`<div class="note">Pede também: <select data-det="${n}" ${ro?'disabled':''}>${Object.entries(DET_ORIGEM).map(([k,l])=>`<option value="${k}" ${(i.det||'')===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`:''}</td><td class="r note">${u?nf(u)+' em uso':''}</td>
        <td class="r" style="white-space:nowrap"><button class="ico" data-op="up" data-n="${n}" ${ro||n===0?'disabled':''} aria-label="Subir">↑</button><button class="ico" data-op="down" data-n="${n}" ${ro||n===it.length-1?'disabled':''} aria-label="Descer">↓</button>
        <button class="ico" data-op="ren" data-n="${n}" ${ro?'disabled':''}>Editar</button><button class="ico" data-op="tog" data-n="${n}" ${ro?'disabled':''}>${i.ativo===false?'Ativar':'Desativar'}</button>${u?'':`<button class="ico" data-op="del" data-n="${n}" ${ro?'disabled':''} aria-label="Excluir">✕</button>`}</td></tr>`;}).join('')}</tbody></table>
      <form class="lista-add" data-add="${def.id}"><input placeholder="Nova opção" ${ro?'disabled':''} required><button class="blue" ${ro?'disabled':''}>Adicionar</button></form></div>`;}).join('');
}
async function gravarLista(id,itens){
  S.listas={...(S.listas||{}),[id]:itens}; renderListas();
  try{await salvarLista(id,itens);}catch(err){toast('Não foi possível salvar a lista.');}
}
$('#listasGrid').addEventListener('click',e=>{const b=e.target.closest('[data-op]');if(!b||!ADMIN)return;
  const id=b.closest('[data-lista]').dataset.lista,n=+b.dataset.n,it=listaItens(id).map(i=>({...i}));
  if(b.dataset.op==='ren'){S.listaEd={id,n};renderListas();const i=document.querySelector('#listasGrid [data-ren] input');if(i){i.focus();i.select();}return;}
  if(b.dataset.op==='cancel'){S.listaEd=null;renderListas();return;}
  if(b.dataset.op==='up')[it[n-1],it[n]]=[it[n],it[n-1]];
  else if(b.dataset.op==='down')[it[n+1],it[n]]=[it[n],it[n+1]];
  else if(b.dataset.op==='tog')it[n].ativo=it[n].ativo===false;
  else if(b.dataset.op==='del')it.splice(n,1);
  gravarLista(id,it);});
$('#listasGrid').addEventListener('change',e=>{const sl=e.target.closest('[data-det]');if(!sl||!podeCfg())return;
  const id=sl.closest('[data-lista]').dataset.lista,n=+sl.dataset.det,it=listaItens(id).map(i=>({...i}));if(sl.value)it[n].det=sl.value;else delete it[n].det;gravarLista(id,it);});
$('#listasGrid').addEventListener('submit',e=>{e.preventDefault();if(!ADMIN)return;const fr=e.target.closest('[data-ren]');if(fr){renomearItem(fr.dataset.ren,+fr.dataset.n,fr.querySelector('input').value.trim());return;}const f=e.target.closest('[data-add]');const inp=f.querySelector('input');const v=inp.value.trim();if(!v)return;
  const id=f.dataset.add,it=listaItens(id).map(i=>({...i}));
  if(it.some(i=>i.v.toLowerCase()===v.toLowerCase())){toast('Essa opção já existe na lista.');return;}
  it.push({v,ativo:true});gravarLista(id,it);});
// Renomear uma opção: nas listas da oportunidade (fabricante, tipo de revenda, origem) as oportunidades que usavam o nome antigo passam para o novo.
const temValor=(o,campo,v)=>Array.isArray(o[campo])?o[campo].includes(v):o[campo]===v;
async function renomearItem(id,n,v){const def=LISTAS_DEF.find(d=>d.id===id),it=listaItens(id).map(i=>({...i})),de=it[n]&&it[n].v;if(!v||!de)return;
  if(v===de){S.listaEd=null;renderListas();return;}
  if(it.some((i,k)=>k!==n&&i.v.toLowerCase()===v.toLowerCase())){toast('Essa opção já existe na lista.');return;}
  const q=def.ren?S.opps.filter(o=>temValor(o,def.ren,de)).length:0,uso=usoOpcao(def,de);it[n].v=v;S.listaEd=null;await gravarLista(id,it);
  if(q){try{await renomearEmOpps(def.ren,de,v);toast(`Opção renomeada. ${nf(q)} oportunidade${q===1?'':'s'} atualizada${q===1?'':'s'}.`);}catch(err){toast('A lista foi salva, mas não foi possível atualizar as oportunidades.');}}
  else if(uso&&!def.ren)toast('Opção renomeada. Os registros que já usavam o nome antigo continuam com ele.');}
const podeCfg=()=>ADMIN;
async function renomearEmOpps(campo,de,para){await api.renomearOpcaoOpps(campo,de,para);await recarregar();}
async function salvarLista(id,itens){await api.salvarLista(id,itens);}

/* ---- usuários e acessos ---- */
const usoPapel=k=>S.usuarios.filter(u=>u.papel===k).length;
function renderAcessos(){
  const P=papeisAtuais(),ks=Object.keys(P),ro=!ADMIN;
  const grupos=[...new Set(PERMS.map(x=>x.g))];
  $('#tbPapeis').innerHTML=`<thead><tr><th>Permissão</th>${ks.map(k=>`<th class="c">${esc(P[k].nome)}${['admin','diretor','gerente'].includes(k)||usoPapel(k)?'':` <button class="ico" data-delpapel="${esc(k)}" aria-label="Excluir tipo" ${ro?'disabled':''}>✕</button>`}<div class="note">${nf(usoPapel(k))} usuário${usoPapel(k)===1?'':'s'}</div></th>`).join('')}</tr></thead><tbody>
    <tr><td class="w"><b>Carteira que enxerga</b><div class="note">Quais gerentes aparecem no painel e nas listas</div></td>${ks.map(k=>`<td class="c"><select data-esc="${esc(k)}" ${ro?'disabled':''}>${Object.entries(ESCOPOS).map(([v,l])=>`<option value="${v}" ${P[k].escopo===v?'selected':''}>${l}</option>`).join('')}</select></td>`).join('')}</tr>
    ${grupos.map(g=>`<tr class="grp"><td colspan="${ks.length+1}">${esc(g)}</td></tr>`+PERMS.filter(x=>x.g===g).map(x=>`<tr><td class="w">${esc(x.l)}</td>${ks.map(k=>{const trava=k==='admin'&&x.k==='configurar';
      return `<td class="c"><input type="checkbox" data-perm="${esc(k)}|${x.k}" ${P[k].permissoes[x.k]?'checked':''} ${ro||trava?'disabled':''} ${trava?'title="O administrador sempre acessa as Configurações"':''}></td>`;}).join('')}</tr>`).join('')).join('')}</tbody>`;
  const usuarios=[...S.usuarios].sort((a,b)=>(a.ativo===false)-(b.ativo===false)||String(a.nome).localeCompare(String(b.nome),'pt'));
  $('#tbUsuarios').innerHTML=`<thead><tr><th>Usuário</th><th>E-mail</th><th>Tipo</th><th>Gerente vinculado</th><th>Áreas</th><th>Carteira</th><th class="r">Exceções</th><th>Situação</th><th></th></tr></thead><tbody>${
    usuarios.map(u=>{const a=calcAcesso(u),ex=Object.keys(u.permissoes||{}).length+(u.escopo?1:0);
      return `<tr><td class="w"><b>${esc(u.nome)}</b></td><td>${esc(u.email||'—')}</td><td>${esc((P[u.papel]||{}).nome||u.papel)}</td><td>${esc(u.gerente||'—')}</td><td>${esc((u.areas||[]).join(', ')||'—')}</td>
      <td>${esc(ESCOPOS[a.escopo])}</td><td class="r">${ex?nf(ex):'—'}</td><td>${u.ativo===false?'<span class="tag off">Inativo</span>':u.pendente?'<span class="tag">Aguardando 1º acesso</span>':'Ativo'}</td>
      <td><button class="ico" data-usr="${esc(u.id)}">Editar</button></td></tr>`;}).join('')||`<tr><td colspan="9" class="note">Nenhum usuário cadastrado ainda. Use "Novo usuário".</td></tr>`}</tbody>`;
  ['#btnNovoTipo','#btnNovoUsr'].forEach(s=>$(s).disabled=ro);
}
async function gravarPapeis(P){S.papeis=P;renderAcessos();try{await salvarPapeis(P);}catch(err){toast('Não foi possível salvar os tipos de usuário.');}}
$('#tbPapeis').addEventListener('change',e=>{if(!ADMIN)return;const P=JSON.parse(JSON.stringify(papeisAtuais()));
  const c=e.target.closest('[data-perm]'),s=e.target.closest('[data-esc]');
  if(c){const [k,perm]=c.dataset.perm.split('|');P[k].permissoes[perm]=c.checked;if(k==='admin')P.admin.permissoes.configurar=true;}
  if(s)P[s.dataset.esc].escopo=s.value;
  gravarPapeis(P);});
$('#tbPapeis').addEventListener('click',e=>{const b=e.target.closest('[data-delpapel]');if(!b||!ADMIN)return;const P=JSON.parse(JSON.stringify(papeisAtuais()));delete P[b.dataset.delpapel];gravarPapeis(P);});
$('#btnNovoTipo').addEventListener('click',()=>{if(!ADMIN)return;
  openDrawer(`<div class="card-head" style="margin:0"><h2 style="font-size:22px">Novo tipo de usuário</h2><button class="ghost" data-close>Fechar</button></div>
    <form class="form" id="tpF"><label class="full">Nome<input id="t_nome" required placeholder="Ex.: Pré-vendas, Financeiro"></label>
    <label class="full">Começar com as permissões de<select id="t_base">${Object.entries(papeisAtuais()).map(([k,t])=>`<option value="${esc(k)}" ${k==='gerente'?'selected':''}>${esc(t.nome)}</option>`).join('')}</select></label>
    <div class="full err" id="t_err"></div><div class="full actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="blue">Criar</button></div></form>`,()=>{
    $('#tpF').addEventListener('submit',ev=>{ev.preventDefault();const nome=$('#t_nome').value.trim(),k=slug(nome).replace(/-/g,'_');const P=JSON.parse(JSON.stringify(papeisAtuais()));
      if(!k||P[k]){$('#t_err').textContent='Já existe um tipo com esse nome.';return;}
      const b=P[$('#t_base').value];P[k]={nome,escopo:b.escopo,permissoes:{...b.permissoes,configurar:false}};closeDrawer();gravarPapeis(P);toast('Tipo criado');});});});
$('#tbUsuarios').addEventListener('click',e=>{const b=e.target.closest('[data-usr]');if(b)usuarioForm(S.usuarios.find(u=>u.id===b.dataset.usr));});
$('#btnNovoUsr').addEventListener('click',()=>usuarioForm(null));
function usuarioForm(u){
  const isNew=!u; u=u||{nome:'',email:'',papel:'gerente',gerente:'',areas:[],permissoes:{},ativo:true};
  const P=papeisAtuais(),areas=opcoes('area_gerente'),gs=gerentesTodosSemFiltro();
  const tri=(k)=>{const o=(u.permissoes||{})[k];return `<select data-tri="${k}"><option value="" ${o!==true&&o!==false?'selected':''}>Igual ao tipo</option><option value="1" ${o===true?'selected':''}>Permitir</option><option value="0" ${o===false?'selected':''}>Bloquear</option></select>`;};
  openDrawer(`<div class="card-head" style="margin:0"><h2 style="font-size:22px">${isNew?'Novo usuário':esc(u.nome)}</h2><button class="ghost" data-close>Fechar</button></div>
    <form class="form" id="uF">
      <label class="full">Nome<input id="u_nome" required value="${esc(u.nome)}"></label>
      <label class="full">E-mail de acesso<input id="u_email" type="email" required value="${esc(u.email||'')}" ${!isNew&&u.user_id?'readonly':''}></label>
      <label>Tipo de usuário<select id="u_papel">${Object.entries(P).map(([k,t])=>`<option value="${esc(k)}" ${u.papel===k?'selected':''}>${esc(t.nome)}</option>`).join('')}</select></label>
      <label>Gerente vinculado<select id="u_ger"><option value=""></option>${opts(gs,u.gerente||'')}</select></label>
      <div class="full"><span class="note">Áreas (usadas quando a carteira é "Gerentes das suas áreas")</span><div class="chips">${areas.map(a=>`<label class="chip"><input type="checkbox" data-uarea value="${esc(a)}" ${(u.areas||[]).includes(a)?'checked':''}> ${esc(a)}</label>`).join('')}</div></div>
      <label class="full">Carteira que enxerga<select id="u_esc"><option value="">Igual ao tipo</option>${Object.entries(ESCOPOS).map(([v,l])=>`<option value="${v}" ${u.escopo===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <div class="full"><h3 style="margin:6px 0">Exceções para este usuário</h3><div class="note" id="u_tipoTxt"></div>
        <table class="perm-tab"><tbody>${PERMS.map(x=>`<tr><td class="w">${esc(x.l)}</td><td class="note" data-padrao="${x.k}"></td><td>${tri(x.k)}</td></tr>`).join('')}</tbody></table></div>
      <label class="full" style="display:flex;gap:8px;align-items:center;flex-direction:row"><input type="checkbox" id="u_ativo" ${u.ativo!==false?'checked':''} style="width:auto"> Ativo (desmarque para bloquear o acesso)</label>
      ${isNew||u.pendente?'<div class="full note">A pessoa entra no app com este e-mail, pelo link de acesso enviado por e-mail. O acesso é liberado no primeiro login.</div>':''}
      <div class="full err" id="u_err"></div>
      <div class="full actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="blue" ${ADMIN?'':'disabled'}>${isNew?'Cadastrar':'Salvar'}</button></div>
    </form>`,()=>{
      const pad=()=>{const t=P[$('#u_papel').value]||{permissoes:{}};document.querySelectorAll('[data-padrao]').forEach(td=>{td.textContent=t.permissoes[td.dataset.padrao]?'tipo: permite':'tipo: bloqueia';});
        $('#u_tipoTxt').textContent=`Sem exceção, o usuário segue o tipo "${t.nome}" (carteira: ${ESCOPOS[t.escopo]}).`;};
      $('#u_papel').addEventListener('change',pad);pad();
      $('#uF').addEventListener('submit',async ev=>{ev.preventDefault();if(!ADMIN)return;
        const email=$('#u_email').value.trim().toLowerCase();
        if(isNew&&S.usuarios.some(x=>(x.email||'').toLowerCase()===email)){$('#u_err').textContent='Já existe um usuário com esse e-mail.';return;}
        const permissoes={};document.querySelectorAll('[data-tri]').forEach(s=>{if(s.value!=='')permissoes[s.dataset.tri]=s.value==='1';});
        const papel=$('#u_papel').value,gerente=$('#u_ger').value||null,escopo=$('#u_esc').value||null;
        const t=P[papel]||{};
        if((escopo||t.escopo)==='proprio'&&!gerente){$('#u_err').textContent='Este usuário vê só a própria carteira: escolha o gerente vinculado.';return;}
        if(u.id&&u.id===usuarioAtual().id&&papel!=='admin'&&permissoes.configurar!==true&&!(t.permissoes||{}).configurar){$('#u_err').textContent='Você tiraria o seu próprio acesso às Configurações.';return;}
        const data={...u,nome:$('#u_nome').value.trim(),email,papel,gerente,escopo,areas:[...document.querySelectorAll('[data-uarea]:checked')].map(i=>i.value),permissoes,ativo:$('#u_ativo').checked};
        try{await salvarUsuario(data);closeDrawer();toast(isNew?'Usuário cadastrado':'Usuário salvo');}catch(err){writeErr(err,'#u_err');}});});
}
async function salvarPapeis(P){await api.salvarPapeis(P);await recarregar('papeis');}
async function salvarUsuario(u){await api.salvarUsuario(u);await recarregar('usuarios');}

/* ================= forecast: categoria, cobertura, riscos e fotos semanais ================= */
const QL=['1º tri','2º tri','3º tri','4º tri'];
const QC=['Q1','Q2','Q3','Q4'];
const diretorDe=g=>(S.gerCad.find(x=>x.nome===g)||{}).diretor||'Sem diretor';
const DIMS={ger:{t:'gerente',T:'Gerente',f:o=>o.gerente,fg:g=>g},dir:{t:'diretor',T:'Diretor',f:o=>diretorDe(o.gerente),fg:g=>diretorDe(g)},area:{t:'área',T:'Área',f:o=>areaDe(o.gerente),fg:g=>areaDe(g)},
  fab:{t:'fabricante',T:'Fabricante',f:o=>fab(o),fo:o=>fab(o),fr:r=>fabFat(r.tecnologia),fg:null},
  orig:{t:'origem',T:'Origem',f:o=>o.origemOpp||'Não informada',fo:o=>o.origemOpp||'Não informada',fg:null,ganhas:true}};
// fabricante no faturamento: a coluna TECNOLOGIA, casada com a lista de fabricantes sem diferença de maiúsculas e espaços
const normFab=s=>String(s||'').normalize('NFKD').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
function fabFat(t){if(!String(t||'').trim())return 'Não informado';const n=normFab(t),c=[...opcoes('fabricante'),...S.opps.map(o=>o.software).filter(Boolean)].find(x=>normFab(x)===n);return c||String(t).trim();}
const fcAno=()=>S.opps.filter(o=>inSel(o.gerente)&&OPEN.has(o.status)&&(o.fechamento||'').startsWith(S.ano));
const medida=(a,m)=>m==='n'?a.length:m==='p'?sum(a,o=>vAno(o)*(Number(o.probabilidade)||0)/100):sum(a,vAno);
const fmtMed=(v,m)=>m==='n'?nf(v):M(v);
// Categoria de forecast: o gerente escolhe Commit, Best case ou Pipeline. Sem escolha, vale a sugestão pela probabilidade.
const CATS=['Commit','Best case','Pipeline'];
const SERIES=['Realizado','Commit','Best case','Pipeline'];
const PARAM_PADRAO={coberturaAlvo:3,commitProb:90,bestProb:70,diasSemAtualizacao:30,adiamentosMax:2,diasEtapa:60,fatorMedia:1.5,valorAlto:1000000};
const PARAM_DEF=[
  {k:'coberturaAlvo',l:'Cobertura alvo (x)',s:'Pipeline aberto ÷ o que falta da meta. Verde a partir deste valor, amarelo a partir de 2/3 dele.',step:0.1},
  {k:'commitProb',l:'Sugerir Commit a partir de (%)',s:'Probabilidade a partir da qual a categoria sugerida é Commit.',step:5},
  {k:'bestProb',l:'Sugerir Best case a partir de (%)',s:'Abaixo disso, a sugestão é Pipeline.',step:5},
  {k:'diasSemAtualizacao',l:'Sem atualização (dias)',s:'Selo "Sem atualização" quando a oportunidade não é alterada há esse tempo.',step:1},
  {k:'adiamentosMax',l:'Adiada (vezes)',s:'Selo "Adiada" quando a data de fechamento foi empurrada esse número de vezes.',step:1},
  {k:'diasEtapa',l:'Parada na etapa (dias, mínimo)',s:'Selo quando passa deste tempo na mesma etapa e também acima da média da etapa.',step:1},
  {k:'fatorMedia',l:'Acima da média da etapa (fator)',s:'1,5 = 50% acima do tempo médio das oportunidades na mesma etapa.',step:0.1},
  {k:'valorAlto',l:'Valor alto (R$ no ano)',s:'Selo "Sem próximo passo" para oportunidades deste valor sem próximo passo nem ação aberta.',step:100000}];
const param=()=>({...PARAM_PADRAO,...(S.param||{})});
const catSugerida=o=>{const p=param(),pr=Number(o.probabilidade)||0;return pr>=p.commitProb?'Commit':pr>=p.bestProb?'Best case':'Pipeline';};
const catDe=o=>o.status===WON?'Fechado':!OPEN.has(o.status)?null:(CATS.includes(o.categoria)?o.categoria:catSugerida(o));
const catTag=o=>{const c=catDe(o);if(!c)return '';const sug=c!=='Fechado'&&!CATS.includes(o.categoria);
  return `<span class="cat k-${slug(c)}" title="${sug?'Sugerida pela probabilidade. O gerente ainda não definiu.':'Definida pelo gerente'}">${esc(c)}${sug?' <i>sug.</i>':''}</span>`;};
const dia=s=>String(s||'').slice(0,10);
const diasEntre=(a,b)=>Math.round((new Date(b)-new Date(a))/864e5);
const maxD=(...a)=>a.filter(Boolean).sort().pop()||TODAY_ISO;
// início do uso do CRM: a primeira foto. Para a carga inicial, os relógios de risco contam a partir dela.
const inicioCRM=()=>S.fotos.length?S.fotos.map(f=>f.data).sort()[0]:TODAY_ISO;
const ultimaAtualizacao=o=>maxD(dia(o.atualizadoEm)||dia(o.cadastro),inicioCRM());
const naEtapaDesde=o=>maxD(dia(o.etapaDesde)||dia(o.cadastro),inicioCRM());
let _mE={k:null,n:-1,v:{}};
function mediaEtapa(st){if(_mE.k!==S.opps||_mE.n!==S.fotos.length){const g={};
    S.opps.filter(o=>OPEN.has(o.status)).forEach(o=>{(g[o.status]=g[o.status]||[]).push(diasEntre(naEtapaDesde(o),TODAY_ISO));});
    _mE={k:S.opps,n:S.fotos.length,v:Object.fromEntries(Object.entries(g).map(([s,a])=>[s,a.reduce((x,y)=>x+y,0)/a.length]))};}
  return _mE.v[st]||0;}
function riscos(o){
  if(!OPEN.has(o.status))return [];const p=param(),r=[];
  if(o.fechamento&&o.fechamento<TODAY_ISO)r.push({k:'venc',l:'Data vencida',t:`O fechamento previsto (${fmtD(o.fechamento)}) já passou`});
  const ad=Number(o.adiamentos)||0;if(ad>=p.adiamentosMax)r.push({k:'adiada',l:`Adiada ${ad}x`,t:`A data de fechamento foi empurrada ${ad} vezes`});
  const ua=ultimaAtualizacao(o),su=diasEntre(ua,TODAY_ISO);if(su>=p.diasSemAtualizacao)r.push({k:'parada',l:`Sem atualização há ${su} dias`,t:`Última alteração em ${fmtD(ua)}`});
  const de=diasEntre(naEtapaDesde(o),TODAY_ISO),me=mediaEtapa(o.status);
  if(de>=p.diasEtapa&&de>me*p.fatorMedia)r.push({k:'etapa',l:`${de} dias na etapa`,t:`Em ${o.status} há ${de} dias. A média da etapa é ${Math.round(me)} dias.`});
  if(vAno(o)>=p.valorAlto&&!String(o.proximoPasso||'').trim()&&!acoesOpp(o.numero).some(a=>a.status!=='concluida'))r.push({k:'passo',l:'Sem próximo passo',t:`${M(vAno(o))} no ano sem próximo passo nem ação aberta`});
  return r;}
const selos=o=>riscos(o).map(x=>`<span class="selo s-${x.k}" title="${esc(x.t)}">${esc(x.l)}</span>`).join('');
// ---- fotos semanais do pipeline ----
const semanaISO=d=>{const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const dn=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-dn);
  const y=t.getUTCFullYear();return y+'-W'+String(Math.ceil(((t-Date.UTC(y,0,1))/864e5+1)/7)).padStart(2,'0');};
const SEMANA=semanaISO(TODAY);
const fotoItem=o=>[o.numero,o.gerente,o.status,catDe(o),vAno(o),o.fechamento||null,Number(o.probabilidade)||0];
const BASES={semana:{l:'a foto da semana passada',d:6},'4sem':{l:'a foto de 4 semanas atrás',d:27},inicio:{l:'a primeira foto',d:1}};
function fotoBase(modo){const f=S.fotos.filter(x=>x.itens).sort((a,b)=>a.data.localeCompare(b.data));
  if(modo==='inicio')return f.length&&diasEntre(f[0].data,TODAY_ISO)>=1?f[0]:null;
  const c=f.filter(x=>diasEntre(x.data,TODAY_ISO)>=BASES[modo].d);return c.length?c[c.length-1]:null;}
const inPer=(d,P)=>!!d&&d.startsWith(S.ano)&&(P==='ano'||quarter(d)===+P);
const PASSOS=[['novas','Novas',1],['entrou','Entraram no período',1],['aumento','Aumentos de valor',1],['reducao','Reduções de valor',-1],['saiu','Adiadas para fora',-1],['ganhas','Ganhas',-1],['perdidas','Perdidas ou encerradas',-1]];
// compara o pipeline aberto do período (P) com uma foto. fg filtra o gerente.
function mudancas(foto,P,fg){
  const prev=new Map(),fm=new Map(),cur=new Map(),om=new Map(S.opps.map(o=>[String(o.numero),o]));
  foto.itens.forEach(([n,g,st,cat,v,fe,pr])=>{const i={g,st,cat,v:Number(v)||0,fe,pr};fm.set(String(n),i);if(fg(g)&&OPEN.has(st)&&inPer(fe,P))prev.set(String(n),i.v);});
  S.opps.forEach(o=>{if(fg(o.gerente)&&OPEN.has(o.status)&&inPer(o.fechamento,P))cur.set(String(o.numero),vAno(o));});
  const B=Object.fromEntries(PASSOS.map(([k])=>[k,0])),itens=[];
  const nums=new Set([...prev.keys(),...cur.keys()]);
  // mudanças sem efeito no valor (etapa, categoria, data dentro do período) também entram na lista
  om.forEach((o,n)=>{const f=fm.get(n);if(f&&fg(o.gerente)&&OPEN.has(o.status)&&inPer(o.fechamento,P)&&(f.st!==o.status||f.cat!==catDe(o)||f.fe!==(o.fechamento||null)))nums.add(n);});
  nums.forEach(n=>{const p=prev.get(n)||0,c=cur.get(n)||0,hp=prev.has(n),hc=cur.has(n),f=fm.get(n),o=om.get(n);let k=null;
    if(hp&&hc)k=c>p?'aumento':c<p?'reducao':null;
    else if(hc)k=f&&OPEN.has(f.st)&&fg(f.g)?'entrou':'novas';
    else if(hp)k=o&&o.status===WON?'ganhas':!o||!OPEN.has(o.status)?'perdidas':'saiu';
    if(k)B[k]+=c-p;
    const tx=[];
    if(k==='novas')tx.push(f?'Voltou ao pipeline':'Nova oportunidade');
    if(k==='ganhas')tx.push('Ganha');if(k==='perdidas')tx.push(o?'Encerrada ('+o.status+')':'Removida');
    if(f&&o&&f.st!==o.status&&k!=='ganhas'&&k!=='perdidas')tx.push(`${f.st} → ${o.status}`);
    if(f&&o&&f.fe!==(o.fechamento||null)&&f.fe&&o.fechamento)tx.push(`fechamento ${fmtD(f.fe)} → ${fmtD(o.fechamento)}${o.fechamento>f.fe?' (adiada)':' (antecipada)'}`);
    if(f&&o&&OPEN.has(o.status)&&f.cat!==catDe(o)&&f.cat)tx.push(`${f.cat} → ${catDe(o)}`);
    if(k==='aumento'||k==='reducao')tx.push(`valor ${M(p)} → ${M(c)}`);
    if(tx.length)itens.push({n,o,f,k,d:c-p,tx:tx.join(' · ')});});
  itens.sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)||String(a.n).localeCompare(String(b.n)));
  return {ini:sum([...prev.values()],x=>x),fim:sum([...cur.values()],x=>x),B,itens};}
// ---- linhas de forecast por visão ----
const PER_L=P=>P==='ano'?S.ano:QC[+P]+' de '+S.ano;
function linhasFc(P,D){
  const dd=DIMS[D],kf=dd.fg,kfo=dd.fo||(o=>kf(o.gerente)),kfr=dd.fr||(r=>kf(r.gerente)),R={},row=k=>R[k]=R[k]||{k,meta:0,real:0,Commit:0,'Best case':0,Pipeline:0,aberto:0,pond:0,n:0,nc:0,riscos:0,vRisco:0,opps:[]};
  const fm=P==='ano'?1:.25;
  if(kf)gerSel().filter(g=>!HIDE_GER.has(g)).forEach(g=>{const m=S.metas[g]||0;if(m)row(kf(g)).meta+=m*fm;});
  // origem não existe no faturamento: o realizado é o valor no ano das oportunidades ganhas no período
  if(dd.ganhas)selOpps().forEach(o=>{if(o.status===WON&&inPer(o.fechamento,P))row(kfo(o)).real+=vAno(o);});
  else selFat().forEach(r=>{if(inPer(r.mes+'-01',P))row(kfr(r)).real+=r.valor;});
  selOpps().forEach(o=>{if(!OPEN.has(o.status)||!inPer(o.fechamento,P))return;const x=row(kfo(o)),v=vAno(o),c=catDe(o);
    x[c]+=v;x.aberto+=v;x.pond+=v*(Number(o.probabilidade)||0)/100;x.n++;if(c==='Commit')x.nc++;x.opps.push(o);if(riscos(o).length){x.riscos++;x.vRisco+=v;}});
  return Object.values(R).map(x=>({...x,gap:Math.max(0,x.meta-x.real),prev:x.real+x.Commit,cob:x.meta-x.real>0?x.aberto/(x.meta-x.real):null}))
    .sort((a,b)=>b.meta-a.meta||b.aberto+b.real-a.aberto-a.real);}
function totalFc(L){const t={k:'Total',opps:[]};['meta','real','Commit','Best case','Pipeline','aberto','pond','n','nc','riscos','vRisco'].forEach(c=>{t[c]=sum(L,x=>x[c]);});
  t.gap=Math.max(0,t.meta-t.real);t.prev=t.real+t.Commit;t.cob=t.meta-t.real>0?t.aberto/(t.meta-t.real):null;L.forEach(x=>t.opps.push(...x.opps));return t;}
function cobInfo(x){const a=param().coberturaAlvo;if(!x.meta)return {c:'',t:'Sem meta',i:'–',v:'—'};if(x.cob===null)return {c:'good',t:'Meta atingida',i:'✓',v:'Meta atingida'};
  const v=nf(x.cob,1)+'x';return x.cob>=a?{c:'good',t:'Saudável',i:'●',v}:x.cob>=a*2/3?{c:'warn',t:'Atenção',i:'▲',v}:{c:'bad',t:'Crítica',i:'■',v};}
const fimChip=x=>`<span class="cob" title="Quarter encerrado: realizado sobre a meta do quarter">Encerrado · ${x.meta?pct(x.real,x.meta,0):M(x.real)}</span>`;
const cobChip=x=>{const i=cobInfo(x);return `<span class="cob ${i.c}" title="Cobertura ${esc(i.t.toLowerCase())}">${i.i} ${esc(i.v)}${i.c&&x.cob!==null?' <small>'+esc(i.t)+'</small>':''}</span>`;};
// ---- gráficos 2D (ECharts) ----
const corS=s=>cssVar({Realizado:'--k-real',Commit:'--k-commit','Best case':'--k-best',Pipeline:'--k-pipe'}[s]);
async function grafico(el,opt,onClick){let ec;try{ec=await carregarEC();}catch(err){el.innerHTML='<p class="note" style="padding:20px">Não foi possível carregar o gráfico.</p>';return null;}
  if(!el.isConnected||el.offsetParent===null)return null;
  const inst=ec.getInstanceByDom(el)||ec.init(el);inst.setOption(opt,true);inst.off('click');if(onClick)inst.on('click',onClick);return inst;}
function ecTema(){const fg=cssVar('--fg'),mu=cssVar('--muted'),ln=cssVar('--line'),sf=cssVar('--surface');
  return {fg,mu,ln,sf,textStyle:{fontFamily:cssVar('--font'),color:fg},
    tooltip:{backgroundColor:sf,borderColor:ln,textStyle:{color:fg,fontSize:12},confine:true,extraCssText:'box-shadow:0 6px 24px rgba(0,0,0,.12);border-radius:10px'},
    legend:{top:0,left:0,itemWidth:12,itemHeight:12,icon:'roundRect',textStyle:{color:fg,fontSize:12}},
    vAxis:{type:'value',axisLabel:{color:mu,formatter:v=>Ms(v)},splitLine:{lineStyle:{color:ln}},axisLine:{show:false}},
    cAxis:{axisLabel:{color:fg,fontSize:12},axisLine:{lineStyle:{color:ln}},axisTick:{show:false}}};}
const linhaTip=(c,l,v)=>`<div style="display:flex;gap:10px;justify-content:space-between"><span>${c?`<i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};margin-right:6px"></i>`:''}${esc(l)}</span><b>${esc(v)}</b></div>`;
function tipFc(x,titulo){return `<b>${esc(titulo||x.k)}</b><div style="min-width:220px;margin-top:4px">${
  [['Meta',x.meta,cssVar('--meta')],...SERIES.map(s=>[s,s==='Realizado'?x.real:x[s],corS(s)])].map(([l,v,c])=>linhaTip(c,l,M(v))).join('')}
  ${linhaTip('','Realizado + Commit',M(x.prev)+(x.meta?' · '+pct(x.prev,x.meta,0):''))}${linhaTip('','Cobertura',cobInfo(x).v)}</div>`;}
function grFcMeta(el,L,onClick,pctM){const T=ecTema(),R=[...L].filter(x=>x.meta||x.aberto).reverse(),fv=(x,v)=>pctM?(x.meta?v/x.meta*100:0):v;
  el.style.height=Math.max(220,70+R.length*36)+'px';
  return grafico(el,{textStyle:T.textStyle,legend:{...T.legend,data:[...SERIES,'Meta']},grid:{left:8,right:24,top:36,bottom:8,containLabel:true},
    tooltip:{...T.tooltip,trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>tipFc(R[ps[0].dataIndex])},
    xAxis:pctM?{...T.vAxis,axisLabel:{color:T.mu,formatter:v=>v+'%'}}:T.vAxis,yAxis:{type:'category',data:R.map(x=>x.k),...T.cAxis,axisLabel:{color:T.fg,fontSize:12,width:150,overflow:'truncate'}},
    series:[...SERIES.map((s,i)=>({name:s,type:'bar',stack:'t',barWidth:18,data:R.map(x=>fv(x,s==='Realizado'?x.real:x[s])),
      itemStyle:{color:corS(s),borderColor:T.sf,borderWidth:1,borderRadius:i===3?[0,4,4,0]:0},emphasis:{focus:'series'}})),
      {name:'Meta',type:'scatter',symbol:'rect',symbolSize:[3,28],z:5,data:R.map(x=>x.meta?(pctM?100:x.meta):null),itemStyle:{color:cssVar('--meta')}}]},
    p=>onClick&&onClick(R[p.dataIndex]));}
function grFcQuarter(el,Q,onClick){const T=ecTema();
  return grafico(el,{textStyle:T.textStyle,legend:{...T.legend,data:[...SERIES,'Meta']},grid:{left:8,right:12,top:36,bottom:8,containLabel:true},
    tooltip:{...T.tooltip,trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>tipFc(Q[ps[0].dataIndex],QC[ps[0].dataIndex]+' de '+S.ano)},
    xAxis:{type:'category',data:QC,...T.cAxis},yAxis:T.vAxis,
    series:[...SERIES.map((s,i)=>({name:s,type:'bar',stack:'t',barWidth:'46%',data:Q.map(x=>s==='Realizado'?x.real:x[s]),
      itemStyle:{color:corS(s),borderColor:T.sf,borderWidth:1,borderRadius:i===3?[4,4,0,0]:0},emphasis:{focus:'series'}})),
      {name:'Meta',type:'scatter',symbol:'rect',symbolSize:[54,3],z:5,data:Q.map(x=>x.meta||null),itemStyle:{color:cssVar('--meta')}}]},
    p=>onClick&&onClick(p.dataIndex));}
// ---- tela Relatórios ----
function setSeg(sel,v){document.querySelectorAll(sel+' button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===v)));}
function renderRelatorios(){
  const P=S.rel.per,D=S.rel.dim,dt=DIMS[D];
  $('#rAno').innerHTML=opts(['2026','2027'],S.ano);setSeg('#rPer',P);setSeg('#rDim',D);$('#rBase').value=S.rel.base;
  $('#rDim').hidden=!!GER_FIXO;
  const gsv=filtrando()?gerSel():[];
  $('#rVisao').innerHTML=GER_FIXO?`Sua carteira: <b>${esc(GER_FIXO)}</b>.`:!filtrando()?'Todos os gerentes que você enxerga. Para filtrar, escolha áreas ou gerentes no <a href="#painel">Painel</a>.':`Seleção do Painel: ${S.areas.size?`áreas <b>${esc([...S.areas].join(', '))}</b>, `:''}<b>${gsv.length}</b> gerente${gsv.length===1?'':'s'}.`;
  const L=linhasFc(P,D),T=totalFc(linhasFc(P,'ger')),pm=x=>x.meta?Math.min(100,x/T.meta*100):0,ci=cobInfo(T);
  $('#rKpis').innerHTML=[
    ['Meta '+PER_L(P),T.meta?M(T.meta):'—',P==='ano'?'Soma das metas dos gerentes':'¼ da meta anual',100,''],
    ['Realizado',M(T.real),T.meta?pct(T.real,T.meta)+' da meta (notas emitidas)':'Notas emitidas',pm(T.real),''],
    ['Commit',M(T.Commit),`${nf(T.nc)} oportunidade${T.nc===1?'':'s'} que o gerente garante`,pm(T.Commit),''],
    ['Realizado + Commit',M(T.prev),T.meta?`${pct(T.prev,T.meta)} da meta · falta ${M(Math.max(0,T.meta-T.prev))}`:'',pm(T.prev),T.meta&&T.prev<T.meta?'bad':''],
    ['Best case',M(T['Best case']),`Potencial: ${M(T.prev+T['Best case'])}${T.meta?' ('+pct(T.prev+T['Best case'],T.meta,0)+' da meta)':''}`,pm(T['Best case']),''],
    ['Pipeline aberto',M(T.aberto),`${nf(T.n)} oportunidades · ponderado ${M(T.pond)}`,pm(T.aberto),''],
    ['Cobertura',ci.v,T.meta?(T.cob===null?'O realizado já cobre a meta':`Pipeline ÷ o que falta (${M(T.gap)}). Alvo ${nf(param().coberturaAlvo,1)}x · ${ci.t}`):'Seleção sem meta',T.cob===null?100:Math.min(100,(T.cob||0)/param().coberturaAlvo*100),ci.c],
    ['Em risco',nf(T.riscos),`${M(T.vRisco)} do pipeline com algum selo de risco`,T.aberto?T.vRisco/T.aberto*100:0,T.riscos?'warn':'']]
    .map(([l,v,s,w,c])=>`<div class="kpi kpi-${c}" style="--w:${Math.max(0,w||0).toFixed(1)}%"><span class="l">${esc(l)}</span><span class="v">${esc(v)}</span><span class="s">${esc(s)}</span></div>`).join('');
  $('#rMetaTit').textContent=!dt.fg?`Previsão por ${dt.t} · ${PER_L(P)}${dt.ganhas?' · realizado = oportunidades ganhas no CRM':''}`:`Previsão x meta por ${dt.t} · ${PER_L(P)}`;
  setSeg('#rEsc',S.rel.esc);$('#rEsc').hidden=!dt.fg;grFcMeta($('#rChMeta'),L,x=>{S.rel.det={k:x.k};renderRelDet();rolarDet();},S.rel.esc==='pct'&&!!dt.fg);
  // por quarter (sempre o ano inteiro)
  const Q=[0,1,2,3].map(q=>totalFc(linhasFc(String(q),'ger')));
  $('#rQSub').textContent=`Seleção inteira em ${S.ano}. Meta do quarter = ¼ da meta anual. Clique num quarter para filtrar a tela.`;
  grFcQuarter($('#rChQ'),Q,i=>{S.rel.per=String(i);S.rel.det=null;renderRelatorios();});
  grEtapas($('#rChEt'),P);grOrigens(P);
  // tabela principal
  $('#rTabTit').textContent=`Cobertura e previsão por ${dt.t} · ${PER_L(P)}`;
  $('#rTabSub').textContent=`Cobertura = pipeline aberto ÷ o que falta da meta. Verde a partir de ${nf(param().coberturaAlvo,1)}x, amarelo a partir de ${nf(param().coberturaAlvo*2/3,1)}x. Clique numa linha para ver as oportunidades.`;
  const lin=(x,tot)=>`<tr ${tot?'':`class="click" data-rel="${esc(x.k)}"`}><td class="w"><b>${esc(x.k)}</b></td><td class="r">${x.meta?esc(M(x.meta)):'—'}</td><td class="r">${esc(M(x.real))}</td>
    <td><span class="relbar"><i style="width:${x.meta?Math.min(100,x.real/x.meta*100):0}%"></i></span> <span class="note">${x.meta?pct(x.real,x.meta,0):''}</span></td>
    <td class="r">${esc(M(x.Commit))}</td><td class="r"><b>${esc(M(x.prev))}</b>${x.meta?` <span class="note">${pct(x.prev,x.meta,0)}</span>`:''}</td><td class="r">${esc(M(x['Best case']))}</td><td class="r">${esc(M(x.Pipeline))}</td>
    <td class="r">${esc(M(x.aberto))}</td><td class="r">${esc(M(x.pond))}</td><td class="r">${x.meta?esc(M(x.gap)):'—'}</td><td>${cobChip(x)}</td><td class="r">${x.riscos?`<span class="selo s-venc">${nf(x.riscos)}</span>`:'—'}</td></tr>`;
  $('#rTab').innerHTML=`<thead><tr><th>${dt.T}</th><th class="r">Meta</th><th class="r">Realizado</th><th style="min-width:120px">% da meta</th><th class="r">Commit</th><th class="r">Realizado + Commit</th><th class="r">Best case</th><th class="r">Pipeline</th><th class="r">Pipeline aberto</th><th class="r">Ponderado</th><th class="r">Falta p/ meta</th><th>Cobertura</th><th class="r">Em risco</th></tr></thead>
    <tbody>${L.map(x=>lin(x)).join('')||'<tr><td colspan="13" class="note">Nada para a seleção.</td></tr>'}</tbody><tfoot>${lin(T,true)}</tfoot>`;
  // cobertura por quarter
  $('#rCobQTit').textContent=`Cobertura por ${dt.t} e quarter · ${S.ano}`;
  const LQ=[0,1,2,3].map(q=>Object.fromEntries(linhasFc(String(q),D).map(x=>[x.k,x])));
  const qFim=q=>`${S.ano}-${String(q*3+3).padStart(2,'0')}-31`<TODAY_ISO&&TODAY_ISO.slice(0,4)>=S.ano&&!(TODAY_ISO.slice(0,4)===S.ano&&quarter(TODAY_ISO)===q);
  const ksQ=uniq(LQ.flatMap(m=>Object.entries(m).filter(([k,x])=>x.meta||x.aberto).map(([k])=>k))).sort((a,b)=>sum(LQ,m=>(m[b]||{}).meta||0)-sum(LQ,m=>(m[a]||{}).meta||0));
  $('#rCobQ').innerHTML=ksQ.length?`<div class="scroll"><table class="rel"><thead><tr><th>${dt.T}</th>${QC.map(q=>`<th>${q}</th>`).join('')}</tr></thead><tbody>${
    ksQ.map(k=>`<tr><td class="w"><b>${esc(k)}</b></td>${LQ.map((m,q)=>{const x=m[k];return `<td class="click" data-relq="${esc(k)}|${q}" title="${x?esc(`Meta ${M(x.meta)} · realizado ${M(x.real)} · pipeline ${M(x.aberto)}`):''}">${!x?'—':qFim(q)?fimChip(x):cobChip(x)}</td>`;}).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td>${Q.map((x,q)=>`<td>${qFim(q)?fimChip(x):cobChip(x)}</td>`).join('')}</tr></tfoot></table></div>`:'<p class="note">Nada para a seleção.</p>';
  renderCascata(P);
  // oportunidades em risco
  const rk=T.opps.filter(o=>riscos(o).length).sort((a,b)=>vAno(b)-vAno(a));
  $('#rRiscoTit').textContent=`Oportunidades em risco · ${PER_L(P)}`;
  $('#rRiscoSub').textContent=rk.length?`${nf(rk.length)} de ${nf(T.n)} oportunidades abertas (${M(sum(rk,vAno))}). Passe o mouse no selo para ver o motivo.`:'Nenhuma oportunidade aberta com selo de risco no período.';
  $('#rRisco').innerHTML=rk.length?`<thead><tr><th>Nº</th><th>Gerente</th><th>Cliente</th><th>Oportunidade</th><th>Fechamento</th><th>Categoria</th><th class="r">Valor no ano</th><th>Riscos</th></tr></thead><tbody>${
    rk.slice(0,60).map(o=>`<tr class="click" data-opp="${esc(o.id)}"><td>${esc(o.numero)}</td><td>${esc(o.gerente)}</td><td class="w">${esc(o.cliente)}</td><td class="w">${esc(o.titulo)}</td><td>${esc(fmtD(o.fechamento))}</td><td>${catTag(o)}</td><td class="r">${esc(M(vAno(o)))}</td><td class="selos">${selos(o)}</td></tr>`).join('')}</tbody>`:'';
  renderRelDet();
}
function grEtapas(el,P){const T=ecTema(),a=selOpps().filter(o=>OPEN.has(o.status)&&inPer(o.fechamento,P));
  const et=STATUS.filter(s=>s.open&&(s.ativa!==false||a.some(o=>o.status===s.k))).map(s=>({k:s.k,p:s.p,a:a.filter(o=>o.status===s.k)}));
  return grafico(el,{textStyle:T.textStyle,legend:{...T.legend,data:['Valor no ano','Ponderado']},grid:{left:8,right:12,top:36,bottom:8,containLabel:true},
    tooltip:{...T.tooltip,trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const e=et[ps[0].dataIndex];return `<b>${esc(e.k)}</b> · ${e.p}%<div style="min-width:200px;margin-top:4px">${linhaTip(corS('Best case'),'Valor no ano',M(medida(e.a,'v')))}${linhaTip(corS('Commit'),'Ponderado',M(medida(e.a,'p')))}${linhaTip('','Oportunidades',nf(e.a.length))}</div>`;}},
    xAxis:{type:'category',data:et.map(e=>e.k),...T.cAxis,axisLabel:{color:T.fg,fontSize:11,interval:0,formatter:(v,i)=>`${v}\n${et[i].p}% · ${et[i].a.length}`}},yAxis:T.vAxis,
    series:[{name:'Valor no ano',type:'bar',barGap:'8%',barWidth:'30%',data:et.map(e=>medida(e.a,'v')),itemStyle:{color:corS('Best case'),borderRadius:[4,4,0,0]}},
      {name:'Ponderado',type:'bar',barWidth:'30%',data:et.map(e=>medida(e.a,'p')),itemStyle:{color:corS('Commit'),borderRadius:[4,4,0,0]}}]});}
// Origem das oportunidades: pipeline aberto e resultado (ganhas x perdidas) por origem, na seleção e no período
function grOrigens(P){const T=ecTema(),nome=o=>o.origemOpp||'Não informada';
  const ab=selOpps().filter(o=>OPEN.has(o.status)&&inPer(o.fechamento,P)),fe=selOpps().filter(o=>!OPEN.has(o.status)&&inPer(o.fechamento,P));
  const A=uniq([...opcoes('origem'),...ab.map(nome),...fe.map(nome)]).map(k=>({k,a:ab.filter(o=>nome(o)===k),g:fe.filter(o=>nome(o)===k&&o.status===WON),p:fe.filter(o=>nome(o)===k&&o.status!==WON)})).filter(x=>x.a.length||x.g.length||x.p.length);
  const ni=A.find(x=>x.k==='Não informada'),tot=ab.length+fe.length;
  $('#rOrigSub').textContent=`${PER_L(P)}. Oportunidades sem origem aparecem como "Não informada"${ni&&tot?` (${nf(ni.a.length+ni.g.length+ni.p.length)} de ${nf(tot)} neste período; a origem passou a existir em 27/11/2026)`:''}. Clique numa barra do pipeline para ver as oportunidades.`;
  const A1=[...A].filter(x=>x.a.length).sort((x,y)=>medida(x.a,'v')-medida(y.a,'v')),A2=[...A].filter(x=>x.g.length||x.p.length).sort((x,y)=>medida(x.g,'v')-medida(y.g,'v'));
  const conv=x=>x.g.length+x.p.length?x.g.length/(x.g.length+x.p.length)*100:0,vazio=(el,t)=>{const ec=window.echarts&&window.echarts.getInstanceByDom(el);if(ec)ec.dispose();el.style.height='auto';el.innerHTML=`<div class="vazio">${t}</div>`;};
  const elA=$('#rChOrA'),elB=$('#rChOrB');
  if(!A1.length)vazio(elA,'Nenhuma oportunidade aberta com fechamento neste período.');else{elA.innerHTML='';elA.style.height=Math.max(220,60+A1.length*38)+'px';
    grafico(elA,{textStyle:T.textStyle,grid:{left:8,right:70,top:12,bottom:8,containLabel:true},tooltip:{...T.tooltip,trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const x=A1[ps[0].dataIndex];return `<b>${esc(x.k)}</b><div style="min-width:200px;margin-top:4px">${linhaTip(corS('Best case'),'Valor no ano',M(medida(x.a,'v')))}${linhaTip(corS('Commit'),'Ponderado',M(medida(x.a,'p')))}${linhaTip('','Oportunidades',nf(x.a.length))}</div>`;}},
      xAxis:T.vAxis,yAxis:{type:'category',data:A1.map(x=>x.k),...T.cAxis,axisLabel:{color:T.fg,fontSize:12}},
      series:[{name:'Valor no ano',type:'bar',barWidth:'55%',data:A1.map(x=>medida(x.a,'v')),itemStyle:{color:corS('Best case'),borderRadius:[0,4,4,0]},label:{show:true,position:'right',color:T.mu,fontSize:11,formatter:p=>`${nf(A1[p.dataIndex].a.length)} opp.`}}]},
      p=>{S.rel.dim='orig';S.rel.det={k:A1[p.dataIndex].k};renderRelatorios();rolarDet();});}
  if(!A2.length)vazio(elB,'Nenhuma oportunidade ganha ou perdida com fechamento neste período.');else{elB.innerHTML='';elB.style.height=Math.max(220,90+A2.length*38)+'px';
    grafico(elB,{textStyle:T.textStyle,legend:{...T.legend,data:['Ganhas','Perdidas']},grid:{left:8,right:70,top:36,bottom:8,containLabel:true},tooltip:{...T.tooltip,trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const x=A2[ps[0].dataIndex];return `<b>${esc(x.k)}</b><div style="min-width:220px;margin-top:4px">${linhaTip(corS('Realizado'),'Ganhas',`${nf(x.g.length)} · ${M(medida(x.g,'v'))}`)}${linhaTip(T.mu,'Perdidas',`${nf(x.p.length)} · ${M(medida(x.p,'v'))}`)}${linhaTip('','Taxa de conversão',nf(conv(x))+'%')}</div>`;}},
      xAxis:T.vAxis,yAxis:{type:'category',data:A2.map(x=>x.k),...T.cAxis,axisLabel:{color:T.fg,fontSize:12}},
      series:[{name:'Ganhas',type:'bar',stack:'r',barWidth:'55%',data:A2.map(x=>medida(x.g,'v')),itemStyle:{color:corS('Realizado')}},
        {name:'Perdidas',type:'bar',stack:'r',data:A2.map(x=>medida(x.p,'v')),itemStyle:{color:T.mu,opacity:.45,borderRadius:[0,4,4,0]},label:{show:true,position:'right',color:T.fg,fontSize:11,formatter:p=>`${nf(conv(A2[p.dataIndex]))}% conv.`}}]});}}
function renderCascata(P){
  const base=S.rel.base,foto=fotoBase(base),box=$('#rCas');
  if(!foto){const f=S.fotos.map(x=>x.data).sort();
    $('#rCasSub').textContent='Compara o pipeline aberto do período com uma foto tirada toda segunda-feira.';
    box.innerHTML=`<div class="vazio"><b>Ainda não há foto para essa comparação.</b><br>${f.length?`A primeira foto do pipeline foi tirada em ${esc(fmtD(f[0]))}. A comparação com ${esc(BASES[base].l)} aparece a partir de ${esc(fmtD(new Date(new Date(f[0]).getTime()+(BASES[base].d+1)*864e5).toISOString().slice(0,10)))}.`:'A foto semanal começa a ser tirada assim que as oportunidades carregarem.'}</div>`;return;}
  const m=mudancas(foto,P,g=>inSel(g));
  $('#rCasSub').textContent=`Pipeline aberto de ${PER_L(P)}: foto de ${fmtD(foto.data)} contra hoje. Valores no ano.`;
  box.innerHTML='<div id="rChCas" class="ec" style="height:340px"></div><div id="rCasLista"></div>';
  const T=ecTema(),cats=['Foto '+fmtD(foto.data).slice(0,5),...PASSOS.map(p=>p[1]),'Hoje'];let acc=m.ini;const baseV=[0],val=[m.ini],cor=[corS('Realizado')];
  PASSOS.forEach(([k])=>{const v=m.B[k];if(v>=0){baseV.push(acc);val.push(v);acc+=v;cor.push(cssVar('--c1'));}else{acc+=v;baseV.push(acc);val.push(-v);cor.push(cssVar('--c3'));}});
  baseV.push(0);val.push(m.fim);cor.push(corS('Realizado'));
  grafico($('#rChCas'),{textStyle:T.textStyle,grid:{left:8,right:12,top:24,bottom:8,containLabel:true},
    tooltip:{...T.tooltip,trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const i=ps[0].dataIndex,sg=i===0||i===cats.length-1?'':PASSOS[i-1][2]*0+(m.B[PASSOS[i-1][0]]>=0?'+':'−');return `<b>${esc(cats[i])}</b><br>${sg}${esc(M(val[i]))}`;}},
    xAxis:{type:'category',data:cats,...T.cAxis,axisLabel:{color:T.fg,fontSize:11,interval:0,width:90,overflow:'break'}},yAxis:T.vAxis,
    series:[{type:'bar',stack:'w',data:baseV,itemStyle:{color:'transparent'},emphasis:{disabled:true},tooltip:{show:false}},
      {type:'bar',stack:'w',barWidth:'56%',data:val.map((v,i)=>({value:v,itemStyle:{color:cor[i],borderRadius:4}})),
        label:{show:true,position:'top',color:T.fg,fontSize:11,fontWeight:700,formatter:p=>{const i=p.dataIndex;if(!p.value)return '';return (i===0||i===cats.length-1?'':m.B[PASSOS[i-1][0]]>=0?'+':'−')+Ms(p.value);}}}]});
  $('#rCasLista').innerHTML=m.itens.length?`<h3 style="margin-top:6px">Principais mudanças</h3><div class="scroll"><table><thead><tr><th>Nº</th><th>Gerente</th><th>Cliente</th><th>O que mudou</th><th class="r">Efeito no período</th></tr></thead><tbody>${
    m.itens.slice(0,12).map(i=>`<tr ${i.o?`class="click" data-opp="${esc(i.o.id)}"`:''}><td>${esc(i.n)}</td><td>${esc(i.o?i.o.gerente:i.f.g)}</td><td class="w">${esc(i.o?i.o.cliente:'')}</td><td class="w">${esc(i.tx)}</td><td class="r ${i.d<0?'neg':i.d>0?'pos':''}">${i.d?(i.d>0?'+':'−')+esc(M(Math.abs(i.d))):'—'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="note">Nenhuma mudança desde a foto.</p>';}
function rolarDet(){$('#rDetCard').scrollIntoView({behavior:'smooth',block:'start'});}
function renderRelDet(){
  const det=S.rel.det,card=$('#rDetCard'); if(!det){card.hidden=true;return;} card.hidden=false;
  const P=det.q!==undefined?String(det.q):S.rel.per,dd=DIMS[S.rel.dim],kf=dd.fo||(o=>dd.fg(o.gerente));
  const a=selOpps().filter(o=>OPEN.has(o.status)&&inPer(o.fechamento,P)&&kf(o)===det.k).sort((x,y)=>vAno(y)-vAno(x));
  $('#rDetTit').textContent=`${det.k} · ${PER_L(P)}: ${nf(a.length)} oportunidade${a.length===1?'':'s'} abertas · ${M(sum(a,vAno))}`;
  $('#rDet').innerHTML=`<thead><tr><th>Nº</th><th>Fechamento</th><th>Gerente</th><th>Cliente</th><th>Oportunidade</th><th>Etapa</th><th>Categoria</th><th class="r">Valor no ano</th><th class="r">Prob.</th><th>Riscos</th></tr></thead><tbody>${
    a.map(o=>`<tr class="click" data-opp="${esc(o.id)}"><td>${esc(o.numero)}</td><td>${esc(fmtD(o.fechamento))}</td><td>${esc(o.gerente)}</td><td class="w">${esc(o.cliente)}</td><td class="w">${esc(o.titulo)}</td><td>${tagSt(o.status)}</td><td>${catTag(o)}</td><td class="r">${esc(M(vAno(o)))}</td><td class="r">${esc(o.probabilidade)}%</td><td class="selos">${selos(o)}</td></tr>`).join('')||'<tr><td colspan="10" class="note">Nenhuma oportunidade aberta.</td></tr>'}</tbody>`;
}
// ---- exportação (CSV com ; e vírgula decimal, abre direto no Excel) ----
const nCsv=v=>(Math.round((Number(v)||0)*100)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
function csv(linhas){return '﻿'+linhas.map(r=>r.map(c=>{const s=String(c??'');return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(';')).join('\r\n');}
function exportarTabela(){const P=S.rel.per,D=S.rel.dim,L=linhasFc(P,D),T=totalFc(L);
  const cab=[DIMS[D].T,'Meta','Realizado','% da meta','Commit','Realizado + Commit','Best case','Pipeline','Pipeline aberto','Ponderado','Falta para a meta','Cobertura (x)','Situação','Oportunidades abertas','Em risco'];
  const l=x=>[x.k,nCsv(x.meta),nCsv(x.real),x.meta?nCsv(x.real/x.meta*100):'',nCsv(x.Commit),nCsv(x.prev),nCsv(x['Best case']),nCsv(x.Pipeline),nCsv(x.aberto),nCsv(x.pond),nCsv(x.gap),x.cob===null||!x.meta?'':nCsv(x.cob),cobInfo(x).t,x.n,x.riscos];
  baixar(`forecast-por-${slug(DIMS[D].t)}-${slug(PER_L(P))}.csv`,csv([cab,...L.map(l),l(T)]));}
function exportarOpps(){const P=S.rel.per,a=selOpps().filter(o=>OPEN.has(o.status)&&inPer(o.fechamento,P)).sort((x,y)=>(x.fechamento||'').localeCompare(y.fechamento||''));
  const cab=['Nº','Gerente','Diretor','Área','Cliente','Oportunidade','Origem','Origem (qual)','Team members','Etapa','Probabilidade (%)','Categoria','Categoria sugerida?','Fechamento','Quarter','Valor no ano','Ponderado','Próximo passo','Data do próximo passo','Adiamentos','Riscos'];
  baixar(`oportunidades-forecast-${slug(PER_L(P))}.csv`,csv([cab,...a.map(o=>[o.numero,o.gerente,diretorDe(o.gerente),areaDe(o.gerente),o.cliente,o.titulo,o.origemOpp||'',o.origemDet||'',(o.team||[]).join(', '),o.status,o.probabilidade,catDe(o),CATS.includes(o.categoria)?'Não':'Sim',fmtD(o.fechamento),o.fechamento?QC[quarter(o.fechamento)]:'',
    nCsv(vAno(o)),nCsv(vAno(o)*(Number(o.probabilidade)||0)/100),o.proximoPasso||'',fmtD(o.proximoPassoData||''),Number(o.adiamentos)||0,riscos(o).map(r=>r.l).join(' | ')])]));}
$('#v-relatorios').addEventListener('click',e=>{const r=e.target.closest('[data-rel],[data-relq]');if(!r)return;
  if(r.dataset.rel!==undefined)S.rel.det={k:r.dataset.rel};else{const [k,q]=r.dataset.relq.split('|');S.rel.det={k,q:+q};}renderRelDet();rolarDet();});
$('#rDetFechar').addEventListener('click',()=>{S.rel.det=null;renderRelDet();});
$('#rPer').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;S.rel.per=b.dataset.v;S.rel.det=null;renderRelatorios();});
$('#rDim').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;S.rel.dim=b.dataset.v;S.rel.det=null;renderRelatorios();});
$('#rEsc').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;S.rel.esc=b.dataset.v;renderRelatorios();});
$('#rBase').addEventListener('change',e=>{S.rel.base=e.target.value;renderCascata(S.rel.per);});
$('#rExpTab').addEventListener('click',exportarTabela);$('#rExpOpp').addEventListener('click',exportarOpps);
$('#rAno').addEventListener('change',e=>{S.ano=e.target.value;$('#fAno').value=S.ano;S.rel.det=null;renderAll();});
let rTE;window.addEventListener('resize',()=>{clearTimeout(rTE);rTE=setTimeout(()=>{if(!ecP2)return;ecP2.then(ec=>document.querySelectorAll('.ec').forEach(el=>{const i=ec.getInstanceByDom(el);i&&i.resize();})).catch(()=>{});},200);});
// ---- Configurações > Forecast e riscos ----
function renderParamCfg(){const p=param(),ro=!ADMIN;
  $('#parGrid').innerHTML=PARAM_DEF.map(d=>`<label class="field"><span>${esc(d.l)}</span><input type="number" min="0" step="${d.step}" id="par_${d.k}" value="${esc(p[d.k])}" ${ro?'disabled':''}><span class="note">${esc(d.s)}</span></label>`).join('');
  $('#par_save').disabled=ro;$('#par_reset').disabled=ro;}
$('#parF').addEventListener('submit',async e=>{e.preventDefault();if(!ADMIN)return;const v={};
  for(const d of PARAM_DEF){const x=Number($('#par_'+d.k).value);if(!isFinite(x)||x<0){$('#par_err').textContent=`Valor inválido em "${d.l}".`;return;}v[d.k]=x;}
  if(v.bestProb>v.commitProb){$('#par_err').textContent='A probabilidade de Best case não pode ser maior que a de Commit.';return;}
  try{await salvarParam(v);$('#par_err').textContent='';toast('Limites salvos');}catch(err){$('#par_err').textContent='Não foi possível salvar: '+(err&&err.message||'tente de novo.');}});
$('#par_reset').addEventListener('click',()=>{PARAM_DEF.forEach(d=>{$('#par_'+d.k).value=PARAM_PADRAO[d.k];});});

/* ================= reunião de forecast ================= */
const cssVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const PAL3D=['#0a66e8','#63c8ff','#7c5cff','#e5484d','#12a37f','#e5484d','#ff8ad8','#9ad14b','#00b3a4','#b07cff'];
function reuGerentes(){return (filtrando()?gerSel():gerentes()).filter(g=>!HIDE_GER.has(g));}
function reuGer(){const gs=reuGerentes();if(GER_FIXO)return GER_FIXO;if(!gs.includes(S.reu.ger))S.reu.ger=(S.sel.size===1&&gs.includes([...S.sel][0]))?[...S.sel][0]:gs.sort((a,b)=>sum(fcAno().filter(o=>o.gerente===b),vAno)-sum(fcAno().filter(o=>o.gerente===a),vAno))[0]||'';return S.reu.ger;}
const acoesOpp=n=>S.acoes.filter(a=>a.tipo==='opp'&&String(a.numero)===String(n));
const acoesGer=g=>S.acoes.filter(a=>a.tipo==='gerente'&&a.gerente===g);
const ordAcoes=a=>[...a].sort((x,y)=>(x.status==='concluida')-(y.status==='concluida')||String(x.prazo||'9').localeCompare(String(y.prazo||'9')));
function itemAcao(a,comOpp){const venc=a.status!=='concluida'&&a.prazo&&a.prazo<TODAY_ISO;const o=comOpp&&S.opps.find(x=>String(x.numero)===String(a.numero));
  return `<li class="acao ${a.status==='concluida'?'feita':''}"><label><input type="checkbox" data-acao-tog="${esc(a.id)}" ${a.status==='concluida'?'checked':''} ${pode('registrar_acoes')?'':'disabled'} aria-label="Concluída"></label>
    <div><div class="txt">${esc(a.texto)}</div><div class="note">${o?`<a href="#" data-acoes-opp="${esc(o.numero)}">Nº ${esc(o.numero)} · ${esc(o.cliente)}</a> · `:''}${a.responsavel?'Resp.: '+esc(a.responsavel)+' · ':''}${a.prazo?`<span class="${venc?'venc':''}">Prazo ${esc(fmtD(a.prazo))}${venc?' (vencida)':''}</span> · `:''}${esc(a.criadoPorNome||'')} em ${esc(fmtD((a.criadoEm||'').slice(0,10)))}</div></div></li>`;}
function formAcao(id){const pd=pode('registrar_acoes');const resp=uniq([...gerentes(),usuarioAtual().nome].filter(Boolean));
  return pd?`<form class="acao-f" data-acao-form="${id}"><input name="texto" required placeholder="Nova ação (ex.: agendar reunião com o cliente)"><input name="resp" list="dlResp" placeholder="Responsável"><input name="prazo" type="date" title="Prazo"><button class="blue">Registrar</button>
    <datalist id="dlResp">${resp.map(r=>`<option value="${esc(r)}">`).join('')}</datalist></form>`:'<p class="note">Seu acesso permite ver, mas não registrar ações.</p>';}
function renderReuniao(){
  const gs=reuGerentes(),g=reuGer();
  $('#mGer').innerHTML=opts(gs,g);$('#mGer').disabled=!!GER_FIXO;$('#mAno').innerHTML=opts(['2026','2027'],S.ano);setSeg('#mModo',S.reu.modo);
  const fc=fcAno().filter(o=>o.gerente===g).sort((a,b)=>(a.fechamento||'').localeCompare(b.fechamento||''));
  const x=linhasFc('ano','ger').find(r=>r.k===g)||{k:g,meta:S.metas[g]||0,real:0,Commit:0,'Best case':0,Pipeline:0,aberto:0,pond:0,n:0,nc:0,riscos:0,vRisco:0,gap:S.metas[g]||0,prev:0,cob:null};
  const abertas=S.acoes.filter(a=>a.gerente===g&&a.status!=='concluida').length,venc=S.acoes.filter(a=>a.gerente===g&&a.status!=='concluida'&&a.prazo&&a.prazo<TODAY_ISO).length,ci=cobInfo(x);
  $('#mTit').textContent=g?`Reunião com ${g}`:'Reunião de forecast';
  $('#mKpis').innerHTML=[['Meta',x.meta?M(x.meta):'—',diretorDe(g)!=='Sem diretor'?'Diretor: '+diretorDe(g):'Sem diretor definido',''],['Realizado',M(x.real),x.meta?pct(x.real,x.meta)+' da meta':'faturado em '+S.ano,''],
    ['Realizado + Commit',M(x.prev),x.meta?`${pct(x.prev,x.meta)} da meta · Commit ${M(x.Commit)}`:`Commit ${M(x.Commit)}`,x.meta&&x.prev<x.meta?'bad':''],
    ['Best case',M(x['Best case']),`Pipeline ${M(x.Pipeline)} · ponderado ${M(x.pond)}`,''],
    ['Cobertura',ci.v,x.meta?(x.cob===null?'O realizado já cobre a meta':`Falta ${M(x.gap)} · ${ci.t}`):'Gerente sem meta',ci.c],
    ['Ações abertas',nf(abertas),venc?`${nf(venc)} com prazo vencido`:'Nenhuma vencida',venc?'warn':'']]
    .map(([l,v,s,c])=>`<div class="kpi kpi-${c}"><span class="l">${esc(l)}</span><span class="v">${esc(v)}</span><span class="s">${esc(s)}</span></div>`).join('');
  renderPauta(g,fc);
  $('#mOppTit').textContent=`Oportunidades em forecast de ${g||'—'} em ${S.ano}`;
  $('#mOpps').innerHTML=`<thead><tr><th>Nº</th><th>Fechamento</th><th>Cliente</th><th>Oportunidade</th><th>Etapa</th><th>Categoria</th><th class="r">Valor no ano</th><th class="r">Prob.</th><th>Riscos</th><th class="r">Ações</th><th></th></tr></thead><tbody>${
    fc.map(o=>{const ac=acoesOpp(o.numero),ab=ac.filter(a=>a.status!=='concluida').length;return `<tr><td>${esc(o.numero)}</td><td class="${o.fechamento<TODAY_ISO?'venc':''}">${esc(fmtD(o.fechamento))}</td><td class="w">${esc(o.cliente)}</td><td class="w">${esc(o.titulo)}</td><td>${tagSt(o.status)}</td><td>${catTag(o)}</td><td class="r">${esc(M(vAno(o)))}</td><td class="r">${esc(o.probabilidade)}%</td><td class="selos">${selos(o)}</td>
      <td class="r">${ac.length?`${nf(ab)} aberta${ab===1?'':'s'} / ${nf(ac.length)}`:'—'}</td><td><button class="ico" data-acoes-opp="${esc(o.numero)}">Ações</button></td></tr>`;}).join('')||'<tr><td colspan="11" class="note">Nenhuma oportunidade em forecast.</td></tr>'}</tbody>`;
  $('#mAcGer').innerHTML=ordAcoes(acoesGer(g)).map(a=>itemAcao(a)).join('')||'<li class="note">Nenhuma ação registrada para este gerente.</li>';
  $('#mAcGerForm').innerHTML=g?formAcao('ger'):'';
  const nums=new Set(S.opps.filter(o=>o.gerente===g).map(o=>String(o.numero)));
  $('#mAcOpp').innerHTML=ordAcoes(S.acoes.filter(a=>a.tipo==='opp'&&nums.has(String(a.numero)))).map(a=>itemAcao(a,true)).join('')||'<li class="note">Nenhuma ação registrada nas oportunidades deste gerente.</li>';
  const tt=S.reu.modo==='3d'?[['Forecast por gerente e quarter','Arraste para girar, role para aproximar. Clique numa barra para trocar de gerente. Em laranja, o gerente da reunião.'],['Oportunidades do gerente em 3D','Dias até o fechamento × probabilidade × valor no ano. Cor = etapa, tamanho = valor. Clique num ponto para registrar ações.']]
    :[['Previsão do gerente por quarter','Realizado, Commit, Best case e Pipeline em cada quarter, contra ¼ da meta anual (marca vermelha).'],['Onde estão as oportunidades','Dias até o fechamento × probabilidade. Tamanho = valor no ano, cor = categoria. Clique num ponto para registrar ações.']];
  $('#mChATit').textContent=tt[0][0];$('#mChASub').textContent=tt[0][1];$('#mChBTit').textContent=tt[1][0];$('#mChBSub').textContent=tt[1][1];
  document.querySelectorAll('#m3dBar,#m3dOpp').forEach(el=>el.classList.toggle('chart3d',S.reu.modo==='3d'));
  if(S.reu.modo==='3d')renderGraficos3D(gs,g,fc);else renderGraficos2D(g,fc);
}
const qAtual=()=>S.ano===String(TODAY.getFullYear())?quarter(TODAY_ISO):0;
function pautaDados(g,fc){
  const qa=qAtual(),top=fc.filter(o=>quarter(o.fechamento)===qa).sort((a,b)=>vAno(b)-vAno(a)).slice(0,5);
  const rk=fc.filter(o=>riscos(o).length).sort((a,b)=>vAno(b)-vAno(a)).slice(0,5);
  const foto=fotoBase('semana'),mud=foto?mudancas(foto,'ano',x=>x===g):null;
  const ac=ordAcoes(S.acoes.filter(a=>a.gerente===g&&a.status!=='concluida')).sort((a,b)=>((b.prazo&&b.prazo<TODAY_ISO)-(a.prazo&&a.prazo<TODAY_ISO))).slice(0,6);
  return {qa,top,rk,foto,mud,ac};}
function renderPauta(g,fc){
  const d=pautaDados(g,fc),li=(o,extra)=>`<li><a href="#" data-acoes-opp="${esc(o.numero)}"><b>Nº ${esc(o.numero)}</b> · ${esc(o.cliente)}</a><span class="note">${extra}</span></li>`;
  $('#mPautaTit').textContent=g?`Pauta da reunião com ${g}`:'Pauta da reunião';
  const f=S.fotos.map(x=>x.data).sort()[0];
  $('#mPauta').innerHTML=[
    ['1','Top negócios do '+QC[d.qa],d.top.map(o=>li(o,`${esc(M(vAno(o)))} · ${catTag(o)} · fecha ${esc(fmtD(o.fechamento))}`)).join('')||`<li class="note">Nenhuma oportunidade com fechamento no ${QC[d.qa]}.</li>`],
    ['2','Riscos para discutir',d.rk.map(o=>li(o,`${esc(M(vAno(o)))} · ${selos(o)}`)).join('')||'<li class="note">Nenhuma oportunidade com selo de risco.</li>'],
    ['3',d.foto?`O que mudou desde ${fmtD(d.foto.data)}`:'O que mudou na semana',d.mud?(d.mud.itens.slice(0,5).map(i=>i.o?li(i.o,esc(i.tx)+(i.d?` · <b class="${i.d<0?'neg':'pos'}">${i.d>0?'+':'−'}${esc(M(Math.abs(i.d)))}</b>`:'')):`<li><b>Nº ${esc(i.n)}</b> <span class="note">${esc(i.tx)}</span></li>`).join('')||'<li class="note">Nada mudou desde a última foto.</li>')
      :`<li class="note">${f?`A comparação semanal começa em ${esc(fmtD(new Date(new Date(f).getTime()+7*864e5).toISOString().slice(0,10)))}, uma semana depois da primeira foto (${esc(fmtD(f))}).`:'A primeira foto do pipeline ainda não foi tirada.'}</li>`],
    ['4','Ações pendentes',d.ac.map(a=>{const v=a.prazo&&a.prazo<TODAY_ISO;return `<li><span>${esc(a.texto)}</span><span class="note">${a.responsavel?esc(a.responsavel)+' · ':''}${a.prazo?`<span class="${v?'venc':''}">prazo ${esc(fmtD(a.prazo))}${v?' (vencida)':''}</span>`:'sem prazo'}</span></li>`;}).join('')||'<li class="note">Nenhuma ação aberta.</li>']]
    .map(([n,t,c])=>`<div class="pauta-bloco"><h4><span class="num">${n}</span>${esc(t)}</h4><ul>${c}</ul></div>`).join('');}
function textoPauta(){const g=reuGer(),fc=fcAno().filter(o=>o.gerente===g),d=pautaDados(g,fc),L=[];
  L.push(`Pauta da reunião de forecast com ${g} (${fmtD(TODAY_ISO)})`,'');
  L.push(`1. Top negócios do ${QC[d.qa]}`);d.top.forEach(o=>L.push(`   - Nº ${o.numero} ${o.cliente}: ${M(vAno(o))}, ${catDe(o)}, fecha ${fmtD(o.fechamento)}`));if(!d.top.length)L.push('   - Nenhum');
  L.push('','2. Riscos');d.rk.forEach(o=>L.push(`   - Nº ${o.numero} ${o.cliente}: ${M(vAno(o))} (${riscos(o).map(r=>r.l).join(', ')})`));if(!d.rk.length)L.push('   - Nenhum');
  L.push('',d.foto?`3. O que mudou desde ${fmtD(d.foto.data)}`:'3. O que mudou');(d.mud?d.mud.itens.slice(0,5):[]).forEach(i=>L.push(`   - Nº ${i.n}${i.o?' '+i.o.cliente:''}: ${i.tx}`));if(!d.mud||!d.mud.itens.length)L.push('   - Sem comparação ou sem mudanças');
  L.push('','4. Ações pendentes');d.ac.forEach(a=>L.push(`   - ${a.texto}${a.responsavel?' ('+a.responsavel+')':''}${a.prazo?', prazo '+fmtD(a.prazo):''}`));if(!d.ac.length)L.push('   - Nenhuma');
  return L.join('\n');}
$('#mCopiar').addEventListener('click',async()=>{const t=textoPauta();
  try{await navigator.clipboard.writeText(t);toast('Pauta copiada');}
  catch(err){const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
    let ok=false;try{ok=document.execCommand('copy');}catch(e2){}ta.remove();if(ok)toast('Pauta copiada');else baixar('pauta-forecast-'+slug(reuGer())+'.txt',t);}});
$('#mModo').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b||b.dataset.v===S.reu.modo)return;S.reu.modo=b.dataset.v;try{localStorage.setItem('crm-reu-modo',S.reu.modo);}catch(err){}
  ['#m3dBar','#m3dOpp'].forEach(s=>{const el=$(s);const pr=ecP2||ecP;if(pr)pr.then(m=>{const i=m.getInstanceByDom(el);i&&i.dispose();}).catch(()=>{});});
  setTimeout(renderReuniao,0);});
async function renderGraficos2D(g,fc){
  const Q=[0,1,2,3].map(q=>linhasFc(String(q),'ger').find(r=>r.k===g)||{k:g,meta:(S.metas[g]||0)/4,real:0,Commit:0,'Best case':0,Pipeline:0,aberto:0,pond:0,gap:(S.metas[g]||0)/4,prev:0,cob:null});
  await grFcQuarter($('#m3dBar'),Q,null);
  const T=ecTema(),cats=['Commit','Best case','Pipeline'];
  const mx=Math.max(1,...fc.map(vAno));
  grafico($('#m3dOpp'),{textStyle:T.textStyle,legend:{...T.legend,data:cats},grid:{left:16,right:16,top:36,bottom:28,containLabel:true},
    tooltip:{...T.tooltip,trigger:'item',formatter:p=>{const o=p.data.o;return `<b>Nº ${esc(o.numero)} · ${esc(o.cliente)}</b><br>${esc(o.titulo)}<br>${esc(o.status)} · ${esc(o.probabilidade)}% · ${esc(catDe(o))}<br>${esc(M(vAno(o)))} no ano · fecha ${esc(fmtD(o.fechamento))}${riscos(o).length?'<br>Riscos: '+esc(riscos(o).map(r=>r.l).join(', ')):''}<br><i>Clique para ver as ações</i>`;}},
    xAxis:{type:'value',name:'Dias até o fechamento',nameLocation:'middle',nameGap:26,nameTextStyle:{color:T.mu},axisLabel:{color:T.mu},splitLine:{lineStyle:{color:T.ln}}},
    yAxis:{type:'value',name:'Probabilidade %',nameLocation:'middle',nameGap:34,min:0,max:100,nameTextStyle:{color:T.mu},axisLabel:{color:T.mu},splitLine:{lineStyle:{color:T.ln}}},
    series:cats.map(c=>({name:c,type:'scatter',data:fc.filter(o=>catDe(o)===c).map(o=>({value:[Math.round((new Date(o.fechamento)-TODAY)/864e5),Number(o.probabilidade)||0],o,symbolSize:8+Math.sqrt(vAno(o)/mx)*34})),
      itemStyle:{color:corS(c),opacity:.88,borderColor:T.sf,borderWidth:2},emphasis:{itemStyle:{color:cssVar('--c3')}},
      markLine:c==='Commit'?{silent:true,symbol:'none',lineStyle:{color:T.mu,type:'dashed'},label:{color:T.mu,formatter:'hoje',position:'insideEndTop'},data:[{xAxis:0}]}:undefined}))},
    p=>{if(p.data&&p.data.o)acoesOppForm(p.data.o);});
}
let ecP=null,ecP2=null;
function carregarEC(){return ecP2=ecP2||import('echarts');}

function carregarECharts(){return ecP=ecP||(async()=>{ const ec=await import('echarts');await import('echarts-gl');return ec; })();}
async function renderGraficos3D(gs,g,fc){
  let ec; try{ec=await carregarECharts();}catch(err){['#m3dBar','#m3dOpp'].forEach(s=>$(s).innerHTML='<p class="note" style="padding:20px">Não foi possível carregar os gráficos 3D.</p>');return;}
  if(cur()!=='reuniao')return;
  const fg=cssVar('--fg')||'#0d1f3c',mu=cssVar('--muted')||'#5d6f88',ln=cssVar('--line')||'#d8e3f0',c1=cssVar('--c1')||'#0a66e8',c2=cssVar('--c2')||'#63c8ff';
  const eixo=(nome,extra={})=>({name:nome,nameTextStyle:{color:mu,fontSize:12},axisLabel:{color:fg,fontSize:11},axisLine:{lineStyle:{color:mu}},splitLine:{lineStyle:{color:ln}},...extra});
  const L=fcAno(),top=[...gs].map(x=>({g:x,v:sum(L.filter(o=>o.gerente===x),vAno)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,12).map(x=>x.g);
  if(g&&!top.includes(g)&&L.some(o=>o.gerente===g))top.push(g);
  const dados=[];top.forEach((x,i)=>[0,1,2,3].forEach(q=>{const v=sum(L.filter(o=>o.gerente===x&&quarter(o.fechamento)===q),vAno);dados.push({value:[i,q,Math.round(v/1e3)/1e3],itemStyle:x===g?{color:'#f2a01e'}:undefined});}));
  const mx=Math.max(0.001,...dados.map(d=>d.value[2]));
  const el1=$('#m3dBar'),c1i=ec.getInstanceByDom(el1)||ec.init(el1);
  c1i.setOption({tooltip:{formatter:p=>`<b>${esc(top[p.value[0]])}</b><br>${QL[p.value[1]]} de ${S.ano}: R$ ${nf(p.value[2],2)} M`},
    visualMap:{show:false,min:0,max:mx,inRange:{color:[c2,c1,'#0b2350']}},
    xAxis3D:{type:'category',data:top.map(x=>x.split(' ').slice(0,2).join(' ')),...eixo('')},yAxis3D:{type:'category',data:QL,...eixo('')},zAxis3D:{type:'value',...eixo('R$ M')},
    grid3D:{boxWidth:Math.max(100,top.length*16),boxDepth:70,boxHeight:70,viewControl:{alpha:24,beta:38,distance:230,autoRotate:false},light:{main:{intensity:1.25,shadow:true,alpha:40,beta:30},ambient:{intensity:0.35}},environment:'none',axisPointer:{show:false}},
    series:[{type:'bar3D',data:dados,shading:'lambert',bevelSize:0.25,bevelSmoothness:4,barSize:9,label:{show:false},emphasis:{label:{show:true,formatter:p=>'R$ '+nf(p.value[2],1)+' M',textStyle:{color:fg,fontSize:12,fontWeight:700}},itemStyle:{color:'#f2a01e'}}}]},true);
  c1i.off('click');c1i.on('click',p=>{if(GER_FIXO)return;S.reu.ger=top[p.value[0]];renderReuniao();});
  const etapas=[...new Set(fc.map(o=>o.status))];
  const series=etapas.map((st,i)=>({type:'scatter3D',name:st,data:fc.filter(o=>o.status===st).map(o=>({value:[Math.round((new Date(o.fechamento)-TODAY)/864e5),Number(o.probabilidade)||0,Math.round(vAno(o)/1e3)/1e3],o})),
    symbolSize:d=>8+Math.sqrt(Math.max(0,d[2]))*9,itemStyle:{color:PAL3D[i%PAL3D.length],opacity:0.9,borderWidth:1,borderColor:'rgba(255,255,255,.7)'},emphasis:{itemStyle:{color:'#f2a01e'}}}));
  const el2=$('#m3dOpp'),c2i=ec.getInstanceByDom(el2)||ec.init(el2);
  c2i.setOption({tooltip:{formatter:p=>{const o=p.data.o;return `<b>Nº ${esc(o.numero)} · ${esc(o.cliente)}</b><br>${esc(o.titulo)}<br>${esc(o.status)} · ${esc(o.probabilidade)}%<br>R$ ${nf(p.value[2],2)} M no ano · fecha ${esc(fmtD(o.fechamento))}<br><i>Clique para ver as ações</i>`;}},
    legend:{top:0,textStyle:{color:fg,fontSize:11},data:etapas},
    xAxis3D:{type:'value',...eixo('Dias até o fechamento')},yAxis3D:{type:'value',min:0,max:100,...eixo('Probabilidade %')},zAxis3D:{type:'value',...eixo('R$ M no ano')},
    grid3D:{boxWidth:110,boxDepth:90,boxHeight:80,viewControl:{alpha:18,beta:42,distance:240},light:{main:{intensity:1.2},ambient:{intensity:0.4}},environment:'none'},
    series:series.length?series:[{type:'scatter3D',data:[]}]},true);
  c2i.off('click');c2i.on('click',p=>{if(p.data&&p.data.o)acoesOppForm(p.data.o);});
}
let rT3;window.addEventListener('resize',()=>{clearTimeout(rT3);rT3=setTimeout(()=>{if(!ecP)return;ecP.then(ec=>['#m3dBar','#m3dOpp'].forEach(s=>{const i=ec.getInstanceByDom($(s));i&&i.resize();})).catch(()=>{});},200);});
$('#mGer').addEventListener('change',e=>{S.reu.ger=e.target.value;renderReuniao();});
$('#mAno').addEventListener('change',e=>{S.ano=e.target.value;$('#fAno').value=S.ano;renderAll();});
function acoesOppForm(o){
  openDrawer(`<div class="card-head" style="margin:0"><div><span class="eyebrow">Ações da oportunidade</span><h2 style="font-size:20px">Nº ${esc(o.numero)} · ${esc(o.cliente)}</h2></div><button class="ghost" data-close>Fechar</button></div>
    <dl class="facts"><dt>Oportunidade</dt><dd>${esc(o.titulo)}</dd><dt>Gerente</dt><dd>${esc(o.gerente)}</dd><dt>Etapa</dt><dd>${esc(o.status)} · ${esc(o.probabilidade)}%</dd><dt>Valor no ano</dt><dd>${esc(brl(vAno(o)))}</dd><dt>Fechamento</dt><dd>${esc(fmtD(o.fechamento)||'—')}</dd></dl>
    <ul class="acoes" id="dAcoes"></ul><div id="dAcoesForm">${formAcao('opp:'+o.numero)}</div>
    <div class="actions" style="justify-content:flex-start"><button id="dAbrirOpp">Abrir a oportunidade</button></div>`,d=>{
      const lista=()=>{d.querySelector('#dAcoes').innerHTML=ordAcoes(acoesOpp(o.numero)).map(a=>itemAcao(a)).join('')||'<li class="note">Nenhuma ação registrada.</li>';};lista();S.reu.drawerLista=lista;
      d.querySelector('#dAbrirOpp').addEventListener('click',()=>oppForm(o));});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-acoes-opp]');if(!b)return;e.preventDefault();const o=S.opps.find(x=>String(x.numero)===b.dataset.acoesOpp);o&&acoesOppForm(o);});
document.addEventListener('change',async e=>{const c=e.target.closest('[data-acao-tog]');if(!c||!pode('registrar_acoes'))return;
  const a=S.acoes.find(x=>String(x.id)===c.dataset.acaoTog);if(!a)return;
  try{await salvarAcao({...a,status:c.checked?'concluida':'aberta'});}catch(err){c.checked=!c.checked;toast('Não foi possível atualizar a ação.');}});
document.addEventListener('submit',async e=>{const f=e.target.closest('[data-acao-form]');if(!f)return;e.preventDefault();if(!pode('registrar_acoes'))return;
  const ref=f.dataset.acaoForm,g=reuGer();const texto=f.texto.value.trim();if(!texto)return;
  let a;if(ref==='ger')a={tipo:'gerente',gerente:g,numero:null};else{const o=S.opps.find(x=>String(x.numero)===ref.slice(4));a={tipo:'opp',numero:o.numero,gerente:o.gerente};}
  Object.assign(a,{texto,responsavel:f.resp.value.trim(),prazo:f.prazo.value||null,status:'aberta',criadoEm:new Date().toISOString(),criadoPorNome:usuarioAtual().nome||(papeisAtuais()[usuarioAtual().papel]||{}).nome||''});
  f.querySelector('button').disabled=true;
  try{await salvarAcao(a);f.reset();toast('Ação registrada');}catch(err){toast('Não foi possível registrar a ação.');}finally{f.querySelector('button').disabled=false;}});
function aposAcoes(){if(cur()==='reuniao'){const fe=document.activeElement&&document.activeElement.closest('.acao-f');if(!fe)renderReuniao();}S.reu.drawerLista&&$('#dAcoes')&&S.reu.drawerLista();}
async function salvarAcao(a){await api.salvarAcao(a,userId);await recarregar('acoes');}
async function salvarParam(v){await api.salvarParametros(v,userId);await recarregar('parametros');}
function baixarBlob(nome,txt){const u=URL.createObjectURL(new Blob([txt],{type:nome.endsWith('.csv')?'text/csv;charset=utf-8':'text/plain;charset=utf-8'}));
  const a=document.createElement('a');a.href=u;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);}
async function baixar(nome,txt){baixarBlob(nome,txt);}
/* ================= número, anexos e envio para pré-vendas ================= */
// Número da oportunidade: sequencial, único, nunca reaproveitado. As da carga inicial mantêm o número do sistema antigo; as novas começam em 7000.
const NUM_INICIAL=7000;
async function copiar(t,ok){try{await navigator.clipboard.writeText(t);toast(ok||'Copiado');return;}catch(err){}
  const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
  let r=false;try{r=document.execCommand('copy');}catch(e){}ta.remove();toast(r?(ok||'Copiado'):'Não foi possível copiar. Número: '+t);}
function numeroCriado(o){
  openDrawer(`<div class="card-head" style="margin:0"><div><span class="eyebrow">Oportunidade cadastrada</span><h2 style="font-size:20px">${esc(o.cliente||'')}</h2></div><button class="ghost" data-close>Fechar</button></div>
    <div class="num-grande"><span class="note">Número da oportunidade</span><b>Nº ${esc(o.numero)}</b></div>
    <p class="note" style="margin:0">Use este número para falar desta oportunidade com outras áreas, inclusive as que ainda não usam o CRM. Ele é único, não muda e não é reaproveitado.</p>
    <div class="actions" style="justify-content:flex-start"><button id="nCopiar">Copiar número</button><button class="blue" id="nAbrir">Abrir a oportunidade</button></div>`,d=>{
    d.querySelector('#nCopiar').addEventListener('click',()=>copiar(String(o.numero),`Número ${o.numero} copiado`));
    d.querySelector('#nAbrir').addEventListener('click',()=>oppForm(S.opps.find(x=>String(x.numero)===String(o.numero))||{...o,id:String(o.numero)}));});
  toast(`Oportunidade nº ${o.numero} cadastrada`);}
const tam=b=>{b=Number(b)||0;return b>=1048576?nf(b/1048576,1)+' MB':b>=1024?nf(b/1024,0)+' KB':nf(b)+' B';};
const fmtDH=s=>s?new Date(s).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const nomeAutor=()=>{const u=usuarioAtual();return u.nome||(papeisAtuais()[u.papel]||{}).nome||'';};
const anexosDe=n=>S.anexos.filter(a=>String(a.numero)===String(n)).sort((a,b)=>String(a.criadoEm).localeCompare(String(b.criadoEm)));
const enviosDe=n=>S.envios.filter(e=>String(e.numero)===String(n)).sort((a,b)=>String(b.enviadoEm).localeCompare(String(a.enviadoEm)));
const prevendasAtivos=()=>(S.prevendas||[]).filter(p=>p.ativo!==false&&p.email);
const ST_ENVIO={enviado:['good','E-mail enviado'],registrado:['warn','Registrado (o protótipo não envia e-mail)'],erro:['bad','Falhou']};
function renderExtras(o){const box=$('#oExtra');if(!box)return;S.extraOpp=o;const pd=pode('editar_oportunidades')&&!S.readOnly;
  const an=anexosDe(o.numero),ev=enviosDe(o.numero);
  box.innerHTML=`<div class="card-head" style="margin:0"><div><h3>Anexos</h3><div class="sub">${esc(ANEXO_NOTA)}</div></div>${pd?'<label class="btn-file">Anexar arquivos<input type="file" id="o_files" multiple></label>':''}</div>
    <ul class="anexos">${an.map(a=>`<li><a href="#" data-anexo="${esc(a.id)}"><span class="ext">${esc((a.nome.split('.').pop()||'').slice(0,4).toUpperCase())}</span>${esc(a.nome)}</a><span class="note">${esc(tam(a.tamanho))} · ${esc(a.porNome||'')} em ${esc(fmtD(dia(a.criadoEm)))}</span>${pd?`<button type="button" class="ico" data-anexo-del="${esc(a.id)}" aria-label="Remover ${esc(a.nome)}">✕</button>`:''}</li>`).join('')||'<li class="note">Nenhum arquivo anexado.</li>'}</ul>
    <div class="err" id="o_ferr">${esc(S.extraErr||'')}</div>
    <div class="card-head" style="margin:16px 0 0"><div><h3>Envios para pré-vendas</h3><div class="sub">A pessoa escolhida recebe a oportunidade e os anexos por e-mail, e você recebe uma cópia.</div></div>${pd?'<button type="button" class="blue" id="o_enviar">Enviar para pré-vendas</button>':''}</div>
    <ul class="envios">${ev.map(e=>{const s=ST_ENVIO[e.status]||['',e.status];return `<li><div><b>${esc(fmtDH(e.enviadoEm))}</b> · ${esc(e.porNome||'')} → ${esc(e.paraNome)} &lt;${esc(e.paraEmail)}&gt;</div><span class="note">Cópia para ${esc(e.cc||'—')} · ${nf((e.anexos||[]).length)} anexo${(e.anexos||[]).length===1?'':'s'} · <span class="cob ${s[0]}">${esc(s[1])}</span>${e.erro?' · '+esc(e.erro):''}</span></li>`;}).join('')||'<li class="note">Nenhum envio ainda.</li>'}</ul>`;
  const fi=box.querySelector('#o_files');if(fi)fi.addEventListener('change',async()=>{const fs=[...fi.files];if(!fs.length)return;fi.disabled=true;$('#o_ferr').textContent='Enviando '+fs.length+' arquivo'+(fs.length>1?'s':'')+'…';
    S.extraErr='';try{const r=await anexar(o,fs);S.extraErr=r.erros.join(' ');if(r.ok)toast(`${r.ok} arquivo${r.ok>1?'s':''} anexado${r.ok>1?'s':''}`);}catch(err){S.extraErr='Não foi possível anexar: '+(err&&err.message||'tente de novo.');}
    finally{fi.disabled=false;fi.value='';await carregarExtras(o);}});
  box.querySelectorAll('[data-anexo]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const x=an.find(y=>String(y.id)===a.dataset.anexo);x&&abrirAnexo(x);}));
  box.querySelectorAll('[data-anexo-del]').forEach(b=>b.addEventListener('click',async()=>{const x=an.find(y=>String(y.id)===b.dataset.anexoDel);if(!x)return;
    if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Remover?';b.classList.add('danger');setTimeout(()=>{if(b.isConnected){b.dataset.conf='';b.textContent='✕';b.classList.remove('danger');}},4000);return;}
    S.extraErr='';try{await removerAnexo(x);toast('Anexo removido');}catch(err){S.extraErr='Não foi possível remover: '+(err&&err.message||'');}await carregarExtras(o);}));
  const be=box.querySelector('#o_enviar');if(be)be.addEventListener('click',()=>envioForm(o));}
function corpoEnvio(o,nome){return `Olá${nome?', '+nome.split(' ')[0]:''},

Segue a oportunidade nº ${o.numero} para análise de pré-vendas.

Cliente: ${o.cliente||''}
Oportunidade: ${o.titulo||''}
Gerente: ${o.gerente||''}
Etapa: ${o.status||''} (${o.probabilidade??0}%)${OPEN.has(o.status)?' · '+catDe(o):''}
Valor total: ${brl(o.valorTotal||0)} · no ano: ${brl(vAno(o))}
Fechamento previsto: ${fmtD(o.fechamento)||'—'}
Fabricante / parceiro: ${[o.software,o.parceiro].filter(Boolean).join(' / ')||'—'}
Próximo passo: ${o.proximoPasso||'—'}${o.observacoes?'\n\nObservações: '+o.observacoes:''}

Atenciosamente,
${nomeAutor()}`;}
function envioForm(o){const pv=prevendasAtivos(),an=anexosDe(o.numero),u=usuarioAtual();
  openDrawer(`<div class="card-head" style="margin:0"><div><span class="eyebrow">Enviar para pré-vendas</span><h2 style="font-size:20px">Nº ${esc(o.numero)} · ${esc(o.cliente)}</h2></div><button class="ghost" data-close>Fechar</button></div>
    ${pv.length?'':'<div class="banner warn">Nenhuma pessoa de pré-vendas cadastrada. O administrador cadastra em Configurações > Pré-vendas.</div>'}
    <form class="form" id="envF">
      <label class="full">Para (pré-vendas)<select id="e_para" required><option value=""></option>${pv.map(p=>`<option value="${esc(p.id)}">${esc(p.nome)} · ${esc(p.email)}</option>`).join('')}</select></label>
      <label class="full">Cópia para o seu e-mail corporativo<input id="e_cc" type="email" required value="${esc(u.email||'')}" ${ENVIO_REAL?'readonly':''} placeholder="voce@almaviva..."></label>
      <label class="full">Assunto<input id="e_ass" required maxlength="200" value="${esc(`Oportunidade nº ${o.numero} · ${o.cliente||''} · ${o.titulo||''}`)}"></label>
      <label class="full">Mensagem<textarea id="e_msg" rows="12">${esc(corpoEnvio(o,''))}</textarea></label>
      <div class="full"><span class="lbl">Anexos</span>${an.length?an.map(a=>`<label class="chk"><input type="checkbox" value="${esc(a.id)}" checked> ${esc(a.nome)} <span class="note">${esc(tam(a.tamanho))}</span></label>`).join(''):'<p class="note" style="margin:4px 0 0">Nenhum anexo. Se precisar, anexe os arquivos na oportunidade antes de enviar.</p>'}</div>
      <div class="full note">${esc(ENVIO_NOTA)}</div><div class="full err" id="e_err"></div>
      <div class="full actions"><button type="button" class="ghost" id="e_voltar">Voltar para a oportunidade</button><button class="blue" ${pv.length?'':'disabled'}>Enviar</button></div>
    </form>`,d=>{
    d.querySelector('#e_voltar').addEventListener('click',()=>oppForm(o));
    d.querySelector('#e_para').addEventListener('change',e=>{const p=pv.find(x=>String(x.id)===e.target.value),m=d.querySelector('#e_msg');if(p&&/^Olá[^\n]*\n/.test(m.value))m.value=m.value.replace(/^Olá[^\n]*\n/,`Olá, ${p.nome.split(' ')[0]},\n`);});
    d.querySelector('#envF').addEventListener('submit',async e=>{e.preventDefault();const p=pv.find(x=>String(x.id)===d.querySelector('#e_para').value);if(!p)return;
      const btn=d.querySelector('#envF button.blue'),ids=[...d.querySelectorAll('.chk input:checked')].map(c=>c.value);
      const env={prevendasId:p.id,paraNome:p.nome,paraEmail:p.email,cc:d.querySelector('#e_cc').value.trim(),assunto:d.querySelector('#e_ass').value.trim(),mensagem:d.querySelector('#e_msg').value,
        anexoIds:ids,anexos:an.filter(a=>ids.includes(String(a.id))).map(a=>a.nome)};
      btn.disabled=true;btn.textContent='Enviando…';d.querySelector('#e_err').textContent='';
      try{const r=await enviar(o,env);await carregarExtras(o);
        if(r.status==='erro'){d.querySelector('#e_err').textContent='O e-mail não saiu: '+(r.erro||'erro no envio')+'. O envio ficou registrado como falho.';btn.disabled=false;btn.textContent='Tentar de novo';return;}
        aposEnvio(o,env,r);}
      catch(err){d.querySelector('#e_err').textContent='Não foi possível enviar: '+(err&&err.message||'tente de novo.');btn.disabled=false;btn.textContent='Enviar';}});});}
// ---- Configurações > Pré-vendas ----
function renderPrevendas(){const L=S.prevendas||[],ro=!ADMIN;
  $('#tbPrev').innerHTML=`<thead><tr><th>Nome</th><th>E-mail</th><th>Situação</th><th></th></tr></thead><tbody>${
    L.map((p,i)=>`<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.email)}</td><td>${p.ativo===false?'<span class="tag off">Inativo</span>':'<span class="tag win">Ativo</span>'}</td>      <td class="r">${ro?'':`<button class="ico" data-prev-ed="${i}">Editar</button>`}</td></tr>`).join('')||'<tr><td colspan="4" class="note">Ninguém cadastrado. Use "Nova pessoa" para cadastrar quem recebe as oportunidades.</td></tr>'}</tbody>`;
  $('#btnNovoPrev').disabled=ro;}
function prevForm(i){const L=S.prevendas||[],p=i==null?{nome:'',email:'',ativo:true}:L[i];
  openDrawer(`<div class="card-head" style="margin:0"><h2 style="font-size:22px">${i==null?'Nova pessoa de pré-vendas':'Editar pré-vendas'}</h2><button class="ghost" data-close>Fechar</button></div>
    <form class="form" id="prevF"><label class="full">Nome<input id="p_nome" required value="${esc(p.nome)}"></label><label class="full">E-mail corporativo<input id="p_email" type="email" required value="${esc(p.email)}"></label>
      <label class="full chk"><input type="checkbox" id="p_ativo" ${p.ativo!==false?'checked':''}> Ativo (aparece na lista de envio)</label>
      <div class="full err" id="p_err"></div><div class="full actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="blue">Salvar</button></div></form>`,d=>{
    d.querySelector('#prevF').addEventListener('submit',async e=>{e.preventDefault();if(!ADMIN)return;
      const n={...p,nome:$('#p_nome').value.trim(),email:$('#p_email').value.trim().toLowerCase(),ativo:$('#p_ativo').checked};
      if(L.some((x,j)=>j!==i&&x.email.toLowerCase()===n.email)){$('#p_err').textContent='Esse e-mail já está cadastrado.';return;}
      if(!n.id)n.id=Date.now().toString(36);
      const nova=i==null?[...L,n]:L.map((x,j)=>j===i?n:x);
      try{await salvarPrevendas(nova);closeDrawer();toast('Pré-vendas salvo');}catch(err){$('#p_err').textContent='Não foi possível salvar: '+(err&&err.message||'');}});});}
$('#btnNovoPrev').addEventListener('click',()=>prevForm(null));
$('#tbPrev').addEventListener('click',e=>{const b=e.target.closest('[data-prev-ed]');if(b)prevForm(+b.dataset.prevEd);});

// ---- produção: arquivos no Supabase Storage, e-mail pela função enviar-oportunidade ----
const ENVIO_REAL=true;
const ANEXO_NOTA='Qualquer tipo de arquivo, até 50 MB cada.';
const ENVIO_NOTA='O CRM envia o e-mail com os anexos para a pessoa escolhida, com cópia para o e-mail da sua conta, e registra o envio aqui.';
async function anexar(o,files){const r={ok:0,erros:[]};
  for(const f of files){if(f.size>50*1048576){r.erros.push(`${f.name}: maior que 50 MB.`);continue;}
    try{await api.anexar(o.numero,f,userId,nomeAutor());r.ok++;}catch(err){r.erros.push(`${f.name}: ${err&&err.message||'não foi possível enviar'}.`);}}
  return r;}
async function abrirAnexo(a){try{const u=await api.urlAnexo(a.caminho);window.open(u,'_blank','noopener');}catch(err){toast('Não foi possível abrir o arquivo.');}}
async function removerAnexo(a){await api.removerAnexo(a);}
async function carregarExtras(o){try{const [a,e]=await Promise.all([api.anexos(o.numero),api.envios(o.numero)]);S.anexos=a;S.envios=e;}catch(err){}renderExtras(o);}
async function enviar(o,e){return api.enviarOportunidade({numero:o.numero,prevendasId:e.prevendasId,assunto:e.assunto,mensagem:e.mensagem,anexoIds:e.anexoIds});}
function aposEnvio(o,e){toast(`E-mail enviado para ${e.paraNome}, com cópia para você`);oppForm(S.opps.find(x=>String(x.numero)===String(o.numero))||o);}
async function salvarPrevendas(l){await api.salvarPrevendas(l);S.prevendas=await api.prevendas();renderAll();}
/* ================= roteamento ================= */
const cur=()=>{const h=location.hash.slice(1);return VIEWS.includes(h)?h:(VIEWS[0]||null);};
function renderAll(){
  aplicarAcesso();
  const v=cur(); TODAS_VIEWS.forEach(n=>{$('#v-'+n).hidden=n!==v;}); $('#hero').hidden=v!=='painel';
  $('#semAcesso').hidden=!!v; if(!v)return;
  document.querySelectorAll('#nav a').forEach(a=>{if(a.getAttribute('href')==='#'+v)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const gl=gerentes(); ['#fGerC'].forEach(id=>{const c=$(id).value;$(id).innerHTML=opts(gl,c,'Todos os gerentes');});
  ({painel:renderPainel,oportunidades:renderOpps,clientes:renderClientes,faturamento:renderFat,relatorios:renderRelatorios,reuniao:renderReuniao,config:renderConfig})[v]();
}
window.addEventListener('hashchange',()=>{renderAll();window.scrollTo(0,0);});
$('#fAno').addEventListener('change',e=>{S.ano=e.target.value;S.metaDirty=false;renderAll();recarregar('metas');});
$('#btnLimpar').addEventListener('click',()=>{S.sel.clear();S.areas.clear();if(GER_FIXO)S.sel.add(GER_FIXO);S.ano='2026';$('#fAno').value='2026';S.p={cli:'',fab:'',area:'',res:'gp'};renderAll();});
[['#pCli','cli'],['#pFab','fab'],['#pArea','area'],['#pRes','res']].forEach(([id,k])=>$(id).addEventListener('change',e=>{S.p[k]=e.target.value;renderPipeline(base());}));
$('#btnLimparP').addEventListener('click',()=>{S.p={cli:'',fab:'',area:'',res:'gp'};renderPipeline(base());});
$('#simR').addEventListener('input',e=>{S.sim.pct=+e.target.value;renderSim(base());});
$('#simPresets').addEventListener('click',e=>{const x=e.target.closest('button');if(!x)return;S.sim.pct=+x.dataset.p;renderSim(base());});
$('#simEx').addEventListener('change',e=>{S.sim.ex=e.target.checked;renderSim(base());});
$('#evFab').addEventListener('change',e=>{S.evFab=e.target.value;renderEvol(base());});
$('#qOpp').addEventListener('input',renderOpps);$('#fStatus').addEventListener('change',renderOpps);$('#fTeam').addEventListener('change',renderOpps);
$('#qCli').addEventListener('input',renderClientes);$('#fGerC').addEventListener('change',renderClientes);
let rT;window.addEventListener('resize',()=>{clearTimeout(rT);rT=setTimeout(()=>{if(cur()==='painel')renderHero(base());},200);});

/* ================= painel lateral ================= */
function openDrawer(html,onMount){const root=$('#drawerRoot');
  root.innerHTML=`<div class="drawer-bg" data-close></div><aside class="drawer" role="dialog" aria-modal="true">${html}</aside>`;
  root.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeDrawer));
  onMount&&onMount(root.querySelector('.drawer'));const f=root.querySelector('input,select,textarea');f&&f.focus();}
function closeDrawer(){$('#drawerRoot').innerHTML='';}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
const gerForm=()=>{const c=S.gerCad.filter(g=>g.ativo!==false).map(g=>g.nome);return c.length?uniq(c):gerentes();};

function oppForm(o,preCli){
  const isNew=!o; const ro=S.readOnly||!(isNew?pode('criar_oportunidades'):pode('editar_oportunidades')); o=o||{status:(STATUS.find(s=>s.open&&s.ativa!==false)||STATUS[0]).k,probabilidade:(STATUS.find(s=>s.open&&s.ativa!==false)||STATUS[0]).p,gerente:S.sel.size===1?[...S.sel][0]:'',cadastro:TODAY_ISO,cliente:preCli||''};
  const clis=S.clientes.map(c=>c.nome).sort((a,b)=>a.localeCompare(b,'pt'));
  openDrawer(`
    <div class="card-head" style="margin:0"><h2 style="font-size:22px">${isNew?'Nova oportunidade':'Oportunidade nº '+esc(o.numero)+` <button type="button" class="ghost num-copy" data-copiar-num="${esc(o.numero)}">Copiar nº</button>`}</h2><button class="ghost" data-close>Fechar</button></div>
    ${ro?'<div class="banner warn">Você pode ver, mas não editar, esta oportunidade.</div>':''}
    <form class="form" id="oppF">
      <label class="full">Oportunidade<input id="o_titulo" required value="${esc(o.titulo)}"></label>
      <label>Cliente<input id="o_cliente" list="dlCli" required value="${esc(o.cliente)}"><datalist id="dlCli">${clis.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label>
      <label>Gerente<select id="o_gerente" required><option value=""></option>${opts(gerForm(),o.gerente)}</select></label>
      <label>Etapa<select id="o_status">${opts(STATUS.filter(s=>s.ativa!==false||s.k===o.status).map(s=>s.k),o.status)}</select></label>
      <label>Probabilidade (%)<input id="o_prob" type="number" min="0" max="100" step="5" value="${esc(o.probabilidade)}"></label>
      <label>Categoria de forecast<select id="o_cat"><option value="">Automática (pela probabilidade)</option>${opts(CATS,CATS.includes(o.categoria)?o.categoria:'')}</select><span class="note" id="o_catNota"></span></label>
      <label>Próximo passo<input id="o_pp" value="${esc(o.proximoPasso||'')}" placeholder="Ex.: reunião técnica com o cliente"></label>
      <label>Data do próximo passo<input id="o_ppd" type="date" value="${esc(o.proximoPassoData||'')}"></label>
      <label>Área de negócio<select id="o_area">${opts(opcoes('area',o.area),o.area||'','')}</select></label>
      <label>Tipo de revenda<select id="o_rev">${opts(opcoes('revenda',o.revenda),o.revenda||'','')}</select></label>
      <label>Fabricante<select id="o_soft">${opts(opcoes('fabricante',o.software),o.software||'','')}</select></label>
      <label>Parceiro<select id="o_parc">${opts(opcoes('parceiro',o.parceiro),o.parceiro||'','')}</select></label>
      <label>Origem da oportunidade<select id="o_orig" ${isNew?'required':''}>${opts(opcoes('origem',o.origemOpp),o.origemOpp||'','')}</select></label>
      <label id="o_odetL" hidden></label>
      <fieldset class="full team-box"><legend>Team members <span class="note">(especialistas que trabalham na oportunidade além do gerente)</span></legend>${(t=>t.length?t.map(v=>`<label class="chk"><input type="checkbox" value="${esc(v)}" ${(o.team||[]).includes(v)?'checked':''} ${ro?'disabled':''}> ${esc(v)}</label>`).join(''):'<span class="note">Nenhum especialista cadastrado ainda. Quem tem acesso às Configurações cadastra em Listas de opções &gt; Team members.</span>')(uniq([...opcoes('team'),...(o.team||[])]))}</fieldset>
      <label>Valor de serviço (R$)<input id="o_vs" type="number" min="0" step="1000" value="${esc(o.valorServico||0)}"></label>
      <label>Valor de software (R$)<input id="o_vsw" type="number" min="0" step="1000" value="${esc(o.valorSoftware||0)}"></label>
      <label>Faturamento de serviço no ano (R$)<input id="o_fs" type="number" min="0" step="1000" value="${esc(o.faturamentoServico||0)}"></label>
      <label>Software no ano (R$)<input id="o_sa" type="number" min="0" step="1000" value="${esc(o.softwareAno||0)}"></label>
      <label>Cadastro<input id="o_cad" type="date" value="${esc(o.cadastro||'')}"></label>
      <label>Fechamento previsto<input id="o_fech" type="date" required value="${esc(o.fechamento||'')}"></label>
      <label class="full">Observações<textarea id="o_obs">${esc(o.observacoes||'')}</textarea></label>
      <div class="full note" id="o_total"></div><div class="full err" id="o_err"></div>
      <div class="full actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="blue" ${ro?'disabled':''}>${isNew?'Cadastrar':'Salvar alterações'}</button></div>
    </form>${isNew?'<p class="note" style="margin:0">O número da oportunidade é gerado ao cadastrar. Depois de cadastrar, você pode anexar arquivos e enviar para pré-vendas.</p>':'<section class="opp-extra" id="oExtra"></section>'}`,d=>{
      if(!isNew){S.extraErr='';renderExtras(o);carregarExtras(o);}
      const odet=()=>{const v=$('#o_orig').value,t=origemDet(v),L=$('#o_odetL'),cur=v===o.origemOpp?(o.origemDet||''):(($('#o_odet')||{}).value||'');L.hidden=!t;
        L.innerHTML=!t?'':esc(DET_ORIGEM[t])+(t==='texto'?`<input id="o_odet" required value="${esc(cur)}" placeholder="Ex.: nome do evento ou de quem indicou">`:`<select id="o_odet" required>${opts(detOpcoes(t,cur),cur,'')}</select>`);
        if(ro&&$('#o_odet'))$('#o_odet').disabled=true;};
      $('#o_orig').addEventListener('change',odet);odet();
      const bc=d.querySelector('[data-copiar-num]');if(bc)bc.addEventListener('click',()=>copiar(bc.dataset.copiarNum,`Número ${bc.dataset.copiarNum} copiado`));
      const tot=()=>{$('#o_total').textContent=`Valor total: ${brl((+$('#o_vs').value||0)+(+$('#o_vsw').value||0))} · Valor no ano (usado no forecast): ${brl((+$('#o_fs').value||0)+(+$('#o_sa').value||0))}`;};
      ['#o_vs','#o_vsw','#o_fs','#o_sa'].forEach(s=>$(s).addEventListener('input',tot));tot();
      $('#o_status').addEventListener('change',e=>{$('#o_prob').value=ST[e.target.value]?.p??$('#o_prob').value;});
      const catNota=()=>{const st=$('#o_status').value,ab=OPEN.has(st);$('#o_cat').disabled=!ab||ro;
        $('#o_catNota').textContent=!ab?(st===WON?'Etapa ganha: entra como Fechado.':'Etapa encerrada: sai do forecast.'):$('#o_cat').value?'Definida pelo gerente.':`Sugerida agora: ${catSugerida({probabilidade:+$('#o_prob').value||0})}.`;};
      ['#o_status','#o_prob','#o_cat'].forEach(s=>{$(s).addEventListener('change',catNota);$(s).addEventListener('input',catNota);});catNota();
      d.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeDrawer));
      $('#oppF').addEventListener('submit',async e=>{e.preventDefault();if(ro)return;if(S.readOnly)return;
        const nome=$('#o_cliente').value.trim();const c=S.clientes.find(x=>x.nome.toLowerCase()===nome.toLowerCase());
        const data={...o,titulo:$('#o_titulo').value.trim(),cliente:c?c.nome:nome,clienteId:c?c.id:slug(nome),gerente:$('#o_gerente').value,status:$('#o_status').value,
          probabilidade:Math.max(0,Math.min(100,+$('#o_prob').value||0)),area:$('#o_area').value,revenda:$('#o_rev').value||null,software:$('#o_soft').value||null,parceiro:$('#o_parc').value||null,origemOpp:$('#o_orig').value||null,team:[...document.querySelectorAll('.team-box input:checked')].map(i=>i.value),origemDet:(!$('#o_odetL').hidden&&$('#o_odet')?$('#o_odet').value.trim():'')||null,
          valorServico:+$('#o_vs').value||0,valorSoftware:+$('#o_vsw').value||0,faturamentoServico:+$('#o_fs').value||0,softwareAno:+$('#o_sa').value||0,
          cadastro:$('#o_cad').value||null,fechamento:$('#o_fech').value||null,observacoes:$('#o_obs').value.trim(),atualizadoEm:new Date().toISOString(),
          categoria:OPEN.has($('#o_status').value)?($('#o_cat').value||null):null,proximoPasso:$('#o_pp').value.trim(),proximoPassoData:$('#o_ppd').value||null};
        data.valorTotal=data.valorServico+data.valorSoftware;
        // histórico para os selos de risco (no app de produção o banco também calcula, por gatilho)
        if(isNew||o.status!==data.status)data.etapaDesde=new Date().toISOString();
        if(!isNew&&o.fechamento&&data.fechamento&&data.fechamento>o.fechamento)data.adiamentos=(Number(o.adiamentos)||0)+1;
        if(isNew){delete data.numero;data.origem='crm';}
        delete data.id;
        try{ if(!c)await api.salvarCliente({id:data.clienteId,nome,gerente:data.gerente,segmento:'',siglasFaturamento:[],origem:'crm'},userId);
          const salvo=await api.salvarOpp(data,userId);await recarregar();if(isNew)numeroCriado(salvo);else{closeDrawer();toast('Alterações salvas');}}
        catch(err){writeErr(err,'#o_err');}
      });});
}
const semPermissao=e=>e&&(e.code==='42501'||/row-level security|permission/i.test(e.message||''));
function writeErr(err,sel){if(semPermissao(err))$(sel).textContent='Você não tem permissão para gravar este registro (só a carteira do próprio gerente pode ser alterada).';
  else $(sel).textContent='Não foi possível salvar: '+(err&&err.message||'tente de novo em alguns segundos.');}

function cliForm(c){const isNew=!c;const ro=S.readOnly||!pode('editar_clientes');c=c||{gerente:S.sel.size===1?[...S.sel][0]:'',segmento:'Público'};
  openDrawer(`<div class="card-head" style="margin:0"><h2 style="font-size:22px">${isNew?'Novo cliente':'Editar cliente'}</h2><button class="ghost" data-close>Fechar</button></div>
    <form class="form" id="cliF">
      <label class="full">Nome<input id="c_nome" required value="${esc(c.nome)}"></label>
      <label>Gerente da conta<select id="c_ger"><option value=""></option>${opts(gerForm(),c.gerente)}</select></label>
      <label>Segmento<select id="c_seg">${opts(opcoes('segmento',c.segmento),c.segmento||'','')}</select></label>
      <label>CNPJ<input id="c_cnpj" value="${esc(c.cnpj||'')}" inputmode="numeric"></label>
      <label>Contato principal<input id="c_cont" value="${esc(c.contato||'')}"></label>
      <label class="full">Nome no faturamento (siglas, separadas por vírgula)<input id="c_sig" value="${esc((c.siglasFaturamento||[]).join(', '))}"></label>
      <div class="full err" id="c_err"></div>
      <div class="full actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="blue" ${ro?'disabled':''}>${isNew?'Cadastrar':'Salvar'}</button></div>
    </form>`,()=>{
      $('#cliF').addEventListener('submit',async e=>{e.preventDefault();if(ro)return;if(S.readOnly)return;
        const nome=$('#c_nome').value.trim();const id=isNew?slug(nome):c.id;
        if(isNew&&S.clientes.some(x=>x.id===id)){$('#c_err').textContent='Já existe um cliente com esse nome.';return;}
        const data={nome,gerente:$('#c_ger').value,segmento:$('#c_seg').value,cnpj:$('#c_cnpj').value.trim(),contato:$('#c_cont').value.trim(),
          siglasFaturamento:$('#c_sig').value.split(',').map(s=>s.trim()).filter(Boolean),origem:c.origem||'crm',atualizadoEm:new Date().toISOString()};
        try{await api.salvarCliente({id,...data},userId);await recarregar('clientes');closeDrawer();toast(isNew?'Cliente cadastrado':'Cliente salvo');}catch(err){writeErr(err,'#c_err');}});});}

function cliDetail(id){
  const c=S.clientes.find(x=>x.id===id)||{id,nome:(S.fat.find(r=>r.clienteId===id)||{}).cliente||id};
  const o=S.opps.filter(x=>x.clienteId===id).sort((a,b)=>(b.fechamento||'').localeCompare(a.fechamento||''));
  const f=S.fat.filter(r=>r.clienteId===id),s=cliStats(id);
  openDrawer(`<div class="card-head" style="margin:0"><h2 style="font-size:22px">${esc(c.nome)}</h2><button class="ghost" data-close>Fechar</button></div>
    <dl class="facts"><dt>Gerente da conta</dt><dd>${esc(c.gerente||'—')}</dd><dt>Segmento</dt><dd>${esc(c.segmento||'—')}</dd><dt>Faturado 2026</dt><dd>${esc(brl(s.fat))}</dd><dt>Pipeline aberto</dt><dd>${esc(brl(s.pip))}</dd><dt>No faturamento como</dt><dd>${esc((c.siglasFaturamento||[]).join(', ')||'—')}</dd></dl>
    <div class="actions" style="justify-content:flex-start">${S.clientes.find(x=>x.id===id)?'<button id="btnEdCli">Editar cliente</button>':''}<button class="blue" id="btnOppCli">Nova oportunidade</button></div>
    ${s.fat?'<div><h3>Faturamento por mês</h3><div id="chCli"></div></div>':''}
    <div><h3>Oportunidades (${o.length})</h3><div class="scroll"><table><thead><tr><th>Nº</th><th>Oportunidade</th><th>Etapa</th><th class="r">Valor</th><th>Fech.</th></tr></thead><tbody>
    ${o.map(x=>`<tr class="click" data-opp="${esc(x.id)}"><td>${esc(x.numero)}</td><td class="w">${esc(x.titulo)}</td><td>${tagSt(x.status)}</td><td class="r">${esc(M(x.valorTotal))}</td><td>${esc(fmtD(x.fechamento))}</td></tr>`).join('')||'<tr><td colspan="5" class="note">Nenhuma oportunidade cadastrada.</td></tr>'}</tbody></table></div></div>`,d=>{
      if(s.fat)vbars(d.querySelector('#chCli'),MES.slice(0,11).map((m,i)=>({l:m,v:sum(f.filter(r=>r.mes===`2026-${String(i+1).padStart(2,'0')}`),r=>r.valor)})),{h:210,label:'Faturamento do cliente'});
      d.querySelector('#btnEdCli')?.addEventListener('click',()=>cliForm(S.clientes.find(x=>x.id===id)));
      d.querySelector('#btnOppCli').addEventListener('click',()=>oppForm(null,c.nome));});
}
document.addEventListener('click',e=>{const r=e.target.closest('[data-opp],[data-cli]');if(!r)return;
  if(r.dataset.opp){const o=S.opps.find(x=>x.id===r.dataset.opp);o&&oppForm(o);}else if(r.dataset.cli)cliDetail(r.dataset.cli);});
$('#btnNovaOpp').addEventListener('click',()=>oppForm(null));$('#btnNovoCli').addEventListener('click',()=>cliForm(null));

/* ================= carga ================= */
function setStatus(m,w){const s=$('#status');s.hidden=!m;s.textContent=m||'';s.classList.toggle('warn',!!w);}
async function recarregar(qual?:string){
  try{
    if(!qual||qual==='oportunidades')S.opps=await api.oportunidades();
    if(!qual||qual==='clientes')S.clientes=await api.clientes();
    if(!qual||qual==='running_previsto')S.running=await api.running();
    if(!qual||qual==='etapas')aplicarEtapas(await api.etapas());
    if(!qual||qual==='gerentes')S.gerCad=await api.gerentes();
    if(!qual||qual==='opcoes')S.listas=await api.listas();
    if(!qual||qual==='papeis')S.papeis=await api.papeis();
    if(!qual||qual==='parametros')S.param=await api.parametros();
    if(!qual||qual==='prevendas')S.prevendas=await api.prevendas();
    if(!qual||qual==='fotos_pipeline')S.fotos=await api.fotos(TODAY_ISO);
    if((!qual||qual==='acoes')&&(pode('ver_reuniao')||pode('registrar_acoes'))){S.acoes=await api.acoes();aposAcoes();}
    if(ADMIN&&(!qual||qual==='usuarios'||qual==='perfis'||qual==='convites'))S.usuarios=await api.usuarios();
    if(!qual||qual==='metas'){S.metasDoc=await api.metasDetalhe(+S.ano);S.metas=S.metasDoc.valores;}
    renderAll();
  }catch(e){setStatus('Não foi possível atualizar os dados: '+(e.message||e),true);}
}
const mostrarNome=()=>{$('#userNome').textContent=`${perfil.nome} · ${(papeisAtuais()[perfil.papel]||{nome:perfil.papel}).nome}`;};
mostrarNome();
renderAll();
(async()=>{
  try{
    const [o,c,f,m,r,et,gc,ls,pp,pr,pv]=await Promise.all([api.oportunidades(),api.clientes(),api.faturamento(),api.metasDetalhe(+S.ano),api.running(),api.etapas(),api.gerentes(),api.listas(),api.papeis(),api.parametros(),api.prevendas()]);
    aplicarEtapas(et);S.opps=o;S.clientes=c;S.fat=f;S.metasDoc=m;S.metas=m.valores;S.running=r;S.gerCad=gc;S.listas=ls;S.papeis=pp;S.param=pr;S.prevendas=pv;aplicarAcesso();mostrarNome();if(pode('ver_reuniao')||pode('registrar_acoes'))S.acoes=await api.acoes().catch(()=>[]);if(ADMIN)S.usuarios=await api.usuarios().catch(()=>[]);
    setStatus(o.length?'':'Ainda não há oportunidades. Use "Nova oportunidade" para registrar a primeira.');
    renderAll();
    // foto semanal: o banco tira toda segunda (pg_cron); se ainda não houver a da semana, pede agora
    api.tirarFoto().catch(()=>{}).then(()=>api.fotos(TODAY_ISO)).then(fs=>{S.fotos=fs;renderAll();}).catch(()=>{});
    let t;api.aoVivo(tab=>{clearTimeout(t);t=setTimeout(()=>recarregar(tab),300);});
  }catch(e){setStatus('Não foi possível carregar os dados: '+(e.message||e),true);$('#liveTxt').textContent='Sem conexão aos dados';}
})();
}
