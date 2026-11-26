// @ts-nocheck
// Lógica das telas (painel, oportunidades, clientes, faturamento).
// Portado do protótipo; ver README > Próximos passos para a migração a componentes tipados.
import { api, type Perfil } from './supabase';

export function iniciarApp(perfil: Perfil, userId: string){

/* ================= constantes ================= */
const STATUS=[
  {k:'Qualificação',p:10,open:true},{k:'Orçamento',p:30,open:true},{k:'Proposta',p:50,open:true},
  {k:'Forecast',p:70,open:true},{k:'Negociação',p:90,open:true},{k:'Encerrada - Ganha',p:100},
  {k:'Encerrada - Perdida',p:0},{k:'Encerrada - Abandonada',p:0},{k:'Encerrada - Encerrada pelo Sistema',p:0}];
const ST=Object.fromEntries(STATUS.map(s=>[s.k,s]));
const OPEN=new Set(STATUS.filter(s=>s.open).map(s=>s.k));
const WON='Encerrada - Ganha';
const FUNNEL=[...OPEN,WON];
const AREAS=['Revenda','Consultoria','Desenvolvimento de Soluções','Serviços de Infra-estrutura de TI'];
const MES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESL=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const HIDE_GER=new Set(['Sem gerente','Parcerias']);
const TODAY=new Date(); const TODAY_ISO=TODAY.toISOString().slice(0,10);

const S:any={opps:[],clientes:[],fat:[],metas:{},running:{},readOnly:false,loaded:{o:false,c:false},
  sel:new Set(),ano:'2026',p:{cli:'',fab:'',area:'',res:'gp'},sim:{pct:60,ex:false},evFab:'',
  f:{q:'',per:'',ger:'',cli:'',tec:'',tip:'',bu:'',ter:'',st:'',page:0}};

const GER_FIXO=perfil.papel==='gerente'?perfil.gerente:null;
if(GER_FIXO)S.sel.add(GER_FIXO);
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
const tagSt=s=>`<span class="tag ${s===WON?'win':s&&s.startsWith('Encerrada')?'lost':''}">${esc(s)}</span>`;
const opts=(list,sel,all)=>(all!==undefined?`<option value="">${esc(all)}</option>`:'')+list.map(v=>`<option ${v===sel?'selected':''}>${esc(v)}</option>`).join('');
const uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'pt'));

/* ================= recortes ================= */
function gerentes(){return uniq([...Object.keys(S.metas),...S.opps.map(o=>o.gerente),...S.fat.map(r=>r.gerente)]).filter(g=>!HIDE_GER.has(g));}
const inSel=g=>!S.sel.size||S.sel.has(g);
function selOpps(){return S.opps.filter(o=>inSel(o.gerente));}
function selFat(){return S.fat.filter(r=>inSel(r.gerente));}
function metaSel(){const k=S.sel.size?[...S.sel]:Object.keys(S.metas);return sum(k,g=>S.metas[g]||0);}
function runKey(){return (S.sel.size?[...S.sel].sort().join('|'):'todos')+'@'+S.ano;}
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
  if(GER_FIXO){$('#msGer').innerHTML=`<button type="button" disabled><span>${esc(GER_FIXO)}</span><span class="cnt">1</span></button>`;$('#gerHint').textContent='Você vê a sua carteira.';return;}
  const all=gerentes(); const n=S.sel.size;
  const lbl=!n?'Todos os gerentes':n===1?[...S.sel][0]:`${n} gerentes`;
  const box=$('#msGer'); const open=box.querySelector('.ms-pop')&&!box.querySelector('.ms-pop').hidden;
  box.innerHTML=`<button type="button" aria-haspopup="true" aria-expanded="${open}"><span>${esc(lbl)}</span><span class="cnt">${n||all.length}</span></button>
    <div class="ms-pop" ${open?'':'hidden'}>${all.map(g=>`<label><input type="checkbox" value="${esc(g)}" ${S.sel.has(g)?'checked':''}>${esc(g)}${S.metas[g]?` <span class="note">· meta ${esc(M(S.metas[g]))}</span>`:''}</label>`).join('')}</div>`;
  $('#gerHint').textContent=`${n||all.length} de ${all.length} gerentes compõem os números atuais.`;
}
document.addEventListener('click',e=>{const box=$('#msGer');
  if(box.contains(e.target)){ if(e.target.closest('button')){const p=box.querySelector('.ms-pop');p.hidden=!p.hidden;box.querySelector('button').setAttribute('aria-expanded',!p.hidden);} return;}
  const p=box.querySelector('.ms-pop'); if(p&&!p.hidden){p.hidden=true;}
});
$('#msGer').addEventListener('change',e=>{if(GER_FIXO)return;const v=e.target.value;if(e.target.checked)S.sel.add(v);else S.sel.delete(v);renderAll();});

function renderHero(b){
  const one=S.sel.size===1?[...S.sel][0]:null;
  $('#hName').textContent=one||(S.sel.size?`${S.sel.size} gerentes selecionados`:'Comercial Almaviva');
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
     <button class="blue" id="runBtn" style="padding:6px 10px" ${S.readOnly?'disabled':''}>Aplicar à projeção</button></div>
   <div class="kpi" ${w(b.proj)}><span class="l">Projeção combinada</span><span class="v num">${esc(M(b.proj))}</span><span class="s">${b.meta?(b.proj>=b.meta?'superaria em '+M(b.proj-b.meta):'faltariam '+M(b.meta-b.proj)):'realizado + forecast + running'}</span></div>`;
  $('#runBtn').addEventListener('click',saveRunning);
}
async function saveRunning(){
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
  const gs=(S.sel.size?[...S.sel]:gerentes());
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
  $('#pArea').innerHTML=opts(AREAS,S.p.area,'Todas as áreas');
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
  const gsM=(S.sel.size?[...S.sel]:Object.keys(S.metas)).filter(g=>S.metas[g]);
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
  const g=$('#fGerO').value, q=$('#qOpp').value.trim().toLowerCase(), st=$('#fStatus').value;
  let a=S.opps.filter(o=>(!g||o.gerente===g)&&(st==='abertas'?OPEN.has(o.status):st==='ganhas'?o.status===WON:true));
  if(q)a=a.filter(o=>[o.cliente,o.titulo,o.numero,o.software,o.parceiro,o.gerente].join(' ').toLowerCase().includes(q));
  a=[...a].sort((x,y)=>(x.fechamento||'9').localeCompare(y.fechamento||'9'));
  $('#oppCount').textContent=`${a.length} oportunidades · total ${M(sum(a,o=>o.valorTotal))} · no ano ${M(sum(a,vAno))}`;
  $('#tbOpp').innerHTML=`<thead><tr><th>Nº</th><th>Fechamento</th><th>Gerente</th><th>Cliente</th><th>Fabricante</th><th>Oportunidade</th><th>Área</th><th>Etapa</th><th class="r">Valor total</th><th class="r">Valor no ano</th><th class="r">Prob.</th></tr></thead><tbody>`+
    a.map(o=>`<tr class="click" data-opp="${esc(o.id)}"><td><b>${esc(o.numero)}</b></td><td>${esc(mesAno(o.fechamento))}</td><td>${esc(o.gerente)}</td><td class="w"><b>${esc(o.cliente)}</b></td><td>${esc(fab(o))}</td><td class="w">${esc(o.titulo)}</td><td class="w">${esc(o.area||'')}</td><td>${tagSt(o.status)}</td><td class="r"><b>${esc(brl(o.valorTotal))}</b></td><td class="r">${esc(brl(vAno(o)))}</td><td class="r">${esc(o.probabilidade)}%</td></tr>`).join('')+'</tbody>';
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

/* ================= roteamento ================= */
const VIEWS=['painel','oportunidades','clientes','faturamento'];
const cur=()=>{const h=location.hash.slice(1);return VIEWS.includes(h)?h:'painel';};
function renderAll(){
  const v=cur(); VIEWS.forEach(n=>{$('#v-'+n).hidden=n!==v;}); $('#hero').hidden=v!=='painel';
  document.querySelectorAll('#nav a').forEach(a=>{if(a.getAttribute('href')==='#'+v)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const gl=gerentes(); ['#fGerO','#fGerC'].forEach(id=>{const c=$(id).value;$(id).innerHTML=opts(gl,c,'Todos os gerentes');});
  ({painel:renderPainel,oportunidades:renderOpps,clientes:renderClientes,faturamento:renderFat})[v]();
}
window.addEventListener('hashchange',()=>{renderAll();window.scrollTo(0,0);});
$('#fAno').addEventListener('change',e=>{S.ano=e.target.value;renderAll();api.metas(+S.ano).then(m=>{S.metas=m;renderAll();}).catch(()=>{});});
$('#btnLimpar').addEventListener('click',()=>{S.sel.clear();if(GER_FIXO)S.sel.add(GER_FIXO);S.ano='2026';$('#fAno').value='2026';S.p={cli:'',fab:'',area:'',res:'gp'};renderAll();});
[['#pCli','cli'],['#pFab','fab'],['#pArea','area'],['#pRes','res']].forEach(([id,k])=>$(id).addEventListener('change',e=>{S.p[k]=e.target.value;renderPipeline(base());}));
$('#btnLimparP').addEventListener('click',()=>{S.p={cli:'',fab:'',area:'',res:'gp'};renderPipeline(base());});
$('#simR').addEventListener('input',e=>{S.sim.pct=+e.target.value;renderSim(base());});
$('#simPresets').addEventListener('click',e=>{const x=e.target.closest('button');if(!x)return;S.sim.pct=+x.dataset.p;renderSim(base());});
$('#simEx').addEventListener('change',e=>{S.sim.ex=e.target.checked;renderSim(base());});
$('#evFab').addEventListener('change',e=>{S.evFab=e.target.value;renderEvol(base());});
$('#qOpp').addEventListener('input',renderOpps);$('#fStatus').addEventListener('change',renderOpps);$('#fGerO').addEventListener('change',renderOpps);
$('#qCli').addEventListener('input',renderClientes);$('#fGerC').addEventListener('change',renderClientes);
let rT;window.addEventListener('resize',()=>{clearTimeout(rT);rT=setTimeout(()=>{if(cur()==='painel')renderHero(base());},200);});

/* ================= painel lateral ================= */
function openDrawer(html,onMount){const root=$('#drawerRoot');
  root.innerHTML=`<div class="drawer-bg" data-close></div><aside class="drawer" role="dialog" aria-modal="true">${html}</aside>`;
  root.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeDrawer));
  onMount&&onMount(root.querySelector('.drawer'));const f=root.querySelector('input,select,textarea');f&&f.focus();}
function closeDrawer(){$('#drawerRoot').innerHTML='';}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
const gerForm=()=>gerentes();

function oppForm(o,preCli){
  const isNew=!o; o=o||{status:'Qualificação',probabilidade:10,gerente:S.sel.size===1?[...S.sel][0]:'',cadastro:TODAY_ISO,cliente:preCli||''};
  const clis=S.clientes.map(c=>c.nome).sort((a,b)=>a.localeCompare(b,'pt'));
  openDrawer(`
    <div class="card-head" style="margin:0"><h2 style="font-size:22px">${isNew?'Nova oportunidade':'Oportunidade nº '+esc(o.numero)}</h2><button class="ghost" data-close>Fechar</button></div>
    ${S.readOnly?'<div class="banner warn">Você pode ver, mas não editar, os dados.</div>':''}
    <form class="form" id="oppF">
      <label class="full">Oportunidade<input id="o_titulo" required value="${esc(o.titulo)}"></label>
      <label>Cliente<input id="o_cliente" list="dlCli" required value="${esc(o.cliente)}"><datalist id="dlCli">${clis.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label>
      <label>Gerente<select id="o_gerente" required><option value=""></option>${opts(gerForm(),o.gerente)}</select></label>
      <label>Etapa<select id="o_status">${opts(STATUS.map(s=>s.k),o.status)}</select></label>
      <label>Probabilidade (%)<input id="o_prob" type="number" min="0" max="100" step="5" value="${esc(o.probabilidade)}"></label>
      <label>Área de negócio<select id="o_area">${opts(uniq([...AREAS,o.area]),o.area)}</select></label>
      <label>Fabricante<input id="o_soft" value="${esc(o.software||'')}" placeholder="IBM, Google, Red Hat…"></label>
      <label>Valor de serviço (R$)<input id="o_vs" type="number" min="0" step="1000" value="${esc(o.valorServico||0)}"></label>
      <label>Valor de software (R$)<input id="o_vsw" type="number" min="0" step="1000" value="${esc(o.valorSoftware||0)}"></label>
      <label>Faturamento de serviço no ano (R$)<input id="o_fs" type="number" min="0" step="1000" value="${esc(o.faturamentoServico||0)}"></label>
      <label>Software no ano (R$)<input id="o_sa" type="number" min="0" step="1000" value="${esc(o.softwareAno||0)}"></label>
      <label>Cadastro<input id="o_cad" type="date" value="${esc(o.cadastro||'')}"></label>
      <label>Fechamento previsto<input id="o_fech" type="date" required value="${esc(o.fechamento||'')}"></label>
      <label class="full">Observações<textarea id="o_obs">${esc(o.observacoes||'')}</textarea></label>
      <div class="full note" id="o_total"></div><div class="full err" id="o_err"></div>
      <div class="full actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="blue" ${S.readOnly?'disabled':''}>${isNew?'Cadastrar':'Salvar alterações'}</button></div>
    </form>`,d=>{
      const tot=()=>{$('#o_total').textContent=`Valor total: ${brl((+$('#o_vs').value||0)+(+$('#o_vsw').value||0))} · Valor no ano (usado no forecast): ${brl((+$('#o_fs').value||0)+(+$('#o_sa').value||0))}`;};
      ['#o_vs','#o_vsw','#o_fs','#o_sa'].forEach(s=>$(s).addEventListener('input',tot));tot();
      $('#o_status').addEventListener('change',e=>{$('#o_prob').value=ST[e.target.value]?.p??$('#o_prob').value;});
      d.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeDrawer));
      $('#oppF').addEventListener('submit',async e=>{e.preventDefault();if(S.readOnly)return;
        const nome=$('#o_cliente').value.trim();const c=S.clientes.find(x=>x.nome.toLowerCase()===nome.toLowerCase());
        const data={...o,titulo:$('#o_titulo').value.trim(),cliente:c?c.nome:nome,clienteId:c?c.id:slug(nome),gerente:$('#o_gerente').value,status:$('#o_status').value,
          probabilidade:Math.max(0,Math.min(100,+$('#o_prob').value||0)),area:$('#o_area').value,software:$('#o_soft').value.trim()||null,
          valorServico:+$('#o_vs').value||0,valorSoftware:+$('#o_vsw').value||0,faturamentoServico:+$('#o_fs').value||0,softwareAno:+$('#o_sa').value||0,
          cadastro:$('#o_cad').value||null,fechamento:$('#o_fech').value||null,observacoes:$('#o_obs').value.trim(),atualizadoEm:new Date().toISOString()};
        data.valorTotal=data.valorServico+data.valorSoftware;
        if(isNew){delete data.numero;data.origem='crm';}
        delete data.id;
        try{ if(!c)await api.salvarCliente({id:data.clienteId,nome,gerente:data.gerente,segmento:'',siglasFaturamento:[],origem:'crm'},userId);
          const salvo=await api.salvarOpp(data,userId);await recarregar();closeDrawer();toast(isNew?`Oportunidade nº ${salvo.numero} cadastrada`:'Alterações salvas');}
        catch(err){writeErr(err,'#o_err');}
      });});
}
const semPermissao=e=>e&&(e.code==='42501'||/row-level security|permission/i.test(e.message||''));
function writeErr(err,sel){if(semPermissao(err))$(sel).textContent='Você não tem permissão para gravar este registro (só a carteira do próprio gerente pode ser alterada).';
  else $(sel).textContent='Não foi possível salvar: '+(err&&err.message||'tente de novo em alguns segundos.');}

function cliForm(c){const isNew=!c;c=c||{gerente:S.sel.size===1?[...S.sel][0]:'',segmento:'Público'};
  openDrawer(`<div class="card-head" style="margin:0"><h2 style="font-size:22px">${isNew?'Novo cliente':'Editar cliente'}</h2><button class="ghost" data-close>Fechar</button></div>
    <form class="form" id="cliF">
      <label class="full">Nome<input id="c_nome" required value="${esc(c.nome)}"></label>
      <label>Gerente da conta<select id="c_ger"><option value=""></option>${opts(gerForm(),c.gerente)}</select></label>
      <label>Segmento<select id="c_seg">${opts(['Público','Privado','Parcerias'],c.segmento)}</select></label>
      <label>CNPJ<input id="c_cnpj" value="${esc(c.cnpj||'')}" inputmode="numeric"></label>
      <label>Contato principal<input id="c_cont" value="${esc(c.contato||'')}"></label>
      <label class="full">Nome no faturamento (siglas, separadas por vírgula)<input id="c_sig" value="${esc((c.siglasFaturamento||[]).join(', '))}"></label>
      <div class="full err" id="c_err"></div>
      <div class="full actions"><button type="button" class="ghost" data-close>Cancelar</button><button class="blue" ${S.readOnly?'disabled':''}>${isNew?'Cadastrar':'Salvar'}</button></div>
    </form>`,()=>{
      $('#cliF').addEventListener('submit',async e=>{e.preventDefault();if(S.readOnly)return;
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
    renderAll();
  }catch(e){setStatus('Não foi possível atualizar os dados: '+(e.message||e),true);}
}
$('#userNome').textContent=`${perfil.nome} · ${perfil.papel==='gerente'?'Gerente':perfil.papel==='diretor'?'Diretoria':'Administração'}`;
renderAll();
(async()=>{
  try{
    const [o,c,f,m,r]=await Promise.all([api.oportunidades(),api.clientes(),api.faturamento(),api.metas(+S.ano),api.running()]);
    S.opps=o;S.clientes=c;S.fat=f;S.metas=m;S.running=r;
    setStatus(o.length?'':'Ainda não há oportunidades. Use "Nova oportunidade" para registrar a primeira.');
    renderAll();
    let t;api.aoVivo(tab=>{clearTimeout(t);t=setTimeout(()=>recarregar(tab),300);});
  }catch(e){setStatus('Não foi possível carregar os dados: '+(e.message||e),true);$('#liveTxt').textContent='Sem conexão aos dados';}
})();
}
