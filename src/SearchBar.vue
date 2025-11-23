<template>
    <div class="navbar">
        <button class="btn" @click="$router.back()">← Retour</button>
        <button class="btn" @click="$router.push('/libraries')" aria-label="Accueil">🏠 Accueil</button>
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
        <button class="btn logout" @click="onLogout">Déconnexion</button>
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

async function onLogout() {
    await store.logout();
    router.push({ name: 'login' });
}


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
.btn {
    text-decoration: none;
    font-weight: 700;
    background: #131313;
    /* border: 1px solid #2a2a2a; */
    padding: 8px 12px;
    border-radius: 8px;


    border: none;
    cursor: pointer;
    color: #fff;
    transition: background 0.2s, transform 0.15s;
}

.btn:hover {
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

.btn.logout {
    justify-self: end;
    background: #ff4c4c;
    color: #fff;
    border: none;
}

.navbar {
    display: grid;
    grid-template-columns: 1fr 1fr 11fr 1fr;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    background: #1b1b1b;
    padding: 10px 12px;
}
</style>
