import fs from 'node:fs';
import path from 'node:path';

/**
 * Garde-fous de la police (src/fonts.ts, components/Text.tsx) :
 * - tous les textes passent par le `Text` / `TextInput` de l'application (dessinés dans la police de l'application) :
 *   aucun fichier ne les importe de 'react-native', sauf l'enveloppe elle-même et les dossiers de la carte ;
 * - la police n'est nommée que dans src/fonts.ts (changer de police = changer ce fichier et le paquet).
 */
const SRC = path.resolve(__dirname, '..');
const WRAPPER = path.join(SRC, 'components', 'Text.tsx');
const FONTS = path.join(SRC, 'fonts.ts');
/** Dossiers de la carte : ils ont leur propre rythme (marqueurs, mentions des données). */
const MAP_DIRS = [path.join(SRC, 'components', 'map') + path.sep, path.join(SRC, 'lib', 'map') + path.sep];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f);
const files = sourceFiles(SRC);

/** Noms importés (valeurs, pas les types) depuis 'react-native' dans un source. */
function reactNativeValueImports(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]react-native['"]/g)) {
    if (m[1]) continue;
    for (const spec of (m[2] ?? '').split(',')) {
      const s = spec.trim();
      if (!s || s.startsWith('type ')) continue;
      names.push(s.split(/\s+as\s+/)[0]!.trim());
    }
  }
  // Import par défaut ou espace de noms (`import RN from…`, `import * as RN from…`) : RN.Text contournerait la règle.
  if (/import\s+(\*\s+as\s+\w+|\w+)\s*(,\s*\{[^}]*\})?\s*from\s*['"]react-native['"]/.test(source)) names.push('*');
  // require('react-native').Text
  if (/require\(\s*['"]react-native['"]\s*\)\s*\.\s*Text/.test(source)) names.push('Text');
  return names;
}

describe('police de l’application : garde-fous', () => {
  it('le détecteur reconnaît les imports de Text / TextInput (et pas les types)', () => {
    expect(reactNativeValueImports("import { View, Text } from 'react-native';")).toEqual(['View', 'Text']);
    expect(reactNativeValueImports("import {\n  StyleSheet,\n  TextInput as Input,\n  type TextStyle,\n} from 'react-native';")).toEqual(['StyleSheet', 'TextInput']);
    expect(reactNativeValueImports("import type { Text } from 'react-native';")).toEqual([]);
    expect(reactNativeValueImports("import * as RN from 'react-native';")).toEqual(['*']);
  });

  it('aucun fichier n’importe Text ou TextInput de react-native (hors components/Text.tsx et dossiers de la carte)', () => {
    const offenders = files
      .filter((f) => f !== WRAPPER && f !== __filename && !MAP_DIRS.some((d) => f.startsWith(d)))
      .flatMap((f) => {
        const names = reactNativeValueImports(fs.readFileSync(f, 'utf8')).filter((n) => n === 'Text' || n === 'TextInput' || n === '*');
        return names.length ? [`${rel(f)} : ${names.join(', ')} (importer depuis components/Text)`] : [];
      });
    expect(offenders).toEqual([]);
  });

  it('la police n’est nommée que dans src/fonts.ts (aucun fontFamily ailleurs, hors dossiers de la carte)', () => {
    const offenders = files
      .filter((f) => f !== FONTS && f !== __filename && !MAP_DIRS.some((d) => f.startsWith(d)) && !f.includes(`${path.sep}__tests__${path.sep}`))
      .flatMap((f) => {
        const src = fs.readFileSync(f, 'utf8');
        const hits = [/Jakarta/i.test(src) ? 'nom de la police' : null, /fontFamily\s*:/.test(src) ? 'fontFamily' : null].filter(Boolean);
        return hits.length ? [`${rel(f)} : ${hits.join(', ')}`] : [];
      });
    expect(offenders).toEqual([]);
  });
});
