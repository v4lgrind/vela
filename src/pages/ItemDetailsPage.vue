<template>
    <div class="min-h-dvh bg-surface text-text-primary p-5 flex flex-col">
        <section v-if="loading" class="text-center py-10 text-lg text-text-muted">Loading...</section>
        <section v-else-if="error" class="text-center py-10 text-lg text-error">{{ error }}</section>

        <Card v-else class="bg-surface-raised border-border-default rounded-xl p-4 shadow-lg grid grid-cols-[200px_1fr] max-md:grid-cols-1 gap-4">
            <div>
                <div class="rounded-lg overflow-hidden bg-black/60 shadow-md mx-auto"
                    :class="isAudioType(item.Type) ? 'w-[200px] h-[200px] max-md:w-[160px] max-md:h-[160px]' : 'w-[200px] h-[300px] max-md:w-[160px] max-md:h-[240px]'">
                    <LazyImg :src="posterUrl" :alt="item?.Name" :item-type="item?.Type" class="w-full h-full object-cover" />
                </div>
            </div>

            <div>
                <h3 class="text-xl font-bold text-text-heading m-0 mb-2">{{ item?.Name }}</h3>

                <Button v-if="isPlayable(item)" class="mt-3 bg-gradient-to-r from-accent-green to-accent-teal text-surface-raised font-bold" @click="playMedia">
                    <Play class="size-4 mr-1 fill-current stroke-none" /> Play
                </Button>

                <Button v-if="item.Type === 'MusicAlbum' && audioTracks.length" class="mt-3 bg-gradient-to-r from-accent-green to-accent-teal text-surface-raised font-bold" @click="playAlbum">
                    <Play class="size-4 mr-1 fill-current stroke-none" /> Play album
                </Button>

                <Button v-if="isItemDownloaded && !isDownloading" class="mt-3 ml-1 bg-accent-purple text-white hover:bg-error-dark" @click="deleteDownload">
                    <Check class="size-4 mr-1" /> Downloaded - Remove
                </Button>

                <Button v-else-if="canDownload(item) && !isItemDownloaded && !isDownloading" class="mt-3 ml-1 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white font-bold" @click="handleDownload">
                    <DownloadIcon class="size-4 mr-1" /> Download for offline
                </Button>

                <Button v-if="isDownloading" class="mt-3 ml-1 bg-[#1a5f7a] text-white font-bold cursor-wait" disabled>
                    Downloading... {{ downloadProgress }}%
                </Button>

                <Button v-if="isDownloading" variant="destructive" class="mt-2" @click="cancelDownload">
                    <X class="size-4 mr-1" /> Cancel
                </Button>

                <div class="flex flex-wrap gap-2 mb-2 mt-2">
                    <Badge v-if="year" variant="secondary">{{ year }}</Badge>
                    <Badge v-if="duration" variant="secondary">{{ duration }}</Badge>
                    <Badge v-if="item?.CommunityRating" variant="secondary">Rating: {{ item.CommunityRating }}</Badge>
                    <Badge v-if="typeLabel" variant="secondary">{{ typeLabel }}</Badge>
                    <Badge v-if="videoCodec" variant="secondary">Codec: {{ videoCodec }}</Badge>
                    <Badge v-if="videoResolution" variant="secondary">{{ videoResolution }}</Badge>
                </div>

                <p v-if="item?.Overview" class="my-2 leading-relaxed text-sm text-text-primary/85">
                    {{ item.Overview }}
                </p>

                <div v-if="genres?.length" class="mt-3">
                    <h4 class="text-sm font-semibold text-text-bright m-0 mb-1.5">Genres</h4>
                    <div class="flex flex-wrap gap-2">
                        <Badge v-for="g in genres" :key="g" variant="secondary">{{ g }}</Badge>
                    </div>
                </div>

                <div v-if="directorNames?.length" class="mt-3">
                    <h4 class="text-sm font-semibold text-text-bright m-0 mb-1.5">Director</h4>
                    <div class="flex flex-wrap gap-2">
                        <Badge v-for="d in directorNames" :key="d" variant="secondary">{{ d }}</Badge>
                    </div>
                </div>

                <div v-if="studioNames?.length" class="mt-3">
                    <h4 class="text-sm font-semibold text-text-bright m-0 mb-1.5">Studios</h4>
                    <div class="flex flex-wrap gap-2">
                        <Badge v-for="s in studioNames" :key="s" variant="secondary">{{ s }}</Badge>
                    </div>
                </div>
            </div>
        </Card>

        <!-- Seasons -->
        <section v-if="item?.Type === 'Series' && seasons.length" class="mt-6">
            <h3 class="text-xl font-semibold mb-3">Seasons</h3>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                <Card v-for="season in seasons" :key="season.Id" class="bg-surface-raised border-border-default cursor-pointer overflow-hidden hover:-translate-y-1 hover:border-accent-purple transition-all duration-200" @click="goToItem(season.Id)">
                    <LazyImg :src="getImageUrl(season.Id, 'Primary', 300, 450)" :alt="season.Name" item-type="Season"
                        class="w-full aspect-[2/3] object-cover" />
                    <div class="p-2 text-center font-semibold">{{ season.Name }}</div>
                </Card>
            </div>
        </section>

        <!-- Episodes -->
        <section v-if="item?.Type === 'Season' && episodes.length" class="mt-6">
            <h3 class="text-xl font-semibold mb-3">Episodes</h3>
            <div class="flex flex-col gap-3">
                <Card v-for="ep in episodes" :key="ep.Id" class="bg-surface-raised border-border-default flex gap-4 p-4 cursor-pointer hover:translate-x-1 hover:border-accent-purple transition-all duration-200" @click="goToItem(ep.Id)">
                    <LazyImg :src="getImageUrl(ep.Id, 'Primary', 240, 135)" :alt="ep.Name" item-type="Episode"
                        class="w-[240px] h-[135px] object-cover rounded-lg shrink-0" />
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between gap-3 mb-2">
                            <h4 class="font-bold text-lg text-text-heading m-0">{{ ep.IndexNumber }}. {{ ep.Name }}</h4>
                            <Badge v-if="ep.RunTimeTicks" variant="secondary" class="shrink-0">{{ formatTicksDuration(ep.RunTimeTicks) }}</Badge>
                        </div>
                        <p v-if="ep.Overview" class="text-text-primary text-sm leading-relaxed mb-0">
                            {{ ep.Overview }}
                        </p>
                        <p v-else class="text-text-muted text-sm italic mb-0">
                            No synopsis available
                        </p>
                        <div v-if="ep.CommunityRating || ep.PremiereDate" class="flex gap-2 mt-2">
                            <Badge v-if="ep.CommunityRating" variant="secondary" class="text-xs">
                                ⭐ {{ ep.CommunityRating.toFixed(1) }}
                            </Badge>
                            <Badge v-if="ep.PremiereDate" variant="secondary" class="text-xs">
                                {{ new Date(ep.PremiereDate).getFullYear() }}
                            </Badge>
                        </div>
                    </div>
                </Card>
            </div>
        </section>

        <!-- Audio Tracks -->
        <section v-if="item?.Type === 'MusicAlbum' && audioTracks.length" class="mt-6">
            <h3 class="text-xl font-semibold mb-3">Tracks</h3>
            <div class="flex flex-col gap-1">
                <div v-for="(track, i) in audioTracks" :key="track.Id"
                    class="grid grid-cols-[40px_1fr_60px] gap-3 items-center bg-surface-raised border border-border-default rounded-lg px-3.5 py-2.5 cursor-pointer transition-all duration-150 hover:translate-x-1 hover:border-accent-purple hover:bg-surface-hover"
                    :class="audioPlayerStore.currentTrack?.id === track.Id && 'border-accent-purple! bg-accent-purple/10'"
                    @click="playTrack(track.Id, i)">
                    <div class="text-center text-text-muted font-semibold text-sm">{{ track.IndexNumber || '·' }}</div>
                    <div class="min-w-0">
                        <div class="font-semibold text-text-heading truncate" :class="audioPlayerStore.currentTrack?.id === track.Id && 'text-accent-purple-light'">{{ track.Name }}</div>
                        <div v-if="track.Artists?.length" class="text-text-muted text-sm mt-0.5 truncate">{{ track.Artists.join(', ') }}</div>
                    </div>
                    <div class="text-right text-text-muted text-sm tabular-nums">{{ formatTrackDuration(track.RunTimeTicks) }}</div>
                </div>
            </div>
        </section>

        <!-- Cast -->
        <section v-if="cast?.length" class="mt-6">
            <div class="flex items-center justify-between gap-3 mb-3">
                <h3 class="text-xl font-semibold m-0">Cast</h3>
                <div class="flex gap-2">
                    <Button variant="outline" size="icon" class="size-8" @click="scrollCast('left')"><ArrowLeft class="size-4" /></Button>
                    <Button variant="outline" size="icon" class="size-8" @click="scrollCast('right')"><ArrowRight class="size-4" /></Button>
                </div>
            </div>
            <div ref="castRail" class="grid grid-flow-col auto-cols-[minmax(140px,160px)] gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-proximity scroll-smooth pb-1.5 scrollbar-hide" role="list">
                <Card v-for="p in cast" :key="p.Id || p.Name" class="bg-surface-raised border-border-default p-2.5 text-center snap-center hover:-translate-y-1 hover:bg-surface-hover hover:border-border-hover transition-all duration-200" role="listitem" :title="p.Name">
                    <div class="size-[110px] mx-auto mb-2.5 rounded-full overflow-hidden bg-black/60 shadow-lg grid place-items-center">
                        <LazyImg :src="personImageUrl(p)" :alt="p.Name" item-type="person" class="w-full h-full object-cover" />
                    </div>
                    <div class="font-semibold text-text-heading truncate">{{ p.Name }}</div>
                    <div v-if="p.Role" class="text-text-muted text-sm mt-1">{{ p.Role }}</div>
                </Card>
            </div>
        </section>

        <!-- Video Metadata -->
        <section v-if="videoDetails.length" class="mt-6">
            <h3 class="text-lg font-semibold mb-2.5">Video Metadata</h3>
            <dl class="grid grid-cols-[180px_1fr] gap-x-3.5 gap-y-1.5 items-center">
                <template v-for="row in videoDetails" :key="`v-${row.label}`">
                    <dt class="text-text-muted font-semibold">{{ row.label }}</dt>
                    <dd class="m-0 text-text-primary break-all">{{ row.value }}</dd>
                </template>
            </dl>
        </section>

        <section v-if="sourceDetails.length || fileSizeHuman" class="mt-6">
            <h3 class="text-lg font-semibold mb-2.5">Media Source</h3>
            <dl class="grid grid-cols-[180px_1fr] gap-x-3.5 gap-y-1.5 items-center">
                <template v-for="row in sourceDetails" :key="`s-${row.label}`">
                    <dt class="text-text-muted font-semibold">{{ row.label }}</dt>
                    <dd class="m-0 text-text-primary break-all">{{ row.value }}</dd>
                </template>
                <template v-if="fileSizeHuman">
                    <dt class="text-text-muted font-semibold">File size</dt>
                    <dd class="m-0 text-text-primary break-all">{{ fileSizeHuman }}</dd>
                </template>
            </dl>
        </section>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useOfflineStore } from '@/store/offline-store';
import { useAudioPlayerStore, type AudioTrack } from '@/store/audio-player-store';
import { downloadService } from '@/services/downloadService';
import LazyImg from '@/components/LazyImg.vue';
import { isAudioType, typeLabel as getTypeLabel, formatTicksDuration, formatTicksHuman, formatBytes } from '@/utils/helpers';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Check, Download as DownloadIcon, X, ArrowLeft, ArrowRight } from 'lucide-vue-next';

const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const audioPlayerStore = useAudioPlayerStore();
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

const isDownloading = ref(false);
const downloadProgress = ref(0);

async function load() {
    loading.value = true;
    error.value = null;
    seasons.value = [];
    episodes.value = [];
    audioTracks.value = [];

    try {
        const data = await store.fetchItemDetails(itemId.value);
        item.value = data;

        if (data?.Type === 'Series') {
            seasons.value = await store.fetchSeasons(itemId.value);
        }
        if (data?.Type === 'Season') {
            episodes.value = await store.fetchEpisodes(itemId.value);
        }
        if (data?.Type === 'MusicAlbum') {
            audioTracks.value = await store.fetchAudioTracks(itemId.value);
        }
    } catch (e) {
        error.value = 'Failed to load details';
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch(() => route.params.id, load);

const posterUrl = computed(() => {
    if (!item.value?.Id) return '';
    return store.getImageUrl(item.value.Id, 'Primary', 300, 450) || '';
});

const year = computed(() => item.value?.ProductionYear || null);
const duration = computed(() => formatTicksHuman(item.value?.RunTimeTicks));
const genres = computed<string[]>(() => item.value?.Genres || []);
const typeLabel = computed(() => getTypeLabel(item.value?.Type));

type Person = { Id?: string; Name: string; Role?: string; Type?: string };
const people = computed<Person[]>(() => item.value?.People || []);
const directorNames = computed(() => people.value.filter(p => p.Type === 'Director').map(p => p.Name));
const cast = computed<Person[]>(() => people.value.filter(p => p.Type === 'Actor'));
const studioNames = computed(() => (item.value?.Studios || []).map((s: any) => s.Name).filter(Boolean));

function personImageUrl(p: Person) {
    if (!p?.Id) return '';
    return store.getImageUrl(p.Id, 'Primary', 140) || '';
}

function isPlayable(it: any) {
    return it && ['Movie', 'Episode', 'Video', 'Audio'].includes(it.Type);
}

function playMedia() {
    if (!item.value || !accessToken) return;
    if (item.value.Type === 'Audio' || item.value.MediaType === 'Audio') {
        const track = itemToAudioTrack(item.value);
        audioPlayerStore.playTrack(track);
        return;
    }
    router.push({ name: 'Player', params: { id: item.value.Id } });
}

function goToItem(id: string) {
    router.push({ name: 'ItemDetails', params: { id } });
}

function getImageUrl(id: string, type: string, w: number, h: number) {
    return store.getImageUrl(id, type, w, h) || '';
}

const formatTrackDuration = formatTicksDuration;

function itemToAudioTrack(raw: any): AudioTrack {
    return {
        id: raw.Id,
        name: raw.Name || '',
        artist: raw.AlbumArtist || raw.Artists?.join(', ') || '',
        albumId: raw.AlbumId || raw.ParentId || raw.Id,
        albumName: raw.Album || item.value?.Name || '',
        duration: raw.RunTimeTicks ? raw.RunTimeTicks / 10_000_000 : 0,
        indexNumber: raw.IndexNumber || 0,
    };
}

function playTrack(_trackId: string, index: number) {
    const tracks = audioTracks.value.map(itemToAudioTrack);
    audioPlayerStore.playAlbum(tracks, index);
}

function playAlbum() {
    const tracks = audioTracks.value.map(itemToAudioTrack);
    audioPlayerStore.playAlbum(tracks, 0);
}

const castRail = ref<HTMLDivElement | null>(null);
function scrollCast(dir: 'left' | 'right') {
    const el = castRail.value;
    if (!el) return;
    const cardWidth = 160;
    const delta = dir === 'left' ? -cardWidth * 3 : cardWidth * 3;
    el.scrollBy({ left: delta, behavior: 'smooth' });
}

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
    return w && h ? `${w}x${h}` : null;
});

const videoDetails = computed(() => {
    const v = primaryVideo.value;
    if (!v) return [];
    const entries: Array<{ label: string; value: string }> = [];
    const push = (label: string, val: any) => {
        if (val === null || val === undefined || val === '') return;
        entries.push({ label, value: String(val) });
    };
    push('Codec', v.Codec?.toUpperCase());
    push('Profile', v.Profile);
    push('Level', v.Level);
    if (v.Width && v.Height) push('Resolution', `${v.Width}x${v.Height}`);
    push('Aspect Ratio', v.AspectRatio);
    push('Avg Frame Rate', v.AverageFrameRate);
    push('Real Frame Rate', v.RealFrameRate);
    push('Bitrate (video)', v.BitRate);
    push('Bit Depth', v.BitDepth);
    push('Ref Frames', v.RefFrames);
    push('Interlaced', v.IsInterlaced);
    push('IsAVC', v.IsAVC);
    push('Pixel Format', v.PixelFormat);
    push('Color Space', v.ColorSpace);
    push('Color Transfer', v.ColorTransfer);
    push('Color Primaries', v.ColorPrimaries);
    push('Video Range', v.VideoRange);
    push('HDR Type', v.VideoRangeType);
    if (v.DvProfile != null) push('DoVi Profile', v.DvProfile);
    if (v.DvLevel != null) push('DoVi Level', v.DvLevel);
    if (v.DvVersionMajor != null) {
        push('DoVi Version', `${v.DvVersionMajor}.${v.DvVersionMinor ?? 0}`);
    }
    push('Time Base', v.TimeBase);
    push('Index', v.Index);
    return entries;
});

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
    push('Total Bitrate', s.Bitrate);
    push('Path', s.Path);
    push('Direct Play', s.SupportsDirectPlay);
    push('Remux', s.SupportsDirectStream);
    push('Transcode', s.SupportsTranscoding);
    return entries;
});

const fileSizeHuman = computed(() => {
    const size = firstSource.value?.Size as number | undefined;
    return formatBytes(size);
});

function canDownload(it: any): boolean {
    return it && ['Movie', 'Episode', 'Video', 'Audio', 'MusicAlbum'].includes(it.Type);
}

const isItemDownloaded = computed(() => {
    return offlineStore.isItemDownloaded(itemId.value);
});

async function handleDownload() {
    if (!item.value) return;
    try {
        isDownloading.value = true;
        downloadProgress.value = 0;
        await store.downloadItemForOffline(itemId.value, (progress) => {
            downloadProgress.value = progress.percentage;
        });
        await offlineStore.loadDownloads();
    } catch (error: any) {
        alert('Download failed');
    } finally {
        isDownloading.value = false;
        downloadProgress.value = 0;
    }
}

async function deleteDownload() {
    if (!item.value) return;
    if (!confirm(`Delete "${item.value.Name}" from offline storage?`)) return;
    try {
        await downloadService.deleteOfflineFile(itemId.value);
        await offlineStore.removeDownload(itemId.value);
    } catch (error: any) {
        alert('Failed to delete');
    }
}

function cancelDownload() {
    if (!item.value) return;
    store.cancelDownload(itemId.value);
    isDownloading.value = false;
    downloadProgress.value = 0;
}
</script>
