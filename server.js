const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

/* ---------------- storage ---------------- */

function seed() {
  return {
    users: [
      { id: 'u1', name: 'Admin', email: 'admin@institute.com', password: 'admin123', role: 'admin' },
      { id: 'u2', name: 'Priya Sharma', email: 'teacher@institute.com', password: 'teacher123', role: 'teacher' },
      { id: 'u3', name: 'Rahul Verma', email: 'student@institute.com', password: 'student123', role: 'student' }
    ],
    courses: [],
    notes: [],
    quizzes: [],
    results: []
  };
}

let db;
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {
  db = seed();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

const id = () => crypto.randomBytes(6).toString('hex');

/* ---------------- sessions ---------------- */

const sessions = new Map(); // token -> userId

function currentUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  const userId = sessions.get(token);
  if (!userId) return null;
  return db.users.find(u => u.id === userId) || null;
}

/* ---------------- helpers ---------------- */

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 25 * 1024 * 1024) reject(new Error('too large'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
  });
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

function courseForUser(courseId, user) {
  const course = db.courses.find(c => c.id === courseId);
  if (!course) return null;
  if (user.role === 'admin') return course;
  if (user.role === 'teacher' && course.teacherId === user.id) return course;
  if (user.role === 'student' && course.studentIds.includes(user.id)) return course;
  return null;
}

/* ---------------- api ---------------- */

async function api(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean).slice(1);
  const method = req.method;
  const body = (method === 'POST' || method === 'PUT') ? await readBody(req) : {};

  // POST /api/login
  if (seg[0] === 'login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const user = db.users.find(u => u.email.toLowerCase() === email && u.password === body.password);
    if (!user) return send(res, 401, { error: 'Incorrect email or password.' });
    const token = crypto.randomBytes(16).toString('hex');
    sessions.set(token, user.id);
    return send(res, 200, { token, user: publicUser(user) });
  }

  const me = currentUser(req);
  if (!me) return send(res, 401, { error: 'Please log in again.' });

  // POST /api/logout
  if (seg[0] === 'logout' && method === 'POST') {
    sessions.delete((req.headers['authorization'] || '').replace('Bearer ', ''));
    return send(res, 200, { ok: true });
  }

  // GET /api/me
  if (seg[0] === 'me' && method === 'GET') {
    return send(res, 200, { user: publicUser(me) });
  }

  /* ----- users (admin only) ----- */
  if (seg[0] === 'users') {
    if (me.role !== 'admin') return send(res, 403, { error: 'Not allowed.' });

    if (method === 'GET' && !seg[1]) {
      return send(res, 200, { users: db.users.map(publicUser) });
    }

    if (method === 'POST' && !seg[1]) {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const password = String(body.password || '');
      const role = body.role === 'teacher' ? 'teacher' : 'student';
      if (!name || !email || !password) return send(res, 400, { error: 'Name, email and password are required.' });
      if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase()))
        return send(res, 400, { error: 'That email is already in use.' });
      const user = { id: id(), name, email, password, role };
      db.users.push(user);
      save();
      return send(res, 200, { user: publicUser(user) });
    }

    if (method === 'DELETE' && seg[1]) {
      const target = db.users.find(u => u.id === seg[1]);
      if (!target) return send(res, 404, { error: 'User not found.' });
      if (target.role === 'admin') return send(res, 400, { error: 'The admin account cannot be removed.' });
      db.users = db.users.filter(u => u.id !== target.id);
      db.courses = db.courses.filter(c => c.teacherId !== target.id);
      db.courses.forEach(c => { c.studentIds = c.studentIds.filter(s => s !== target.id); });
      db.results = db.results.filter(r => r.studentId !== target.id);
      save();
      return send(res, 200, { ok: true });
    }
  }

  /* ----- courses ----- */
  if (seg[0] === 'courses') {

    // GET /api/courses
    if (method === 'GET' && !seg[1]) {
      let list;
      if (me.role === 'teacher') list = db.courses.filter(c => c.teacherId === me.id);
      else if (me.role === 'student') list = db.courses.filter(c => c.studentIds.includes(me.id));
      else list = db.courses;
      return send(res, 200, {
        courses: list.map(c => ({
          id: c.id,
          title: c.title,
          description: c.description,
          teacher: (db.users.find(u => u.id === c.teacherId) || {}).name || 'Unknown',
          noteCount: db.notes.filter(n => n.courseId === c.id).length,
          quizCount: db.quizzes.filter(q => q.courseId === c.id).length,
          studentCount: c.studentIds.length
        }))
      });
    }

    // POST /api/courses
    if (method === 'POST' && !seg[1]) {
      if (me.role !== 'teacher') return send(res, 403, { error: 'Only teachers can create courses.' });
      const title = String(body.title || '').trim();
      if (!title) return send(res, 400, { error: 'Course name is required.' });
      const course = {
        id: id(),
        title,
        description: String(body.description || '').trim(),
        teacherId: me.id,
        studentIds: []
      };
      db.courses.push(course);
      save();
      return send(res, 200, { course });
    }

    const course = seg[1] ? courseForUser(seg[1], me) : null;
    if (seg[1] && !course) return send(res, 404, { error: 'Course not found.' });
    const owns = !!course && me.role === 'teacher' && course.teacherId === me.id;

    // GET /api/courses/:id
    if (method === 'GET' && seg[1] && !seg[2]) {
      return send(res, 200, {
        course: {
          id: course.id,
          title: course.title,
          description: course.description,
          teacher: (db.users.find(u => u.id === course.teacherId) || {}).name || 'Unknown'
        },
        students: course.studentIds
          .map(sid => db.users.find(u => u.id === sid))
          .filter(Boolean)
          .map(publicUser),
        notes: db.notes.filter(n => n.courseId === course.id).map(n => ({
          id: n.id, title: n.title, content: n.content, fileName: n.fileName, createdAt: n.createdAt
        })),
        quizzes: db.quizzes.filter(q => q.courseId === course.id).map(q => {
          const result = db.results.find(r => r.quizId === q.id && r.studentId === me.id);
          return {
            id: q.id,
            title: q.title,
            questionCount: q.questions.length,
            totalMarks: q.questions.reduce((s, x) => s + x.marks, 0),
            result: result ? { score: result.score, total: result.total } : null
          };
        })
      });
    }

    // DELETE /api/courses/:id
    if (method === 'DELETE' && seg[1] && !seg[2]) {
      if (!owns) return send(res, 403, { error: 'Not allowed.' });
      db.courses = db.courses.filter(c => c.id !== course.id);
      db.notes.filter(n => n.courseId === course.id).forEach(n => {
        if (n.storedName) { try { fs.unlinkSync(path.join(UPLOAD_DIR, n.storedName)); } catch (e) {} }
      });
      db.notes = db.notes.filter(n => n.courseId !== course.id);
      const quizIds = db.quizzes.filter(q => q.courseId === course.id).map(q => q.id);
      db.quizzes = db.quizzes.filter(q => q.courseId !== course.id);
      db.results = db.results.filter(r => !quizIds.includes(r.quizId));
      save();
      return send(res, 200, { ok: true });
    }

    // POST /api/courses/:id/students
    if (method === 'POST' && seg[2] === 'students' && !seg[3]) {
      if (!owns) return send(res, 403, { error: 'Not allowed.' });
      const email = String(body.email || '').trim().toLowerCase();
      const student = db.users.find(u => u.email.toLowerCase() === email && u.role === 'student');
      if (!student) return send(res, 404, { error: 'No student account with that email.' });
      if (course.studentIds.includes(student.id)) return send(res, 400, { error: 'Already added to this course.' });
      course.studentIds.push(student.id);
      save();
      return send(res, 200, { student: publicUser(student) });
    }

    // DELETE /api/courses/:id/students/:studentId
    if (method === 'DELETE' && seg[2] === 'students' && seg[3]) {
      if (!owns) return send(res, 403, { error: 'Not allowed.' });
      course.studentIds = course.studentIds.filter(s => s !== seg[3]);
      save();
      return send(res, 200, { ok: true });
    }

    // POST /api/courses/:id/notes
    if (method === 'POST' && seg[2] === 'notes') {
      if (!owns) return send(res, 403, { error: 'Not allowed.' });
      const title = String(body.title || '').trim();
      if (!title) return send(res, 400, { error: 'Note title is required.' });
      const note = {
        id: id(),
        courseId: course.id,
        title,
        content: String(body.content || '').trim(),
        fileName: null,
        storedName: null,
        createdAt: new Date().toISOString()
      };
      if (body.fileName && body.fileData) {
        const safe = String(body.fileName).replace(/[^\w.\- ]/g, '_').slice(0, 120);
        const stored = note.id + '__' + safe;
        fs.writeFileSync(path.join(UPLOAD_DIR, stored), Buffer.from(String(body.fileData).split(',').pop(), 'base64'));
        note.fileName = safe;
        note.storedName = stored;
      }
      db.notes.push(note);
      save();
      return send(res, 200, { note });
    }

    // POST /api/courses/:id/quizzes
    if (method === 'POST' && seg[2] === 'quizzes') {
      if (!owns) return send(res, 403, { error: 'Not allowed.' });
      const title = String(body.title || '').trim();
      const questions = Array.isArray(body.questions) ? body.questions : [];
      if (!title) return send(res, 400, { error: 'Quiz title is required.' });
      if (!questions.length) return send(res, 400, { error: 'Add at least one question.' });
      const clean = [];
      for (const q of questions) {
        const text = String(q.text || '').trim();
        const options = (Array.isArray(q.options) ? q.options : []).map(o => String(o || '').trim());
        const answer = Number(q.answer);
        const marks = Math.max(1, Number(q.marks) || 1);
        if (!text) return send(res, 400, { error: 'Every question needs a question line.' });
        if (options.length !== 4 || options.some(o => !o)) return send(res, 400, { error: 'Every question needs all four options filled in.' });
        if (!(answer >= 0 && answer <= 3)) return send(res, 400, { error: 'Mark the correct option for every question.' });
        clean.push({ text, options, answer, marks });
      }
      const quiz = { id: id(), courseId: course.id, title, questions: clean, createdAt: new Date().toISOString() };
      db.quizzes.push(quiz);
      save();
      return send(res, 200, { quiz: { id: quiz.id, title: quiz.title } });
    }
  }

  /* ----- notes ----- */
  if (seg[0] === 'notes' && seg[1] && method === 'DELETE') {
    const note = db.notes.find(n => n.id === seg[1]);
    if (!note) return send(res, 404, { error: 'Note not found.' });
    const course = db.courses.find(c => c.id === note.courseId);
    if (!course || course.teacherId !== me.id) return send(res, 403, { error: 'Not allowed.' });
    if (note.storedName) { try { fs.unlinkSync(path.join(UPLOAD_DIR, note.storedName)); } catch (e) {} }
    db.notes = db.notes.filter(n => n.id !== note.id);
    save();
    return send(res, 200, { ok: true });
  }

  /* ----- quizzes ----- */
  if (seg[0] === 'quizzes' && seg[1]) {
    const quiz = db.quizzes.find(q => q.id === seg[1]);
    if (!quiz) return send(res, 404, { error: 'Quiz not found.' });
    const course = courseForUser(quiz.courseId, me);
    if (!course) return send(res, 403, { error: 'Not allowed.' });

    // GET /api/quizzes/:id
    if (method === 'GET' && !seg[2]) {
      const showAnswers = me.role !== 'student';
      const result = db.results.find(r => r.quizId === quiz.id && r.studentId === me.id);
      return send(res, 200, {
        quiz: {
          id: quiz.id,
          title: quiz.title,
          courseId: quiz.courseId,
          courseTitle: course.title,
          totalMarks: quiz.questions.reduce((s, x) => s + x.marks, 0),
          questions: quiz.questions.map((q, i) => ({
            index: i,
            text: q.text,
            options: q.options,
            marks: q.marks,
            answer: showAnswers || result ? q.answer : undefined
          }))
        },
        result: result ? { score: result.score, total: result.total, answers: result.answers } : null
      });
    }

    // DELETE /api/quizzes/:id
    if (method === 'DELETE' && !seg[2]) {
      if (me.role !== 'teacher' || course.teacherId !== me.id) return send(res, 403, { error: 'Not allowed.' });
      db.quizzes = db.quizzes.filter(q => q.id !== quiz.id);
      db.results = db.results.filter(r => r.quizId !== quiz.id);
      save();
      return send(res, 200, { ok: true });
    }

    // POST /api/quizzes/:id/submit
    if (method === 'POST' && seg[2] === 'submit') {
      if (me.role !== 'student') return send(res, 403, { error: 'Only students can attempt quizzes.' });
      if (db.results.some(r => r.quizId === quiz.id && r.studentId === me.id))
        return send(res, 400, { error: 'You have already attempted this quiz.' });
      const answers = Array.isArray(body.answers) ? body.answers : [];
      let score = 0;
      quiz.questions.forEach((q, i) => { if (Number(answers[i]) === q.answer) score += q.marks; });
      const total = quiz.questions.reduce((s, x) => s + x.marks, 0);
      db.results.push({
        id: id(), quizId: quiz.id, studentId: me.id, score, total,
        answers, submittedAt: new Date().toISOString()
      });
      save();
      return send(res, 200, { score, total });
    }

    // GET /api/quizzes/:id/results
    if (method === 'GET' && seg[2] === 'results') {
      if (me.role !== 'teacher' || course.teacherId !== me.id) return send(res, 403, { error: 'Not allowed.' });
      return send(res, 200, {
        results: db.results.filter(r => r.quizId === quiz.id).map(r => ({
          student: (db.users.find(u => u.id === r.studentId) || {}).name || 'Removed student',
          score: r.score,
          total: r.total
        }))
      });
    }
  }

  return send(res, 404, { error: 'Not found.' });
}

/* ---------------- file downloads ---------------- */

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function serveNote(req, res, noteId) {
  const note = db.notes.find(n => n.id === noteId);
  if (!note || !note.storedName) { res.writeHead(404); return res.end('Not found'); }
  const file = path.join(UPLOAD_DIR, note.storedName);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="' + note.fileName.replace(/"/g, '') + '"'
  });
  fs.createReadStream(file).pipe(res);
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (!path.extname(rel)) rel += '.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Page not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' });
  fs.createReadStream(file).pipe(res);
}

/* ---------------- server ---------------- */

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch(err => {
      console.error(err);
      send(res, 500, { error: 'Something went wrong.' });
    });
    return;
  }
  if (url.pathname.startsWith('/files/')) {
    return serveNote(req, res, url.pathname.split('/')[2]);
  }
  serveStatic(req, res, url.pathname);
}).listen(PORT, () => {
  console.log('LMS running at http://localhost:' + PORT);
});
