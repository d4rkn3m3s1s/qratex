/**
 * API contract tests (P2-20 item 12).
 * Validates OpenAPI spec structure and API response shapes.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

describe('API contract', () => {
  describe('OpenAPI spec', () => {
    const specPath = path.join(process.cwd(), 'openapi.yaml');
    let spec: Record<string, unknown>;

    beforeAll(() => {
      const content = fs.readFileSync(specPath, 'utf-8');
      spec = yaml.parse(content) as Record<string, unknown>;
    });

    it('loads valid OpenAPI 3 spec', () => {
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info).toBeDefined();
      expect((spec.info as Record<string, unknown>).title).toBe('QRATEX API');
    });

    it('defines required paths', () => {
      const paths = spec.paths as Record<string, unknown>;
      expect(paths['/api/qr-codes/public/{code}']).toBeDefined();
      expect(paths['/api/feedbacks']).toBeDefined();
    });

    it('qr-codes public GET returns 200 schema with id, code, name, isActive', () => {
      const paths = spec.paths as Record<string, unknown>;
      const qrPath = paths['/api/qr-codes/public/{code}'] as Record<string, unknown>;
      const get = qrPath?.get as Record<string, unknown>;
      const responses = get?.responses as Record<string, unknown>;
      const ok = responses?.['200'] as Record<string, unknown>;
      const content = ok?.content as Record<string, unknown>;
      const json = content?.['application/json'] as Record<string, unknown>;
      const schema = json?.schema as Record<string, unknown>;
      const required = schema?.required as string[];
      expect(required).toContain('id');
      expect(required).toContain('code');
      expect(required).toContain('name');
      expect(required).toContain('isActive');
    });
  });
});
