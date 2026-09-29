import fs from 'fs';
import path from 'path';

const assetsDir = path.join(process.cwd(), 'src', 'assets');
const outPath = path.join(assetsDir, 'build-version.json');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const payload = {
  build: new Date().toISOString()
};

fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
