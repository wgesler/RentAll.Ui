import fs from 'fs';
import { execSync } from 'child_process';

const SHARED_KEYS = [
  'offices',
  'contacts',
  'chartOfAccounts',
  'costCodes',
  'accountingOffices',
  'propertyCodes',
  'features'
];
const sharedPattern = SHARED_KEYS.join('|');

const files = execSync('rg -l "itemsToLoad\\$" src/app --glob "*.ts"', { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

const changedFiles = [];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  content = content.replace(
    new RegExp(`^[ \\t]*this\\.utilityService\\.removeLoadItemFromSet\\(this\\.itemsToLoad\\$, '(${sharedPattern})'\\);\\r?\\n`, 'gm'),
    ''
  );

  content = content.replace(
    new RegExp(`, finalize\\(\\(\\) => \\{ this\\.utilityService\\.removeLoadItemFromSet\\(this\\.itemsToLoad\\$, '(${sharedPattern})'\\); \\}\\)`, 'g'),
    ', take(1)'
  );
  content = content.replace(
    new RegExp(`, finalize\\(\\(\\) => this\\.utilityService\\.removeLoadItemFromSet\\(this\\.itemsToLoad\\$, '(${sharedPattern})'\\)\\)`, 'g'),
    ', take(1)'
  );
  content = content.replace(
    new RegExp(`finalize\\(\\(\\) => \\{ this\\.utilityService\\.removeLoadItemFromSet\\(this\\.itemsToLoad\\$, '(${sharedPattern})'\\); \\}\\)`, 'g'),
    'take(1)'
  );
  content = content.replace(
    new RegExp(`finalize\\(\\(\\) => \\{this\\.utilityService\\.removeLoadItemFromSet\\(this\\.itemsToLoad\\$, '(${sharedPattern})'\\);\\}\\)`, 'g'),
    'take(1)'
  );

  content = content.replace(
    /itemsToLoad\$ = new BehaviorSubject<Set<string>>\(new Set\(\[([\s\S]*?)\]\)\)/g,
    (match, inner) => {
      const items = inner
        .split(',')
        .map((s) => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);
      const filtered = items.filter((item) => !SHARED_KEYS.includes(item));
      if (filtered.length === items.length) {
        return match;
      }
      if (filtered.length === 0) {
        return 'itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set())';
      }
      const quoted = filtered.map((i) => `'${i}'`).join(', ');
      return `itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set([${quoted}]))`;
    }
  );

  if (content !== original) {
    fs.writeFileSync(file, content);
    changedFiles.push(file);
  }
}

console.log(`Changed ${changedFiles.length} files`);
changedFiles.forEach((f) => console.log(f));
