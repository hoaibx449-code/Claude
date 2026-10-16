import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
// Execute the actual D1 SQL with SQLite, including batch rollback semantics.
export function database(file: string) {
  const execute = (statements: any[], schema = '') => JSON.parse(execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', `
import json, sqlite3, sys
p=json.load(sys.stdin); db=sqlite3.connect(sys.argv[1]); db.row_factory=sqlite3.Row
if p['schema']: db.executescript(p['schema'])
results=[]
with db:
 for s in p['statements']:
  before=db.total_changes
  cur=db.execute(s['sql'],s['args'])
  rows=[dict(r) for r in cur.fetchall()] if cur.description else []
  results.append({'results':rows,'meta':{'changes':db.total_changes-before}})
print(json.dumps(results))
`, file], { input: JSON.stringify({ statements, schema }), encoding: 'utf8' }));
  execute([], readFileSync('web/schema.sql', 'utf8'));
  return {
    prepare(sql: string) {
      const statement: any = { sql, args: [], bind(...args: any[]) { this.args = args; return this; },
        async first() { return execute([this])[0].results[0] || null; },
        async run() { return execute([this])[0]; }, async all() { return execute([this])[0]; } };
      return statement;
    },
    async batch(statements: any[]) { return execute(statements); },
  };
}

