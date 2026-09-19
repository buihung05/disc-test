const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const port = Number(process.env.DASHBOARD_PORT || 3000);
const publicDir = path.join(__dirname, 'AI discord');
const bots = {
  ai: { id: 'ai', name: 'AI Discord', command: 'node', args: ['index.js'], cwd: path.join(__dirname, 'AI discord') },
  nhaca: { id: 'nhaca', name: 'Fishfarm · Nhạc', command: 'node', args: ['index.js'], cwd: path.join(__dirname, 'fishfarm', 'nhaca') },
  random: { id: 'random', name: 'Fishfarm · Random', command: 'node', args: ['index.js'], cwd: path.join(__dirname, 'fishfarm', 'random') },
  manager: { id: 'manager', name: 'Quản trị Server', command: process.platform === 'win32' ? 'py' : 'python3', args: process.platform === 'win32' ? ['-3', 'index.py'] : ['index.py'], cwd: path.join(__dirname, 'mng discord') }
};
const children = new Map(); const logs = [];
function addLog(bot, message, level = 'info') { if (!message) return; logs.unshift({ bot, message, level, time: new Date().toISOString() }); if (logs.length > 150) logs.pop(); console.log(`[${bot}] ${message}`); }
function status(id) { const item = children.get(id); return { id, name: bots[id].name, running: Boolean(item && !item.process.killed), startedAt: item ? item.startedAt : null, pid: item ? item.process.pid : null }; }
function startBot(id) {
  if (!bots[id]) throw new Error('Không tìm thấy bot.');
  if (children.has(id) && !children.get(id).process.killed) return status(id);
  const bot = bots[id]; const child = spawn(bot.command, bot.args, { cwd: bot.cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  children.set(id, { process: child, startedAt: new Date().toISOString() }); addLog(bot.name, `Đã khởi động (PID ${child.pid}).`, 'success');
  child.stdout.on('data', chunk => addLog(bot.name, chunk.toString().trim())); child.stderr.on('data', chunk => addLog(bot.name, chunk.toString().trim(), 'error'));
  child.on('error', error => addLog(bot.name, `Không thể chạy: ${error.message}`, 'error')); child.on('exit', (code, signal) => { children.delete(id); addLog(bot.name, `Đã dừng${signal ? ` bởi ${signal}` : ` (mã ${code})`}.`, code === 0 || signal ? 'info' : 'error'); });
  return status(id);
}
function stopBot(id) { const item = children.get(id); if (!item || item.process.killed) return status(id); item.process.kill('SIGTERM'); addLog(bots[id].name, 'Đang gửi lệnh dừng.'); return status(id); }
function send(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => data += chunk); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Dữ liệu gửi lên không hợp lệ.')); } }); }); }
function envValue(file, key) { const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find(item => item.trim().startsWith(`${key}=`)); return line ? line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '') : ''; }
async function discord(pathname, options = {}) { const token = envValue(path.join(__dirname, 'mng discord', '.env'), 'DISCORD_TOKEN'); if (!token) throw new Error('Thiếu DISCORD_TOKEN cho bot Quản trị Server.'); const response = await fetch(`https://discord.com/api/v10${pathname}`, { ...options, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } }); if (!response.ok) throw new Error(`Discord trả về lỗi ${response.status}. Kiểm tra Guild ID và quyền bot.`); return response.status === 204 ? null : response.json(); }
function fish(action, userId, amount = 0) { const result = spawnSync(process.platform === 'win32' ? 'py' : 'python3', process.platform === 'win32' ? ['-3', path.join(__dirname, 'fish-data.py'), path.join(__dirname, 'fishfarm', 'data', 'database.sqlite'), action, userId, String(amount)] : [path.join(__dirname, 'fish-data.py'), path.join(__dirname, 'fishfarm', 'data', 'database.sqlite'), action, userId, String(amount)], { encoding: 'utf8' }); if (result.status !== 0) throw new Error(result.stderr || 'Không thể đọc cơ sở dữ liệu cá.'); return JSON.parse(result.stdout); }
function serveFile(res, file) { const safeName = file === '/' ? 'index.html' : file.replace(/^\/+/, ''); const filename = path.normalize(path.join(publicDir, safeName)); if (!filename.startsWith(publicDir) || !fs.existsSync(filename)) return send(res, 404, { error: 'Không tìm thấy trang.' }); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }; res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }); fs.createReadStream(filename).pipe(res); }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { bots: Object.keys(bots).map(status), logs });
  const match = url.pathname.match(/^\/api\/bots\/(ai|nhaca|random|manager)\/(start|stop|restart)$/);
  if (req.method === 'POST' && match) { const [, id, action] = match; if (action === 'stop') stopBot(id); if (action === 'start') startBot(id); if (action === 'restart') { stopBot(id); setTimeout(() => startBot(id), 600); } return send(res, 200, { bot: status(id) }); }
  if (req.method === 'POST' && /^\/api\/bots\/(start-all|stop-all|restart-all)$/.test(url.pathname)) { const action = url.pathname.split('/').pop(); if (action === 'stop-all' || action === 'restart-all') Object.keys(bots).forEach(stopBot); if (action === 'start-all') Object.keys(bots).forEach(startBot); if (action === 'restart-all') setTimeout(() => Object.keys(bots).forEach(startBot), 600); return send(res, 200, { bots: Object.keys(bots).map(status) }); }
  if (req.method === 'GET' && url.pathname === '/api/discord/members') return discord(`/guilds/${url.searchParams.get('guildId')}/members?limit=1000`).then(data => send(res, 200, data)).catch(error => send(res, 400, { error: error.message }));
  if (req.method === 'GET' && url.pathname === '/api/discord/roles') return discord(`/guilds/${url.searchParams.get('guildId')}/roles`).then(data => send(res, 200, data)).catch(error => send(res, 400, { error: error.message }));
  if (req.method === 'POST' && url.pathname === '/api/discord/member') return readBody(req).then(async body => { const base = `/guilds/${body.guildId}/members/${body.userId}`; if (body.action === 'nickname') await discord(base, { method: 'PATCH', body: JSON.stringify({ nick: body.nickname || null }) }); else if (body.action === 'kick') await discord(base, { method: 'DELETE' }); else if (body.action === 'add-role') await discord(`${base}/roles/${body.roleId}`, { method: 'PUT' }); else if (body.action === 'remove-role') await discord(`${base}/roles/${body.roleId}`, { method: 'DELETE' }); else throw new Error('Thao tác không hỗ trợ.'); addLog('Quản trị Server', `Đã ${body.action} cho ${body.userId}.`, 'success'); send(res, 200, { ok: true }); }).catch(error => send(res, 400, { error: error.message }));
  if (req.method === 'GET' && url.pathname === '/api/fish') { try { return send(res, 200, fish('get', url.searchParams.get('userId'))); } catch (error) { return send(res, 400, { error: error.message }); } }
  if (req.method === 'POST' && url.pathname === '/api/fish') return readBody(req).then(body => { const result = fish(body.action, body.userId, body.amount); addLog('Fishfarm · Nhạc', `Đã ${body.action} ${body.amount || 0} cá cho ${body.userId}.`, 'success'); send(res, 200, result); }).catch(error => send(res, 400, { error: error.message }));
  if (req.method === 'GET') return serveFile(res, url.pathname); return send(res, 405, { error: 'Phương thức không hỗ trợ.' });
});
server.listen(port, '127.0.0.1', () => { console.log(`Dashboard: http://localhost:${port}`); Object.keys(bots).forEach(startBot); });
function shutdown() { Object.keys(bots).forEach(stopBot); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
