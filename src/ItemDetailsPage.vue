<template>
    <div class="details-page">
        <header class="details-header">
            <button class="btn ghost" @click="$router.back()">← Retour</button>
            <h2 class="title">{{ item?.Name || 'Détails' }}</h2>
            <router-link class="btn home" :to="{ name: 'libraries' }">🏠 Accueil</router-link>
        </header>

        <section v-if="loading" class="state">Chargement...</section>
        <section v-else-if="error" class="state error">{{ error }}</section>

        <section v-else class="details-card">
            <div class="left">
                <div class="poster">
                    <img @error="(e) => handleImageError(e, item.Type)" :src="posterUrl" :alt="item?.Name"
                        loading="lazy" />
                </div>
            </div>

            <div class="right">
                <h3 class="name">{{ item?.Name }}</h3>

                <button class="btn play" v-if="isPlayable(item)" @click="playMedia">
                    ▶️ Lire ce média
                </button>

                <div class="meta-line">
                    <span v-if="year" class="chip">{{ year }}</span>
                    <span v-if="duration" class="chip">{{ duration }}</span>
                    <span v-if="item?.CommunityRating" class="chip">Note: {{ item.CommunityRating }}</span>
                    <span v-if="typeLabel" class="chip">{{ typeLabel }}</span>
                    <span v-if="videoCodec" class="chip">Codec: {{ videoCodec }}</span>
                    <span v-if="videoResolution" class="chip">Résolution: {{ videoResolution }}</span>
                </div>

                <p v-if="item?.Overview" class="overview">
                    {{ item.Overview }}
                </p>

                <div v-if="genres?.length" class="section">
                    <h4>Genres</h4>
                    <div class="chips">
                        <span v-for="g in genres" :key="g" class="chip">{{ g }}</span>
                    </div>
                </div>

                <div v-if="directorNames?.length" class="section">
                    <h4>Réalisateur</h4>
                    <div class="chips">
                        <span v-for="d in directorNames" :key="d" class="chip">{{ d }}</span>
                    </div>
                </div>

                <div v-if="studioNames?.length" class="section">
                    <h4>Studios</h4>
                    <div class="chips">
                        <span v-for="s in studioNames" :key="s" class="chip">{{ s }}</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- Si Série : afficher les Saisons -->
        <section v-if="item?.Type === 'Series' && seasons.length" class="children-section">
            <h3>Saisons</h3>
            <div class="grid">
                <div v-for="season in seasons" :key="season.Id" class="card" @click="goToItem(season.Id)">
                    <img :src="getImageUrl(season.Id, 'Primary', 300, 450)" :alt="season.Name" loading="lazy"
                        class="card-poster" />
                    <div class="card-title">{{ season.Name }}</div>
                </div>
            </div>
        </section>

        <!-- Si Saison : afficher les Épisodes -->
        <section v-if="item?.Type === 'Season' && episodes.length" class="children-section">
            <h3>Épisodes</h3>
            <div class="episodes-list">
                <div v-for="ep in episodes" :key="ep.Id" class="episode-card" @click="goToItem(ep.Id)">
                    <img :src="getImageUrl(ep.Id, 'Primary', 200, 112)" :alt="ep.Name" loading="lazy"
                        class="episode-thumb" />
                    <div class="episode-info">
                        <div class="episode-title">{{ ep.IndexNumber }}. {{ ep.Name }}</div>
                        <div class="episode-overview">{{ ep.Overview }}</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Si Album : afficher les pistes audio -->
        <section v-if="item?.Type === 'MusicAlbum' && audioTracks.length" class="children-section">
            <h3>Pistes</h3>
            <div class="tracks-list">
                <div v-for="track in audioTracks" :key="track.Id" class="track-card" @click="playTrack(track.Id)">
                    <div class="track-number">{{ track.IndexNumber || '•' }}</div>
                    <div class="track-info">
                        <div class="track-title">{{ track.Name }}</div>
                        <div class="track-artist" v-if="track.Artists?.length">
                            {{ track.Artists.join(', ') }}
                        </div>
                    </div>
                    <div class="track-duration">{{ formatTrackDuration(track.RunTimeTicks) }}</div>
                </div>
            </div>
        </section>

        <!-- Distribution en liste horizontale déroulante -->
        <section v-if="cast?.length" class="cast-scroller">
            <div class="scroller-header">
                <h3>Distribution</h3>
                <div class="controls">
                    <button class="btn ghost" @click="scrollCast('left')" aria-label="Défiler vers la gauche">←</button>
                    <button class="btn ghost" @click="scrollCast('right')"
                        aria-label="Défiler vers la droite">→</button>
                </div>
            </div>

            <div ref="castRail" class="scroller-rail" role="list" aria-label="Distribution">
                <div v-for="p in cast" :key="p.Id || p.Name" class="scroller-item" role="listitem" :title="p.Name">
                    <div class="avatar">
                        <img :src="personImageUrl(p)" :alt="p.Name" loading="lazy" />
                    </div>
                    <div class="cast-meta">
                        <div class="cast-name">{{ p.Name }}</div>
                        <div class="cast-role" v-if="p.Role">{{ p.Role }}</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Section technique: détails complets du flux vidéo -->
        <section v-if="videoDetails.length" class="tech-section">
            <h3>Métadonnées vidéo</h3>
            <dl class="kv">
                <template v-for="row in videoDetails" :key="`v-${row.label}`">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                </template>
            </dl>
        </section>

        <section v-if="sourceDetails.length || fileSizeHuman" class="tech-section">
            <h3>Source média</h3>
            <dl class="kv">
                <template v-for="row in sourceDetails" :key="`s-${row.label}`">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                </template>
                <template v-if="fileSizeHuman">
                    <dt>Taille du fichier</dt>
                    <dd>{{ fileSizeHuman }}</dd>
                </template>
            </dl>
        </section>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from './store/jellyfin-store';

const store = useJellyfinStore();
const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref<string | null>(null);
const item = ref<any | null>(null);
const seasons = ref<any[]>([]);
const episodes = ref<any[]>([]);
const audioTracks = ref<any[]>([]);

const itemId = computed(() => route.params.id as string);
const accessToken = store.accessToken;

function handleImageError(e: Event, itemType: string) {
    const img = e.target as HTMLImageElement;
    let fallbackUrl = store.getPlaceholderImage(itemType)
    img.src = fallbackUrl;
}

async function load() {
    loading.value = true;
    error.value = null;
    seasons.value = [];
    episodes.value = [];
    audioTracks.value = [];

    try {
        const data = await store.fetchItemDetails(itemId.value);
        item.value = data;

        // Si Série, charger les saisons
        if (data?.Type === 'Series') {
            seasons.value = await store.fetchSeasons(itemId.value);
        }

        // Si Saison, charger les épisodes
        if (data?.Type === 'Season') {
            episodes.value = await store.fetchEpisodes(itemId.value);
        }

        // Si Album de musique, charger les pistes audio
        if (data?.Type === 'MusicAlbum') {
            audioTracks.value = await store.fetchAudioTracks(itemId.value);
        }
    } catch (e) {
        error.value = 'Impossible de charger les détails';
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(() => route.params.id, load);

// Image principale
const posterUrl = computed(() => {
    if (!item.value?.Id) return '';
    return store.getImageUrl(item.value.Id, 'Primary', 300, 450) || '';
});

// Métadonnées simples
const year = computed(() => item.value?.ProductionYear || null);

const duration = computed(() => {
    const ticks = item.value?.RunTimeTicks;
    if (!ticks) return null;
    const totalSec = Math.floor(ticks / 10_000_000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
});

const genres = computed<string[]>(() => item.value?.Genres || []);

const typeLabel = computed(() => {
    const t = item.value?.Type;
    if (t === 'Movie') return 'Film';
    if (t === 'Series') return 'Série';
    if (t === 'Season') return 'Saison';
    if (t === 'Episode') return 'Épisode';
    if (t === 'MusicAlbum') return 'Album';
    if (t === 'Audio') return 'Audio';
    return t || '';
});

// People
type Person = { Id?: string; Name: string; Role?: string; Type?: string };
const people = computed<Person[]>(() => item.value?.People || []);

const directorNames = computed(() =>
    people.value.filter(p => p.Type === 'Director').map(p => p.Name)
);

const cast = computed<Person[]>(() =>
    people.value.filter(p => p.Type === 'Actor')
);

const studioNames = computed(() =>
    (item.value?.Studios || []).map((s: any) => s.Name).filter(Boolean)
);

function personImageUrl(p: Person) {
    if (!p?.Id) return '';
    return store.getImageUrl(p.Id, 'Primary', 140) || '';
}

// Play
function isPlayable(it: any) {
    return it && ['Movie', 'Episode', 'Video', 'Audio'].includes(it.Type);
}
function playMedia() {
    if (!item.value || !accessToken) return;
    router.push({ name: 'Player', params: { id: item.value.Id } });
}

// Navigation
function goToItem(id: string) {
    router.push({ name: 'ItemDetails', params: { id } });
}

function getImageUrl(id: string, type: string, w: number, h: number) {
    return store.getImageUrl(id, type, w, h) || '';
}

// Pistes audio
function formatTrackDuration(ticks?: number) {
    if (!ticks) return '';
    const totalSec = Math.floor(ticks / 10_000_000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function playTrack(trackId: string) {
    router.push({ name: 'Player', params: { id: trackId } });
}

// Cast rail scrolling
const castRail = ref<HTMLDivElement | null>(null);
function scrollCast(dir: 'left' | 'right') {
    const el = castRail.value;
    if (!el) return;
    const cardWidth = 160;
    const delta = dir === 'left' ? -cardWidth * 3 : cardWidth * 3;
    el.scrollBy({ left: delta, behavior: 'smooth' });
}

// MediaStreams / MediaSources (vidéo)
const mediaStreams = computed<any[]>(() => item.value?.MediaStreams ?? []);
const videoStreams = computed(() => mediaStreams.value.filter(s => s.Type === 'Video'));
const primaryVideo = computed(() => videoStreams.value[0] || null);

const videoCodec = computed(() => {
    const c = primaryVideo.value?.Codec;
    return c ? String(c).toUpperCase() : null;
});
const videoResolution = computed(() => {
    const w = primaryVideo.value?.Width;
    const h = primaryVideo.value?.Height;
    return w && h ? `${w}×${h}` : null;
});

// Liste détaillée de toutes les infos du flux vidéo
const videoDetails = computed(() => {
    const v = primaryVideo.value;
    if (!v) return [];

    const entries: Array<{ label: string; value: string }> = [];
    const push = (label: string, val: any) => {
        if (val === null || val === undefined || val === '') return;
        entries.push({ label, value: String(val) });
    };

    push('Codec', v.Codec?.toUpperCase());
    push('Profil', v.Profile);
    push('Niveau', v.Level);
    if (v.Width && v.Height) push('Résolution', `${v.Width}×${v.Height}`);
    push('Ratio', v.AspectRatio);
    push('Frame rate (moy.)', v.AverageFrameRate);
    push('Frame rate (réel)', v.RealFrameRate);
    push('Bitrate (vidéo)', v.BitRate);
    push('Profondeur bits', v.BitDepth);
    push('Ref frames', v.RefFrames);
    push('Entrelacé', v.IsInterlaced);
    push('IsAVC', v.IsAVC);
    push('Pixel format', v.PixelFormat);
    push('Espace couleur', v.ColorSpace);
    push('Transfert', v.ColorTransfer);
    push('Primaires', v.ColorPrimaries);
    push('Plage vidéo', v.VideoRange);
    push('Type HDR', v.VideoRangeType);
    if (v.DvProfile != null) push('DoVi Profil', v.DvProfile);
    if (v.DvLevel != null) push('DoVi Niveau', v.DvLevel);
    if (v.DvVersionMajor != null) {
        const dvVer = `${v.DvVersionMajor}.${v.DvVersionMinor ?? 0}`;
        push('DoVi Version', dvVer);
    }
    push('Time base', v.TimeBase);
    push('Index', v.Index);

    return entries;
});

// Source
const mediaSources = computed<any[]>(() => item.value?.MediaSources ?? []);
const firstSource = computed(() => mediaSources.value[0] || null);

const sourceDetails = computed(() => {
    const s = firstSource.value;
    if (!s) return [];
    const entries: Array<{ label: string; value: string }> = [];
    const push = (label: string, val: any) => {
        if (val === null || val === undefined || val === '') return;
        entries.push({ label, value: String(val) });
    };

    push('Container', s.Container);
    push('Bitrate total', s.Bitrate);
    push('Chemin', s.Path);
    push('DirectPlay possible', s.SupportsDirectPlay);
    push('Remux possible', s.SupportsDirectStream);
    push('Transcode possible', s.SupportsTranscoding);

    return entries;
});

function formatBytes(bytes?: number | null) {
    if (!bytes || bytes <= 0) return null;
    const units = ['octets', 'Ko', 'Mo', 'Go', 'To'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024;
        i++;
    }
    const fixed = val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2);
    return `${fixed} ${units[i]}`;
}

const fileSizeHuman = computed(() => {
    const size = firstSource.value?.Size as number | undefined;
    return formatBytes(size);
});
</script>

<style scoped>
.details-page {
    min-height: 100vh;
    background: #121212;
    color: #e0e0e0;
    padding: 20px;
    display: flex;
    flex-direction: column;
}

.details-header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
}

.title {
    margin: 0;
    justify-self: center;
    font-size: 1.8rem;
    font-weight: 600;
}

.btn {
    height: 36px;
    padding: 0 14px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: transform .15s ease, background .2s ease, color .2s ease, border-color .2s ease;
    border: 1px solid #2a2a2a;
    color: #e0e0e0;
    background: transparent;
}

.btn:hover {
    background: #1f1f1f;
    transform: translateY(-1px);
}

.btn.home {
    text-decoration: none;
    background: #131313;
    border: 1px solid #2a2a2a;
}

.btn.play {
    margin-top: 12px;
    background: linear-gradient(90deg, #43e97b 0%, #38f9d7 100%);
    color: #181818;
    font-weight: bold;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 1.05rem;
}

.btn.play:hover {
    background: linear-gradient(90deg, #38f9d7 20%, #43e97b 100%);
    transform: translateY(-1px) scale(1.02);
}

.state {
    text-align: center;
    padding: 40px 0;
    font-size: 1.1rem;
}

.state.error {
    color: #ff6b6b;
}

.details-card {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 24px;
    background: #1e1e1e;
    border: 1px solid #232323;
    border-radius: 14px;
    padding: 18px;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.35);
}

.left .poster {
    width: 300px;
    height: 450px;
    border-radius: 12px;
    overflow: hidden;
    background: #0f0f0f;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45);
}

.left .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.right .name {
    font-size: 1.6rem;
    font-weight: 700;
    margin: 0 0 8px 0;
    color: #f0f0f0;
}

.meta-line {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.chip {
    display: inline-flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 999px;
    background: #242424;
    border: 1px solid #2a2a2a;
    color: #dcdcdc;
    font-size: 0.85rem;
}

.overview {
    margin: 10px 0 16px 0;
    line-height: 1.6;
    color: #d7d7d7;
}

.section {
    margin-top: 14px;
}

.section h4 {
    margin: 0 0 8px 0;
    font-size: 1.05rem;
    color: #f3f3f3;
}

/* Saisons/Épisodes/Albums */
.children-section {
    margin-top: 24px;
}

.children-section h3 {
    margin: 0 0 12px 0;
    font-size: 1.3rem;
    font-weight: 600;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
}

.card {
    cursor: pointer;
    border-radius: 12px;
    overflow: hidden;
    background: #1e1e1e;
    border: 1px solid #232323;
    transition: transform 0.2s, border-color 0.2s;
}

.card:hover {
    transform: translateY(-4px);
    border-color: #38f9d7;
}

.card-poster {
    width: 100%;
    height: auto;
    aspect-ratio: 2/3;
    object-fit: cover;
}

.card-title {
    padding: 8px;
    text-align: center;
    font-weight: 600;
}

.episodes-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.episode-card {
    display: flex;
    gap: 12px;
    background: #1e1e1e;
    border: 1px solid #232323;
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    transition: transform 0.2s, border-color 0.2s;
}

.episode-card:hover {
    transform: translateX(4px);
    border-color: #38f9d7;
}

.episode-thumb {
    width: 200px;
    height: 112px;
    object-fit: cover;
    border-radius: 8px;
}

.episode-info {
    flex: 1;
}

.episode-title {
    font-weight: 600;
    margin-bottom: 6px;
}

.episode-overview {
    color: #9aa0a6;
    font-size: 0.9rem;
    line-height: 1.4;
}

/* Pistes audio */
.tracks-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.track-card {
    display: grid;
    grid-template-columns: 40px 1fr 60px;
    gap: 12px;
    align-items: center;
    background: #1e1e1e;
    border: 1px solid #232323;
    border-radius: 8px;
    padding: 10px 14px;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.2s, background 0.2s;
}

.track-card:hover {
    transform: translateX(4px);
    border-color: #38f9d7;
    background: #242424;
}

.track-number {
    text-align: center;
    color: #9aa0a6;
    font-weight: 600;
    font-size: 0.95rem;
}

.track-info {
    flex: 1;
    min-width: 0;
}

.track-title {
    font-weight: 600;
    color: #f0f0f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.track-artist {
    color: #9aa0a6;
    font-size: 0.85rem;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.track-duration {
    text-align: right;
    color: #9aa0a6;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
}

/* Cast horizontal scroller */
.cast-scroller {
    margin-top: 22px;
}

.scroller-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.scroller-header h3 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
}

.controls {
    display: flex;
    gap: 8px;
}

.scroller-rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(140px, 160px);
    gap: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scroll-behavior: smooth;
    padding-bottom: 6px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
}

.scroller-rail::-webkit-scrollbar {
    display: none;
}

.scroller-item {
    background: #1e1e1e;
    border: 1px solid #232323;
    border-radius: 12px;
    padding: 10px;
    text-align: center;
    scroll-snap-align: center;
    transition: transform .2s ease, background .2s ease, border-color .2s ease;
}

.scroller-item:hover {
    transform: translateY(-3px);
    background: #242424;
    border-color: #2c2c2c;
}

.avatar {
    width: 110px;
    aspect-ratio: 1 / 1;
    margin: 0 auto 10px auto;
    border-radius: 50%;
    overflow: hidden;
    background: #0f0f0f;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
    display: grid;
    place-items: center;
}

.avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
}

.cast-meta .cast-name {
    font-weight: 600;
    color: #f0f0f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cast-meta .cast-role {
    margin-top: 4px;
    color: #9aa0a6;
    font-size: 0.85rem;
}

/* Tech sections */
.tech-section {
    margin-top: 22px;
}

.tech-section h3 {
    margin: 0 0 10px 0;
    font-size: 1.2rem;
    font-weight: 600;
}

.kv {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 6px 14px;
    align-items: center;
}

.kv dt {
    color: #9aa0a6;
    font-weight: 600;
}

.kv dd {
    margin: 0;
    color: #e0e0e0;
    overflow-wrap: anywhere;
}

/* Responsive */
@media (max-width: 880px) {
    .details-card {
        grid-template-columns: 1fr;
    }

    .left .poster {
        width: 220px;
        height: 330px;
        margin: 0 auto;
    }
}
</style>
