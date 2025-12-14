// 临时测试文件
const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  const db = drizzle(pool);
  
  // 测试查询
  const result = await db.execute(`
    SELECT r2_key, r2_bucket, file_type 
    FROM vt_file_final 
    WHERE del_status = 0 
    LIMIT 1
  `);
  
  console.log('Raw SQL result:', result.rows);
  
  await pool.end();
}

test().catch(console.error);
