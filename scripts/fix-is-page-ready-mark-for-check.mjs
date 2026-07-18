import fs from 'fs';
import path from 'path';

const srcRoot = path.join(process.cwd(), 'src');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(full, files);
    } else if (entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function getMarkCall(content) {
  if (/markViewForCheck\s*\(\s*\)\s*:\s*void/.test(content)) {
    return 'this.markViewForCheck();';
  }
  if (/\bcdr\s*=\s*inject\(ChangeDetectorRef\)/.test(content)) {
    return 'this.cdr.markForCheck();';
  }
  return 'this.cdr.markForCheck();';
}

function ensureCdrSetup(content) {
  if (/markViewForCheck\s*\(\s*\)\s*:\s*void/.test(content)) {
    return content;
  }
  if (/\bcdr\s*=\s*inject\(ChangeDetectorRef\)/.test(content)) {
    return content;
  }

  let updated = content;
  if (!updated.includes('ChangeDetectorRef')) {
    updated = updated.replace(
      /import\s+\{([^}]+)\}\s+from\s+'@angular\/core';/,
      (full, imports) => {
        const parts = imports.split(',').map(s => s.trim()).filter(Boolean);
        if (!parts.includes('inject')) parts.push('inject');
        if (!parts.includes('ChangeDetectorRef')) parts.push('ChangeDetectorRef');
        return `import { ${parts.join(', ')} } from '@angular/core';`;
      }
    );
  } else if (!/\binject\b/.test(updated.split('export class')[0])) {
    updated = updated.replace(
      /import\s+\{([^}]+)\}\s+from\s+'@angular\/core';/,
      (full, imports) => {
        if (imports.includes('inject')) return full;
        return `import { ${imports.trim()}, inject } from '@angular/core';`;
      }
    );
  }

  if (!/\bcdr\s*=\s*inject\(ChangeDetectorRef\)/.test(updated)) {
    updated = updated.replace(
      /(export class \w+[^{]*\{)/,
      '$1\n  private cdr = inject(ChangeDetectorRef);'
    );
  }

  return updated;
}

function hasMarkNearby(lines, index) {
  for (let i = index + 1; i < Math.min(lines.length, index + 12); i++) {
    const line = lines[i].trim();
    if (/markForCheck\(|markViewForCheck\(|detectChanges\(/.test(line)) {
      return true;
    }
    if (line === '});' || line.startsWith('});')) {
      return false;
    }
  }
  return false;
}

function isRuntimePageReadyAssignment(line) {
  return /this\.isPageReady\s*=/.test(line);
}

const changed = [];

for (const filePath of walk(srcRoot)) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('isPageReady')) continue;

  const lines = content.split('\n');
  const pending = [];

  for (let i = 0; i < lines.length; i++) {
    if (!isRuntimePageReadyAssignment(lines[i])) continue;
    if (hasMarkNearby(lines, i)) continue;
    pending.push(i);
  }

  if (pending.length === 0) continue;

  content = ensureCdrSetup(content);
  const updatedLines = content.split('\n');
  const markCall = getMarkCall(content);

  // Re-find assignments after potential content changes
  const insertions = [];
  for (let i = 0; i < updatedLines.length; i++) {
    if (!isRuntimePageReadyAssignment(updatedLines[i])) continue;
    if (hasMarkNearby(updatedLines, i)) continue;
    const indent = updatedLines[i].match(/^\s*/)[0];
    insertions.push({ afterLine: i, text: `${indent}${markCall}` });
  }

  if (insertions.length === 0) continue;

  insertions.sort((a, b) => b.afterLine - a.afterLine);
  for (const { afterLine, text } of insertions) {
    updatedLines.splice(afterLine + 1, 0, text);
  }

  const nextContent = updatedLines.join('\n');
  if (nextContent !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, nextContent);
    changed.push(path.relative(process.cwd(), filePath));
  }
}

console.log(`Updated ${changed.length} files:`);
for (const f of changed.sort()) {
  console.log(`  ${f}`);
}
