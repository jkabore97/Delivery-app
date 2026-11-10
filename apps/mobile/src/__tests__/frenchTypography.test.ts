import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Typographie française des textes affichés (docs/DESIGN.md) : une espace fine insécable (U+202F) — jamais une espace
 * ordinaire — avant « : ; ? ! » et à l'intérieur des guillemets « ». Sans elle, « Repère : » peut se couper en fin de
 * ligne et le « : » partir seul à la ligne suivante. Le `Text` de l'application dessine U+202F en espace insécable
 * (`FONT_MISSING_CHARS` de src/fonts.ts). Vérifié dans les textes seulement (chaînes, gabarits, texte JSX), pas dans le
 * code, les imports, les testID, les styles ni les expressions régulières ; pas dans les messages qui partent hors de
 * l'application (lib/share.ts : un SMS avec U+202F passerait en UCS-2, deux fois plus court).
 */
const SRC = path.resolve(__dirname, '..');
const EXCLUDED = [path.join(SRC, 'lib', 'share.ts')];
const CODE_ATTR = /^(testID|style|name|icon|tone|variant|href|pathname|accessibilityRole|role|keyboardType|autoComplete|textContentType|inputMode|behavior|edges|size|resizeMode|animationType|key|nativeID|dataSet|source|uri)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') sourceFiles(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !EXCLUDED.includes(p)) out.push(p);
  }
  return out;
}

/** Espaces ordinaires mal placées dans les textes d'un source (« fichier:ligne: extrait »). */
export function frenchSpacingIssues(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const issues: string[] = [];
  const visit = (n: ts.Node) => {
    const text =
      ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)
        ? n.text
        : null;
    const par = n.parent;
    const code =
      !par ||
      ts.isImportDeclaration(par) ||
      ts.isExportDeclaration(par) ||
      (ts.isJsxAttribute(par) && CODE_ATTR.test(par.name.getText(sf))) ||
      ((ts.isCallExpression(par) || ts.isNewExpression(par)) && /RegExp|require|getByTestId|querySelector/.test(par.expression.getText(sf))) ||
      (ts.isPropertyAssignment(par) && par.name === n) ||
      ts.isElementAccessExpression(par);
    if (text && !code && /[A-Za-zÀ-ÿ]/.test(text)) {
      const re = / (?=[:;?!»])|« /g;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        // « 12 : 09 » n'existe pas ; « a ? b : c » de code non plus : seules les lettres comptent ici.
        if (text[m.index + 1] === ':' && /\d/.test(text[m.index + 2] ?? '')) continue;
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        issues.push(`${path.relative(SRC, file)}:${line}: …${text.slice(Math.max(0, m.index - 24), m.index + 3).replace(/\n/g, ' ')}…`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return issues;
}

describe('typographie française des textes affichés', () => {
  it('le détecteur trouve les espaces ordinaires et laisse le code tranquille', () => {
    const bad = "const a = 'Repère : x'; const b = <Text>Vous êtes prêt !</Text>; const c = '« OK »';";
    expect(frenchSpacingIssues('x.tsx', bad)).toHaveLength(4);
    const good = "import x from './a : b'; const r = new RegExp(' :'); const s = <View testID=\"a : b\" />; const t = 'Repère : x';";
    expect(frenchSpacingIssues('x.tsx', good)).toEqual([]);
  });

  it('espace fine insécable (U+202F) avant « : ; ? ! » et dans « », partout dans apps/mobile/src', () => {
    const issues = sourceFiles(SRC).flatMap((f) => frenchSpacingIssues(f, fs.readFileSync(f, 'utf8')));
    expect(issues).toEqual([]);
  });
});
