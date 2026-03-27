<template>
    <div class="min-h-dvh text-foreground bg-background relative isolate">

        <!-- ── Ambient backdrop ──────────────────────────────── -->
        <!-- absolute (not fixed) so it stays within the page area below the nav bar.
             isolate on root creates a stacking context; -z-10 is scoped inside it,
             above the root's bg-color but below all page content. -->
        <div aria-hidden="true" class="absolute inset-x-0 top-0 h-screen overflow-hidden pointer-events-none -z-10">
            <template v-if="backdropUrl">
                <img :src="backdropUrl"
                    class="w-full h-full object-cover scale-110 blur-2xl opacity-100 select-none" />
                <div class="absolute inset-0" style="background-color: var(--item-backdrop-tint)" />
                <div class="absolute inset-0 item-page-overlay" />
            </template>
        </div>

        <!-- Loading -->
        <section v-if="loading"
            class="flex items-center justify-center min-h-dvh text-text-muted text-lg">Loading…</section>

        <!-- Error -->
        <section v-else-if="error"
            class="flex items-center justify-center min-h-dvh text-red-400 text-lg">{{ error }}</section>

        <template v-else>

            <!-- ── HERO ──────────────────────────────────────── -->
            <section class="relative px-4 pt-8 pb-10 sm:px-6 md:px-10 lg:px-16 text-white">
                <div class="mx-auto max-w-5xl flex flex-col sm:flex-row gap-7 sm:gap-10 items-start">

                    <!-- Poster -->
                    <div class="shrink-0 mx-auto sm:mx-0">
                        <div class="rounded-2xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.85)] ring-1 ring-border-default"
                            :class="isAudioType(item.Type)
                                ? 'w-40 h-40 sm:w-48 sm:h-48'
                                : isLandscapePoster
                                    ? 'w-full max-w-xs aspect-video'
                                    : 'w-36 sm:w-48'">
                            <LazyImg :src="posterUrl" :alt="item.Name" :item-type="item.Type"
                                class="w-full h-full object-cover block" />
                        </div>
                    </div>

                    <!-- Info -->
                    <Dialog v-model:open="showMediaInfo">
                        <div class="flex-1 min-w-0 w-full">

                            <!-- Breadcrumb -->
                            <div v-if="item.SeriesId || item.SeasonId"
                                class="flex items-center gap-1.5 text-sm text-white/70 mb-2">
                                <button v-if="item.SeriesId" @click="goToItem(item.SeriesId)"
                                    class="hover:text-white transition-colors cursor-pointer">{{ item.SeriesName }}</button>
                                <span v-if="item.SeriesId && item.SeasonId" class="text-white/40">/</span>
                                <button v-if="item.SeasonId" @click="goToItem(item.SeasonId)"
                                    class="hover:text-white transition-colors cursor-pointer">{{ item.SeasonName }}</button>
                            </div>

                            <!-- Title -->
                            <h1 class="text-3xl sm:text-4xl font-bold text-white leading-tight mb-3">{{ item.Name }}</h1>

                            <!-- Metadata row -->
                            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm mb-5">
                                <span v-if="year" class="text-white/80">{{ year }}</span>
                                <span v-if="year && duration" class="text-white/35">·</span>
                                <span v-if="duration" class="text-white/80">{{ duration }}</span>
                                <template v-if="item.CommunityRating">
                                    <span class="text-white/35">·</span>
                                    <span class="text-yellow-400 font-semibold">★ {{ item.CommunityRating.toFixed(1) }}</span>
                                </template>
                                <span v-if="item.Type === 'Season' && episodes.length" class="text-white/70">
                                    {{ episodes.length }} episodes
                                </span>
                                <span v-if="item.Type === 'Season' && item.PremiereDate" class="text-white/70">
                                    {{ new Date(item.PremiereDate).getFullYear() }}
                                </span>
                                <span v-if="videoResolution"
                                    class="px-2 py-0.5 rounded-md bg-white/10 text-xs font-medium text-white/80">{{ videoResolution }}</span>
                                <span v-if="videoCodec"
                                    class="px-2 py-0.5 rounded-md bg-white/10 text-xs font-medium text-white/80 uppercase">{{ videoCodec }}</span>
                            </div>

                            <!-- Actions -->
                            <div class="flex flex-wrap gap-2 mb-6">
                                <button v-if="isPlayable(item)" @click="playMedia"
                                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-white/90 active:scale-95 transition-all shadow-lg shadow-black/30 cursor-pointer">
                                    <Play class="size-4 fill-black stroke-none" />
                                    {{ resumePositionLabel ? `Resume · ${resumePositionLabel}` : 'Play' }}
                                </button>

                                <button v-if="item.Type === 'MusicAlbum' && audioTracks.length" @click="playAlbum"
                                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-white/90 transition-all cursor-pointer">
                                    <Play class="size-4 fill-black stroke-none" /> Play album
                                </button>

                                <!-- Cast button -->
                                <button
                                    v-if="isPlayable(item) && castState !== 'NO_DEVICES_AVAILABLE'"
                                    @click="castItem"
                                    :class="castState === 'CONNECTED' ? 'bg-accent-blue/20 border-accent-blue/50 text-accent-blue' : 'bg-white/10 border-white/10 text-white/90 hover:bg-white/15'"
                                    class="flex items-center justify-center w-11 h-11 rounded-xl border transition-all cursor-pointer"
                                    :title="castState === 'CONNECTED' ? 'Casting' : 'Cast to TV'">
                                    <Tv2 class="size-4" />
                                </button>

                                <button v-if="isItemDownloaded && !isDownloading" @click="deleteDownload"
                                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-purple/20 border border-accent-purple/40 text-accent-purple text-sm font-medium hover:bg-accent-purple/30 transition-all cursor-pointer">
                                    <Check class="size-4" /> Downloaded
                                </button>
                                <button v-else-if="canDownload(item) && !isItemDownloaded && !isDownloading"
                                    @click="handleDownload"
                                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white/90 text-sm font-medium hover:bg-white/15 transition-all cursor-pointer">
                                    <DownloadIcon class="size-4" /> Download
                                </button>
                                <button v-if="isDownloading" disabled
                                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white/65 text-sm cursor-wait">
                                    Downloading… {{ downloadProgress }}%
                                </button>
                                <button v-if="isDownloading" @click="cancelDownload"
                                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/25 transition-all cursor-pointer">
                                    <X class="size-4" /> Cancel
                                </button>

                                <!-- Bulk download buttons for Season / Series -->
                                <button v-if="item.Type === 'Season'"
                                    @click="openBulkDialog('season')"
                                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white/90 text-sm font-medium hover:bg-white/15 transition-all cursor-pointer">
                                    <DownloadIcon class="size-4" /> Download Season
                                </button>
                                <button v-if="item.Type === 'Series'"
                                    @click="openBulkDialog('series')"
                                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white/90 text-sm font-medium hover:bg-white/15 transition-all cursor-pointer">
                                    <DownloadIcon class="size-4" /> Download Series
                                </button>

                                <!-- Mark all watched for Series / Season -->
                                <button v-if="item.Type === 'Series' || item.Type === 'Season'"
                                    :disabled="togglingWatched" @click="toggleWatched"
                                    :title="item.UserData?.Played ? 'Mark all as unwatched' : 'Mark all as watched'"
                                    class="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer"
                                    :class="item.UserData?.Played
                                        ? 'bg-accent-purple/20 border-accent-purple/50 text-accent-purple hover:bg-accent-purple/30'
                                        : 'bg-white/10 border-white/10 text-white/90 hover:bg-white/15'">
                                    <Loader2 v-if="togglingWatched" class="size-4 animate-spin" />
                                    <Check v-else class="size-4" />
                                    {{ item.UserData?.Played ? 'All watched' : 'Mark all watched' }}
                                </button>

                                <button
                                    v-if="item.Type !== 'Series' && item.Type !== 'Season' && item.Type !== 'MusicAlbum' && item.Type !== 'BoxSet'"
                                    :disabled="togglingWatched" @click="toggleWatched"
                                    :title="item.UserData?.Played ? 'Mark as unwatched' : 'Mark as watched'"
                                    class="flex items-center justify-center w-11 h-11 rounded-xl border transition-all cursor-pointer"
                                    :class="item.UserData?.Played
                                        ? 'bg-accent-purple/20 border-accent-purple/50 text-accent-purple'
                                        : 'bg-white/10 border-white/10 text-white/75 hover:bg-white/15 hover:text-white'">
                                    <Loader2 v-if="togglingWatched" class="size-4 animate-spin" />
                                    <Check v-else class="size-4" />
                                </button>

                                <DialogTrigger v-if="videoDetails.length || sourceDetails.length || fileSizeHuman"
                                    as-child>
                                    <button
                                        class="flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 border border-white/10 text-white/75 hover:bg-white/15 hover:text-white transition-all cursor-pointer"
                                        title="Media info">
                                        <Info class="size-4" />
                                    </button>
                                </DialogTrigger>
                            </div>

                            <!-- Overview -->
                            <div v-if="item.Overview" class="mb-5 max-w-2xl">
                                <p class="text-sm leading-relaxed text-white/85 m-0 transition-all"
                                    :class="overviewExpanded ? '' : 'line-clamp-3'">
                                    {{ item.Overview }}
                                </p>
                                <button @click="overviewExpanded = !overviewExpanded"
                                    class="mt-1.5 text-xs text-accent-purple hover:text-accent-purple-light transition-colors cursor-pointer">
                                    {{ overviewExpanded ? 'Show less' : 'Show more' }}
                                </button>
                            </div>

                            <!-- Genres -->
                            <div v-if="genres.length" class="flex flex-wrap gap-1.5 mb-4">
                                <span v-for="g in genres" :key="g"
                                    class="px-3 py-1 rounded-full text-xs text-white/80 border border-white/20 bg-white/10">
                                    {{ g }}
                                </span>
                            </div>

                            <!-- Director / Studio inline -->
                            <div class="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                                <span v-if="directorNames.length">
                                    <span class="text-white/50 uppercase tracking-wider text-[10px] mr-1.5">Director</span>
                                    <span class="text-white/80">{{ directorNames.join(', ') }}</span>
                                </span>
                                <span v-if="studioNames.length">
                                    <span class="text-white/50 uppercase tracking-wider text-[10px] mr-1.5">Studio</span>
                                    <span class="text-white/80">{{ studioNames.join(', ') }}</span>
                                </span>
                            </div>

                            <!-- Media Info dialog content -->
                            <DialogContent
                                class="max-w-lg max-h-[85dvh] overflow-y-auto bg-surface-raised border-border-default">
                                <DialogHeader>
                                    <DialogTitle class="text-text-heading text-lg">Media Information</DialogTitle>
                                    <DialogDescription class="text-text-muted text-sm">Technical details for
                                        {{ item.Name }}</DialogDescription>
                                </DialogHeader>

                                <div v-if="videoDetails.length" class="mt-4">
                                    <h4 class="text-sm font-semibold text-accent-purple-light uppercase tracking-wider mb-3">Video Stream</h4>
                                    <div class="grid grid-cols-2 gap-2">
                                        <div v-for="row in videoDetails" :key="`v-${row.label}`"
                                            class="bg-surface-hover/50 rounded-lg px-3 py-2">
                                            <div class="text-[11px] text-text-muted uppercase tracking-wider">{{ row.label }}</div>
                                            <div class="text-sm font-medium text-text-heading mt-0.5 break-all">{{ row.value }}</div>
                                        </div>
                                    </div>
                                </div>

                                <Separator v-if="videoDetails.length && (sourceDetails.length || fileSizeHuman)"
                                    class="my-4 bg-border-default" />

                                <div v-if="sourceDetails.length || fileSizeHuman">
                                    <h4 class="text-sm font-semibold text-accent-purple-light uppercase tracking-wider mb-3">Media Source</h4>
                                    <div class="grid grid-cols-2 gap-2">
                                        <template v-for="row in sourceDetails" :key="`s-${row.label}`">
                                            <div class="bg-surface-hover/50 rounded-lg px-3 py-2"
                                                :class="row.label === 'Path' ? 'col-span-2' : ''">
                                                <div class="text-[11px] text-text-muted uppercase tracking-wider">{{ row.label }}</div>
                                                <div class="text-sm font-medium text-text-heading mt-0.5 break-all">{{ row.value }}</div>
                                            </div>
                                        </template>
                                        <div v-if="fileSizeHuman" class="bg-surface-hover/50 rounded-lg px-3 py-2">
                                            <div class="text-[11px] text-text-muted uppercase tracking-wider">File size</div>
                                            <div class="text-sm font-medium text-text-heading mt-0.5">{{ fileSizeHuman }}</div>
                                        </div>
                                    </div>
                                </div>

                                <DialogFooter class="mt-4">
                                    <DialogClose as-child>
                                        <Button variant="outline" class="min-h-[44px]">Close</Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </div>
                    </Dialog>
                </div>
            </section>

            <!-- ── SECTIONS ──────────────────────────────────── -->
            <div class="px-4 sm:px-6 md:px-10 lg:px-16 pb-12 max-w-5xl mx-auto space-y-5">

                <!-- Seasons -->
                <section v-if="item.Type === 'Series' && seasons.length"
                    class="bg-surface-raised border border-border-default rounded-2xl p-5 backdrop-blur-sm">
                    <h3 class="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">Seasons</h3>
                    <div class="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-4">
                        <div v-for="season in seasons" :key="season.Id"
                            class="cursor-pointer group rounded-xl overflow-hidden bg-surface-raised border border-border-default hover:-translate-y-1 hover:border-border-hover transition-all duration-200 active:scale-[0.97] active:opacity-75"
                            @click="goToItem(season.Id)">
                            <div class="relative w-full aspect-[2/3] overflow-hidden">
                                <LazyImg :src="getImageUrl(season.Id, 'Primary', 300, 450)" :alt="season.Name"
                                    item-type="Season" class="w-full h-full object-cover" />
                                <button @click.stop="toggleWatchedSeason(season)" :disabled="watchingSeasonId === season.Id"
                                    class="absolute top-1.5 right-1.5 p-1.5 rounded-full transition-all duration-200 cursor-pointer pointer-events-auto opacity-100 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-50"
                                    :class="season.UserData?.Played ? 'bg-accent-purple text-white shadow' : 'bg-black/50 text-white/70 hover:bg-black/80 hover:text-white'"
                                    :title="season.UserData?.Played ? 'Mark as unwatched' : 'Mark as watched'">
                                    <Loader2 v-if="watchingSeasonId === season.Id" class="size-3 animate-spin" />
                                    <Check v-else class="size-3" />
                                </button>
                                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-center pb-2 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 pointer-events-none">
                                    <button @click.stop="playNextInSeason(season)" :disabled="playingSeasonId === season.Id"
                                        class="bg-white/90 hover:bg-white text-black rounded-full p-1.5 shadow-lg transition-all disabled:opacity-60 pointer-events-auto cursor-pointer">
                                        <Loader2 v-if="playingSeasonId === season.Id" class="size-3.5 animate-spin" />
                                        <Play v-else class="size-3.5 fill-black stroke-none" />
                                    </button>
                                </div>
                            </div>
                            <div class="px-2 py-2 text-center text-xs font-semibold text-text-primary">{{ season.Name }}</div>
                        </div>
                    </div>
                </section>

                <!-- Episodes -->
                <section v-if="item.Type === 'Season' && episodes.length"
                    class="bg-surface-raised border border-border-default rounded-2xl p-5 backdrop-blur-sm">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-widest">Episodes</h3>
                        <button :disabled="togglingWatched" @click="toggleWatched"
                            :title="item.UserData?.Played ? 'Mark all as unwatched' : 'Mark all as watched'"
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer"
                            :class="item.UserData?.Played
                                ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple hover:bg-accent-purple/25'
                                : 'bg-surface-hover border-border-input text-text-muted hover:text-text-heading hover:border-border-hover'">
                            <Loader2 v-if="togglingWatched" class="size-3 animate-spin" />
                            <Check v-else class="size-3" />
                            {{ item.UserData?.Played ? 'All watched' : 'Mark all watched' }}
                        </button>
                    </div>
                    <div class="flex flex-col gap-2">
                        <div v-for="ep in episodes" :key="ep.Id"
                            class="flex gap-3 sm:gap-4 p-2.5 rounded-xl cursor-pointer transition-all duration-200 border border-transparent hover:bg-surface-raised hover:border-border-default active:opacity-75"
                            :class="ep.UserData?.Played ? 'opacity-50 hover:opacity-80' : ''"
                            @click="goToItem(ep.Id)">
                            <!-- Thumbnail -->
                            <div class="relative group w-[100px] h-[56px] sm:w-[180px] sm:h-[101px] rounded-lg overflow-hidden shrink-0 bg-black/40">
                                <LazyImg :src="getImageUrl(ep.Id, 'Primary', 240, 135)" :alt="ep.Name"
                                    item-type="Episode" class="w-full h-full object-cover" />
                                <div class="absolute inset-0 bg-black/50 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <button @click.stop="playEpisode(ep)"
                                        class="bg-white/90 text-black rounded-full p-1.5 sm:p-2 shadow-lg pointer-events-auto active:scale-95 cursor-pointer">
                                        <Play class="size-3.5 sm:size-4 fill-black stroke-none" />
                                    </button>
                                </div>
                                <!-- Progress bar -->
                                <div v-if="ep.UserData?.PlayedPercentage > 0 && ep.UserData?.PlayedPercentage < 100"
                                    class="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                                    <div class="h-full bg-accent-purple"
                                        :style="{ width: ep.UserData.PlayedPercentage + '%' }" />
                                </div>
                            </div>
                            <!-- Info -->
                            <div class="flex-1 min-w-0 py-0.5">
                                <div class="flex items-start justify-between gap-2 mb-1">
                                    <p class="font-semibold text-sm text-text-heading m-0 leading-snug">
                                        <span class="text-text-subtle mr-1">{{ ep.IndexNumber }}.</span>{{ ep.Name }}
                                    </p>
                                    <div class="flex items-center gap-1.5 shrink-0">
                                        <span v-if="ep.RunTimeTicks"
                                            class="text-xs text-text-subtle hidden sm:block tabular-nums">{{ formatTicksDuration(ep.RunTimeTicks) }}</span>
                                        <span v-if="offlineStore.isItemDownloaded(ep.Id)"
                                            class="rounded-full p-1.5 bg-accent-purple/20 text-accent-purple"
                                            title="Downloaded">
                                            <DownloadIcon class="size-3.5" />
                                        </span>
                                        <span v-else-if="downloadStore.isDownloading(ep.Id)"
                                            class="rounded-full p-1.5 bg-accent-purple/20 text-accent-purple animate-pulse"
                                            :title="'Downloading ' + (downloadStore.getTask(ep.Id)?.progress ?? 0) + '%'">
                                            <Loader2 class="size-3.5 animate-spin" />
                                        </span>
                                        <button @click.stop="toggleWatchedEpisode(ep)" :disabled="watchingEpId === ep.Id"
                                            class="rounded-full p-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                            :class="ep.UserData?.Played ? 'bg-accent-purple text-white' : 'bg-surface-hover text-text-muted hover:bg-surface-raised hover:text-text-heading'"
                                            :title="ep.UserData?.Played ? 'Mark as unwatched' : 'Mark as watched'">
                                            <Check class="size-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <p v-if="ep.Overview"
                                    class="text-text-muted text-xs leading-relaxed mb-0 line-clamp-2">
                                    {{ ep.Overview }}
                                </p>
                                <p v-else class="text-text-subtle text-xs italic mb-0">No synopsis available</p>
                                <div v-if="ep.CommunityRating || ep.PremiereDate" class="flex gap-2 mt-1">
                                    <span v-if="ep.CommunityRating" class="text-xs text-yellow-400/70">★ {{ ep.CommunityRating.toFixed(1) }}</span>
                                    <span v-if="ep.PremiereDate" class="text-xs text-text-subtle">{{ new Date(ep.PremiereDate).getFullYear() }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Audio Tracks -->
                <section v-if="item.Type === 'MusicAlbum' && audioTracks.length"
                    class="bg-surface-raised border border-border-default rounded-2xl p-5 backdrop-blur-sm">
                    <h3 class="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">Tracks</h3>
                    <div class="flex flex-col gap-0.5">
                        <div v-for="(track, i) in audioTracks" :key="track.Id"
                            class="grid grid-cols-[36px_1fr_56px] gap-3 items-center rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-150 hover:bg-surface-raised"
                            :class="audioPlayerStore.currentTrack?.id === track.Id ? 'bg-accent-purple/10 text-accent-purple-light' : ''"
                            @click="playTrack(track.Id, i)">
                            <div class="text-center text-text-subtle font-medium text-sm tabular-nums">{{ track.IndexNumber || '·' }}</div>
                            <div class="min-w-0">
                                <div class="font-medium text-text-primary truncate text-sm"
                                    :class="audioPlayerStore.currentTrack?.id === track.Id ? 'text-accent-purple-light' : ''">
                                    {{ track.Name }}
                                </div>
                                <div v-if="track.Artists?.length" class="text-text-subtle text-xs mt-0.5 truncate">{{ track.Artists.join(', ') }}</div>
                            </div>
                            <div class="flex items-center gap-1.5 justify-end">
                                <DownloadIcon v-if="offlineStore.isItemDownloaded(track.Id)" class="size-3.5 text-accent-purple" title="Downloaded" />
                                <Loader2 v-else-if="downloadStore.isDownloading(track.Id)" class="size-3.5 text-accent-purple animate-spin" />
                                <span class="text-text-subtle text-xs tabular-nums">{{ formatTrackDuration(track.RunTimeTicks) }}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Cast -->
                <section v-if="cast.length"
                    class="bg-surface-raised border border-border-default rounded-2xl p-5 backdrop-blur-sm">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-widest">Cast</h3>
                        <div class="flex gap-1.5">
                            <button class="p-1.5 rounded-lg bg-surface-raised hover:bg-surface-hover text-text-muted hover:text-text-heading transition-all cursor-pointer" @click="scrollCast('left')">
                                <ArrowLeft class="size-3.5" />
                            </button>
                            <button class="p-1.5 rounded-lg bg-surface-raised hover:bg-surface-hover text-text-muted hover:text-text-heading transition-all cursor-pointer" @click="scrollCast('right')">
                                <ArrowRight class="size-3.5" />
                            </button>
                        </div>
                    </div>
                    <div ref="castRail"
                        class="grid grid-flow-col auto-cols-[minmax(100px,120px)] gap-3 overflow-x-auto overflow-y-hidden snap-x snap-proximity scroll-smooth scrollbar-hide"
                        role="list">
                        <div v-for="p in cast" :key="p.Id || p.Name"
                            class="snap-center text-center group cursor-pointer" role="listitem" :title="p.Name"
                            @click="navigateToPerson(p.Id)">
                            <div class="w-full aspect-[2/3] rounded-xl overflow-hidden bg-surface-raised shadow-lg mb-2 group-hover:-translate-y-1 transition-transform duration-200">
                                <LazyImg :src="personImageUrl(p)" :alt="p.Name" item-type="person"
                                    class="w-full h-full object-cover object-top" />
                            </div>
                            <div class="font-medium text-text-primary truncate text-xs">{{ p.Name }}</div>
                            <div v-if="p.Role" class="text-text-subtle text-xs mt-0.5 truncate">{{ p.Role }}</div>
                        </div>
                    </div>
                </section>

                <!-- Similar Items -->
                <section v-if="similarItems.length"
                    class="bg-surface-raised border border-border-default rounded-2xl p-5 backdrop-blur-sm">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-widest">More Like This</h3>
                        <div class="flex gap-1.5">
                            <button class="p-1.5 rounded-lg bg-surface-raised hover:bg-surface-hover text-text-muted hover:text-text-heading transition-all cursor-pointer" @click="scrollSimilar('left')">
                                <ArrowLeft class="size-3.5" />
                            </button>
                            <button class="p-1.5 rounded-lg bg-surface-raised hover:bg-surface-hover text-text-muted hover:text-text-heading transition-all cursor-pointer" @click="scrollSimilar('right')">
                                <ArrowRight class="size-3.5" />
                            </button>
                        </div>
                    </div>
                    <div ref="similarRail"
                        class="grid grid-flow-col auto-cols-[minmax(120px,140px)] gap-3 overflow-x-auto overflow-y-hidden snap-x snap-proximity scroll-smooth scrollbar-hide"
                        role="list">
                        <div v-for="sim in similarItems" :key="sim.Id"
                            class="snap-center cursor-pointer group rounded-xl overflow-hidden bg-surface-raised border border-border-default hover:-translate-y-1 hover:border-border-hover transition-all duration-200 active:scale-[0.97] active:opacity-75"
                            role="listitem" @click="goToItem(sim.Id)">
                            <div class="relative w-full aspect-[2/3] overflow-hidden">
                                <LazyImg :src="getImageUrl(sim.Id, 'Primary', 300, 450)" :alt="sim.Name"
                                    :item-type="sim.Type" class="w-full h-full object-cover" />
                                <div v-if="offlineStore.isItemDownloaded(sim.Id)"
                                    class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
                                    <DownloadIcon class="size-3 text-white" />
                                </div>
                                <div v-else-if="downloadStore.isDownloading(sim.Id)"
                                    class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
                                    <Loader2 class="size-3 text-white animate-spin" />
                                </div>
                            </div>
                            <div class="p-2">
                                <div class="font-medium text-text-primary text-xs truncate">{{ sim.Name }}</div>
                                <div class="text-text-subtle text-xs mt-0.5">{{ sim.ProductionYear }}</div>
                            </div>
                        </div>
                    </div>
                </section>

            </div>

        </template>
    </div>

    <!-- Bulk Download Confirmation Dialog -->
    <Dialog v-model:open="showBulkDialog">
        <DialogContent class="max-w-sm bg-surface-raised border-border-default">
            <DialogHeader>
                <DialogTitle class="text-text-heading">
                    Download {{ bulkDownloadTarget === 'series' ? item?.Name : (item?.Type === 'Season' ? item?.Name : item?.SeasonName) }}
                </DialogTitle>
                <DialogDescription class="text-text-muted text-sm">
                    Which episodes would you like to download?
                </DialogDescription>
            </DialogHeader>
            <div class="flex flex-col gap-3 mt-2">
                <Button @click="startBulkDownload('unwatched')" class="w-full justify-center gap-2">
                    <DownloadIcon class="size-4" /> Unwatched only
                </Button>
                <Button variant="outline" @click="startBulkDownload('all')" class="w-full justify-center gap-2">
                    <DownloadIcon class="size-4" /> All episodes
                </Button>
                <DialogClose as-child>
                    <Button variant="ghost" class="w-full">Cancel</Button>
                </DialogClose>
            </div>
        </DialogContent>
    </Dialog>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useOfflineStore } from '@/store/offline-store';
import { useAudioPlayerStore, type AudioTrack } from '@/store/audio-player-store';
import { useDownloadStore } from '@/store/download-store';
import { useMetadataCacheStore } from '@/store/metadata-cache-store';
import { downloadService } from '@/services/downloadService';
import { offlineDatabase } from '@/services/offlineDatabase';
import LazyImg from '@/components/LazyImg.vue';
import { isAudioType, formatTicksDuration, formatTicksHuman, formatBytes } from '@/utils/helpers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Play, Check, Download as DownloadIcon, X, ArrowLeft, ArrowRight, Loader2, Info, Tv2 } from 'lucide-vue-next';
import { Capacitor } from '@capacitor/core';
import CastPlugin, { type CastState } from '@/plugins/CastPlugin';

const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const audioPlayerStore = useAudioPlayerStore();
const downloadStore = useDownloadStore();
const metadataCache = useMetadataCacheStore();
const route = useRoute();
const router = useRouter();

const loading = ref(true);
const overviewExpanded = ref(false);
const error = ref<string | null>(null);
const item = ref<any | null>(null);
const seasons = ref<any[]>([]);
const episodes = ref<any[]>([]);
const audioTracks = ref<any[]>([]);
const similarItems = ref<any[]>([]);

const itemId = computed(() => route.params.id as string);
const accessToken = store.accessToken;

const showMediaInfo = ref(false);
const showBulkDialog = ref(false);
const bulkDownloadTarget = ref<'season' | 'series'>('season');
const playingSeasonId = ref<string | null>(null);
const watchingSeasonId = ref<string | null>(null);
const watchingEpId = ref<string | null>(null);
const togglingWatched = ref(false);
const offlineProgressSeconds = ref<number | null>(null);

async function load() {
    loading.value = true;
    error.value = null;
    seasons.value = [];
    episodes.value = [];
    audioTracks.value = [];
    similarItems.value = [];
    offlineProgressSeconds.value = null;

    try {
        const isOffline = !offlineStore.isFullyOnline;

        // ── Offline: downloaded episode/movie ────────────────────────────────
        const cached = offlineStore.getDownload(itemId.value);
        if (isOffline && cached) {
            item.value = cached.jellyfinItem;
            const progress = await offlineDatabase.getWatchProgress(itemId.value);
            if (progress && progress.position > 0 && !progress.completed) {
                offlineProgressSeconds.value = progress.position;
            }
            return;
        }

        // ── Offline: Series page (has downloaded episodes) ──────────────────
        if (isOffline) {
            const seriesGroup = offlineStore.tvShowsGrouped.find(
                (s: any) => s.seriesId === itemId.value
            );
            if (seriesGroup) {
                item.value = metadataCache.get(itemId.value) ?? {
                    Id: seriesGroup.seriesId,
                    Name: seriesGroup.seriesName,
                    Type: 'Series',
                };
                seasons.value = seriesGroup.seasons.map((s: any) => ({
                    Id: s.seasonId,
                    Name: `Season ${s.seasonNumber}`,
                    Type: 'Season',
                    IndexNumber: s.seasonNumber,
                    UserData: { UnplayedItemCount: null, PlayCount: 0 },
                }));
                return;
            }

            // ── Offline: Season page (has downloaded episodes) ────────────────
            for (const sg of offlineStore.tvShowsGrouped) {
                const seasonGroup = sg.seasons.find((s: any) => s.seasonId === itemId.value);
                if (seasonGroup) {
                    item.value = metadataCache.get(itemId.value) ?? {
                        Id: seasonGroup.seasonId,
                        Name: `Season ${seasonGroup.seasonNumber}`,
                        Type: 'Season',
                        IndexNumber: seasonGroup.seasonNumber,
                        SeriesId: sg.seriesId,
                        SeriesName: sg.seriesName,
                    };
                    episodes.value = seasonGroup.episodes.map((ep: any) => ({
                        ...ep.jellyfinItem,
                        Id: ep.itemId,
                    }));
                    return;
                }
            }
        }

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
        if (data?.Type === 'Movie' || data?.Type === 'Series') {
            similarItems.value = await store.fetchSimilarItems(itemId.value);
        }
    } catch (e) {
        // Network failed — fall back to cached download data if available.
        const cached = offlineStore.getDownload(itemId.value);
        if (cached) {
            item.value = cached.jellyfinItem;
        } else {
            error.value = 'Failed to load details';
        }
    } finally {
        loading.value = false;
    }
}

// ── Cast ────────────────────────────────────────────────────────────────────
const castState = ref<CastState>('NO_DEVICES_AVAILABLE');
let castStateListener: { remove: () => void } | null = null;
let castSessionListener: { remove: () => void } | null = null;

async function initCast() {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await CastPlugin.initialize();
        const stateResult = await CastPlugin.getState();
        castState.value = stateResult.state;
        castStateListener = await CastPlugin.addListener('castStateChanged', (d) => {
            castState.value = d.state;
        });
        castSessionListener = await CastPlugin.addListener('sessionStarted', async () => {
            if (!item.value) return;
            const ticks = item.value.UserData?.PlaybackPositionTicks ?? 0;
            await CastPlugin.castMedia({
                itemId: item.value.Id,
                serverUrl: store.serverUrl,
                accessToken: store.accessToken ?? '',
                startPositionTicks: ticks,
                title: item.value.Name ?? '',
            });
        });
    } catch {
        // Cast not available (web / non-Google device)
    }
}

async function castItem() {
    if (castState.value === 'CONNECTED' && item.value) {
        // Already connected — cast directly
        const ticks = item.value.UserData?.PlaybackPositionTicks ?? 0;
        await CastPlugin.castMedia({
            itemId: item.value.Id,
            serverUrl: store.serverUrl,
            accessToken: store.accessToken ?? '',
            startPositionTicks: ticks,
            title: item.value.Name ?? '',
        });
    } else {
        await CastPlugin.showPicker();
    }
}

onMounted(() => { load(); initCast(); });
onUnmounted(() => { castStateListener?.remove(); castSessionListener?.remove(); });
watch(() => route.params.id, load);

const isLandscapePoster = computed(() => {
    const type = item.value?.Type;
    return type === 'Episode';
});

const posterUrl = computed(() => {
    if (!item.value?.Id) return '';
    if (isLandscapePoster.value) {
        return store.getImageUrl(item.value.Id, 'Primary', 960, 540) || '';
    }
    return store.getImageUrl(item.value.Id, 'Primary', 300, 450) || '';
});

const backdropUrl = computed(() => {
    if (!item.value?.Id) return '';
    if (item.value.Type === 'Episode' && item.value.SeriesId) {
        return store.getImageUrl(item.value.SeriesId, 'Backdrop', 1920, 1080) || '';
    }
    return store.getImageUrl(item.value.Id, 'Backdrop', 1920, 1080) || '';
});

const resumePositionLabel = computed(() => {
    // Prefer offline progress (most recent) over cached Jellyfin position
    if (offlineProgressSeconds.value && offlineProgressSeconds.value > 0) {
        const ticks = Math.floor(offlineProgressSeconds.value * 10_000_000);
        return formatTicksHuman(ticks);
    }
    const ticks = item.value?.UserData?.PlaybackPositionTicks;
    if (!ticks || ticks <= 0) return null;
    return formatTicksHuman(ticks);
});

const year = computed(() => item.value?.ProductionYear || null);
const duration = computed(() => formatTicksHuman(item.value?.RunTimeTicks));
const genres = computed<string[]>(() => item.value?.Genres || []);

type Person = { Id?: string; Name: string; Role?: string; Type?: string; PrimaryImageTag?: string };
const people = computed<Person[]>(() => item.value?.People || []);
const directorNames = computed(() => people.value.filter(p => p.Type === 'Director').map(p => p.Name));
const cast = computed<Person[]>(() => people.value.filter(p => p.Type === 'Actor'));
const studioNames = computed(() => (item.value?.Studios || []).map((s: any) => s.Name).filter(Boolean));

function personImageUrl(p: Person) {
    if (!p?.Id || !p.PrimaryImageTag) return '';
    return store.getImageUrl(p.Id, 'Primary', 220) || '';
}

function navigateToPerson(id?: string) {
    if (id) router.push({ name: 'PersonDetail', params: { id } });
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
    const ticks = item.value.UserData?.PlaybackPositionTicks;
    router.push({
        name: 'Player',
        params: { id: item.value.Id },
        query: ticks ? { startTicks: String(ticks) } : {},
    });
}

function goToItem(id: string) {
    router.push({ name: 'ItemDetails', params: { id } });
}

async function playNextInSeason(season: any) {
    if (playingSeasonId.value) return;
    playingSeasonId.value = season.Id;
    try {
        const hasUnwatched = season.UserData?.UnplayedItemCount == null || season.UserData.UnplayedItemCount > 0;
        const ep = hasUnwatched
            ? await store.fetchFirstUnwatchedEpisode(season.Id)
            : await store.fetchFirstEpisode(season.Id);
        if (ep) {
            router.push({ name: 'Player', params: { id: ep.Id } });
        }
    } finally {
        playingSeasonId.value = null;
    }
}

function playEpisode(ep: any) {
    const sorted = [...episodes.value].sort((a, b) => (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0));
    const idx = sorted.findIndex(e => e.Id === ep.Id);
    const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
    router.push({
        name: 'Player',
        params: { id: ep.Id },
        query: next ? { nextEpisodeId: next.Id } : {},
    });
}

async function toggleWatched() {
    if (togglingWatched.value || !item.value) return;
    togglingWatched.value = true;
    try {
        if (item.value.UserData?.Played) {
            await store.markUnplayed(item.value.Id);
            if (item.value.UserData) item.value.UserData.Played = false;
        } else {
            await store.markPlayed(item.value.Id);
            if (!item.value.UserData) item.value.UserData = {};
            item.value.UserData.Played = true;
        }
    } finally {
        togglingWatched.value = false;
    }
}

async function toggleWatchedSeason(season: any) {
    if (watchingSeasonId.value) return;
    watchingSeasonId.value = season.Id;
    try {
        if (season.UserData?.Played) {
            await store.markUnplayed(season.Id);
            if (season.UserData) season.UserData.Played = false;
        } else {
            await store.markPlayed(season.Id);
            if (!season.UserData) season.UserData = {};
            season.UserData.Played = true;
        }
    } finally {
        watchingSeasonId.value = null;
    }
}

async function toggleWatchedEpisode(ep: any) {
    if (watchingEpId.value) return;
    watchingEpId.value = ep.Id;
    try {
        if (ep.UserData?.Played) {
            await store.markUnplayed(ep.Id);
            if (ep.UserData) ep.UserData.Played = false;
        } else {
            await store.markPlayed(ep.Id);
            if (!ep.UserData) ep.UserData = {};
            ep.UserData.Played = true;
        }
    } finally {
        watchingEpId.value = null;
    }
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

const similarRail = ref<HTMLDivElement | null>(null);
function scrollSimilar(dir: 'left' | 'right') {
    const el = similarRail.value;
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

const isDownloading = computed(() => {
    return downloadStore.isDownloading(itemId.value);
});

const downloadProgress = computed(() => {
    const task = downloadStore.getTask(itemId.value);
    return task?.progress ?? 0;
});

async function handleDownload() {
    if (!item.value) return;
    // Start download in background - don't await, let it run
    downloadStore.startDownload(itemId.value, item.value).catch((error: any) => {
        if (error.name !== 'AbortError') {
            console.error('Download failed:', error);
        }
    });
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
    downloadStore.cancelDownload(itemId.value);
}

function openBulkDialog(target: 'season' | 'series') {
    bulkDownloadTarget.value = target;
    showBulkDialog.value = true;
}

async function startBulkDownload(mode: 'all' | 'unwatched') {
    showBulkDialog.value = false;
    if (!item.value) return;

    let candidates: any[] = [];

    if (bulkDownloadTarget.value === 'season') {
        // Episodes already loaded for Season pages
        candidates = [...episodes.value];
    } else {
        // Fetch all episodes for the series in one API call
        try {
            candidates = await store.fetchAllSeriesEpisodes(item.value.Id);
        } catch (e) {
            console.error('[BulkDownload] Failed to fetch series episodes:', e);
            return;
        }
    }

    // Filter by watched state
    if (mode === 'unwatched') {
        candidates = candidates.filter(ep => !ep.UserData?.Played);
    }

    // Skip already-downloaded episodes
    candidates = candidates.filter(ep => !offlineStore.isItemDownloaded(ep.Id));

    if (candidates.length === 0) return;

    console.log(`[BulkDownload] Queueing ${candidates.length} episodes (mode: ${mode})`);

    for (const ep of candidates) {
        downloadStore.startDownload(ep.Id, ep).catch((err: any) => {
            if (err?.name !== 'AbortError') {
                console.error('[BulkDownload] Failed:', ep.Name, err);
            }
        });
    }
}
</script>
