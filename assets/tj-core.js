(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TJCore = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function ordered(value) {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function (out, key) { out[key] = ordered(value[key]); return out; }, {});
    return value;
  }
  function equal(a, b) { return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b)); }
  function nextNumber(prefix, list, property) {
    let max = '0';
    (list || []).forEach(function (record) {
      const raw = String(record[property] || '');
      if (!raw.startsWith(prefix)) return;
      const digits = raw.slice(prefix.length);
      if (!/^\d+$/.test(digits)) return;
      const n = digits.replace(/^0+(?=\d)/, '');
      if (n.length > max.length || (n.length === max.length && n > max)) max = n;
    });
    const chars = max.split(''); let carry = 1;
    for (let i = chars.length - 1; i >= 0 && carry; i--) { const n = Number(chars[i]) + carry; chars[i] = String(n % 10); carry = n > 9 ? 1 : 0; }
    return prefix + ((carry ? '1' : '') + chars.join('')).padStart(5, '0');
  }
  function items(list) {
    return (Array.isArray(list) ? list : []).map(function (it) {
      return Array.isArray(it) ? { descricao: String(it[0] || ''), qtd: String(it[1] || ''), valor: String(it[2] || '') } : Object.assign({}, it);
    });
  }
  function budgetReview(budget) {
    return { num: String(budget.num), servico: budget.servico || '', status: budget.status, total: budget.total, itens: items(budget.itens), chamado: String(budget.chamado || '') };
  }
  // Pure operation: callers validate owner authorization inside a Firestore transaction.
  function convert(data, uid, number, input, ids, now) {
    const budgets = Array.isArray(data.orcamentos) ? data.orcamentos : [];
    const budget = budgets.find(o => String(o.num) === String(number));
    if (!budget || budget.status !== 'Aprovado') throw new Error('O orçamento precisa estar aprovado. Recarregue a lista.');
    if (budget.clienteUid && budget.clienteUid !== uid) throw new Error('Cliente do orçamento não confere.');
    if (!input.schedule && !input.order) throw new Error('Selecione agendamento e/ou pedido.');
    const patch = {};
    const source = { orcamentoNum: String(budget.num), cliente: budget.cliente, clienteUid: uid, totalOrcamento: budget.total, itensOrcamento: items(budget.itens), chamado: String(input.chamado || budget.chamado || '') };
    if (source.chamado && !(data.chamados || []).some(c => String(c.num) === source.chamado && (!c.clienteUid || c.clienteUid === uid))) throw new Error('Selecione um chamado deste cliente.');
    const linked = record => String(record.orcamentoNum || '') === String(budget.num);
    if (input.schedule) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || '')) throw new Error('Informe data e horário válidos.');
      const day = new Date(input.date + 'T12:00:00');
      if (isNaN(day.getTime()) || day.getFullYear() !== Number(input.date.slice(0,4)) || day.getMonth()+1 !== Number(input.date.slice(5,7)) || day.getDate() !== Number(input.date.slice(8,10))) throw new Error('Informe uma data válida.');
      const schedules = Array.isArray(data.agendamentos) ? data.agendamentos : [];
      if (schedules.some(linked)) throw new Error('Este orçamento já gerou um agendamento. Edite o registro existente.');
      const dateText = input.date.split('-').reverse().join('/') + ' às ' + input.time;
      const record = Object.assign({}, source, { id: ids.schedule, data: input.date, hora: input.time, agend: dateText, tipo: 'Manutenção corretiva', status: 'Agendado', local: String(input.local || '').trim(), observacoes: String(input.notes || '').trim(), criadoEmTexto: now });
      patch.agendamentos = [record].concat(schedules);
      if (source.chamado) patch.chamados = data.chamados.map(c => String(c.num) === source.chamado ? Object.assign({}, c, { agend: dateText }) : c);
    }
    if (input.order) {
      if (!String(input.parts || '').trim()) throw new Error('Revise as peças do pedido.');
      const orders = Array.isArray(data.pedidos) ? data.pedidos : [];
      if (orders.some(linked)) throw new Error('Este orçamento já gerou um pedido. Edite o registro existente.');
      patch.pedidos = [Object.assign({}, source, { num: ids.order, peca: String(input.parts).trim(), status: 'Solicitado', data: now })].concat(orders);
    }
    patch.historicoCliente = [{ data: now, tipo: 'orcamento', titulo: 'Orçamento #' + budget.num, desc: input.schedule && input.order ? 'Agendamento e pedido gerados pela TJ.' : input.schedule ? 'Agendamento gerado pela TJ.' : 'Pedido gerado pela TJ.', status: 'Aprovado' }].concat(data.historicoCliente || []);
    return patch;
  }
  return { equal, nextNumber, items, budgetReview, convert };
});
