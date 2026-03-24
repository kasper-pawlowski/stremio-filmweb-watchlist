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

const isValidUsername = (username) => /^[a-zA-Z0-9_\-.]+$/.test(username);

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

// 1A. Manifest: TYLKO USERNAME (Dla starych użytkowników)
app.get('/:username/manifest.json', (req, res) => {
    if (!isValidUsername(req.params.username)) return res.status(400).send('Invalid username');
    const manifest = addon.getManifest(req.params.username, false);
    res.json(manifest);
});

// 1B. Manifest: USERNAME + UUID (Dla starych użytkowników)
app.get('/:username/:aioId/manifest.json', (req, res) => {
    if (!isValidUsername(req.params.username)) return res.status(400).send('Invalid username');
    const manifest = addon.getManifest(req.params.username, false);
    res.json(manifest);
});

// 1C. Manifest: USERNAME + UUID + POPULAR
app.get('/:username/:aioId/:popular/manifest.json', (req, res) => {
    if (!isValidUsername(req.params.username)) return res.status(400).send('Invalid username');
    const includePopular = req.params.popular === 'true';
    const manifest = addon.getManifest(req.params.username, includePopular);
    res.json(manifest);
});

// 2A. Katalog: TYLKO USERNAME
app.get('/:username/catalog/:type/:id.json', async (req, res) => {
    const { username, type, id } = req.params;
    if (!isValidUsername(username)) return res.json({ metas: [] });
    // Dodano obsługę ID popularnych
    if (id.startsWith('filmweb-watchlist') || id.startsWith('filmweb-popular')) {
        const data = await addon.getCatalog(username, type, null, id);
        res.json(data);
    } else {
        res.json({ metas: [] });
    }
});

// 2B. Katalog: USERNAME + UUID
app.get('/:username/:aioId/catalog/:type/:id.json', async (req, res) => {
    const { username, aioId, type, id } = req.params;
    if (!isValidUsername(username)) return res.json({ metas: [] });
    if (id.startsWith('filmweb-watchlist') || id.startsWith('filmweb-popular')) {
        const data = await addon.getCatalog(username, type, aioId, id);
        res.json(data);
    } else {
        res.json({ metas: [] });
    }
});

// 2C. Katalog: USERNAME + UUID + POPULAR
app.get('/:username/:aioId/:popular/catalog/:type/:id.json', async (req, res) => {
    const { username, aioId, popular, type, id } = req.params;
    if (!isValidUsername(username)) return res.json({ metas: [] });

    const actualAioId = aioId === 'none' ? null : aioId;

    if (id.startsWith('filmweb-watchlist') || id.startsWith('filmweb-popular')) {
        const data = await addon.getCatalog(username, type, actualAioId, id);
        res.json(data);
    } else {
        res.json({ metas: [] });
    }
});

app.listen(port, () => {
    console.log(`Serwer działa na porcie ${port}`);
});

module.exports = app;
