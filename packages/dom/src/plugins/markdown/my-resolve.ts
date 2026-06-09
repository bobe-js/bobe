import fs from 'fs';
import path from 'path';
import hljs from 'highlight.js';
function highlight(code: string, lang: string): string {
  try {
    return hljs.highlight(code, { language: lang }).value;
  } catch {
    return code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

type ResolveFn = (id: string, importer?: string) => Promise<{ id: string } | null>;
export type FileItem = {
  path: string;
  name: string;
  lang: string;
  html: string;
};
export async function resolveImportTree(
  importPath: string,
  currentPath: string,
  vResolve: ResolveFn,
  walked = new Set<string>()
): Promise<FileItem[]> {
  const resolved = await vResolve(importPath, currentPath);
  const absPath = resolved?.id;

  if (!absPath || absPath.includes('node_modules') || absPath.startsWith('\0') || walked.has(absPath)) {
    return [];
  }

  walked.add(absPath);

  let content = '';
  try {
    content = await fs.promises.readFile(absPath, 'utf-8');
  } catch (error) {
    console.warn(`Failed to read file: ${absPath}`);
  }
  if (!content) {
    return [];
  }

  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    css: 'css',
    html: 'xml',
    json: 'json'
  };
  const ext = path.extname(absPath).slice(1);
  const lang = langMap[ext];

  const item: FileItem = {
    path: absPath,
    name: path.basename(absPath),
    lang: lang,
    // html: highlight(content, lang)
    html: lang ? highlight(content, lang) : content
  };

  // 4. 正则匹配出文件中的静态 import 语句
  const importRegex = /import\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  const dependencies: Promise<FileItem[]>[] = [];

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    // 排除绝对路径网络请求(如 https://)
    if (!importPath.startsWith('http')) {
      dependencies.push(resolveImportTree(importPath, absPath, vResolve, walked));
    }
  }
  if (!dependencies.length) {
    return [item];
  }
  const deps = await Promise.all(dependencies);
  return [item, ...deps.flat()];
}
