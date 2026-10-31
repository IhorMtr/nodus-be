const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'Set DATABASE_URL in .env.test before preparing or running integration tests.'
  );
}

const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0] ?? '';
if (!databaseName.endsWith('_test')) {
  throw new Error(
    'Refusing to use a database whose name does not end in _test.'
  );
}
