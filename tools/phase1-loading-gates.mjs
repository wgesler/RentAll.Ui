import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const LIST_FILES = [
  ['src/app/authenticated/accounting/cost-codes-list/cost-codes-list.component'],
  ['src/app/authenticated/accounting/invoice-list/invoice-list.component'],
  ['src/app/authenticated/contacts/contact-list/contact-list.component'],
  ['src/app/authenticated/documents/document-list/document-list.component'],
  ['src/app/authenticated/organizations/accounting-office-list/accounting-office-list.component'],
  ['src/app/authenticated/organizations/agent-list/agent-list.component'],
  ['src/app/authenticated/organizations/area-list/area-list.component'],
  ['src/app/authenticated/organizations/building-list/building-list.component'],
  ['src/app/authenticated/organizations/color-list/color-list.component'],
  ['src/app/authenticated/organizations/office-list/office-list.component'],
  ['src/app/authenticated/organizations/organization-list/organization-list.component'],
  ['src/app/authenticated/organizations/region-list/region-list.component'],
  ['src/app/authenticated/organizations/state-form-list/state-form-list.component'],
  ['src/app/authenticated/organizations/tracker-list/tracker-list.component'],
  ['src/app/authenticated/properties/property-list/property-list.component'],
  ['src/app/authenticated/reservations/reservation-list/reservation-list.component'],
  ['src/app/authenticated/users/user-list/user-list.component'],
  ['src/app/authenticated/tickets/ticket-list/ticket-list.component'],
];

const EXTRA_TS = [
  'src/app/authenticated/maintenance/receipt/receipt.component',
  'src/app/authenticated/tickets/ticket-shell/ticket-shell.component',
];

const SUBSCRIBE_WITH_MARK = `    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
`;

const SUBSCRIBE_NO_MARK = `    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });
`;

function addRxjsImports(content) {
  return content.replace(/import \{([^}]*)\} from 'rxjs';/, (_, inner) => {
    const parts = inner.split(',').map(p => p.trim()).filter(Boolean);
    for (const need of ['Subject', 'takeUntil']) {
      if (!parts.includes(need)) parts.push(need);
    }
    return `import {${parts.join(', ')}} from 'rxjs';`;
  });
}

function cleanRxjsImports(content) {
  return content.replace(/import \{([^}]*)\} from 'rxjs';/, (_, inner) => {
    let parts = inner.split(',').map(p => p.trim()).filter(Boolean);
    if (!/[^a-zA-Z]map\(/.test(content)) parts = parts.filter(p => p !== 'map');
    if (!/Observable</.test(content)) parts = parts.filter(p => p !== 'Observable');
    return `import {${parts.join(', ')}} from 'rxjs';`;
  });
}

function patchTs(relPath) {
  const ts = path.join(ROOT, relPath + '.ts');
  let content = fs.readFileSync(ts, 'utf8');
  const orig = content;

  content = content.replace(/\n  isLoading\$: Observable<boolean> = this\.itemsToLoad\$\.pipe\(map\(items => items\.size > 0\)\);\n/g, '\n');
  content = content.replace(/\n  isLoading\$: Observable<boolean> = this\.itemsToLoad\$\.pipe\(map\(s => s\.size > 0\)\);\n/g, '\n');

  if (!content.split('itemsToLoad$')[0].includes('isPageReady')) {
    content = content.replace('itemsToLoad$ = new BehaviorSubject', 'isPageReady = false;\n  itemsToLoad$ = new BehaviorSubject');
  }

  content = content.replace(
    /    this\.itemsToLoad\$\.pipe\(filter\(items => items\.size === 0\), take\(1\)\)\.subscribe\(\(\) => \{\n      this\.isPageReady = true;\n      this\.markViewForCheck\(\);\n    \}\);\n\n/g,
    SUBSCRIBE_WITH_MARK + '\n'
  );

  if (!content.includes('itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items =>')) {
    const sub = content.includes('markViewForCheck') ? SUBSCRIBE_WITH_MARK : SUBSCRIBE_NO_MARK;
    content = content.replace(/(  ngOnInit\(\): void \{\n)/, `$1${sub}\n`);
  }

  if (!content.includes('destroy$ = new Subject<void>();') && content.includes('itemsToLoad$')) {
    content = content.replace('itemsToLoad$ = new BehaviorSubject', 'destroy$ = new Subject<void>();\n  itemsToLoad$ = new BehaviorSubject');
    content = addRxjsImports(content);
  }

  if (content.includes('destroy$ = new Subject<void>();')) {
    content = addRxjsImports(content);
    if (!content.includes('this.destroy$.next();')) {
      content = content.replace(
        /(  ngOnDestroy\(\): void \{\n)(    this\.itemsToLoad\$\.complete\(\);\n  \})/,
        '$1    this.destroy$.next();\n    this.destroy$.complete();\n$2'
      );
    }
  }

  content = cleanRxjsImports(content);

  if (content !== orig) {
    fs.writeFileSync(ts, content, 'utf8');
    return true;
  }
  return false;
}

function patchHtml(relPath) {
  const htmlPath = path.join(ROOT, relPath + '.html');
  if (!fs.existsSync(htmlPath)) return false;
  let html = fs.readFileSync(htmlPath, 'utf8');
  const orig = html;
  html = html.replace(/!\(isLoading\$ \| async\)/g, 'isPageReady');
  html = html.replace(/isLoading\$ \| async/g, '!isPageReady');
  if (html !== orig) {
    fs.writeFileSync(htmlPath, html, 'utf8');
    return true;
  }
  return false;
}

for (const [rel] of LIST_FILES) {
  console.log(`${rel}: ts=${patchTs(rel)} html=${patchHtml(rel)}`);
}
for (const rel of EXTRA_TS) {
  console.log(`${rel}: ts=${patchTs(rel)}`);
}
