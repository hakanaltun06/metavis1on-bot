const express = require('express');
const { PORT } = require('../config/env');

function startHealthServer() {
    const app = express();
    app.get('/', (req, res) => {
        res.status(200).send('metavis1on bot çalışıyor.');
    });
    const server = app.listen(PORT, () => {
        console.log(`🌐 Sağlık kontrol servisi ${PORT} numaralı bağlantı noktasını dinliyor.`);
    });
    server.on('error', (err) => {
        console.error('🌐 Sağlık kontrol servisi başlatılamadı:', err && err.message ? err.message : err);
    });
    return server;
}

module.exports = { startHealthServer };
