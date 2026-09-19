const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const configPath = path.join(process.cwd(), 'bots.config.json');
const botsRoot = path.join(process.cwd(), 'bots');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    return discoverBots();
  }

  let raw = '';
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    fail(`Khong the doc bots.config.json: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`bots.config.json khong hop le: ${error.message}`);
  }

  if (!parsed || !Array.isArray(parsed.bots)) {
    fail('bots.config.json phai co truong bots la mot mang.');
  }

  return parsed.bots.filter((bot) => bot && bot.enabled !== false);
}

function discoverBots() {
  const entries = fs.readdirSync(process.cwd(), { withFileTypes: true });
  const bots = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name === 'bots' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }

    const cwd = path.join(process.cwd(), entry.name);
    const packageJson = path.join(cwd, 'package.json');
    const mainPy = path.join(cwd, 'main.py');
    const indexPy = path.join(cwd, 'index.py');
    const indexJs = path.join(cwd, 'index.js');

    if (fs.existsSync(packageJson)) {
      let packageData = null;
      try {
        packageData = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      } catch (error) {
        fail(`Khong the doc package.json trong ${entry.name}: ${error.message}`);
      }

      if (packageData && packageData.scripts && packageData.scripts.start) {
      bots.push({
        name: entry.name,
        command: 'npm',
        args: ['run', 'start'],
          cwd: path.relative(process.cwd(), cwd)
        });
        continue;
      }

      if (fs.existsSync(indexJs)) {
        bots.push({
          name: entry.name,
          command: 'node',
          args: ['index.js'],
          cwd: path.relative(process.cwd(), cwd)
        });
        continue;
      }

      if (fs.existsSync(mainPy) || fs.existsSync(indexPy)) {
        bots.push({
          name: entry.name,
          command: process.platform === 'win32' ? 'py' : 'python3',
          args: process.platform === 'win32' ? ['-3', fs.existsSync(indexPy) ? 'index.py' : 'main.py'] : [fs.existsSync(indexPy) ? 'index.py' : 'main.py'],
          cwd: path.relative(process.cwd(), cwd)
        });
        continue;
      }

      continue;
    }

    if (fs.existsSync(indexJs)) {
      bots.push({
        name: entry.name,
        command: 'node',
        args: ['index.js'],
        cwd: path.relative(process.cwd(), cwd)
      });
      continue;
    }

    if (fs.existsSync(mainPy) || fs.existsSync(indexPy)) {
      bots.push({
        name: entry.name,
        command: process.platform === 'win32' ? 'py' : 'python3',
        args: process.platform === 'win32' ? ['-3', fs.existsSync(indexPy) ? 'index.py' : 'main.py'] : [fs.existsSync(indexPy) ? 'index.py' : 'main.py'],
        cwd: path.relative(process.cwd(), cwd)
      });
    }
  }

  if (bots.length === 0) {
    fail('Khong tim thay bot nao o cap goc. Hay tao bots.config.json hoac dat bot trong moi thu muc rieng.');
  }

  return bots;
}

function createLinePrefixer(stream, prefix) {
  const reader = readline.createInterface({ input: stream });
  reader.on('line', (line) => {
    process.stdout.write(`${prefix}${line}\n`);
  });
  return reader;
}

function startBot(bot) {
  if (!bot.name || !bot.command) {
    fail('Moi bot trong bots.config.json phai co name va command.');
  }

  let command = bot.command;
  let args = bot.args || [];
  if (process.platform === 'win32' && bot.command === 'npm') {
    command = 'cmd';
    args = ['/c', 'npm', ...args];
  }
  const cwd = bot.cwd ? path.resolve(process.cwd(), bot.cwd) : process.cwd();
  if (!fs.existsSync(cwd)) {
    fail(`Thu muc khong ton tai cho bot ${bot.name}: ${cwd}`);
  }

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...(bot.env || {}) },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const prefix = `[${bot.name}] `;
  const stdoutReader = createLinePrefixer(child.stdout, prefix);
  const stderrReader = createLinePrefixer(child.stderr, prefix);

  child.on('spawn', () => {
    console.log(`${prefix}da khoi dong`);
  });

  child.on('exit', (code, signal) => {
    stdoutReader.close();
    stderrReader.close();
    if (signal) {
      console.log(`${prefix}dung voi signal ${signal}`);
      if (!shuttingDown) {
        exitCode = 1;
        shutdown(signal);
      }
    } else {
      console.log(`${prefix}thoat voi code ${code}`);
      if (!shuttingDown && typeof code === 'number' && code !== 0) {
        exitCode = code;
        shutdown('SIGTERM');
      }
    }
  });

  child.on('error', (error) => {
    console.error(`${prefix}khong the khoi dong: ${error.message}`);
  });

  return child;
}

const bots = loadConfig();

if (bots.length === 0) {
  fail('Khong co bot nao duoc bat. Hay kiem tra truong enabled trong bots.config.json.');
}

const children = bots.map(startBot);
let shuttingDown = false;
let exitCode = 0;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Nhan ${signal}, dang tat tat ca bot...`);

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }

  setTimeout(() => process.exit(exitCode || 0), 2000).unref();
}

for (const child of children) {
  child.on('exit', (code) => {
    if (typeof code === 'number' && code !== 0) {
      exitCode = code;
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
