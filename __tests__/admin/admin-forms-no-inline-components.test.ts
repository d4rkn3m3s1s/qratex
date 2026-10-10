/**
 * P0-39 / P0-22 regresyon kalkanı: admin formları render içinde bileşen TANIMLAMAMALI.
 *
 * Hata senaryosu (eski kod): `export default function Page() { const PageForm = () => (<Input …/>); … <PageForm/> }`
 * Her `setFormData` çağrısında `PageForm` yeni bir fonksiyon kimliği alır; React bunu
 * farklı bir bileşen tipi sayıp alt ağacı unmount/mount eder → her tuş vuruşunda odak kaybolur.
 *
 * Bu test sayfaların AST'ini tarar: varsayılan dışa aktarılan bileşenin gövdesinde
 * BÜYÜK harfle başlayan (JSX'te etiket olarak kullanılabilecek) fonksiyon tanımı varsa düşer.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '..', '..');

const FILES = [
  'app/admin/pages/page.tsx',
  'app/admin/pricing/page.tsx',
  'app/admin/quests/page.tsx',
  'app/admin/rewards/page.tsx',
  'app/admin/quests/quest-form.tsx',
  'app/admin/rewards/reward-form.tsx',
];

type Finding = { name: string; line: number };

function isFunctionLike(node: ts.Node | undefined): boolean {
  if (!node) return false;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
  // useCallback(() => …) / memo(() => …) gibi sarmalayıcılar da her render'da yeni tip üretebilir.
  if (ts.isCallExpression(node)) return node.arguments.some((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
  return false;
}

function findInlineComponents(source: ts.SourceFile, body: ts.Node): Finding[] {
  const out: Finding[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /^[A-Z]/.test(node.name.text) && isFunctionLike(node.initializer)) {
      out.push({ name: node.name.text, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    }
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) {
      out.push({ name: node.name.text, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

/** Dosyadaki tüm bileşen (PascalCase fonksiyon) gövdelerini döner. */
function componentBodies(source: ts.SourceFile): Array<{ name: string; body: ts.Node }> {
  const out: Array<{ name: string; body: ts.Node }> = [];
  for (const stmt of source.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.body && stmt.name && /^[A-Z]/.test(stmt.name.text)) {
      out.push({ name: stmt.name.text, body: stmt.body });
    }
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && /^[A-Z]/.test(d.name.text) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          out.push({ name: d.name.text, body: d.initializer.body });
        }
      }
    }
  }
  return out;
}

describe('admin formları: render içinde bileşen tanımı yok (odak kaybı regresyonu)', () => {
  it.each(FILES)('%s', (rel) => {
    const file = path.join(ROOT, rel);
    const text = fs.readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const bodies = componentBodies(source);
    expect(bodies.length).toBeGreaterThan(0);
    const findings = bodies.flatMap(({ name, body }) =>
      findInlineComponents(source, body).map((f) => `${name} içinde ${f.name} (satır ${f.line})`)
    );
    expect(findings).toEqual([]);
  });

  it('dedektör eski hatalı kalıbı yakalar (öz-test)', () => {
    const bad = `
      export default function AdminPagesPage() {
        const [formData, setFormData] = useState({ title: '' });
        const PageForm = ({ onSubmit }: { onSubmit: () => void }) => (
          <Input value={formData.title} onChange={(e) => setFormData({ title: e.target.value })} />
        );
        return <PageForm onSubmit={() => {}} />;
      }
    `;
    const source = ts.createSourceFile('bad.tsx', bad, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const [{ body }] = componentBodies(source);
    expect(findInlineComponents(source, body).map((f) => f.name)).toEqual(['PageForm']);
  });
});
