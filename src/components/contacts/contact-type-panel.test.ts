import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('contact type panel', () => {
  it('is mounted on the contacts page and the catalog API lives in query hooks', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/app/(dashboard)/contacts/page.tsx'),
      'utf8'
    );
    const hooks = readFileSync(
      resolve(process.cwd(), 'src/lib/api/hooks.ts'),
      'utf8'
    );

    expect(page).toContain('ContactTypePanel');
    expect(hooks).toContain('/api/contact-types');
    expect(hooks).toContain('typeId');
  });
});
