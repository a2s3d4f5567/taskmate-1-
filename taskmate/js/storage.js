// storage.js — 数据层，封装 localStorage + IndexedDB

var DB_NAME = 'taskmate';
var DB_VERSION = 1;
var FILE_STORE = 'files';

var _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = function(e) { _db = e.target.result; resolve(_db); };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

var FileDB = {
  save: async function(id, blob) {
    var db = await openDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).put({ id: id, blob: blob });
      tx.oncomplete = resolve;
      tx.onerror = function(e) { reject(e.target.error); };
    });
  },
  get: async function(id) {
    var db = await openDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(FILE_STORE, 'readonly');
      var req = tx.objectStore(FILE_STORE).get(id);
      req.onsuccess = function(e) { resolve(e.target.result ? e.target.result.blob : null); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  },
  delete: async function(id) {
    var db = await openDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = function(e) { reject(e.target.error); };
    });
  }
};

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e) { return null; }
}
function lsSet(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function getAll(collection) { return lsGet(collection) || []; }
function saveAll(collection, items) { lsSet(collection, items); }
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

var Users = {
  getAll: function() { return getAll('users'); },
  findByEmail: function(email) { return Users.getAll().find(function(u) { return u.email.toLowerCase() === email.toLowerCase(); }); },
  findById: function(id) { return Users.getAll().find(function(u) { return u.id === id; }); },
  create: function(data) {
    var users = Users.getAll();
    var user = { id: genId(), createdAt: Date.now() };
    for (var k in data) user[k] = data[k];
    users.push(user); saveAll('users', users); return user;
  },
  update: function(id, patch) {
    var users = Users.getAll().map(function(u) { return u.id === id ? mergeObjects(u, patch) : u; });
    saveAll('users', users); return users.find(function(u) { return u.id === id; });
  }
};

function mergeObjects(a, b) { var r = {}; for (var k in a) r[k] = a[k]; for (var k in b) r[k] = b[k]; return r; }

var Classes = {
  getAll: function() { return getAll('classes'); },
  findById: function(id) { return Classes.getAll().find(function(c) { return c.id === id; }); },
  findByInviteCode: function(code) { return Classes.getAll().find(function(c) { return c.inviteCode === code.toUpperCase(); }); },
  forUser: function(userId) { return Classes.getAll().filter(function(c) { return c.members.some(function(m) { return m.userId === userId; }); }); },
  create: function(data) {
    var classes = Classes.getAll();
    var cls = { id: genId(), createdAt: Date.now(), inviteCode: genInviteCode(), members: [] };
    for (var k in data) cls[k] = data[k];
    classes.push(cls); saveAll('classes', classes); return cls;
  },
  update: function(id, patch) {
    var classes = Classes.getAll().map(function(c) { return c.id === id ? mergeObjects(c, patch) : c; });
    saveAll('classes', classes); return classes.find(function(c) { return c.id === id; });
  },
  addMember: function(classId, userId, role) {
    role = role || 'member';
    var cls = Classes.findById(classId); if (!cls) return null;
    if (cls.members.some(function(m) { return m.userId === userId; })) return cls;
    cls.members.push({ userId: userId, role: role, joinedAt: Date.now() });
    Classes.update(classId, { members: cls.members }); return Classes.findById(classId);
  },
  removeMember: function(classId, userId) {
    var cls = Classes.findById(classId); if (!cls) return;
    Classes.update(classId, { members: cls.members.filter(function(m) { return m.userId !== userId; }) });
  },
  getMemberUsers: function(classId, excludeUserId) {
    var cls = Classes.findById(classId); if (!cls) return [];
    return cls.members.filter(function(m) { return m.userId !== excludeUserId; }).map(function(m) {
      var u = Users.findById(m.userId); if (!u) return null;
      return mergeObjects(u, { classRole: m.role });
    }).filter(Boolean);
  }
};

var Groups = {
  getAll: function() { return getAll('groups'); },
  findById: function(id) { return Groups.getAll().find(function(g) { return g.id === id; }); },
  findByInviteCode: function(code) { return Groups.getAll().find(function(g) { return g.inviteCode === code.toUpperCase(); }); },
  forUser: function(userId) { return Groups.getAll().filter(function(g) { return g.members.some(function(m) { return m.userId === userId; }); }); },
  create: function(data) {
    var groups = Groups.getAll();
    var group = { id: genId(), createdAt: Date.now(), inviteCode: genInviteCode(), members: [] };
    for (var k in data) group[k] = data[k];
    groups.push(group); saveAll('groups', groups); return group;
  },
  update: function(id, patch) {
    var groups = Groups.getAll().map(function(g) { return g.id === id ? mergeObjects(g, patch) : g; });
    saveAll('groups', groups); return groups.find(function(g) { return g.id === id; });
  },
  addMember: function(groupId, userId, role) {
    role = role || 'member';
    var group = Groups.findById(groupId); if (!group) return null;
    if (group.members.some(function(m) { return m.userId === userId; })) return group;
    if (group.classId) {
      var cls = Classes.findById(group.classId);
      if (cls && !cls.members.some(function(m) { return m.userId === userId; })) return null;
    }
    group.members.push({ userId: userId, role: role, joinedAt: Date.now() });
    Groups.update(groupId, { members: group.members }); return Groups.findById(groupId);
  },
  delete: function(id) {
    saveAll('groups', Groups.getAll().filter(function(g) { return g.id !== id; }));
    Tasks.deleteByGroup(id); Bills.deleteByGroup(id);
  }
};

function genInviteCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

var Tasks = {
  getAll: function() { return getAll('tasks'); },
  findById: function(id) { return Tasks.getAll().find(function(t) { return t.id === id; }); },
  forGroup: function(groupId) { return Tasks.getAll().filter(function(t) { return t.groupId === groupId; }); },
  forUser: function(userId) { return Tasks.getAll().filter(function(t) { return t.assigneeId === userId; }); },
  create: function(data) {
    var tasks = Tasks.getAll();
    var task = { id: genId(), createdAt: Date.now(), status: 'todo' };
    for (var k in data) task[k] = data[k];
    tasks.push(task); saveAll('tasks', tasks); return task;
  },
  update: function(id, patch) {
    var tasks = Tasks.getAll().map(function(t) { return t.id === id ? mergeObjects(t, patch) : t; });
    saveAll('tasks', tasks); return tasks.find(function(t) { return t.id === id; });
  },
  delete: function(id) {
    saveAll('tasks', Tasks.getAll().filter(function(t) { return t.id !== id; }));
    FileMeta.deleteByTask(id); Submissions.deleteByTask(id);
  },
  deleteByGroup: function(groupId) {
    var toDelete = Tasks.forGroup(groupId);
    toDelete.forEach(function(t) { FileMeta.deleteByTask(t.id); Submissions.deleteByTask(t.id); });
    saveAll('tasks', Tasks.getAll().filter(function(t) { return t.groupId !== groupId; }));
  }
};

var FileMeta = {
  getAll: function() { return getAll('filemeta'); },
  findById: function(id) { return FileMeta.getAll().find(function(f) { return f.id === id; }); },
  forTask: function(taskId) { return FileMeta.getAll().filter(function(f) { return f.taskId === taskId; }); },
  create: async function(data, blob) {
    var files = FileMeta.getAll();
    var file = { id: genId(), uploadedAt: Date.now() };
    for (var k in data) file[k] = data[k];
    files.push(file); saveAll('filemeta', files);
    await FileDB.save(file.id, blob); return file;
  },
  delete: async function(id) {
    saveAll('filemeta', FileMeta.getAll().filter(function(f) { return f.id !== id; }));
    await FileDB.delete(id);
  },
  deleteByTask: function(taskId) {
    var toDelete = FileMeta.forTask(taskId);
    toDelete.forEach(function(f) { FileDB.delete(f.id); });
    saveAll('filemeta', FileMeta.getAll().filter(function(f) { return f.taskId !== taskId; }));
  }
};

var Submissions = {
  getAll: function() { return getAll('submissions'); },
  findById: function(id) { return Submissions.getAll().find(function(s) { return s.id === id; }); },
  forTask: function(taskId) { return Submissions.getAll().filter(function(s) { return s.taskId === taskId; }).sort(function(a, b) { return b.createdAt - a.createdAt; }); },
  originalsForTask: function(taskId) { return Submissions.getAll().filter(function(s) { return s.taskId === taskId && s.type !== 'revision'; }).sort(function(a, b) { return b.version - a.version; }); },
  revisionsFor: function(originalSubId) { return Submissions.getAll().filter(function(s) { return s.originalSubId === originalSubId; }).sort(function(a, b) { return a.createdAt - b.createdAt; }); },
  latestOriginalForTask: function(taskId) {
    var all = Submissions.originalsForTask(taskId);
    return all.length ? all[0] : null;
  },
  create: async function(data, blob) {
    var all = Submissions.getAll();
    var existing = Submissions.originalsForTask(data.taskId);
    var version = (data.type === 'revision') ? null : (existing.length ? existing[0].version + 1 : 1);
    var sub = { id: genId(), createdAt: Date.now(), type: 'original', version: version };
    for (var k in data) sub[k] = data[k];
    all.push(sub); saveAll('submissions', all);
    if (blob) await FileDB.save(sub.id, blob); return sub;
  },
  update: function(id, patch) {
    var all = Submissions.getAll().map(function(s) { return s.id === id ? mergeObjects(s, patch) : s; });
    saveAll('submissions', all); return all.find(function(s) { return s.id === id; });
  },
  delete: async function(id) {
    saveAll('submissions', Submissions.getAll().filter(function(s) { return s.id !== id; }));
    await FileDB.delete(id); Comments.deleteBySubmission(id);
  },
  deleteByTask: function(taskId) {
    var toDelete = Submissions.forTask(taskId);
    toDelete.forEach(function(s) { FileDB.delete(s.id); Comments.deleteBySubmission(s.id); });
    saveAll('submissions', Submissions.getAll().filter(function(s) { return s.taskId !== taskId; }));
  }
};

var Comments = {
  getAll: function() { return getAll('comments'); },
  findById: function(id) { return Comments.getAll().find(function(c) { return c.id === id; }); },
  forSubmission: function(subId) { return Comments.getAll().filter(function(c) { return c.submissionId === subId; }).sort(function(a, b) { return a.createdAt - b.createdAt; }); },
  forTask: function(taskId) { return Comments.getAll().filter(function(c) { return c.taskId === taskId; }); },
  pendingForTask: function(taskId) { return Comments.forTask(taskId).filter(function(c) { return c.status === 'pending'; }); },
  create: function(data) {
    var all = Comments.getAll();
    var comment = { id: genId(), createdAt: Date.now(), status: 'pending' };
    for (var k in data) comment[k] = data[k];
    all.push(comment); saveAll('comments', all); return comment;
  },
  update: function(id, patch) {
    var all = Comments.getAll().map(function(c) { return c.id === id ? mergeObjects(c, patch) : c; });
    saveAll('comments', all); return all.find(function(c) { return c.id === id; });
  },
  delete: function(id) { saveAll('comments', Comments.getAll().filter(function(c) { return c.id !== id; })); },
  deleteBySubmission: function(subId) { saveAll('comments', Comments.getAll().filter(function(c) { return c.submissionId !== subId; })); }
};

var Ratings = {
  getAll: function() { return getAll('ratings'); },
  findById: function(id) { return Ratings.getAll().find(function(r) { return r.id === id; }); },
  forTask: function(taskId) { return Ratings.getAll().filter(function(r) { return r.taskId === taskId; }); },
  forUser: function(userId) { return Ratings.getAll().filter(function(r) { return r.assigneeId === userId; }); },
  forGroup: function(groupId) { return Ratings.getAll().filter(function(r) { return r.groupId === groupId; }); },
  create: function(data) {
    var all = Ratings.getAll();
    var rating = { id: genId(), createdAt: Date.now() };
    for (var k in data) rating[k] = data[k];
    all.push(rating); saveAll('ratings', all); return rating;
  },
  update: function(id, patch) {
    var all = Ratings.getAll().map(function(r) { return r.id === id ? mergeObjects(r, patch) : r; });
    saveAll('ratings', all); return all.find(function(r) { return r.id === id; });
  },
  delete: function(id) { saveAll('ratings', Ratings.getAll().filter(function(r) { return r.id !== id; })); },
  deleteByTask: function(taskId) { saveAll('ratings', Ratings.getAll().filter(function(r) { return r.taskId !== taskId; })); },
  // 计算用户在小组内的总分（按权重）
  totalScoreForUserInGroup: function(userId, groupId) {
    var ratings = Ratings.getAll().filter(function(r) { return r.assigneeId === userId && r.groupId === groupId; });
    if (!ratings.length) return 0;
    var total = 0;
    ratings.forEach(function(r) {
      var leaderScore = r.leaderScore || 0;
      var memberAvg = r.memberAvg || 0;
      var aiScore = r.aiScore || 0;
      var completion = r.completion || 0;
      total += leaderScore * 0.35 + memberAvg * 0.30 + aiScore * 0.20 + completion * 0.15;
    });
    return Math.round(total / ratings.length);
  },
  // 计算用户综合等级
  levelForUserInGroup: function(userId, groupId) {
    var score = Ratings.totalScoreForUserInGroup(userId, groupId);
    if (score >= 90) return { level: 'S', label: '卓越', color: 'gold' };
    if (score >= 80) return { level: 'A', label: '优秀', color: 'green' };
    if (score >= 70) return { level: 'B', label: '良好', color: 'blue' };
    if (score >= 60) return { level: 'C', label: '合格', color: 'gray' };
    return { level: 'D', label: '待提升', color: 'red' };
  },
  // 判断成员是否有资格担任组长（C级及以上）
  canBeLeader: function(userId, groupId) {
    var ratings = Ratings.getAll().filter(function(r) { return r.assigneeId === userId && r.groupId === groupId; });
    if (!ratings.length) return true; // 无评分记录默认允许
    var info = Ratings.levelForUserInGroup(userId, groupId);
    return info.level !== 'D';
  }
};

var Annotations = {
  getAll: function() { return getAll('annotations'); },
  findById: function(id) { return Annotations.getAll().find(function(a) { return a.id === id; }); },
  forTask: function(taskId) { return Annotations.getAll().filter(function(a) { return a.taskId === taskId; }).sort(function(a, b) { return a.createdAt - b.createdAt; }); },
  forFile: function(fileId) { return Annotations.getAll().filter(function(a) { return a.fileId === fileId; }).sort(function(a, b) { return a.createdAt - b.createdAt; }); },
  forSubmission: function(subId) { return Annotations.getAll().filter(function(a) { return a.submissionId === subId; }).sort(function(a, b) { return a.createdAt - b.createdAt; }); },
  pendingForTask: function(taskId) { return Annotations.forTask(taskId).filter(function(a) { return a.status === 'pending'; }); },
  create: function(data) {
    var all = Annotations.getAll();
    var ann = { id: genId(), createdAt: Date.now(), status: 'pending' };
    for (var k in data) ann[k] = data[k];
    all.push(ann); saveAll('annotations', all); return ann;
  },
  update: function(id, patch) {
    var all = Annotations.getAll().map(function(a) { return a.id === id ? mergeObjects(a, patch) : a; });
    saveAll('annotations', all); return all.find(function(a) { return a.id === id; });
  },
  delete: function(id) { saveAll('annotations', Annotations.getAll().filter(function(a) { return a.id !== id; })); },
  deleteByTask: function(taskId) { saveAll('annotations', Annotations.getAll().filter(function(a) { return a.taskId !== taskId; })); },
  deleteByFile: function(fileId) { saveAll('annotations', Annotations.getAll().filter(function(a) { return a.fileId !== fileId; })); }
};

var Bills = {
  getAll: function() { return getAll('bills'); },
  findById: function(id) { return Bills.getAll().find(function(b) { return b.id === id; }); },
  forGroup: function(groupId) { return Bills.getAll().filter(function(b) { return b.groupId === groupId; }).sort(function(a, b) { return b.createdAt - a.createdAt; }); },
  create: function(data) {
    var all = Bills.getAll();
    var bill = { id: genId(), createdAt: Date.now(), settled: false };
    for (var k in data) bill[k] = data[k];
    all.push(bill); saveAll('bills', all); return bill;
  },
  update: function(id, patch) {
    var all = Bills.getAll().map(function(b) { return b.id === id ? mergeObjects(b, patch) : b; });
    saveAll('bills', all); return all.find(function(b) { return b.id === id; });
  },
  delete: async function(id) {
    var bill = Bills.findById(id);
    if (bill && bill.receiptId) await FileDB.delete(bill.receiptId);
    saveAll('bills', Bills.getAll().filter(function(b) { return b.id !== id; }));
  },
  deleteByGroup: function(groupId) {
    var toDelete = Bills.forGroup(groupId);
    toDelete.forEach(function(b) { if (b.receiptId) FileDB.delete(b.receiptId); });
    saveAll('bills', Bills.getAll().filter(function(b) { return b.groupId !== groupId; }));
  },
  balanceForUser: function(groupId, userId) {
    var bills = Bills.forGroup(groupId);
    var balance = 0;
    bills.forEach(function(b) {
      if (b.settled) return;
      var split = b.splitMembers || [];
      var myShare = split.find(function(s) { return s.userId === userId; });
      if (b.paidBy === userId) {
        balance -= split.filter(function(s) { return s.userId !== userId; }).reduce(function(sum, s) { return sum + s.amount; }, 0);
      } else if (myShare) {
        balance += myShare.amount;
      }
    });
    return balance;
  }
};

var Ideas = {
  getAll: function() { return getAll('ideas'); },
  findById: function(id) { return Ideas.getAll().find(function(i) { return i.id === id; }); },
  forGroup: function(groupId) { return Ideas.getAll().filter(function(i) { return i.groupId === groupId; }).sort(function(a, b) { return b.createdAt - a.createdAt; }); },
  create: function(data) {
    var ideas = Ideas.getAll();
    var idea = { id: genId(), createdAt: Date.now() };
    for (var k in data) idea[k] = data[k];
    ideas.push(idea); saveAll('ideas', ideas); return idea;
  },
  update: function(id, patch) {
    var ideas = Ideas.getAll().map(function(i) { return i.id === id ? mergeObjects(i, patch) : i; });
    saveAll('ideas', ideas); return ideas.find(function(i) { return i.id === id; });
  },
  delete: function(id) { saveAll('ideas', Ideas.getAll().filter(function(i) { return i.id !== id; })); },
  deleteByGroup: function(groupId) { saveAll('ideas', Ideas.getAll().filter(function(i) { return i.groupId !== groupId; })); }
};

var Announcements = {
  getAll: function() { return getAll('announcements'); },
  forClass: function(classId) { return Announcements.getAll().filter(function(a) { return a.classId === classId; }).sort(function(a, b) { return b.createdAt - a.createdAt; }); },
  create: function(data) {
    var list = Announcements.getAll();
    var a = { id: genId(), createdAt: Date.now() };
    for (var k in data) a[k] = data[k];
    list.push(a); saveAll('announcements', list); return a;
  },
  update: function(id, patch) {
    var list = Announcements.getAll().map(function(a) { return a.id === id ? mergeObjects(a, patch) : a; });
    saveAll('announcements', list); return list.find(function(a) { return a.id === id; });
  },
  delete: function(id) { saveAll('announcements', Announcements.getAll().filter(function(a) { return a.id !== id; })); }
};

var GroupArchives = {
  getAll: function() { return getAll('groupArchives'); },
  forUser: function(userId) { return GroupArchives.getAll().filter(function(a) { return a.userId === userId; }); },
  findByGroupId: function(groupId, userId) { return GroupArchives.getAll().find(function(a) { return a.groupId === groupId && a.userId === userId; }); },
  archive: function(group, userId) {
    var list = GroupArchives.getAll();
    var existing = list.find(function(a) { return a.groupId === group.id && a.userId === userId; });
    if (existing) return existing;
    var a = { id: genId(), groupId: group.id, userId: userId, archivedAt: Date.now(), snapshot: group };
    list.push(a); saveAll('groupArchives', list); return a;
  },
  unarchive: function(groupId, userId) {
    saveAll('groupArchives', GroupArchives.getAll().filter(function(a) { return !(a.groupId === groupId && a.userId === userId); }));
  },
  isArchived: function(groupId, userId) { return !!GroupArchives.findByGroupId(groupId, userId); }
};

var DocLinks = {
  getAll: function() { return getAll('doclinks'); },
  forClass: function(classId) { return DocLinks.getAll().filter(function(d) { return d.classId === classId; }).sort(function(a, b) { return b.createdAt - a.createdAt; }); },
  create: function(data) {
    var list = DocLinks.getAll();
    var d = { id: genId(), createdAt: Date.now() };
    for (var k in data) d[k] = data[k];
    list.push(d); saveAll('doclinks', list); return d;
  },
  update: function(id, patch) {
    var list = DocLinks.getAll().map(function(d) { return d.id === id ? mergeObjects(d, patch) : d; });
    saveAll('doclinks', list); return list.find(function(d) { return d.id === id; });
  },
  delete: function(id) { saveAll('doclinks', DocLinks.getAll().filter(function(d) { return d.id !== id; })); }
};

var DB = {
  get: function() { return getAll('db') || {}; },
  set: function(data) { saveAll('db', data); }
};

var Session = {
  get: function() { try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null'); } catch(e) { return null; } },
  set: function(user) { sessionStorage.setItem('currentUser', JSON.stringify(user)); },
  clear: function() { sessionStorage.removeItem('currentUser'); },
  require: function() {
    var user = Session.get();
    if (!user) { window.location.href = 'index.html'; return null; }
    return user;
  }
};

function seedDemoData() {
  if (lsGet('_seeded')) return;
  var alice = Users.create({ email: 'alice@demo.com', password: btoa('demo123'), name: '小张', skills: ['文案撰写', 'PPT制作'] });
  var bob   = Users.create({ email: 'bob@demo.com',   password: btoa('demo123'), name: '小李', skills: ['资料搜集', '数据分析'] });
  var carol = Users.create({ email: 'carol@demo.com', password: btoa('demo123'), name: '小王', skills: ['设计排版', 'PPT制作'] });
  var dave  = Users.create({ email: 'dave@demo.com',  password: btoa('demo123'), name: '小赵', skills: ['资料搜集', '翻译校对'] });
  var eve   = Users.create({ email: 'eve@demo.com',   password: btoa('demo123'), name: '小陈', skills: ['视频剪辑', '设计排版'] });
  var cls = Classes.create({ name: '市场营销2301班', school: '商学院', creatorId: alice.id });
  Classes.addMember(cls.id, alice.id, 'admin');
  Classes.addMember(cls.id, bob.id,   'member');
  Classes.addMember(cls.id, carol.id, 'member');
  Classes.addMember(cls.id, dave.id,  'member');
  Classes.addMember(cls.id, eve.id,   'member');
  var group = Groups.create({ name: '市场营销期末项目', course: '市场营销学', creatorId: alice.id, classId: cls.id });
  Groups.addMember(group.id, alice.id, 'leader');
  Groups.addMember(group.id, bob.id,   'member');
  Groups.addMember(group.id, carol.id, 'member');
  var deadline1 = Date.now() + 2 * 24 * 60 * 60 * 1000;
  var deadline2 = Date.now() + 5 * 24 * 60 * 60 * 1000;
  var deadline3 = Date.now() + 7 * 24 * 60 * 60 * 1000;
  Tasks.create({ groupId: group.id, title: '市场调研报告', desc: '收集竞品分析数据，撰写5000字调研报告', assigneeId: bob.id,   deadline: deadline1, createdBy: alice.id, status: 'done' });
  Tasks.create({ groupId: group.id, title: 'PPT制作',     desc: '根据调研报告制作20页演示文稿，风格简洁专业',              assigneeId: carol.id, deadline: deadline2, createdBy: alice.id, status: 'doing' });
  Tasks.create({ groupId: group.id, title: '演讲稿撰写',  desc: '为每位组员准备3分钟演讲稿',                              assigneeId: alice.id, deadline: deadline3, createdBy: alice.id, status: 'todo' });
  Ideas.create({ groupId: group.id, authorId: alice.id, authorName: '小张', content: '我觉得可以先用问卷调查收集消费者偏好数据，样本量至少200份，覆盖不同年龄段。' });
  Ideas.create({ groupId: group.id, authorId: bob.id,   authorName: '小李', content: '数据分析这块我可以用 Excel 做交叉分析，看不同人群的消费习惯差异，我可以负责这个部分。' });
  Ideas.create({ groupId: group.id, authorId: carol.id, authorName: '小王', content: 'PPT 设计我建议用深蓝色主色调，配合数据图表更专业，我之前做过类似的模板可以直接用。' });
  Ideas.create({ groupId: group.id, authorId: alice.id, authorName: '小张', content: '演讲部分需要提前排练，建议每人先录一段 2 分钟試讲，互相提意见。汇报时间控制在15分钟以内。' });
  lsSet('_seeded', true);
}