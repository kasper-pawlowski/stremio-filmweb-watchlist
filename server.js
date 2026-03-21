const express = require('express');
const addon = require('./addon');
const path = require('path');

const app = express();
const port = process.env.PORT || 8000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

app.get('/', (req, res) => {
    res.redirect('/configure');
});

app.get('/configure', (req, res) => {
    res.sendFile(path.join(__dirname, 'configure.html'));
});

app.get('/:username/configure', (req, res) => {
    res.redirect('/configure');
});

app.get('/:username/:aioId/configure', (req, res) => {
    res.redirect('/configure');
});

app.get('/manifest.json', (req, res) => {
    const manifest = addon.getManifest('');
    res.json(manifest);
});

// 1A. Manifest: TYLKO USERNAME
app.get('/:username/manifest.json', (req, res) => {
    const manifest = addon.getManifest(req.params.username);
    res.json(manifest);
});

// 1B. Manifest: USERNAME + UUID (AIO)
app.get('/:username/:aioId/manifest.json', (req, res) => {
    const manifest = addon.getManifest(req.params.username);
    res.json(manifest);
});

// 2A. Katalog: TYLKO USERNAME
app.get('/:username/catalog/:type/:id.json', async (req, res) => {
    const { username, type, id } = req.params;

    if (id.startsWith('filmweb-watchlist')) {
        const data = await addon.getCatalog(username, type, null);
        res.json(data);
    } else {
        res.json({ metas: [] });
    }
});

// 2B. Katalog: USERNAME + UUID (AIO)
app.get('/:username/:aioId/catalog/:type/:id.json', async (req, res) => {
    const { username, aioId, type, id } = req.params;

    if (id.startsWith('filmweb-watchlist')) {
        const data = await addon.getCatalog(username, type, aioId);
        res.json(data);
    } else {
        res.json({ metas: [] });
    }
});

app.listen(port, () => {
    console.log(`Serwer działa na porcie ${port}`);
});

module.exports = app;
