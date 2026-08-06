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
import { existsSync } from 'node:fs';

const dataDir = path.join(import.meta.dirname, '..', 'pgdata');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
  authMethod: 'password',
});

// initialise()는 initdb를 무조건 실행한다. 이미 초기화된 데이터 디렉터리에 대고
// 다시 부르면 "directory exists but is not empty"로 실패하므로, 첫 실행일 때만 부른다.
if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
  await pg.initialise();
}
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
