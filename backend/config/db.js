const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to database:', err.stack);
        return;
    }
    console.log('Successfully connected to database:', process.env.DB_NAME);
    release();
});

module.exports = pool;