<template>
    <div class="navbar">
        <button class="btn" @click="$router.push('/libraries')" aria-label="Accueil">🏠 Accueil</button>
        <div class="combobox" role="combobox" aria-expanded="true" aria-owns="search-listbox" aria-haspopup="listbox">
            <input ref="inputEl" v-model="query" class="search-input" type="search" :placeholder="placeholder"
                aria-autocomplete="list" aria-controls="search-listbox" aria-label="Rechercher dans les bibliothèques"
                @input="onInput" @keydown.down.prevent="moveActive(1)" @keydown.up.prevent="moveActive(-1)"
                @keydown.enter.prevent="selectActive" @keydown.esc="close" />
            <div v-if="open && (hasResults || isSearching)" class="results-container">
                <div v-if="isSearching" class="searching">
                    <div class="spinner-small"></div>
                    <span>Recherche en cours...</span>
                </div>
                <div v-else-if="hasResults" id="search-listbox" class="results" role="listbox">
                    <!-- Movies -->
                    <div v-if="groupedResults.movies.length" class="result-group">
                        <div class="group-header">Films ({{ groupedResults.movies.length }})</div>
                        <div class="group-items">
                            <div v-for="(r, idx) in groupedResults.movies" :key="r.Id" class="result" role="option"
                                :class="{ active: flatIndex(r) === activeIndex }"
                                @mouseenter="activeIndex = flatIndex(r)" @click="goToResult(r)">
                                <img :src="thumb(r)" alt="" class="thumb" loading="lazy" />
                                <div class="meta">
                                    <div class="name">{{ r.Name }}</div>
                                    <div class="info">
                                        <span v-if="r.ProductionYear" class="year">{{ r.ProductionYear }}</span>
                                        <span v-if="r.CommunityRating" class="rating">⭐ {{ r.CommunityRating.toFixed(1) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TV Shows -->
                    <div v-if="groupedResults.series.length" class="result-group">
                        <div class="group-header">Séries TV ({{ groupedResults.series.length }})</div>
                        <div class="group-items">
                            <div v-for="(r, idx) in groupedResults.series" :key="r.Id" class="result" role="option"
                                :class="{ active: flatIndex(r) === activeIndex }"
                                @mouseenter="activeIndex = flatIndex(r)" @click="goToResult(r)">
                                <img :src="thumb(r)" alt="" class="thumb" loading="lazy" />
                                <div class="meta">
                                    <div class="name">{{ r.Name }}</div>
                                    <div class="info">
                                        <span v-if="r.ProductionYear" class="year">{{ r.ProductionYear }}</span>
                                        <span v-if="r.CommunityRating" class="rating">⭐ {{ r.CommunityRating.toFixed(1) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Music Albums -->
                    <div v-if="groupedResults.albums.length" class="result-group">
                        <div class="group-header">Albums ({{ groupedResults.albums.length }})</div>
                        <div class="group-items">
                            <div v-for="(r, idx) in groupedResults.albums" :key="r.Id" class="result" role="option"
                                :class="{ active: flatIndex(r) === activeIndex }"
                                @mouseenter="activeIndex = flatIndex(r)" @click="goToResult(r)">
                                <img :src="thumb(r)" alt="" class="thumb square" loading="lazy" />
                                <div class="meta">
                                    <div class="name">{{ r.Name }}</div>
                                    <div class="info">
                                        <span v-if="r.AlbumArtist" class="artist">{{ r.AlbumArtist }}</span>
                                        <span v-if="r.ProductionYear" class="year">{{ r.ProductionYear }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-else class="no-results">
                    Aucun résultat pour "{{ query }}"
                </div>
            </div>
        </div>
        <button class="btn logout" @click="onLogout">Déconnexion</button>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useJellyfinStore } from './store/jellyfin-store';

const placeholder = 'Rechercher films, séries, albums…';
const router = useRouter();
const store = useJellyfinStore();

const inputEl = ref<HTMLInputElement | null>(null);
const query = ref('');
const results = ref<any[]>([]);
const open = ref(false);
const activeIndex = ref(0);
const isSearching = ref(false);
let debounceId: number | undefined;

async function onLogout() {
    await store.logout();
    router.push({ name: 'login' });
}

function thumb(item: any) {
    // Larger thumbnails for better visibility
    if (item.Type === 'MusicAlbum') {
        return store.getImageUrl(item.Id, 'Primary', 120, 120) || '';
    }
    return store.getImageUrl(item.Id, 'Primary', 100, 150) || '';
}

// Group results by type
const groupedResults = computed(() => {
    return {
        movies: results.value.filter(r => r.Type === 'Movie'),
        series: results.value.filter(r => r.Type === 'Series'),
        albums: results.value.filter(r => r.Type === 'MusicAlbum'),
    };
});

const hasResults = computed(() => results.value.length > 0);

// Flatten results for keyboard navigation
const flatResults = computed(() => {
    return [
        ...groupedResults.value.movies,
        ...groupedResults.value.series,
        ...groupedResults.value.albums,
    ];
});

function flatIndex(item: any): number {
    return flatResults.value.findIndex(r => r.Id === item.Id);
}

async function searchAll(term: string) {
    if (!term.trim()) {
        results.value = [];
        isSearching.value = false;
        return;
    }

    isSearching.value = true;

    try {
        // Search only: Movies, TV Shows, Music Albums (no episodes)
        results.value = await store.searchItems({
            searchTerm: term,
            limit: 50,
            includeItemTypes: ['Movie', 'Series', 'MusicAlbum']
        });
        activeIndex.value = 0;
    } catch (e) {
        console.error('Search error:', e);
        results.value = [];
    } finally {
        isSearching.value = false;
    }
}

function onInput() {
    open.value = true;
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => searchAll(query.value), 300);
}

function moveActive(delta: number) {
    const flat = flatResults.value;
    if (!flat.length) return;
    activeIndex.value = (activeIndex.value + delta + flat.length) % flat.length;

    // Scroll active item into view
    setTimeout(() => {
        const activeEl = document.querySelector('.result.active');
        activeEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 10);
}

function selectActive() {
    const flat = flatResults.value;
    const r = flat[activeIndex.value];
    if (r) goToResult(r);
}

function goToResult(r: any) {
    close();
    query.value = '';
    router.push({ name: 'ItemDetails', params: { id: r.Id } });
}

function close() {
    open.value = false;
}

onMounted(() => {
    // Focus search with "/" keyboard shortcut
    window.addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const target = e.target as HTMLElement;
            // Don't trigger if already in an input
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            inputEl.value?.focus();
        }
    });
});

watch(query, (val) => {
    if (!val) {
        results.value = [];
        open.value = false;
        isSearching.value = false;
    }
});
</script>

<style scoped>
.btn {
    text-decoration: none;
    font-weight: 700;
    background: #131313;
    padding: 8px 12px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    color: #fff;
    transition: background 0.2s, transform 0.15s;
}

.btn:hover {
    background: #1f1f1f;
    transform: translateY(-1px);
}

.combobox {
    position: relative;
    width: 100%;
}

.search-input {
    width: 100%;
    background: #121212;
    color: #e0e0e0;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    padding: 10px 12px;
    outline: none;
    font-size: 0.95rem;
}

.search-input:focus {
    border-color: #38f9d7;
    box-shadow: 0 0 0 3px rgba(56, 249, 215, 0.15);
}

.results-container {
    position: absolute;
    left: 0;
    right: 0;
    margin-top: 8px;
    background: #1e1e1e;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    max-height: 70vh;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    z-index: 1000;
}

.searching {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 30px;
    color: #9aa0a6;
}

.spinner-small {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: #00a4dc;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.results {
    max-height: 70vh;
    overflow-y: auto;
    padding: 8px;
}

.result-group {
    margin-bottom: 16px;
}

.result-group:last-child {
    margin-bottom: 0;
}

.group-header {
    font-weight: 700;
    font-size: 0.9rem;
    color: #9aa0a6;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 12px 6px;
    position: sticky;
    top: 0;
    background: #1e1e1e;
    z-index: 1;
}

.group-items {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.result {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 12px;
    align-items: center;
    padding: 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s, transform 0.15s;
}

.result.active,
.result:hover {
    background: #242424;
    transform: translateX(2px);
}

.thumb {
    width: 100px;
    height: 150px;
    border-radius: 6px;
    object-fit: cover;
    background: #0f0f0f;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.thumb.square {
    width: 100px;
    height: 100px;
}

.meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}

.meta .name {
    color: #f0f0f0;
    font-weight: 600;
    font-size: 1rem;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.meta .info {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    font-size: 0.85rem;
}

.meta .year {
    color: #9aa0a6;
}

.meta .rating {
    color: #fbbf24;
    font-weight: 600;
}

.meta .artist {
    color: #38f9d7;
}

.no-results {
    padding: 40px 20px;
    text-align: center;
    color: #9aa0a6;
    font-size: 0.95rem;
}

.btn.logout {
    justify-self: end;
    background: #ff4c4c;
    color: #fff;
    border: none;
}

.btn.logout:hover {
    background: #ff3333;
}

.navbar {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    background: #1b1b1b;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px;
}

/* Scrollbar styling */
.results::-webkit-scrollbar {
    width: 8px;
}

.results::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
}

.results::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
}

.results::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
</style>
