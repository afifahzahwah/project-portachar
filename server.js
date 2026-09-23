/**
 * PortaChar Dashboard - Node.js HTTP Server with Built-in SQLite3 Authentication
 * Uses Node.js native modules (http, fs, path, crypto, node:sqlite). Zero external npm packages!
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;
const DB_PATH = path.join(ROOT_DIR, 'auth.db');

// Initialize SQLite database
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT DEFAULT 'operator',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Password hashing using PBKDF2-HMAC-SHA256 (100,000 iterations)
function hashPassword(password, salt) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const { hash } = hashPassword(password, salt);
  return hash === storedHash;
}

// Seed default users if empty
const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (countRow.count === 0) {
  const adminCred = hashPassword('admin123');
  db.prepare('INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)').run(
    'admin', adminCred.hash, adminCred.salt, 'admin'
  );
  const opCred = hashPassword('operator123');
  db.prepare('INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)').run(
    'operator', opCred.hash, opCred.salt, 'operator'
  );
  console.log('[AuthDB] Initialized database and seeded default accounts: admin / admin123, operator / operator123');
}

// Session helpers
function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers['cookie'] || '';
  for (const part of cookieHeader.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === 'portachar_session') return v.trim();
  }
  return null;
}

function validateToken(token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id, username, role, expires_at FROM sessions WHERE token = ?').get(token.trim());
  if (!row) return null;

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  if (String(row.expires_at) < now) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token.trim());
    return null;
  }
  return { id: row.user_id, username: row.username, role: row.role };
}

// MIME types map
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

function sendJson(res, statusCode, data, setCookieToken, clearCookie) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  };
  if (setCookieToken) {
    headers['Set-Cookie'] = `portachar_session=${setCookieToken}; Path=/; SameSite=Lax`;
  } else if (clearCookie) {
    headers['Set-Cookie'] = 'portachar_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE'
    });
    res.end();
    return;
  }

  // --- REST API ROUTES ---

  // GET /api/health
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      status: 'healthy',
      service: 'PortaChar Auth & Telemetry Server',
      engine: 'Node.js (JavaScript)',
      db: 'SQLite3 (node:sqlite)'
    });
  }

  // GET /api/auth/me
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const token = extractToken(req);
    const user = validateToken(token);
    if (user) {
      return sendJson(res, 200, { authenticated: true, user });
    } else {
      return sendJson(res, 200, { authenticated: false, user: null });
    }
  }

  // POST /api/auth/login
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body || !body.username || !body.password) {
      return sendJson(res, 400, { success: false, error: 'Username and password are required' });
    }

    const user = db.prepare('SELECT id, username, password_hash, salt, role FROM users WHERE username = ?').get(body.username.trim());
    if (!user || !verifyPassword(body.password, user.password_hash, user.salt)) {
      return sendJson(res, 401, { success: false, error: 'Invalid username or password' });
    }

    // Clean expired sessions
    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

    // Create session token (32 bytes = 64 hex chars)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

    db.prepare('INSERT INTO sessions (token, user_id, username, role, expires_at) VALUES (?, ?, ?, ?, ?)').run(
      token, user.id, user.username, user.role, expiresAt
    );

    return sendJson(res, 200, {
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role },
      expires_at: expiresAt
    }, token);
  }

  // POST /api/auth/logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = extractToken(req);
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token.trim());
    }
    return sendJson(res, 200, { success: true, message: 'Logged out successfully' }, null, true);
  }

  // GET /api/users
  if (pathname === '/api/users' && req.method === 'GET') {
    const token = extractToken(req);
    const currUser = validateToken(token);
    if (!currUser) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized. Please log in.' });
    }
    const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
    return sendJson(res, 200, { success: true, users });
  }

  // POST /api/users (Create user)
  if (pathname === '/api/users' && req.method === 'POST') {
    const token = extractToken(req);
    const currUser = validateToken(token);
    if (!currUser) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized. Please log in.' });
    }
    if (currUser.role !== 'admin') {
      return sendJson(res, 403, { success: false, error: 'Forbidden: Only administrators can create users.' });
    }

    const body = await readBody(req);
    if (!body) {
      return sendJson(res, 400, { success: false, error: 'Invalid JSON payload' });
    }

    const username = (body.username || '').trim();
    const password = (body.password || '').trim();
    let role = (body.role || 'operator').trim().toLowerCase();

    if (username.length < 3) {
      return sendJson(res, 400, { success: false, error: 'Username must be at least 3 characters long' });
    }
    if (password.length < 4) {
      return sendJson(res, 400, { success: false, error: 'Password must be at least 4 characters long' });
    }
    if (!['admin', 'operator', 'viewer'].includes(role)) {
      role = 'operator';
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return sendJson(res, 400, { success: false, error: `Username '${username}' is already registered` });
    }

    const cred = hashPassword(password);
    const info = db.prepare('INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)').run(
      username, cred.hash, cred.salt, role
    );

    return sendJson(res, 201, {
      success: true,
      user: { id: Number(info.lastInsertRowid), username, role },
      message: 'User created successfully'
    });
  }

  // POST /api/users/delete
  if (pathname === '/api/users/delete' && req.method === 'POST') {
    const token = extractToken(req);
    const currUser = validateToken(token);
    if (!currUser) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized. Please log in.' });
    }
    if (currUser.role !== 'admin') {
      return sendJson(res, 403, { success: false, error: 'Forbidden: Only administrators can delete users.' });
    }

    const body = await readBody(req);
    const targetId = Number(body && body.id);
    if (!targetId) {
      return sendJson(res, 400, { success: false, error: 'Invalid user ID' });
    }
    if (targetId === currUser.id) {
      return sendJson(res, 400, { success: false, error: 'Cannot delete your own active account' });
    }

    const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(targetId);
    if (!targetUser) {
      return sendJson(res, 404, { success: false, error: 'User not found' });
    }

    if (targetUser.username.toLowerCase() === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
      if (adminCount <= 1) {
        return sendJson(res, 400, { success: false, error: 'Cannot delete the last remaining administrator account' });
      }
    }

    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

    return sendJson(res, 200, { success: true, message: `User '${targetUser.username}' deleted successfully` });
  }

  // --- STATIC FILE SERVING ---
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(ROOT_DIR, safePath);

  // Security check: ensure path is within ROOT_DIR
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${safePath}`);
      return;
    }

    let targetFile = filePath;
    if (stats.isDirectory()) {
      targetFile = path.join(filePath, 'index.html');
    }

    const ext = path.extname(targetFile).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });

    const stream = fs.createReadStream(targetFile);
    stream.pipe(res);
  });
});

// Check if ngrok is active
function getNgrokUrl() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', { timeout: 500 }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data.tunnels && data.tunnels.length > 0) {
            resolve(data.tunnels[0].public_url);
            return;
          }
        } catch {}
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

server.listen(PORT, async () => {
  const ngrokUrl = await getNgrokUrl();
  console.log('='.repeat(65));
  console.log(' PortaChar Water Filtration & Auth Server (Node.js + SQLite)');
  console.log(` Local address : http://localhost:${PORT}`);
  console.log(` Login page    : http://localhost:${PORT}/login.html`);
  console.log(` User manager  : http://localhost:${PORT}/users.html`);
  if (ngrokUrl) {
    console.log(` ngrok Public  : ${ngrokUrl}/login.html`);
  }
  console.log(' Default login : admin / admin123  (or operator / operator123)');
  console.log(' Press Ctrl+C to stop the server');
  console.log('='.repeat(65));
});

// Handle graceful termination
process.on('SIGINT', () => {
  console.log('\n[INFO] Node.js server stopped by user.');
  server.close(() => process.exit(0));
});
