/* v29: approved budget -> reviewed schedule/order, in one transaction. */
(function () {
  'use strict';
  const core = window.TJCore;
  function owner() { return state.perfilSessao === 'empresa' && window.TJFB && window.TJFB.auth.currentUser; }
  function uidFor(budget) {
    if (budget.clienteUid) return budget.clienteUid;
    const matches = (state.clientesFirebase || []).filter(c => c.nome === budget.cliente);
    return matches.length === 1 ? matches[0].uid : '';
  }
  function button(budget) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn-tj'; b.textContent = 'Gerar agendamento / pedido';
    b.addEventListener('click', () => open(budget));
    return b;
  }
  const renderList = renderizarOrcamentosEmpresa;
  renderizarOrcamentosEmpresa = function () {
    const result = renderList.apply(this, arguments);
    if (owner()) document.querySelectorAll('#lista-emp-orcamentos .admin-record').forEach(card => {
      const ref = card.querySelector('[data-action="abrir-orc"]');
      const budget = (state.orcamentos || []).find(o => ref && String(o.num) === ref.dataset.id);
      if (budget && budget.status === 'Aprovado') card.querySelector('.admin-card-actions').appendChild(button(budget));
    });
    return result;
  };
  const renderDetail = renderizarDetalheOrcamento;
  renderizarDetalheOrcamento = function () {
    const result = renderDetail.apply(this, arguments);
    const actions = document.getElementById('det-orc-acoes-aprovacao');
    const budget = (state.orcamentos || []).find(o => String(o.num) === String(orcamentoAtualNum));
    if (actions && owner() && budget && budget.status === 'Aprovado') actions.appendChild(button(budget));
    return result;
  };
  const style = document.createElement('style');
  style.textContent = '.tj-flow{margin:auto;box-sizing:border-box;width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;border:0;border-radius:18px;padding:24px;background:var(--surface,#fff);color:var(--text,#162c43)}.tj-flow::backdrop{background:#0009}.tj-flow form{display:grid;gap:14px}.tj-flow label{display:grid;gap:6px}.tj-flow input,.tj-flow select,.tj-flow textarea{box-sizing:border-box;width:100%;min-width:0;font:inherit;padding:10px;border:1px solid #9997;border-radius:8px;background:transparent;color:inherit}.tj-flow .tj-flow-check{display:flex;align-items:center;gap:10px}.tj-flow input[type=checkbox]{width:auto}.tj-flow .tj-flow-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.tj-flow footer{display:flex;gap:10px;flex-wrap:wrap}.tj-flow footer button{flex:1;white-space:normal}.tj-flow p{overflow-wrap:anywhere}.tj-flow [hidden]{display:none!important}.tj-flow-error{color:#b3261e}@media(max-width:400px){.tj-flow{padding:16px}.tj-flow .tj-flow-row{grid-template-columns:1fr}}';
  document.head.appendChild(style);
  function open(budget) {
    if (!owner() || budget.status !== 'Aprovado') return;
    if (document.querySelector('.tj-flow')) return;
    const uid = uidFor(budget);
    if (!uid) { toast('Cliente não identificado com segurança. Revise o cadastro do orçamento.'); return; }
    const reviewed = core.budgetReview(budget);
    const accountUid = window.TJFB.auth.currentUser.uid;
    const dialog = document.createElement('dialog'); dialog.className = 'tj-flow';
    dialog.setAttribute('aria-labelledby', 'tj-flow-title');
    dialog.innerHTML = '<form><h2 id="tj-flow-title">Gerar a partir do orçamento</h2><p class="tj-flow-summary"></p><label>Chamado vinculado<select name="chamado"><option value="">Sem chamado vinculado</option></select></label><label class="tj-flow-check"><input name="schedule" type="checkbox" checked>Gerar agendamento</label><div class="tj-flow-schedule"><div class="tj-flow-row"><label>Data<input name="date" type="date"></label><label>Horário<input name="time" type="time"></label></div><label>Local<input name="local" type="text" maxlength="500"></label><label>Observações<textarea name="notes" maxlength="2000" rows="2"></textarea></label></div><label class="tj-flow-check"><input name="order" type="checkbox">Gerar pedido de peças</label><div class="tj-flow-order" hidden><label>Peças e quantidades<textarea name="parts" rows="4" maxlength="4000"></textarea></label><small>Revise a lista e remova serviços ou mão de obra antes de gerar o pedido.</small></div><p>Cliente, itens e valor aprovado ficam vinculados aos registros gerados. O orçamento mantém sua aprovação.</p><p class="tj-flow-error" role="alert"></p><footer><button type="button" class="btn-tj-secondary tj-flow-cancel">Cancelar</button><button type="submit" class="btn-tj">Salvar registros</button></footer></form>';
    const form = dialog.querySelector('form'); const field = name => form.elements.namedItem(name);
    dialog.querySelector('.tj-flow-summary').textContent = '#' + budget.num + ' • ' + budget.cliente + ' • ' + budget.servico + ' • ' + formatarMoedaBR(budget.total);
    (state.chamados || []).filter(c => c.clienteUid === uid || (!c.clienteUid && c.cliente === budget.cliente)).forEach(c => {
      const option = document.createElement('option'); option.value = c.num; option.textContent = '#' + c.num + ' — ' + (c.equip || c.problema || 'Chamado'); field('chamado').appendChild(option);
    });
    field('chamado').value = budget.chamado || '';
    field('parts').value = core.items(budget.itens).map(i => (i.qtd || i.quantidade || '1') + ' × ' + (i.descricao || i.item || i.nome || '')).join('\n');
    const client = (state.clientesFirebase || []).find(c => c.uid === uid);
    const address = client && Array.isArray(client.enderecos) && client.enderecos.find(e => e.tipo === 'Atendimento');
    field('local').value = address ? (address.endereco || address.logradouro || '') : '';
    function toggle() {
      dialog.querySelector('.tj-flow-schedule').hidden = !field('schedule').checked;
      dialog.querySelector('.tj-flow-order').hidden = !field('order').checked;
      field('date').required = field('time').required = field('schedule').checked;
      field('parts').required = field('order').checked;
    }
    field('schedule').addEventListener('change', toggle); field('order').addEventListener('change', toggle); toggle();
    let busy = false;
    dialog.querySelector('.tj-flow-cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => dialog.remove());
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (busy) return;
      const error = dialog.querySelector('.tj-flow-error'); error.textContent = '';
      const input = { schedule: field('schedule').checked, order: field('order').checked, date: field('date').value, time: field('time').value, chamado: field('chamado').value, parts: field('parts').value, local: field('local').value, notes: field('notes').value };
      const db = window.TJFB.db;
      const ids = { schedule: 'AG-' + db.collection('clientData').doc().id, order: 'PED-' + db.collection('clientData').doc().id };
      busy = true; Array.from(form.elements).forEach(el => { el.disabled = true; });
      try {
        await db.runTransaction(async tx => {
          const auth = window.TJFB.auth;
          if (!owner() || auth.currentUser.uid !== accountUid) throw new Error('Sessão alterada. Entre novamente.');
          const actor = await tx.get(db.collection('users').doc(accountUid));
          const customer = await tx.get(db.collection('users').doc(uid));
          const ref = db.collection('clientData').doc(uid);
          const snapshot = await tx.get(ref);
          if (!actor.exists || actor.data().role !== 'owner' || actor.data().active !== true) throw new Error('Acesso administrativo não está ativo.');
          if (!customer.exists || customer.data().active !== true) throw new Error('Cadastro do cliente não está ativo.');
          const data = snapshot.exists ? snapshot.data() : {};
          const current = (data.orcamentos || []).find(o => String(o.num) === String(budget.num));
          if (!current || !core.equal(core.budgetReview(current), reviewed)) throw new Error('O orçamento mudou desde a revisão. Feche esta tela e recarregue os orçamentos.');
          let patch = core.convert(data, uid, budget.num, input, ids, new Date().toLocaleString('pt-BR'));
          if (window.TJFirestoreSafe) patch = window.TJFirestoreSafe(patch);
          patch.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
          if (!owner() || auth.currentUser.uid !== accountUid) throw new Error('Sessão alterada. Entre novamente.');
          tx.set(ref, patch, { merge: true });
        });
        dialog.close(); toast('Registros gerados com sucesso.');
      } catch (err) {
        error.textContent = err.message || 'Não foi possível salvar. Tente novamente.';
        busy = false; Array.from(form.elements).forEach(el => { el.disabled = false; }); return;
      }
      try { if (await window.TJFB.carregarDadosEmpresaFirebase() === false) throw new Error('Falha ao atualizar lista'); renderizarOrcamentosEmpresa(); }
      catch (_) { toast('Os registros foram salvos. Recarregue a lista para visualizá-los.'); }
    });
    document.body.appendChild(dialog); dialog.showModal();
  }
})();
