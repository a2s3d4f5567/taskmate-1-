// annotation.js — 图片批注模块逻辑

var _annoTaskId = null;
var _annoGroupId = null;
var _annoFileId = null;       // 从任务文件来的 file meta id
var _annoSubmissionId = null; // 从提交版本来的 submission id
var _annoFileMeta = null;
var _annoSubmissionMeta = null;
var _annoCurrentUser = null;
var _annoIsLeader = false;
var _annoIsAssignee = false;
var _annoSrcType = null; // 'file' or 'submission'

var _zoom = 1;
var _minZoom = 0.1;
var _maxZoom = 5;
var _tool = 'pin';     // 'pin' | 'rect' | 'none'
var _filter = 'all';   // 'all' | 'pending' | 'resolved'
var _annotations = [];
var _pendingAnnotation = null; // 当前正在添加的 annotation data
var _selectedAnnoId = null;
var _isRectDrawing = false;
var _rectStart = null;
var _rectGhost = null;
var _isPanning = false;
var _panStart = null;
var _panScrollStart = null;
var _imageNatural = { width: 0, height: 0 };

function initAnnotationPage() {
  seedDemoData();
  _annoCurrentUser = Session.require();
  if (!_annoCurrentUser) return;

  var params = new URLSearchParams(location.search);
  _annoTaskId = params.get('taskId');
  _annoGroupId = params.get('groupId');
  _annoFileId = params.get('fileId');
  _annoSubmissionId = params.get('submissionId');

  if (!_annoTaskId || !_annoGroupId) {
    showToast('参数缺失', 'error');
    setTimeout(function() { window.location.href = 'dashboard.html'; }, 1500);
    return;
  }

  if (!_annoFileId && !_annoSubmissionId) {
    showToast('未指定文件或版本', 'error');
    setTimeout(function() { history.back(); }, 1500);
    return;
  }

  var task = Tasks.findById(_annoTaskId);
  var group = Groups.findById(_annoGroupId);
  if (!task || !group) {
    showToast('任务不存在', 'error');
    setTimeout(function() { window.location.href = 'dashboard.html'; }, 1500);
    return;
  }

  var myMember = group.members.find(function(m) { return m.userId === _annoCurrentUser.id; });
  if (!myMember) {
    showToast('你不在这个小组', 'error');
    setTimeout(function() { window.location.href = 'dashboard.html'; }, 1500);
    return;
  }

  _annoIsLeader = myMember.role === 'leader';
  _annoIsAssignee = task.assigneeId === _annoCurrentUser.id;

  // 导航栏
  document.getElementById('navbar-avatar').innerHTML = renderAvatar(_annoCurrentUser.name, 'sm');
  document.getElementById('navbar-name').textContent = _annoCurrentUser.name;

  // 确定来源类型
  if (_annoFileId) {
    _annoSrcType = 'file';
    _annoFileMeta = FileMeta.findById(_annoFileId);
    if (!_annoFileMeta) {
      showToast('文件不存在', 'error');
      setTimeout(function() { history.back(); }, 1500);
      return;
    }
    document.getElementById('anno-back-link').href = 'group.html?id=' + _annoGroupId;
  } else {
    _annoSrcType = 'submission';
    _annoSubmissionMeta = Submissions.findById(_annoSubmissionId);
    if (!_annoSubmissionMeta) {
      showToast('版本不存在', 'error');
      setTimeout(function() { history.back(); }, 1500);
      return;
    }
    document.getElementById('anno-back-link').href = 'review.html?taskId=' + _annoTaskId + '&groupId=' + _annoGroupId;
  }

  // 页头
  var assignee = Users.findById(task.assigneeId);
  document.getElementById('anno-title').textContent = '图片批注：' + task.title;
  document.getElementById('anno-subtitle').textContent =
    '负责人：' + (assignee ? assignee.name : '未分配') + ' · ' + group.name;

  loadAndRender();
  setupCanvasEvents();
}

function loadAndRender() {
  var sourceId = _annoSrcType === 'file' ? _annoFileId : _annoSubmissionId;
  var sourceMeta = _annoSrcType === 'file' ? _annoFileMeta : _annoSubmissionMeta;
  var fileName = _annoSrcType === 'file' ? sourceMeta.name : sourceMeta.fileName;
  var fileType = _annoSrcType === 'file' ? sourceMeta.type : sourceMeta.fileType;

  // 检查是否为图片类型
  var isImage = fileType && (fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fileName));
  if (!isImage) {
    showToast('该文件不是图片格式，无法进行图像批注。请上传图片文件。', 'error');
    setTimeout(function() { history.back(); }, 2500);
    return;
  }

  // 加载图片
  FileDB.get(sourceId).then(function(blob) {
    if (!blob) {
      showToast('文件数据丢失', 'error');
      setTimeout(function() { history.back(); }, 1500);
      return;
    }
    var url = URL.createObjectURL(blob);
    var img = document.getElementById('anno-image');
    img.onload = function() {
      _imageNatural.width = img.naturalWidth;
      _imageNatural.height = img.naturalHeight;
      img.style.width = img.naturalWidth + 'px';
      img.style.height = img.naturalHeight + 'px';

      // 设置 SVG 层尺寸
      var svg = document.getElementById('anno-svg');
      svg.setAttribute('viewBox', '0 0 ' + img.naturalWidth + ' ' + img.naturalHeight);
      svg.style.width = img.naturalWidth + 'px';
      svg.style.height = img.naturalHeight + 'px';

      // 默认适应屏幕
      setTimeout(function() { zoomFit(); }, 100);

      // 加载已有批注
      loadAnnotations();
    };
    img.src = url;
  }).catch(function() {
    showToast('加载文件失败', 'error');
    setTimeout(function() { history.back(); }, 1500);
  });
}

// ==================== 缩放 ====================

function setZoom(z) {
  _zoom = Math.min(_maxZoom, Math.max(_minZoom, z));
  document.getElementById('anno-canvas').style.transform = 'scale(' + _zoom + ')';
  document.getElementById('anno-zoom-label').textContent = Math.round(_zoom * 100) + '%';
}

function zoomIn() {
  setZoom(_zoom * 1.3);
}

function zoomOut() {
  setZoom(_zoom / 1.3);
}

function zoomFit() {
  var wrapper = document.getElementById('anno-canvas-wrapper');
  var padding = 40;
  var availW = wrapper.clientWidth - padding;
  var availH = wrapper.clientHeight - padding;
  var zW = availW / _imageNatural.width;
  var zH = availH / _imageNatural.height;
  setZoom(Math.min(zW, zH, 1));
}

function zoomReset() {
  setZoom(1);
}

// ==================== 工具切换 ====================

function setTool(tool) {
  _tool = tool;
  var btns = document.querySelectorAll('.anno-tool-btn');
  btns.forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
  });

  var wrapper = document.getElementById('anno-canvas-wrapper');
  wrapper.classList.remove('none-tool', 'panning');
  var hint = document.getElementById('anno-canvas-hint');

  if (tool === 'pin') {
    wrapper.style.cursor = 'crosshair';
    hint.textContent = '📌 点击图片任意位置添加图钉批注';
  } else if (tool === 'rect') {
    wrapper.style.cursor = 'crosshair';
    hint.textContent = '🔲 按住鼠标拖拽框选区域';
  } else {
    wrapper.classList.add('none-tool');
    hint.textContent = '🖱️ 拖拽移动画布 · 滚轮缩放';
  }
}

// ==================== 画布事件 ====================

function setupCanvasEvents() {
  var wrapper = document.getElementById('anno-canvas-wrapper');

  // 滚轮缩放
  wrapper.addEventListener('wheel', function(e) {
    e.preventDefault();
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(_zoom * delta);
  }, { passive: false });

  // 点击添加图钉
  wrapper.addEventListener('click', function(e) {
    if (_tool !== 'pin') return;
    if (_isRectDrawing) return;
    // 排除点击已有标注
    if (e.target.closest && (e.target.closest('.anno-pin') || e.target.closest('.anno-rect'))) return;

    var rect = document.getElementById('anno-canvas').getBoundingClientRect();
    // 计算在原始图片坐标中的位置
    var x = (e.clientX - rect.left) / _zoom;
    var y = (e.clientY - rect.top) / _zoom;

    if (x < 0 || y < 0 || x > _imageNatural.width || y > _imageNatural.height) return;

    _pendingAnnotation = { type: 'pin', x: x, y: y, width: 0, height: 0 };
    openAnnotationEditor();
  });

  // 鼠标按下（框选或平移）
  wrapper.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    if (_tool === 'rect' && !_isRectDrawing) {
      // 开始框选
      var rect = document.getElementById('anno-canvas').getBoundingClientRect();
      var x = (e.clientX - rect.left) / _zoom;
      var y = (e.clientY - rect.top) / _zoom;
      if (x < 0 || y < 0 || x > _imageNatural.width || y > _imageNatural.height) return;
      _isRectDrawing = true;
      _rectStart = { x: x, y: y };

      // 创建ghost矩形
      var svg = document.getElementById('anno-svg');
      _rectGhost = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      _rectGhost.setAttribute('x', x);
      _rectGhost.setAttribute('y', y);
      _rectGhost.setAttribute('width', 0);
      _rectGhost.setAttribute('height', 0);
      _rectGhost.setAttribute('fill', 'rgba(79,110,247,0.15)');
      _rectGhost.setAttribute('stroke', '#4F6EF7');
      _rectGhost.setAttribute('stroke-width', '2');
      _rectGhost.setAttribute('stroke-dasharray', '6 3');
      _rectGhost.setAttribute('vector-effect', 'non-scaling-stroke');
      _rectGhost.style.pointerEvents = 'none';
      svg.appendChild(_rectGhost);

      e.preventDefault();
    } else if (_tool === 'none') {
      // 开始平移
      _isPanning = true;
      _panStart = { x: e.clientX, y: e.clientY };
      _panScrollStart = { left: wrapper.scrollLeft, top: wrapper.scrollTop };
      wrapper.classList.add('panning');
      e.preventDefault();
    }
  });

  // 鼠标移动
  window.addEventListener('mousemove', function(e) {
    if (_isRectDrawing && _rectStart && _rectGhost) {
      var rect = document.getElementById('anno-canvas').getBoundingClientRect();
      var cx = (e.clientX - rect.left) / _zoom;
      var cy = (e.clientY - rect.top) / _zoom;
      var rx = Math.min(_rectStart.x, cx);
      var ry = Math.min(_rectStart.y, cy);
      var rw = Math.abs(cx - _rectStart.x);
      var rh = Math.abs(cy - _rectStart.y);
      _rectGhost.setAttribute('x', rx);
      _rectGhost.setAttribute('y', ry);
      _rectGhost.setAttribute('width', rw);
      _rectGhost.setAttribute('height', rh);
    } else if (_isPanning && _panStart) {
      var dx = e.clientX - _panStart.x;
      var dy = e.clientY - _panStart.y;
      wrapper.scrollLeft = _panScrollStart.left - dx;
      wrapper.scrollTop = _panScrollStart.top - dy;
    }
  });

  // 鼠标松开
  window.addEventListener('mouseup', function(e) {
    if (_isRectDrawing && _rectGhost) {
      _isRectDrawing = false;

      var x = parseFloat(_rectGhost.getAttribute('x'));
      var y = parseFloat(_rectGhost.getAttribute('y'));
      var w = parseFloat(_rectGhost.getAttribute('width'));
      var h = parseFloat(_rectGhost.getAttribute('height'));

      // 移除ghost
      _rectGhost.parentNode.removeChild(_rectGhost);
      _rectGhost = null;
      _rectStart = null;

      // 如果拖拽太小，视为无效
      if (w < 5 || h < 5) return;

      _pendingAnnotation = { type: 'rect', x: x, y: y, width: w, height: h };
      openAnnotationEditor();
    }

    if (_isPanning) {
      _isPanning = false;
      _panStart = null;
      document.getElementById('anno-canvas-wrapper').classList.remove('panning');
    }
  });
}

// ==================== 批注编辑弹窗 ====================

function openAnnotationEditor() {
  document.getElementById('anno-edit-title').textContent =
    _pendingAnnotation.type === 'pin' ? '添加图钉批注' : '添加区域批注';
  document.getElementById('anno-edit-content').value = '';
  document.getElementById('anno-char-count').textContent = '0';
  document.getElementById('anno-edit-error').classList.add('hidden');

  var radios = document.getElementsByName('anno-severity');
  radios[0].checked = true;

  document.getElementById('anno-edit-confirm').textContent = '保存批注';

  var textarea = document.getElementById('anno-edit-content');
  textarea.oninput = function() {
    document.getElementById('anno-char-count').textContent = textarea.value.length;
  };

  openModal('anno-edit-modal');
}

function cancelAnnotation() {
  closeModal('anno-edit-modal');
  _pendingAnnotation = null;
}

function saveAnnotation() {
  var content = document.getElementById('anno-edit-content').value.trim();
  var error = document.getElementById('anno-edit-error');
  error.classList.add('hidden');

  if (!content) {
    error.textContent = '请输入批注内容';
    error.classList.remove('hidden');
    return;
  }

  var severity = 'info';
  var radios = document.getElementsByName('anno-severity');
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) severity = radios[i].value;
  }

  var data = {
    taskId: _annoTaskId,
    groupId: _annoGroupId,
    fileId: _annoSrcType === 'file' ? _annoFileId : null,
    submissionId: _annoSrcType === 'submission' ? _annoSubmissionId : null,
    authorId: _annoCurrentUser.id,
    content: content,
    severity: severity,
    type: _pendingAnnotation.type,
    x: Math.round(_pendingAnnotation.x),
    y: Math.round(_pendingAnnotation.y),
    width: Math.round(_pendingAnnotation.width),
    height: Math.round(_pendingAnnotation.height)
  };

  Annotations.create(data);

  closeModal('anno-edit-modal');
  _pendingAnnotation = null;
  showToast('批注已添加', 'success');

  // 通知任务负责人
  var task = Tasks.findById(_annoTaskId);
  if (task && task.assigneeId !== _annoCurrentUser.id) {
    Notify.send('收到图片批注', _annoCurrentUser.name + ' 对你的作业图片添加了批注');
  }

  loadAnnotations();
}

function renderAnnotationsOnCanvas() {
  var svg = document.getElementById('anno-svg');

  // 清除旧标注（保留 defs）
  var toRemove = [];
  for (var i = 0; i < svg.children.length; i++) {
    var child = svg.children[i];
    if (child.tagName !== 'defs') toRemove.push(child);
  }
  toRemove.forEach(function(c) { c.parentNode.removeChild(c); });

  var list = getFilteredAnnotations();

  list.forEach(function(a, idx) {
    var isResolved = a.status === 'resolved';
    var severity = a.severity || 'info';

    if (a.type === 'pin') {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'anno-pin');
      g.setAttribute('data-anno-id', a.id);
      g.style.cursor = 'pointer';

      // 图钉圆圈
      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', a.x);
      circle.setAttribute('cy', a.y);
      circle.setAttribute('r', isResolved ? 12 : 14);
      circle.setAttribute('class',
        'anno-pin-circle ' + severity + (isResolved ? ' resolved-status' : ''));
      g.appendChild(circle);

      // 编号
      var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', a.x);
      text.setAttribute('y', a.y);
      text.setAttribute('class', 'anno-pin-number');
      text.textContent = idx + 1;
      g.appendChild(text);

      // 点击事件
      g.addEventListener('click', function(e) {
        e.stopPropagation();
        selectAnnotation(a.id);
      });

      svg.appendChild(g);

    } else if (a.type === 'rect') {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-anno-id', a.id);
      g.style.cursor = 'pointer';

      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', a.x);
      rect.setAttribute('y', a.y);
      rect.setAttribute('width', a.width);
      rect.setAttribute('height', a.height);
      rect.setAttribute('class',
        'anno-rect ' + severity + (isResolved ? ' resolved-status' : ''));
      g.appendChild(rect);

      // 标签背景
      var labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      var labelW = (idx + 1 > 9 ? 22 : 16);
      labelBg.setAttribute('x', a.x + 2);
      labelBg.setAttribute('y', a.y + 2);
      labelBg.setAttribute('width', labelW);
      labelBg.setAttribute('height', 16);
      labelBg.setAttribute('rx', 2);
      labelBg.setAttribute('class',
        'anno-rect-label-bg ' + severity + (isResolved ? ' resolved-status' : ''));
      g.appendChild(labelBg);

      var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', a.x + 2 + labelW / 2);
      label.setAttribute('y', a.y + 2 + 8);
      label.setAttribute('class', 'anno-rect-label');
      label.textContent = idx + 1;
      g.appendChild(label);

      g.addEventListener('click', function(e) {
        e.stopPropagation();
        selectAnnotation(a.id);
      });

      svg.appendChild(g);
    }
  });

  document.getElementById('anno-count').textContent = list.length + ' 条批注';
}

function getFilteredAnnotations() {
  var all = _annoSrcType === 'file'
    ? Annotations.forFile(_annoFileId)
    : Annotations.forSubmission(_annoSubmissionId);

  if (_filter === 'pending') all = all.filter(function(a) { return a.status === 'pending'; });
  if (_filter === 'resolved') all = all.filter(function(a) { return a.status === 'resolved'; });

  _annotations = all;
  return all;
}

function loadAnnotations() {
  var list = getFilteredAnnotations();
  renderAnnotationsOnCanvas();
  renderAnnotationList();
}

function renderAnnotationList() {
  var container = document.getElementById('anno-list');
  var list = _annotations;

  if (list.length === 0) {
    var filterLabel = _filter === 'all' ? '' : (_filter === 'pending' ? '待处理' : '已处理');
    container.innerHTML = '<div class="loading-hint" style="padding:24px;text-align:center">' +
      (filterLabel ? '没有' + filterLabel + '的批注' : '暂无批注，点击图片添加图钉') + '</div>';
    return;
  }

  container.innerHTML = list.map(function(a, idx) {
    var author = Users.findById(a.authorId);
    var isResolved = a.status === 'resolved';
    var severity = a.severity || 'info';
    var severityLabels = { info: '建议', warning: '注意', critical: '严重' };
    var canResolve = (_annoIsAssignee || _annoIsLeader || a.authorId === _annoCurrentUser.id) && !isResolved;
    var canReopen = (_annoIsAssignee || _annoIsLeader || a.authorId === _annoCurrentUser.id) && isResolved;
    var canDelete = a.authorId === _annoCurrentUser.id || _annoIsLeader;
    var isActive = a.id === _selectedAnnoId;

    return '<div class="anno-item ' + (isResolved ? 'resolved' : '') + (isActive ? ' active' : '') +
      '" onclick="selectAnnotation(\'' + a.id + '\')" id="anno-list-item-' + a.id + '">' +
      '<div class="anno-item-header">' +
      '<div class="anno-item-pin ' + severity + (isResolved ? ' resolved-status' : '') + '">' +
      (a.type === 'pin' ? '📍' : '🔲') + (idx + 1) +
      '</div>' +
      '<span class="anno-item-author">' + escHtml(author ? author.name : '?') + '</span>' +
      '<span class="anno-item-time">' + formatDate(a.createdAt) + '</span>' +
      '</div>' +
      '<div class="anno-item-content">' + escHtml(a.content) + '</div>' +
      '<div class="anno-item-meta">' +
      '<span class="anno-item-badge ' + severity + '">' + severityLabels[severity] + '</span>' +
      '<span class="anno-item-badge ' + (isResolved ? 'resolved' : 'info') + '">' +
      (isResolved ? '✓ 已处理' : '⏳ 待处理') + '</span>' +
      (a.type === 'rect' ? '<span class="anno-item-badge info" style="font-size:11px">区域批注</span>' : '') +
      '</div>' +
      '<div class="anno-item-actions" onclick="event.stopPropagation()">' +
      (canResolve ? '<button type="button" class="btn btn-ghost btn-sm" onclick="resolveAnnotation(\'' + a.id + '\')">✓ 标记已处理</button>' : '') +
      (canReopen ? '<button type="button" class="btn btn-ghost btn-sm" onclick="reopenAnnotation(\'' + a.id + '\')">↩ 重新打开</button>' : '') +
      (canDelete ? '<button type="button" class="btn btn-ghost btn-sm" onclick="deleteAnnotation(\'' + a.id + '\')" style="color:var(--danger)">🗑️ 删除</button>' : '') +
      '</div>' +
      '</div>';
  }).join('');
}

function selectAnnotation(annoId) {
  _selectedAnnoId = annoId;
  renderAnnotationList();

  // 高亮 SVG 标注并滚动到视图
  var svg = document.getElementById('anno-svg');
  var el = svg.querySelector('[data-anno-id="' + annoId + '"]');
  if (el) {
    // 短暂缩放闪烁效果
    var origTransform = el.style.transform || '';
    el.style.transform = 'scale(1.3)';
    setTimeout(function() { el.style.transform = origTransform; }, 200);
  }

  // 滚动侧边栏到对应项
  var listItem = document.getElementById('anno-list-item-' + annoId);
  if (listItem) {
    listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function resolveAnnotation(annoId) {
  Annotations.update(annoId, { status: 'resolved', resolvedAt: Date.now(), resolvedBy: _annoCurrentUser.id });
  showToast('批注已标记为处理完成', 'success');
  loadAnnotations();
}

function reopenAnnotation(annoId) {
  Annotations.update(annoId, { status: 'pending', resolvedAt: null, resolvedBy: null });
  showToast('批注已重新打开', 'success');
  loadAnnotations();
}

function deleteAnnotation(annoId) {
  if (!confirm('确定删除这条批注吗？')) return;
  Annotations.delete(annoId);
  _selectedAnnoId = null;
  showToast('批注已删除', 'success');
  loadAnnotations();
}

function filterAnnotations(type) {
  _filter = type;
  var btns = document.querySelectorAll('.anno-filter-btn');
  btns.forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === type);
  });
  loadAnnotations();
}

// ==================== Modal helpers ====================

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
});