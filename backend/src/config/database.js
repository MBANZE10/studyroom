const { Pool } = require('pg');
const { createClient } = require('redis');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://studyroom:studyroom@localhost:5432/studyroom';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

const redisClient = createClient({
  url: redisUrl
});

redisClient.on('error', (error) => {
  console.warn('Redis not available:', error.message || error);
});

async function connectDatabase() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('PostgreSQL connected successfully.');
    return true;
  } catch (error) {
    console.warn('PostgreSQL unavailable. Running in local demo mode:', error.message || error);
    return false;
  }
}

async function connectRedis() {
  try {
    await redisClient.connect();
    console.log('Redis connected successfully.');
    return true;
  } catch (error) {
    console.warn('Redis unavailable. Continuing without cache:', error.message || error);
    return false;
  }
}

async function shutdownConnections() {
  try {
    await pool.end();
  } catch (error) {
    console.warn('Unable to close PostgreSQL pool cleanly:', error.message || error);
  }

  try {
    await redisClient.quit();
  } catch (error) {
    console.warn('Unable to close Redis client cleanly:', error.message || error);
  }
}

module.exports = {
  pool,
  redisClient,
  connectDatabase,
  connectRedis,
  shutdownConnections,
  databaseUrl,
  redisUrl
};
