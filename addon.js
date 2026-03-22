const axios = require('axios');
const NodeCache = require('node-cache');

// ==========================================
// 1. KONFIGURACJA I PAMIĘĆ PODRĘCZNA
// ==========================================

const metaCache = new NodeCache({ stdTTL: 86400 });
const userListCache = new NodeCache({ stdTTL: 300 });

const axiosConfig = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    },
};

// ==========================================
// 2. MANIFEST
// ==========================================

function getManifest(username) {
    const isConfigured = username && username !== '';

    return {
        id: 'community.watchlist-filmweb',
        version: '1.0.0',
        name: isConfigured ? `Filmweb Watchlist (${username})` : 'Filmweb Watchlist',
        description: 'Twoja lista "Chcę zobaczyć" z Filmwebu prosto w bibliotece Stremio. Pełne wsparcie dla polskich plakatów i opisów.',
        idPrefixes: ['tt'],
        resources: ['catalog'],
        types: ['movie', 'series'],
        logo: 'https://www.filmweb.pl/favicon.ico',
        catalogs: isConfigured
            ? [
                  { type: 'movie', id: 'filmweb-watchlist-movies', name: 'Filmweb: Chcę zobaczyć' },
                  { type: 'series', id: 'filmweb-watchlist-series', name: 'Filmweb: Chcę zobaczyć' },
              ]
            : [],
        behaviorHints: { configurable: true },
        stremioAddonsConfig: {
            issuer: 'https://stremio-addons.net',
            signature:
                'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..ckqk8R-dnLfsbFfZHWkhpQ.DBgf6USIkGkVdL0i_Ni1G7F5_cr99Q4TAMLZxb0rj4uhj37j1kvaAWBr5avaJAGgHY8MUJXZh1DmZLLJB2fsTEWrUdXjQmEid0VD6kWNb6fQB00Swk2LeBqO0Q6IBsYT.KZMyQLufjcAyZvK6-FowCg',
        },
    };
}

// ==========================================
// 3. GŁÓWNA FUNKCJA KATALOGU
// ==========================================

function chunkArray(array, size) {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}

async function getCatalog(username, type, aioId) {
    console.log(`\n=== Pobieram katalog: ${type.toUpperCase()} dla użytkownika: ${username} ===`);

    const listaZFilmwebu = await fetchWatchlist(username, type);

    if (!listaZFilmwebu || listaZFilmwebu.length === 0) {
        return {
            metas: [
                {
                    id: `error-${username}`,
                    type: type,
                    name: 'Błąd lub pusta lista',
                    poster: '',
                    description: "Twój profil na Filmwebie nie istnieje, jest prywatny lub lista 'Chcę zobaczyć' jest pusta.",
                },
            ],
        };
    }

    const gotoweMetas = [];
    const chunks = chunkArray(listaZFilmwebu, 20);

    for (const chunk of chunks) {
        const chunkPromises = chunk.map((movie) => translateToImdb(movie, aioId));
        const resolvedMetas = await Promise.all(chunkPromises);

        for (const meta of resolvedMetas) {
            if (meta) gotoweMetas.push(meta);
        }
    }

    console.log(`=== Gotowe! Wysyłam do Stremio ${gotoweMetas.length} pozycji (${type}). ===\n`);
    return { metas: gotoweMetas };
}

// ==========================================
// 4. LOGIKA FILMWEBU (Z CACHEM)
// ==========================================

async function fetchWatchlist(username, type) {
    const fwType = type === 'series' ? 'serial' : 'film';
    const cacheKey = `${username}-${fwType}`;

    const cachedList = userListCache.get(cacheKey);
    if (cachedList) {
        console.log(`⚡ Zwracam listę Filmwebu (${fwType}) z Cache dla: ${username}`);
        return cachedList;
    }

    try {
        const url = `https://www.filmweb.pl/api/v1/user/${username}/want2see/${fwType}`;
        const response = await axios.get(url, axiosConfig);
        const itemIds = response.data.map((item) => item.entity);

        console.log(`> Znalazłem ${itemIds.length} ID w zakładce ${fwType.toUpperCase()}`);

        const chunkSize = 20;
        const itemsData = [];

        for (let i = 0; i < itemIds.length; i += chunkSize) {
            const chunk = itemIds.slice(i, i + chunkSize);
            const chunkPromises = chunk.map(async (id) => {
                const infoUrl = `https://www.filmweb.pl/api/v1/title/${id}/info`;
                try {
                    const infoResponse = await axios.get(infoUrl, axiosConfig);
                    return infoResponse.data;
                } catch (e) {
                    return null;
                }
            });
            const chunkResults = await Promise.all(chunkPromises);
            itemsData.push(...chunkResults.filter(Boolean));
        }

        const finalResult = itemsData.map((item) => ({
            id: item.id.toString(),
            plTitle: item.title,
            originalTitle: item.originalTitle || item.title,
            year: item.year,
            posterPath: item.posterPath,
            type: type,
        }));

        userListCache.set(cacheKey, finalResult);
        return finalResult;
    } catch (error) {
        console.error(`Błąd API Filmwebu dla typu ${type}:`, error.message);
        return [];
    }
}

// ==========================================
// 5. TŁUMACZENIE I METADANE
// ==========================================

async function translateToImdb(movie, aioId) {
    const cacheKey = `${movie.type}-${movie.originalTitle}-${movie.year}`;
    const cached = metaCache.get(cacheKey);
    if (cached) return cached;

    try {
        const cinemetaUrl = `https://v3-cinemeta.strem.io/catalog/${movie.type}/top/search=${encodeURIComponent(movie.originalTitle)}.json`;
        const response = await axios.get(cinemetaUrl);
        const metas = response.data?.metas || [];

        const match = metas.find((item) => {
            const yearData = item.releaseInfo || item.year;
            const itemYear = parseInt(yearData ? yearData.toString().split('-')[0] : 0);
            return Math.abs(itemYear - parseInt(movie.year)) <= 1;
        });

        if (match) {
            const imdbId = match.imdb_id || match.id;
            const richData = await fetchRichMetadata(imdbId, movie.type, aioId);
            const finalPoster = richData.poster || match.poster;

            const metaPreview = {
                id: imdbId,
                type: movie.type,
                name: richData.name || movie.plTitle || match.name,
                poster: finalPoster,
                background: richData.background || match.background,
                releaseInfo: match.year,
                description: richData.description || '',
                imdbRating: richData.imdbRating || '',
                links: buildMetaLinks(richData),
            };

            metaCache.set(cacheKey, metaPreview);
            return metaPreview;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// --- FUNKCJE POMOCNICZE ---

async function fetchRichMetadata(imdbId, type, aioId) {
    if (aioId && aioId !== '') {
        try {
            const aioUrl = `https://aiometadata.elfhosted.com/stremio/${aioId}/meta/${type}/${imdbId}.json`;
            const aioResponse = await axios.get(aioUrl);
            if (aioResponse.data && aioResponse.data.meta) {
                return aioResponse.data.meta;
            }
        } catch (e) {}
    }

    try {
        const fullMetaUrl = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
        const response = await axios.get(fullMetaUrl);
        return response.data?.meta || {};
    } catch (e) {
        return {};
    }
}

function buildMetaLinks(richData) {
    if (richData.links && richData.links.length > 0) return richData.links;

    const metaLinks = [];
    if (Array.isArray(richData.genres)) {
        richData.genres.forEach((genre) => {
            metaLinks.push({ name: genre, category: 'genre', url: `stremio:///search?search=${encodeURIComponent(genre)}` });
        });
    }
    if (Array.isArray(richData.cast)) {
        richData.cast.slice(0, 4).forEach((actor) => {
            metaLinks.push({ name: actor, category: 'actor', url: `stremio:///search?search=${encodeURIComponent(actor)}` });
        });
    }
    if (Array.isArray(richData.director)) {
        richData.director.slice(0, 2).forEach((director) => {
            metaLinks.push({ name: director, category: 'director', url: `stremio:///search?search=${encodeURIComponent(director)}` });
        });
    }
    return metaLinks;
}

// ==========================================
// 6. EKSPORT
// ==========================================

module.exports = {
    getManifest,
    getCatalog,
    fetchWatchlist,
};
