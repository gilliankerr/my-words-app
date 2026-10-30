const { validateConfig, prepareDatabase } = require('../../../server/next/beta-preview');
const env = { BETA_PROJECT_ID: 'p', OPERATOR_PROJECT_ID: 'p', BETA_ENVIRONMENT_ID: 'e', OPERATOR_ENVIRONMENT_ID: 'e', BETA_SERVICE_ID: 's', OPERATOR_SERVICE_ID: 's', BETA_ORIGIN: 'https://demo.example.invalid', BETA_SESSION_SECRET: 's'.repeat(64), BETA_OWNER_INVITE: Buffer.alloc(32, 1).toString('base64url'), DATABASE_URL: 'postgres://beta:fictional@beta.invalid/beta' };
test('beta startup requires exact target and origin and never accepts inherited test configuration', () => {
  expect(validateConfig(env).origin).toBe(env.BETA_ORIGIN);
  for (const patch of [{ OPERATOR_ENVIRONMENT_ID: 'production' }, { OPERATOR_SERVICE_ID: 'other' }, { BETA_ORIGIN: 'http://invalid.example.invalid' }, { BETA_OWNER_INVITE: '' }, { NEXT_TEST_DATABASE_URL: 'forbidden' }]) expect(() => validateConfig({ ...env, ...patch })).toThrow();
});
test('beta refuses an unmarked populated database without mutating it', async () => {
  const query = jest.fn(async sql => ({ rows: sql.includes('pg_tables') ? [{ schemaname: 'public', tablename: 'existing_owned_data' }] : [] }));
  const client = { query, release: jest.fn() };
  await expect(prepareDatabase({ connect: async () => client }, validateConfig(env))).rejects.toThrow(/populated|unmarked/);
  expect(query.mock.calls.some(([sql]) => /^(CREATE|INSERT|ALTER)/.test(sql))).toBe(false);
  expect(query).toHaveBeenLastCalledWith('ROLLBACK');
});

test('origin is validated before database preparation, including userinfo and malformed authorities',()=>{ for(const origin of ['https://user:pass@example.invalid','https://example.invalid:bad','https://','https://example.invalid/','https://example.invalid?x=1']) expect(()=>validateConfig({...env,BETA_ORIGIN:origin})).toThrow(); });
