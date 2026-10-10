/**
 * Cada migração do Supabase precisa de uma versão (prefixo numérico) só dela:
 * `supabase db push` recusa duas com a mesma versão, e o release pararia na
 * hora de migrar a produção.
 */
const fs = require('fs');
const path = require('path');

test('versões de supabase/migrations não se repetem', () => {
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const versoes = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.split('_')[0]);
  const repetidas = versoes.filter((v, i) => versoes.indexOf(v) !== i);
  expect(repetidas).toEqual([]);
});
