/**
 * start-db.ts
 *
 * 로컬 embedded-postgres 클러스터를 기동한다. .env의 DATABASE_URL(localhost:5433)과
 * 맞춰서 포트/DB명을 설정한다. 데이터는 apps/api/.pgdata 에 영속 저장되므로
 * 한 번 seed하면 이후엔 이 스크립트로 켜기만 하면 된다.
 *
 * 실행: pnpm db:start
 */
import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';

const pg = new EmbeddedPostgres({
  databaseDir: path.join(import.meta.dirname, '..', 'pgdata'),
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
  authMethod: 'password',
});

await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('steamclone');
} catch {
  // 이미 존재하면 무시
}

console.log('embedded-postgres 실행 중: localhost:5433/steamclone (Ctrl+C로 종료)');

process.on('SIGINT', async () => {
  await pg.stop();
  process.exit(0);
});
