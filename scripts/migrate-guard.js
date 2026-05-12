#!/usr/bin/env node
/**
 * Schema Migration Guard: dry-run diff + rollback plan.
 * CI'da db:migrate öncesi çalıştır; prod'da manuel onay zorunlu.
 */
const { execSync } = require('child_process');

const cmd = process.argv[2] || 'diff';

if (cmd === 'diff') {
  try {
    execSync('npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script', {
      stdio: 'inherit',
    });
    console.log('\n[OK] Schema diff (no pending migrations)');
  } catch (e) {
    if (e.stdout) console.log(e.stdout.toString());
    if (e.stderr) console.log(e.stderr.toString());
    console.log('\n[!] Pending migrations detected. Review diff above.');
    console.log('Rollback: npx prisma migrate resolve --rolled-back <migration_name>');
    process.exit(1);
  }
} else if (cmd === 'help') {
  console.log(`
Schema Migration Guard
  node scripts/migrate-guard.js diff   - dry-run schema diff
  node scripts/migrate-guard.js help   - this help

Prod rollback:
  npx prisma migrate resolve --rolled-back <migration_name>
`);
}
