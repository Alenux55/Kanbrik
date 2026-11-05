export function assertTestDatabase(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("Set TEST_DATABASE_URL to a dedicated local kanbrik_test database"); }
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
      !/^\/kanbrik_test(?:_[a-z0-9_]+)?$/.test(parsed.pathname) ||
      [...parsed.searchParams.keys()].some(key => key !== 'schema') ||
      (parsed.searchParams.has('schema') && parsed.searchParams.get('schema') !== 'public')) {
    throw new Error("Refusing test database: require loopback host, kanbrik_test name, and public schema with no connection overrides");
  }
  return url;
}
