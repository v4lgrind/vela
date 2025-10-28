<template>
    <div class="global-search" role="search">
        <router-link class="home-btn" :to="{ name: 'libraries' }" aria-label="Accueil">🏠 Accueil</router-link>

        <div class="combobox" role="combobox" aria-expanded="true" aria-owns="search-listbox" aria-haspopup="listbox">
            <input ref="inputEl" v-model="query" class="search-input" type="search" :placeholder="placeholder"
                aria-autocomplete="list" aria-controls="search-listbox" aria-label="Rechercher dans les bibliothèques"
                @input="onInput" @keydown.down.prevent="moveActive(1)" @keydown.up.prevent="moveActive(-1)"
                @keydown.enter.prevent="selectActive" />
            <ul v-if="open && results.length" id="search-listbox" class="results" role="listbox">
                <li v-for="(r, idx) in results" :key="r.Id + '-' + idx" class="result" role="option"
                    :aria-selected="idx === activeIndex" @mouseenter="activeIndex = idx" @click="goToResult(r)">
                    <img :src="thumb(r)" alt="" class="thumb" />
                    <div class="meta">
                        <div class="name">{{ r.Name }}</div>
                        <div class="type">{{ typeLabel(r.Type) }}</div>
                    </div>
                </li>
            </ul>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useJellyfinStore } from './store/jellyfin-store';

const placeholder = 'Rechercher films, séries, acteurs…';
const router = useRouter();
const store = useJellyfinStore();

const inputEl = ref<HTMLInputElement | null>(null);
const query = ref('');
const results = ref<any[]>([]);
const open = ref(false);
const activeIndex = ref(0);
let debounceId: number | undefined;

function typeLabel(t?: string) {
    if (t === 'Movie') return 'Film';
    if (t === 'Series') return 'Série';
    if (t === 'Episode') return 'Épisode';
    if (t === 'Person') return 'Personne';
    return t || '';
}

function thumb(item: any) {
    // petite vignette pour les résultats
    return store.getImageUrl(item.Id, 'Primary', 60, 90) || '';
}

async function searchAll(term: string) {
    if (!term.trim()) {
        results.value = [];
        return;
    }
    // Médias uniquement: films, séries, épisodes, musique
    results.value = await store.searchItems({
        searchTerm: term,
        limit: 24,
        includeItemTypes: ['Movie', 'Series', 'Episode', 'Audio', 'AudioAlbum']
    });
    console.log("results", results.value)
    activeIndex.value = 0;
}


function onInput() {
    open.value = true;
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => searchAll(query.value), 250);
}

function moveActive(delta: number) {
    if (!results.value.length) return;
    activeIndex.value = (activeIndex.value + delta + results.value.length) % results.value.length;
}

function selectActive() {
    const r = results.value[activeIndex.value];
    if (r) goToResult(r);
}

function goToResult(r: any) {
    open.value = false;
    // Routage médias uniquement
    if (['Movie', 'Series', 'Episode', 'Video', 'Audio', 'AudioAlbum'].includes(r.Type)) {
        // Vers page détail si vidéo; pour Audio/Album adapter selon vos routes
        const target = ['Audio', 'AudioAlbum'].includes(r.Type)
            ? { name: 'ItemDetails', params: { id: r.Id } } // ou une page Audio dédiée
            : { name: 'ItemDetails', params: { id: r.Id } };
        router.push(target);
    }
}

onMounted(() => {
    // focus clavier rapide via raccourci (/)
    window.addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            inputEl.value?.focus();
        }
    });
});

watch(query, (val) => {
    if (!val) {
        results.value = [];
        open.value = false;
    }
});
</script>

<style scoped>
.global-search {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    background: #1b1b1b;
    border-bottom: 1px solid #262626;
    position: sticky;
    top: 0;
    z-index: 50;
}

.home-btn {
    color: #38f9d7;
    text-decoration: none;
    font-weight: 700;
    background: #131313;
    border: 1px solid #2a2a2a;
    padding: 8px 12px;
    border-radius: 8px;
}

.home-btn:hover {
    text-decoration: underline;
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
}

.search-input:focus {
    border-color: #38f9d7;
    box-shadow: 0 0 0 3px rgba(56, 249, 215, 0.15);
}

.results {
    position: absolute;
    left: 0;
    right: 0;
    margin-top: 6px;
    background: #1e1e1e;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 6px;
    max-height: 60vh;
    overflow: auto;
}

.result {
    display: grid;
    grid-template-columns: 60px 1fr;
    gap: 10px;
    align-items: center;
    padding: 8px;
    border-radius: 8px;
    cursor: pointer;
}

.result[aria-selected="true"],
.result:hover {
    background: #242424;
}

.thumb {
    width: 60px;
    height: 90px;
    border-radius: 6px;
    object-fit: cover;
    background: #0f0f0f;
}

.meta .name {
    color: #f0f0f0;
    font-weight: 600;
}

.meta .type {
    color: #9aa0a6;
    font-size: 0.85rem;
    margin-top: 3px;
}
</style>
