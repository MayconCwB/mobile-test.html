(function () {
  'use strict';
  function cents(raw) {
    const s=String(raw).trim().replace(/^R\$\s*/, '');
    if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s)) throw new Error('Informe o valor em reais, por exemplo 658,00.');
    const [whole,fraction='']=s.replace(/\./g,'').split(',');
    const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if(!Number.isSafeInteger(n)||n>99999999)throw new Error('Valor acima do limite permitido.');
    return n;
  }
  const decimal=n=>(n/100).toFixed(2).replace('.',',');
  if(typeof module==='object'&&module.exports){module.exports={cents,decimal};return;}
  const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
  const fb=()=>window.TJFB, actor=()=>fb().auth.currentUser;
  const isOwner=()=>state.perfilSessao==='empresa';
  const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
  let parts=[], requests=[], generation=0;
  const style=document.createElement('style');style.textContent=`
    .tj-register-dialog{margin:auto;width:min(620px,calc(100% - 24px));max-height:90dvh;overflow:auto;padding:20px;border:1px solid var(--border);border-radius:16px;background:var(--surface,#fff);color:var(--text,#172033)}
    .tj-register-dialog::backdrop{background:#0008}.tj-register-dialog h2{font-size:1.2rem;margin-bottom:16px}
    .tj-register-dialog label{display:block;margin:12px 0 5px}.tj-register-dialog input,.tj-register-dialog select,.tj-register-dialog textarea{width:100%;box-sizing:border-box;min-width:0}
    .tj-register-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.tj-register-actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.tj-register-error{color:var(--danger,#b91c1c);overflow-wrap:anywhere}
    .tj-register-record{padding:14px;border:1px solid var(--border,#ddd);border-radius:10px;margin:10px 0;overflow-wrap:anywhere}.tj-register-record p{margin:6px 0;white-space:pre-wrap}
    @media(max-width:420px){.tj-register-grid{grid-template-columns:1fr}.tj-register-dialog{padding:14px}}
  `;document.head.appendChild(style);
  function button(label,fn,cls='btn-tj'){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.addEventListener('click',fn);return b;}
  function dialog(title){
    const d=document.createElement('dialog');d.className='tj-register-dialog';const form=document.createElement('form');const h=document.createElement('h2');h.textContent=title;h.id='tj-register-title';d.setAttribute('aria-labelledby',h.id);form.append(h);d.append(form);
    const err=document.createElement('p');err.className='tj-register-error';err.setAttribute('role','alert');const actions=document.createElement('div');actions.className='tj-register-actions';
    const save=document.createElement('button');save.type='submit';save.className='btn-tj';save.textContent='Salvar';let busy=false;
    actions.append(save,button('Cancelar',()=>{if(!busy)d.close();},'btn-tj-secondary'));
    d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});d.addEventListener('close',()=>d.remove());
    return {form,save,finish:fn=>{form.append(err,actions);form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;save.disabled=true;err.textContent='';try{await fn();d.close();}catch(e){err.textContent=e.message||'Não foi possível salvar. Tente novamente.';}finally{busy=false;save.disabled=false;}});document.body.append(d);d.showModal();},field:(name,label,type='text',value='',max=200)=>{
      const l=document.createElement('label');l.textContent=label;l.htmlFor='tj-register-'+name;
      const input=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');if(input.tagName==='INPUT')input.type=type;input.name=name;input.id=l.htmlFor;input.className=type==='select'?'form-select':'form-input';if(type!=='select')input.value=value;if(type==='text'||type==='textarea')input.maxLength=max;form.append(l,input);return input;
    }};
  }
  function equipmentDialog(){
    if(isOwner()||!actor())return;
    const user=actor(),d=dialog('Cadastrar equipamento'),name=d.field('nome','Nome / identificação');name.required=true;
    const brand=d.field('marca','Marca','text','',100),model=d.field('modelo','Modelo','text','',100),serial=d.field('sn','Número de série','text','',100),local=d.field('local','Localização','text','',500);
    d.finish(async()=>{
      if(actor()?.uid!==user.uid||state.perfilSessao!=='cliente')throw new Error('Sua sessão mudou. Entre novamente.');
      if(!name.value.trim())throw new Error('Informe o nome do equipamento.');
      await fb().salvarClienteAgora();
      const rec={id:'EQ-'+fb().db.collection('pecas').doc().id,clienteUid:user.uid,cliente:fb().perfilCliente.nome,nome:name.value.trim(),marca:brand.value.trim(),modelo:model.value.trim(),sn:serial.value.trim(),local:local.value.trim(),status:'Cadastrado'};
      state.equip.unshift(rec);
      try{await fb().salvarClienteAgora();}catch(e){state.equip=state.equip.filter(x=>x!==rec);throw e;}
      renderizarEquipamentosCliente();toast('Equipamento cadastrado.');
    });
  }
  function requestDialog(){
    if(isOwner()||!actor())return;
    const user=actor(),d=dialog('Solicitar orçamento'),equipment=d.field('equipamento','Equipamento','select'),description=d.field('descricao','Descreva o serviço ou problema','textarea','',5000);description.required=true;
    equipment.append(new Option('Selecione um equipamento',''));
    state.equip.filter(e=>e.clienteUid===user.uid||(!e.clienteUid&&e.cliente===clienteAtualNome)).forEach(e=>equipment.append(new Option(e.nome,e.id)));
    const info=document.createElement('p');info.textContent='O valor será definido pela TJ após analisar sua solicitação.';d.form.append(info);d.save.textContent='Enviar solicitação';
    d.finish(async()=>{
      if(actor()?.uid!==user.uid||state.perfilSessao!=='cliente')throw new Error('Sua sessão mudou. Entre novamente.');
      const eq=state.equip.find(e=>e.id===equipment.value);if(!eq||!description.value.trim())throw new Error('Selecione o equipamento e descreva o serviço.');
      const ref=fb().db.collection('solicitacoesOrcamento').doc();
      await fb().db.runTransaction(async tx=>{
        const profile=await tx.get(fb().db.collection('users').doc(user.uid)),data=await tx.get(fb().db.collection('clientData').doc(user.uid));
        if(!profile.exists||profile.data().active!==true)throw new Error('Sua conta está inativa.');
        if(!(data.data()?.equip||[]).some(e=>e.id===eq.id))throw new Error('O equipamento não está mais cadastrado. Atualize a página.');
        tx.set(ref,{clienteUid:user.uid,clienteNome:profile.data().nome,equipamentoId:eq.id,equipamentoNome:eq.nome,descricao:description.value.trim(),status:'Solicitado',criadoEm:stamp(),atualizadoEm:stamp()});
      });await loadRequests();toast('Solicitação enviada à TJ.');
    });
  }
  function requestContainer(){return $(isOwner()?'tj-requests-owner':'tj-requests-client');}
  async function loadRequests(){
    const user=actor();if(!user)return;const token=++generation,owner=isOwner(),box=requestContainer();if(box)box.textContent='Carregando solicitações…';
    try{let query=fb().db.collection('solicitacoesOrcamento');if(!owner)query=query.where('clienteUid','==',user.uid);const snap=await query.get();if(token!==generation||actor()?.uid!==user.uid||owner!==isOwner())return;
      requests=snap.docs.map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));renderRequests();
      if(!owner&&fb().atualizarDadosCliente){await fb().atualizarDadosCliente();if(actor()?.uid===user.uid&&!isOwner())renderizarOrcamentosCliente();}
    }catch(e){if(token===generation&&box){box.textContent='Não foi possível carregar as solicitações. ';box.append(button('Tentar novamente',loadRequests,'btn-tj-secondary'));}}
  }
  function renderRequests(){const box=requestContainer();if(!box)return;box.replaceChildren();if(!requests.length){box.textContent='Nenhuma solicitação de orçamento.';return;}
    requests.forEach(r=>{const card=document.createElement('div');card.className='tj-register-record';const title=document.createElement('strong');title.textContent=r.equipamentoNome+' — '+r.status;const text=document.createElement('p');text.textContent=(isOwner()?r.clienteNome+'\n':'')+r.descricao+(r.orcamentoNum?'\nOrçamento #'+r.orcamentoNum:'');card.append(title,text);
      if(isOwner()&&r.status==='Solicitado'){card.append(button('Emitir orçamento',()=>quoteDialog(r)),button('Recusar solicitação',()=>rejectRequest(r),'btn-tj-secondary'));}box.append(card);});
  }
  async function rejectRequest(r){if(!confirm('Recusar esta solicitação de orçamento?'))return;try{await fb().db.runTransaction(async tx=>{const ref=fb().db.collection('solicitacoesOrcamento').doc(r.id),doc=await tx.get(ref);if(doc.data()?.status!=='Solicitado')throw new Error('Esta solicitação já foi atendida.');tx.update(ref,{status:'Recusado',atualizadoEm:stamp()});});await loadRequests();}catch(e){toast(e.message);}}
  function quoteDialog(r){
    const d=dialog('Emitir orçamento para '+r.clienteNome),desc=d.field('servico','Serviço','textarea',r.descricao,2000),catalog=d.field('catalogo','Adicionar peça do catálogo','select');desc.required=true;
    catalog.append(new Option('Selecione uma peça',''));const rows=document.createElement('div');d.form.append(rows);let items=[];
    function addItem(description='',price=''){const row=document.createElement('div');row.className='tj-register-record';const text=document.createElement('input'),qty=document.createElement('input'),value=document.createElement('input');text.className=qty.className=value.className='form-input';text.placeholder='Descrição';text.setAttribute('aria-label','Descrição do item');text.maxLength=200;text.value=description;text.required=true;qty.type='number';qty.min='1';qty.max='10000';qty.step='1';qty.value='1';qty.required=true;qty.setAttribute('aria-label','Quantidade');value.placeholder='Valor unitário (R$)';value.setAttribute('aria-label','Valor unitário');value.inputMode='decimal';value.value=price;value.required=true;const item={text,qty,value};items.push(item);row.append(text,qty,value,button('Remover item',()=>{items=items.filter(x=>x!==item);row.remove();},'btn-tj-secondary'));rows.append(row);}
    d.form.append(button('Adicionar serviço / item',()=>addItem(),'btn-tj-secondary'));addItem('Serviço');
    loadParts().then(()=>parts.filter(p=>p.ativo).forEach(p=>catalog.append(new Option(p.nome+' — '+money(p.precoCentavos),p.id)))).catch(()=>{});
    catalog.addEventListener('change',()=>{const p=parts.find(p=>p.id===catalog.value);if(p)addItem(p.nome,decimal(p.precoCentavos));catalog.value='';});
    d.save.textContent='Enviar orçamento ao cliente';
    d.finish(async()=>{
      if(!actor()||!isOwner())throw new Error('Sua sessão mudou. Entre novamente.');
      if(!items.length||!desc.value.trim())throw new Error('Informe o serviço e pelo menos um item.');
      let total=0;const quoteItems=items.map(i=>{const qty=Number(i.qty.value),price=cents(i.value.value);if(!i.text.value.trim()||!Number.isInteger(qty)||qty<1||qty>10000)throw new Error('Confira descrição e quantidade dos itens.');total+=qty*price;return {descricao:i.text.value.trim(),qtd:String(qty),valor:decimal(price)};});if(total>99999999)throw new Error('Total acima do limite permitido.');
      const user=actor(),db=fb().db,reqRef=db.collection('solicitacoesOrcamento').doc(r.id),dataRef=db.collection('clientData').doc(r.clienteUid),date=new Date().toLocaleDateString('pt-BR');
      await db.runTransaction(async tx=>{
        const profile=await tx.get(db.collection('users').doc(user.uid)),customer=await tx.get(db.collection('users').doc(r.clienteUid)),request=await tx.get(reqRef),data=await tx.get(dataRef);
        if(profile.data()?.role!=='owner'||profile.data()?.active!==true||customer.data()?.active!==true)throw new Error('Conta sem autorização ou cliente inativo.');
        const live=request.data();if(live?.status!=='Solicitado'||live.clienteUid!==r.clienteUid||live.descricao!==r.descricao)throw new Error('A solicitação mudou ou já possui orçamento. Atualize a lista.');
        const current=data.data()||{},existing=current.orcamentos||[];
        // Separate customer documents can be written concurrently; avoid sharing a local counter.
        const random=new Uint32Array(1);crypto.getRandomValues(random);
        const num=String(Date.now())+String(random[0]).padStart(10,'0');
        const quote={num,clienteUid:r.clienteUid,cliente:customer.data().nome,servico:desc.value.trim(),status:'Aguardando aprovação',total:decimal(total),itens:quoteItems,hist:[{data:date,evento:'Orçamento emitido pela TJ'}],solicitacaoId:r.id,equipamentoId:r.equipamentoId};
        const patch={orcamentos:[quote,...existing],notificacoesCliente:[{data:date,titulo:'Novo orçamento disponível',desc:'Orçamento #'+num+' aguarda sua análise.',lida:false},...(current.notificacoesCliente||[])],historicoCliente:[{data:date,tipo:'orcamento',titulo:'Orçamento #'+num+' emitido',desc:quote.servico,status:quote.status},...(current.historicoCliente||[])],atualizadoEm:stamp()};
        tx.set(dataRef,window.TJFirestoreSafe(patch),{merge:true});tx.update(reqRef,{status:'Orçamento enviado',orcamentoNum:num,atualizadoEm:stamp()});
      });await fb().carregarDadosEmpresaFirebase();renderizarOrcamentosEmpresa();await loadRequests();toast('Orçamento enviado ao cliente.');
    });
  }
  async function loadParts(){if(!isOwner()||!actor())throw new Error('Área restrita à empresa.');const uid=actor().uid;const snap=await fb().db.collection('pecas').get();if(actor()?.uid!==uid||!isOwner())return;parts=snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));renderParts();}
  function renderParts(){const box=$('tj-parts-list');if(!box)return;box.replaceChildren();const search=($('tj-parts-search')?.value||'').toLocaleLowerCase('pt-BR');const filtered=parts.filter(p=>(p.nome+' '+p.codigo+' '+p.marca).toLocaleLowerCase('pt-BR').includes(search));if(!filtered.length)box.textContent='Nenhuma peça encontrada.';
    filtered.forEach(p=>{const card=document.createElement('div');card.className='tj-register-record';const title=document.createElement('strong');title.textContent=p.nome+' ('+p.codigo+')'+(!p.ativo?' — Inativa':'');const text=document.createElement('p');text.textContent='Custo: '+money(p.custoCentavos)+' • Venda: '+money(p.precoCentavos)+'\nEstoque: '+p.estoque+' '+p.unidade+(p.marca?' • '+p.marca:'')+(p.descricao?'\n'+p.descricao:'');card.append(title,text,button('Editar peça',()=>partDialog(p),'btn-tj-secondary'));box.append(card);});
  }
  function partDialog(p){if(!isOwner())return;const user=actor(),d=dialog(p?'Editar peça':'Cadastrar peça');const name=d.field('nome','Nome','text',p?.nome||''),code=d.field('codigo','Código','text',p?.codigo||'',80),brand=d.field('marca','Marca','text',p?.marca||'',100),desc=d.field('descricao','Descrição','textarea',p?.descricao||'',2000),unit=d.field('unidade','Unidade','select'),cost=d.field('custo','Custo (R$)','text',p?decimal(p.custoCentavos):''),price=d.field('preco','Preço de venda (R$)','text',p?decimal(p.precoCentavos):''),stock=d.field('estoque','Quantidade em estoque','number',String(p?.estoque??0)),active=d.field('ativo','Situação','select');
    ['un','kg','m','l','kit'].forEach(u=>unit.append(new Option(u,u)));unit.value=p?.unidade||'un';active.append(new Option('Ativa','true'),new Option('Inativa','false'));active.value=String(p?.ativo??true);name.required=code.required=cost.required=price.required=stock.required=true;cost.inputMode=price.inputMode='decimal';stock.min='0';stock.max='1000000';stock.step='1';
    d.finish(async()=>{if(actor()?.uid!==user.uid||!isOwner())throw new Error('Sua sessão mudou.');const quantity=Number(stock.value);if(!name.value.trim()||!code.value.trim()||!Number.isInteger(quantity)||quantity<0||quantity>1000000)throw new Error('Confira nome, código e quantidade.');const record={nome:name.value.trim(),codigo:code.value.trim(),marca:brand.value.trim(),descricao:desc.value.trim(),unidade:unit.value,custoCentavos:cents(cost.value),precoCentavos:cents(price.value),estoque:quantity,ativo:active.value==='true',atualizadoEm:stamp()},ref=p?fb().db.collection('pecas').doc(p.id):fb().db.collection('pecas').doc();
      await fb().db.runTransaction(async tx=>{const existing=await tx.get(ref);if(p&&!existing.exists)throw new Error('Esta peça foi removida.');if(p){const before=existing.data();for(const key of ['nome','codigo','marca','descricao','unidade','custoCentavos','precoCentavos','estoque','ativo'])if(before[key]!==p[key])throw new Error('Esta peça foi alterada em outra sessão. Atualize a lista.');}tx.set(ref,{...record,criadoEm:existing.exists?existing.data().criadoEm:stamp()});});await loadParts();toast('Peça salva.');});
  }
  function setup(){
    const clientEquipment=$('tela-cli-equipamentos')?.querySelector('.card-box');if(clientEquipment)clientEquipment.insertBefore(button('+ Cadastrar equipamento',equipmentDialog),$('lista-cli-equipamentos'));
    for(const [screen,id,owner] of [['tela-cli-orcamentos','tj-requests-client',false],['tela-emp-orcamentos','tj-requests-owner',true]]){const card=$(screen)?.querySelector('.card-box');if(!card)continue;const h=document.createElement('h3');h.textContent='Solicitações de orçamento';const list=document.createElement('div');list.id=id;const actions=document.createElement('div');actions.className='tj-register-actions';if(!owner)actions.append(button('+ Solicitar orçamento',requestDialog));actions.append(button('Atualizar solicitações',loadRequests,'btn-tj-secondary'));card.append(h,actions,list);}
    const section=document.createElement('section');section.id='tela-emp-pecas';section.className='hidden';section.innerHTML='<button type="button" class="btn-voltar" data-action="voltar">‹ Voltar</button><div class="card-box"><h2>Peças</h2><p>Catálogo de peças, preços e quantidade disponível. O estoque é atualizado manualmente.</p><div class="tj-register-actions" id="tj-parts-actions"></div><label for="tj-parts-search">Buscar por nome, código ou marca</label><input id="tj-parts-search" type="search" class="form-input"><div id="tj-parts-list"></div></div>';document.querySelector('main.content-area')?.append(section);$('tj-parts-actions').append(button('+ Cadastrar peça',()=>partDialog()),button('Atualizar catálogo',()=>loadParts().catch(e=>toast(e.message)),'btn-tj-secondary'));$('tj-parts-search').addEventListener('input',renderParts);
    const nav=$('drawer-nav-empresa');if(nav){const b=button('',()=>abrirTela('tela-emp-pecas'),'drawer-card');b.innerHTML='<span class="drawer-card-icon">⚙️</span><span class="drawer-card-content"><span class="drawer-card-title">Peças</span><span class="drawer-card-desc">Catálogo, valores e estoque</span></span><span class="drawer-card-arrow">→</span>';nav.append(b);}
    const original=abrirTela;abrirTela=function(id,history){if(id==='tela-emp-pecas'&&!isOwner())return;const result=original(id,history);if(id==='tela-emp-pecas'){if(typeof atualizarBreadcrumb==='function')atualizarBreadcrumb([{label:'Peças'}]);loadParts().catch(e=>{$('tj-parts-list').textContent=e.message;});}if(id==='tela-cli-orcamentos'||id==='tela-emp-orcamentos')loadRequests();return result;};
    fb().auth.onAuthStateChanged(()=>{generation++;parts=[];requests=[];['tj-parts-list','tj-requests-client','tj-requests-owner'].forEach(id=>$(id)?.replaceChildren());});
  }
  setup();
})();
