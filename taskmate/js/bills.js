// bills.js — 小组账单逻辑

let _billsGroupId = null;
let _billsCurrentUser = null;
let _billsIsLeader = false;
let _splitParticipants = new Set();
let _receiptFile = null;

const CATEGORIES = {
  '餐饮': 'cat-food',
  '交通': 'cat-transport',
  '材料': 'cat-material',
  '活动': 'cat-activity',
  '其他': 'cat-other'
};

// ── 初始化 ────────────────────────────────────────────────────────────────

function initBillsPage() {
  seedDemoData();
  _billsCurrentUser = Session.require();
  if (!_billsCurrentUser) return;

  const params = new URLSearchParams(location.search);
  _billsGroupId = params.get('groupId');
  if (!_billsGroupId) { window.location.href = 'dashboard.html'; return; }

  const group = Groups.findById(_billsGroupId);
  if (!group) { showToast('小组不存在', 'error'); setTimeout(() => window.location.href = 'dashboard.html', 1500); return; }

  const myMember = group.members.find(m => m.userId === _billsCurrentUser.id);
  if (!myMember) { showToast('你不在这个小组', 'error'); setTimeout(() => window.location.href = 'dashboard.html', 1500); return; }

  _billsIsLeader = myMember.role === 'leader';

  document.getElementById('navbar-avatar').innerHTML = renderAvatar(_billsCurrentUser.name, 'sm');
  document.getElementById('navbar-name').textContent = _billsCurrentUser.name;
  document.getElementById('back-to-group').href = `group.html?id=${_billsGroupId}`;
  document.title = `账单 — ${group.name}`;
  document.getElementById('bills-group-name').textContent = `${group.name} · 账单`;
  document.getElementById('bills-group-meta').textContent = `${group.members.length} 位成员`;

  // 凭单文件选择
  document.getElementById('receipt-input').addEventListener('change', e => {
    _receiptFile = e.target.files[0] || null;
    document.getElementById('receipt-file-name').textContent = _receiptFile ? _receiptFile.name : '点击上传收据/截图';
  });

  renderAll();
}

function renderAll() {
  renderSummary();
  renderBillList();
  renderBalances();
}

// ── 汇总 ──────────────────────────────────────────────────────────────────

function renderSummary() {
  const bills = Bills.forGroup(_billsGroupId);
  const total = bills.reduce((s, b) => s + b.amount, 0);
  const unsettled = bills.filter(b => !b.settled).reduce((s, b) => s + b.amount, 0);
  document.getElementById('summary-total').textContent = `¥${total.toFixed(2)}`;
  document.getElementById('summary-count').textContent = bills.length;
  document.getElementById('summary-unsettled').textContent = `¥${unsettled.toFixed(2)}`;
}

// ── 账单列表 ──────────────────────────────────────────────────────────────

function renderBillList() {
  const cat = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  let bills = Bills.forGroup(_billsGroupId);
  if (cat) bills = bills.filter(b => b.category === cat);
  if (status === 'settled') bills = bills.filter(b => b.settled);
  if (status === 'unsettled') bills = bills.filter(b => !b.settled);

  document.getElementById('filter-result-count').textContent = `共 ${bills.length} 条`;

  const container = document.getElementById('bill-list');
  if (bills.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">💰</div>
      <div class="empty-state-text">暂无账单记录</div>
      <div class="empty-state-hint">点击右上角"记一笔"添加账单</div>
    </div>`;
    return;
  }

  container.innerHTML = bills.map(b => {
    const payer = Users.findById(b.paidBy);
    const catClass = CATEGORIES[b.category] || 'cat-other';
    const myShare = (b.splitMembers || []).find(s => s.userId === _billsCurrentUser.id);
    const iAmPayer = b.paidBy === _billsCurrentUser.id;

    return `
      <div class="bill-card" onclick="openBillDetail('${b.id}')">
        <div class="bill-card-header">
          <div class="bill-card-left">
            <div class="bill-card-title">${bEscHtml(b.title)}</div>
            <div class="bill-card-meta">
              ${payer ? `${bEscHtml(payer.name)} 付款` : ''}
              · ${formatDate(b.createdAt)}
              ${b.desc ? ` · ${bEscHtml(b.desc)}` : ''}
            </div>
            <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
              <span class="badge ${catClass}">${bEscHtml(b.category)}</span>
              <span class="badge ${b.settled ? 'badge-settled' : 'badge-unsettled'}">${b.settled ? '已结算' : '未结算'}</span>
              ${b.receiptId ? '<span class="badge badge-gray">🧾 有凭单</span>' : ''}
              ${iAmPayer ? '<span class="badge badge-blue">我付款</span>' : ''}
              ${myShare && !iAmPayer ? `<span class="badge badge-red">我欠 ¥${myShare.amount.toFixed(2)}</span>` : ''}
            </div>
          </div>
          <div class="bill-amount expense">¥${b.amount.toFixed(2)}</div>
        </div>
        ${b.receiptId ? `
          <div class="bill-receipt-thumb" onclick="event.stopPropagation();previewReceipt('${b.id}')">
            <span>🧾</span>
            <span>${bEscHtml(b.receiptName || '凭单')}</span>
            <span style="margin-left:auto;font-size:12px;color:var(--primary)">点击查看</span>
          </div>` : ''}
      </div>`;
  }).join('');
}

// ── 余额 ──────────────────────────────────────────────────────────────────

function renderBalances() {
  const group = Groups.findById(_billsGroupId);
  if (!group) return;

  // 我的余额
  const myBalance = Bills.balanceForUser(_billsGroupId, _billsCurrentUser.id);
  const myBalanceEl = document.getElementById('my-balance-card');
  if (myBalance > 0) {
    myBalanceEl.innerHTML = `<div style="text-align:center;padding:8px 0">
      <div class="balance-amount-negative" style="font-size:24px">-¥${myBalance.toFixed(2)}</div>
      <div style="font-size:13px;color:var(--gray-500);margin-top:4px">我欠别人的钱</div>
    </div>`;
  } else if (myBalance < 0) {
    myBalanceEl.innerHTML = `<div style="text-align:center;padding:8px 0">
      <div class="balance-amount-positive" style="font-size:24px">+¥${Math.abs(myBalance).toFixed(2)}</div>
      <div style="font-size:13px;color:var(--gray-500);margin-top:4px">别人欠我的钱</div>
    </div>`;
  } else {
    myBalanceEl.innerHTML = `<div style="text-align:center;padding:8px 0">
      <div class="balance-amount-zero" style="font-size:24px">¥0</div>
      <div style="font-size:13px;color:var(--gray-500);margin-top:4px">账目已平衡</div>
    </div>`;
  }

  // 所有成员余额
  const balanceList = document.getElementById('balance-list');
  const members = group.members.map(m => {
    const u = Users.findById(m.userId);
    const bal = Bills.balanceForUser(_billsGroupId, m.userId);
    return { user: u, balance: bal };
  }).filter(x => x.user);

  if (members.every(m => m.balance === 0)) {
    balanceList.innerHTML = '<div class="loading-hint">所有账目已平衡 🎉</div>';
    return;
  }

  balanceList.innerHTML = members.map(({ user, balance }) => `
    <div class="balance-item">
      ${renderAvatar(user.name, 'sm')}
      <div style="flex:1;font-size:14px;font-weight:500;color:var(--gray-800)">${bEscHtml(user.name)}</div>
      <div class="${balance > 0 ? 'balance-amount-negative' : balance < 0 ? 'balance-amount-positive' : 'balance-amount-zero'}">
        ${balance > 0 ? `-¥${balance.toFixed(2)}` : balance < 0 ? `+¥${Math.abs(balance).toFixed(2)}` : '已平衡'}
      </div>
    </div>`).join('');
}

// ── 添加账单 ──────────────────────────────────────────────────────────────

function openAddBillModal() {
  const group = Groups.findById(_billsGroupId);
  if (!group) return;

  // 重置表单
  document.getElementById('bill-title').value = '';
  document.getElementById('bill-amount').value = '';
  document.getElementById('bill-category').value = '材料';
  document.getElementById('bill-desc').value = '';
  document.getElementById('bill-title-error').classList.add('hidden');
  document.getElementById('bill-amount-error').classList.add('hidden');
  document.getElementById('bill-paidby-error').classList.add('hidden');
  document.getElementById('receipt-file-name').textContent = '点击上传收据/截图';
  _receiptFile = null;
  document.querySelector('input[name="split-type"][value="equal"]').checked = true;

  // 付款人下拉
  const paidByEl = document.getElementById('bill-paidby');
  paidByEl.innerHTML = '<option value="">请选择付款人</option>' +
    group.members.map(m => {
      const u = Users.findById(m.userId);
      return u ? `<option value="${u.id}" ${u.id === _billsCurrentUser.id ? 'selected' : ''}>${bEscHtml(u.name)}</option>` : '';
    }).join('');

  // 均摊成员（默认全选）
  _splitParticipants = new Set(group.members.map(m => m.userId));
  renderSplitMembers(group);
  document.getElementById('split-equal-section').classList.remove('hidden');
  document.getElementById('split-custom-section').classList.add('hidden');

  openModal('add-bill-modal');
}

function renderSplitMembers(group) {
  const container = document.getElementById('split-members');
  container.innerHTML = group.members.map(m => {
    const u = Users.findById(m.userId);
    if (!u) return '';
    const active = _splitParticipants.has(u.id);
    return `<span class="lottery-participant-tag ${active ? 'active' : ''}" onclick="toggleSplitMember('${u.id}')">
      ${bEscHtml(u.name)}
    </span>`;
  }).join('');
}

function toggleSplitMember(uid) {
  if (_splitParticipants.has(uid)) {
    if (_splitParticipants.size <= 1) { showToast('至少需要1位参与分摊', 'warning'); return; }
    _splitParticipants.delete(uid);
  } else {
    _splitParticipants.add(uid);
  }
  const group = Groups.findById(_billsGroupId);
  renderSplitMembers(group);
  if (document.querySelector('input[name="split-type"]:checked').value === 'custom') {
    renderCustomInputs();
  }
}

function onSplitTypeChange() {
  const type = document.querySelector('input[name="split-type"]:checked').value;
  document.getElementById('split-equal-section').classList.toggle('hidden', type !== 'equal');
  document.getElementById('split-custom-section').classList.toggle('hidden', type !== 'custom');
  if (type === 'custom') renderCustomInputs();
}

function renderCustomInputs() {
  const group = Groups.findById(_billsGroupId);
  const amount = parseFloat(document.getElementById('bill-amount').value) || 0;
  const container = document.getElementById('split-custom-inputs');
  const members = group.members.filter(m => _splitParticipants.has(m.userId));

  container.innerHTML = members.map(m => {
    const u = Users.findById(m.userId);
    if (!u) return '';
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      ${renderAvatar(u.name, 'sm')}
      <span style="flex:1;font-size:14px">${bEscHtml(u.name)}</span>
      <span style="font-size:13px;color:var(--gray-500)">¥</span>
      <input type="number" class="form-input" style="width:90px" min="0" step="0.01"
        id="custom-amount-${u.id}" placeholder="0.00" oninput="updateCustomTotal()">
    </div>`;
  }).join('');

  document.getElementById('split-custom-max').textContent = `¥${amount.toFixed(2)}`;
  updateCustomTotal();
}

function updateCustomTotal() {
  const group = Groups.findById(_billsGroupId);
  let total = 0;
  group.members.forEach(m => {
    const el = document.getElementById(`custom-amount-${m.userId}`);
    if (el) total += parseFloat(el.value) || 0;
  });
  document.getElementById('split-custom-total').textContent = `¥${total.toFixed(2)}`;
}

async function handleAddBill() {
  const title = document.getElementById('bill-title').value.trim();
  const amount = parseFloat(document.getElementById('bill-amount').value);
  const category = document.getElementById('bill-category').value;
  const paidBy = document.getElementById('bill-paidby').value;
  const desc = document.getElementById('bill-desc').value.trim();
  const splitType = document.querySelector('input[name="split-type"]:checked').value;

  // 验证
  const titleErr = document.getElementById('bill-title-error');
  const amountErr = document.getElementById('bill-amount-error');
  const paidByErr = document.getElementById('bill-paidby-error');
  [titleErr, amountErr, paidByErr].forEach(e => e.classList.add('hidden'));

  if (!title) { titleErr.textContent = '请填写账单名称'; titleErr.classList.remove('hidden'); return; }
  if (!amount || amount <= 0) { amountErr.textContent = '请填写有效金额'; amountErr.classList.remove('hidden'); return; }
  if (!paidBy) { paidByErr.textContent = '请选择付款人'; paidByErr.classList.remove('hidden'); return; }

  // 计算分摊
  let splitMembers = [];
  const participants = [..._splitParticipants];

  if (splitType === 'equal') {
    const each = amount / participants.length;
    splitMembers = participants.map(uid => ({ userId: uid, amount: parseFloat(each.toFixed(2)) }));
  } else if (splitType === 'custom') {
    const group = Groups.findById(_billsGroupId);
    let customTotal = 0;
    splitMembers = group.members
      .filter(m => _splitParticipants.has(m.userId))
      .map(m => {
        const val = parseFloat(document.getElementById(`custom-amount-${m.userId}`)?.value) || 0;
        customTotal += val;
        return { userId: m.userId, amount: val };
      });
    if (Math.abs(customTotal - amount) > 0.01) {
      showToast(`自定义分摊总额 ¥${customTotal.toFixed(2)} 与账单金额 ¥${amount.toFixed(2)} 不符`, 'error'); return;
    }
  } else {
    // payer 全出，不分摊
    splitMembers = [{ userId: paidBy, amount }];
  }

  const btn = document.getElementById('add-bill-confirm-btn');
  btn.disabled = true;
  btn.textContent = '保存中...';

  try {
    let receiptId = null, receiptName = null, receiptSize = null, receiptType = null;
    if (_receiptFile) {
      receiptId = genId();
      receiptName = _receiptFile.name;
      receiptSize = _receiptFile.size;
      receiptType = _receiptFile.type;
      const blob = await readBillFileAsBlob(_receiptFile);
      await FileDB.save(receiptId, blob);
    }

    Bills.create({
      groupId: _billsGroupId,
      title, amount, category, paidBy, desc, splitType, splitMembers,
      receiptId, receiptName, receiptSize, receiptType,
      createdBy: _billsCurrentUser.id
    });

    // 通知组员
    const group = Groups.findById(_billsGroupId);
    Notify.send('新账单', `${_billsCurrentUser.name} 记录了一笔 ¥${amount.toFixed(2)} 的账单：${title}`);
    showToast('账单已记录！', 'success');
    closeModal('add-bill-modal');
    renderAll();
  } catch (e) {
    showToast('保存失败：' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '记账';
  }
}

function readBillFileAsBlob(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(new Blob([e.target.result], { type: file.type }));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}

// ── 账单详情 ──────────────────────────────────────────────────────────────

function openBillDetail(billId) {
  const bill = Bills.findById(billId);
  if (!bill) return;

  const payer = Users.findById(bill.paidBy);
  const creator = Users.findById(bill.createdBy);
  const catClass = CATEGORIES[bill.category] || 'cat-other';

  document.getElementById('detail-modal-title').textContent = bill.title;

  document.getElementById('bill-detail-body').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div>
        <span class="badge ${catClass}">${bEscHtml(bill.category)}</span>
        <span class="badge ${bill.settled ? 'badge-settled' : 'badge-unsettled'}" style="margin-left:6px">${bill.settled ? '已结算' : '未结算'}</span>
      </div>
      <div class="bill-amount expense" style="font-size:28px">¥${bill.amount.toFixed(2)}</div>
    </div>
    ${bill.desc ? `<div style="font-size:14px;color:var(--gray-600);margin-bottom:12px">${bEscHtml(bill.desc)}</div>` : ''}
    <div class="divider"></div>
    <div style="font-size:13px;color:var(--gray-500);margin-bottom:8px">
      付款人：<strong style="color:var(--gray-800)">${bEscHtml(payer?.name || '?')}</strong>
      &nbsp;·&nbsp; 记录人：${bEscHtml(creator?.name || '?')}
      &nbsp;·&nbsp; ${formatDate(bill.createdAt)}
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--gray-700);margin-bottom:8px">分摊明细</div>
    <div class="bill-split-list">
      ${(bill.splitMembers || []).map(s => {
        const u = Users.findById(s.userId);
        const isPayer = s.userId === bill.paidBy;
        return `<div class="bill-split-row">
          ${renderAvatar(u?.name || '?', 'sm')}
          <span class="bill-split-name">${bEscHtml(u?.name || '?')}</span>
          ${isPayer
            ? `<span class="bill-split-amount paid">付款 ¥${bill.amount.toFixed(2)}</span>`
            : `<span class="bill-split-amount owes">欠 ¥${s.amount.toFixed(2)}</span>`}
        </div>`;
      }).join('')}
    </div>
    ${bill.receiptId ? `
    <div class="divider"></div>
    <div class="bill-receipt-thumb" onclick="previewReceipt('${bill.id}')">
      <span>🧾</span>
      <span>${bEscHtml(bill.receiptName || '凭单')}</span>
      <span style="font-size:12px;color:var(--gray-400)">${formatFileSize(bill.receiptSize || 0)}</span>
      <span style="margin-left:auto;font-size:12px;color:var(--primary)">点击查看</span>
    </div>` : ''}
  `;

  const canDelete = bill.createdBy === _billsCurrentUser.id || _billsIsLeader;
  const canSettle = _billsIsLeader && !bill.settled;
  document.getElementById('bill-detail-footer').innerHTML = `
    ${canSettle ? `<button type="button" class="btn btn-secondary btn-sm" onclick="settleBill('${bill.id}')">✅ 标记已结算</button>` : ''}
    ${canDelete ? `<button type="button" class="btn btn-danger btn-sm" style="margin-left:auto" onclick="deleteBill('${bill.id}')">🗑️ 删除</button>` : ''}
    <button type="button" class="btn btn-secondary" onclick="closeModal('bill-detail-modal')">关闭</button>
  `;

  openModal('bill-detail-modal');
}

function settleBill(billId) {
  Bills.update(billId, { settled: true, settledAt: Date.now() });
  showToast('已标记为结算', 'success');
  closeModal('bill-detail-modal');
  renderAll();
}

async function deleteBill(billId) {
  if (!confirm('确定删除这条账单吗？')) return;
  await Bills.delete(billId);
  showToast('账单已删除', 'success');
  closeModal('bill-detail-modal');
  renderAll();
}

// ── 凭单预览 ──────────────────────────────────────────────────────────────

async function previewReceipt(billId) {
  const bill = Bills.findById(billId);
  if (!bill?.receiptId) return;

  try {
    const blob = await FileDB.get(bill.receiptId);
    if (!blob) { showToast('凭单文件丢失', 'error'); return; }
    const url = URL.createObjectURL(blob);
    const body = document.getElementById('receipt-preview-body');

    if (bill.receiptType?.startsWith('image/')) {
      body.innerHTML = `<img src="${url}" style="max-width:100%;max-height:60vh;border-radius:var(--radius)" alt="凭单">`;
    } else if (bill.receiptType === 'application/pdf') {
      body.innerHTML = `<iframe src="${url}" style="width:100%;height:60vh;border:none;border-radius:var(--radius)"></iframe>`;
    } else {
      body.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-text">${bEscHtml(bill.receiptName)}</div><div class="empty-state-hint">此格式无法预览，请下载查看</div></div>`;
    }

    document.getElementById('receipt-download-btn').onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = bill.receiptName;
      a.click();
    };

    openModal('receipt-preview-modal');
    // 关闭时释放 URL
    document.getElementById('receipt-preview-modal').addEventListener('click', function handler(e) {
      if (e.target === this) { URL.revokeObjectURL(url); this.removeEventListener('click', handler); }
    });
  } catch { showToast('预览失败', 'error'); }
}

// ── 一键结算 ──────────────────────────────────────────────────────────────

function openSettleModal() {
  const unsettled = Bills.forGroup(_billsGroupId).filter(b => !b.settled);
  const total = unsettled.reduce((s, b) => s + b.amount, 0);

  document.getElementById('settle-preview').innerHTML = unsettled.length === 0
    ? '<div class="loading-hint">没有待结算的账单</div>'
    : `<div style="font-size:14px;color:var(--gray-700)">
        共 <strong>${unsettled.length}</strong> 笔未结算账单，总金额 <strong style="color:var(--danger)">¥${total.toFixed(2)}</strong>，确认全部结算？
      </div>`;

  openModal('settle-modal');
}

function handleSettle() {
  const unsettled = Bills.forGroup(_billsGroupId).filter(b => !b.settled);
  if (unsettled.length === 0) { showToast('没有待结算的账单', 'warning'); closeModal('settle-modal'); return; }
  unsettled.forEach(b => Bills.update(b.id, { settled: true, settledAt: Date.now() }));
  showToast(`${unsettled.length} 笔账单已结算`, 'success');
  closeModal('settle-modal');
  renderAll();
}

// ── Modal helpers ──────────────────────────────────────────────────────────

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});

function bEscHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
