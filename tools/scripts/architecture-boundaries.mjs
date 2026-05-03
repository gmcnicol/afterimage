#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'dist',
  'dist-electron',
  'node_modules',
  'release'
]);

const uiRoots = [
  'apps/studio-desktop/src/app',
  'apps/studio-desktop/src/features',
  'apps/studio-desktop/src/stores',
  'packages/ui'
].map((entry) => path.join(repoRoot, entry));
const uiFiles = new Set([path.join(repoRoot, 'apps/studio-desktop/src/main.tsx')]);
const allowedRendererGateway = path.join(repoRoot, 'apps/studio-desktop/src/lib/studio-client.ts');
const allowedSharedContracts = path.join(repoRoot, 'apps/studio-desktop/src/shared/contracts.ts');
const uiForbiddenImports = new Set([
  '@afterimage/domain-operations',
  '@afterimage/media-analysis',
  '@afterimage/schema-validators',
  '@afterimage/project-model'
]);
const uiForbiddenIdentifiers = new Set([
  'normalizeProject',
  'parseProject',
  'validateProject',
  'generateCutCandidatesFromAnalysis',
  'createAnalysisFile'
]);
const systemForbiddenPackages = new Set([
  'react',
  'react-dom',
  'zustand',
  '@afterimage/ui'
]);
const systemForbiddenRendererPatterns = [
  '/apps/studio-desktop/src/app/',
  '/apps/studio-desktop/src/features/',
  '/apps/studio-desktop/src/stores/',
  '/apps/studio-desktop/src/lib/studio-client'
];

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function isUnder(filePath, root) {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isUiFile(filePath) {
  return uiFiles.has(filePath) || uiRoots.some((root) => isUnder(filePath, root));
}

function isSystemFile(filePath) {
  if (filePath === allowedSharedContracts || filePath === allowedRendererGateway || isUiFile(filePath)) {
    return false;
  }

  const relative = toPosix(path.relative(repoRoot, filePath));
  return relative.startsWith('apps/studio-desktop/electron/')
    || relative.startsWith('packages/');
}

function walk(directory, files = []) {
  if (!existsSync(directory)) {
    return files;
  }

  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }

    const entryPath = path.join(directory, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      walk(entryPath, files);
    } else if (/\.(ts|tsx)$/.test(entryPath) && !entryPath.endsWith('.d.ts')) {
      files.push(entryPath);
    }
  }
  return files;
}

function scriptKind(filePath) {
  return filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function location(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: line + 1,
    column: character + 1
  };
}

function report(violations, sourceFile, node, rule, message) {
  const pos = location(sourceFile, node);
  violations.push({
    file: path.relative(repoRoot, sourceFile.fileName),
    line: pos.line,
    column: pos.column,
    rule,
    message
  });
}

function hasValueImport(importDeclaration) {
  const clause = importDeclaration.importClause;
  if (!clause || clause.isTypeOnly) {
    return false;
  }
  if (clause.name || !clause.namedBindings) {
    return true;
  }
  if (ts.isNamespaceImport(clause.namedBindings)) {
    return true;
  }
  return clause.namedBindings.elements.some((specifier) => !specifier.isTypeOnly);
}

function moduleText(moduleSpecifier) {
  return ts.isStringLiteralLike(moduleSpecifier) ? moduleSpecifier.text : undefined;
}

function resolveRelativeImport(filePath, specifier) {
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  return toPosix(path.resolve(path.dirname(filePath), specifier));
}

function checkFile(filePath, violations) {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(filePath));
  const ui = isUiFile(filePath);
  const system = isSystemFile(filePath);

  const relativePath = toPosix(path.relative(repoRoot, filePath));
  const allowedTsx = ui || /^apps\/[^/]+\/src\//.test(relativePath) || relativePath.startsWith('packages/ui/');
  if (filePath.endsWith('.tsx') && !allowedTsx) {
    report(violations, sourceFile, sourceFile, 'system-no-tsx-outside-ui', '.tsx files are limited to renderer UI folders and packages/ui.');
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const specifier = moduleText(node.moduleSpecifier);
      if (specifier) {
        if (ui && uiForbiddenImports.has(specifier) && hasValueImport(node)) {
          report(violations, sourceFile, node, 'ui-no-system-value-import', `UI value import from ${specifier} is forbidden.`);
        }

        if (system && systemForbiddenPackages.has(specifier)) {
          report(violations, sourceFile, node, 'system-no-ui-package-import', `System import from ${specifier} is forbidden.`);
        }

        if (system) {
          const resolved = resolveRelativeImport(filePath, specifier);
          const normalizedSpecifier = specifier.startsWith('@afterimage/') ? specifier : resolved;
          if (normalizedSpecifier && systemForbiddenRendererPatterns.some((pattern) => normalizedSpecifier.includes(pattern))) {
            report(violations, sourceFile, node, 'system-no-renderer-import', `System import from renderer module ${specifier} is forbidden.`);
          }
        }
      }
    }

    if (ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier ? moduleText(node.moduleSpecifier) : undefined;
      if (specifier && ui && uiForbiddenImports.has(specifier) && !node.isTypeOnly) {
        report(violations, sourceFile, node, 'ui-no-system-value-export', `UI value export from ${specifier} is forbidden.`);
      }
    }

    if (ui && ts.isIdentifier(node) && uiForbiddenIdentifiers.has(node.text)) {
      report(violations, sourceFile, node, 'ui-no-system-identifier', `UI identifier ${node.text} is forbidden.`);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function runSelfTest() {
  const sourceFile = ts.createSourceFile(
    path.join(repoRoot, 'apps/studio-desktop/src/features/__fixture__.tsx'),
    "import { normalizeProject } from '@afterimage/project-model';\nnormalizeProject({});\n",
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const violations = [];
  const node = sourceFile.statements[0];
  if (ts.isImportDeclaration(node) && hasValueImport(node)) {
    report(violations, sourceFile, node, 'ui-no-system-value-import', 'fixture');
  }
  if (violations.length !== 1) {
    throw new Error('architecture-boundaries self-test failed.');
  }
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
}

const files = [
  ...walk(path.join(repoRoot, 'apps')),
  ...walk(path.join(repoRoot, 'packages'))
];
const violations = [];
for (const file of files) {
  checkFile(file, violations);
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}:${violation.column} ${violation.rule} ${violation.message}`);
  }
  process.exit(1);
}

console.log(`architecture-boundaries: checked ${files.length} files`);
