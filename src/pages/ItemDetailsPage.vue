<template>
    <div class="min-h-dvh text-foreground bg-background relative isolate">

        <!-- Loading -->
        <section v-if="loading"
            class="flex items-center justify-center min-h-dvh text-text-muted text-lg">{{ t('common.loading') }}</section>

        <!-- Error -->
        <section v-else-if="error"
            class="flex items-center justify-center min-h-dvh text-error text-lg">{{ error }}</section>

        <template v-else-if="item">

            <!-- ── CINEMATIC HERO ────────────────────────────── -->
            <Dialog v-model:open="showMediaInfo">
                <section class="relative">

                    <!-- Backdrop -->
                    <!-- A square cover needs a taller hero on phones to stay a decent size -->
                    <div class="relative w-full overflow-hidden"
                        :class="showCoverHero && posterUrl ? 'aspect-[4/5] max-h-[70vh] sm:aspect-[16/10] sm:max-h-[58vh]' : 'aspect-[16/10] max-h-[58vh]'">
                        <template v-if="showCoverHero && posterUrl">
                            <LazyImg :src="posterUrl" alt="" :kind="item.kind"
                                class="absolute inset-0 w-full h-full object-cover blur-3xl scale-125 opacity-70" />
                            <!-- Below the top buttons, which sit under the status bar / camera cutout -->
                            <div class="absolute inset-0 flex items-center justify-center pb-24"
                                style="padding-top: calc(56px + var(--sat, env(safe-area-inset-top, 0px)))">
                                <LazyImg :src="posterUrl" :alt="item.title" :kind="item.kind"
                                    class="h-full aspect-square rounded-xl object-cover shadow-[0_20px_60px_rgba(0,0,0,0.6)]" />
                            </div>
                        </template>
                        <LazyImg v-else-if="heroImageUrl" :src="heroImageUrl" :alt="item.title" :kind="item.kind"
                            class="w-full h-full object-cover" />
                        <div v-else class="absolute inset-0 bg-gradient-to-br from-surface-raised to-background" />
                        <!-- Fades: bottom into page bg, subtle top darken for buttons -->
                        <div class="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-transparent" />
                        <div class="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />

                        <!-- Floating glass top buttons -->
                        <div class="absolute inset-x-0 top-0 flex items-center justify-between px-3.5 pb-2"
                            style="padding-top: calc(10px + var(--sat, env(safe-area-inset-top, 0px)))">
                            <button @click="goBack" :aria-label="t('common.back')"
                                class="size-11 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center active:scale-95 transition cursor-pointer">
                                <ChevronLeft class="size-5" />
                            </button>
                            <div class="flex gap-2">
                                <button v-if="isPlayable(item) && castState !== 'NO_DEVICES_AVAILABLE'" @click="castItem"
                                    :aria-label="castState === 'CONNECTED' ? t('detail.casting') : t('detail.castToTv')"
                                    class="size-11 rounded-full backdrop-blur-md flex items-center justify-center active:scale-95 transition cursor-pointer"
                                    :class="castState === 'CONNECTED' ? 'bg-accent-purple text-accent-ink' : 'bg-black/35 text-white'">
                                    <Tv2 class="size-[18px]" />
                                </button>
                                <DialogTrigger v-if="videoDetails.length || sourceDetails.length || fileSizeHuman" as-child>
                                    <button :aria-label="t('detail.mediaInfo')"
                                        class="size-11 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center active:scale-95 transition cursor-pointer">
                                        <Info class="size-[18px]" />
                                    </button>
                                </DialogTrigger>
                            </div>
                        </div>

                        <!-- Title + meta overlaid on backdrop bottom -->
                        <div class="absolute inset-x-0 bottom-0 pb-1">
                          <div class="mx-auto max-w-[1200px] px-gutter md:px-gutter-wide">
                            <!-- Breadcrumb -->
                            <div v-if="breadcrumb"
                                class="flex items-center gap-1.5 text-caption text-text-muted mb-1.5">
                                <button v-if="breadcrumb.seriesId" @click="goToItem(breadcrumb.seriesId)"
                                    class="hover:text-text-heading transition-colors cursor-pointer">{{ breadcrumb.seriesTitle }}</button>
                                <span v-if="breadcrumb.seriesId && breadcrumb.seasonId" class="text-text-subtle">/</span>
                                <button v-if="breadcrumb.seasonId" @click="goToItem(breadcrumb.seasonId)"
                                    class="hover:text-text-heading transition-colors cursor-pointer">{{ breadcrumb.seasonTitle }}</button>
                            </div>
                            <h1 class="line-clamp-2 text-page lg:text-page-wide font-bold text-text-heading leading-tight tracking-tight mb-2">{{ item.title }}</h1>
                            <div v-if="albumArtists.length" class="flex flex-wrap gap-x-2 mb-1.5 text-body font-semibold text-text-primary">
                                <button v-for="artist in albumArtists" :key="artist.id" @click="goToItem(artist.id!)"
                                    class="hover:text-text-heading underline-offset-4 hover:underline cursor-pointer">{{ artist.name }}</button>
                            </div>
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-caption text-text-primary">
                                <template v-for="(part, i) in heroMeta" :key="part">
                                    <span v-if="i" class="text-text-subtle">·</span>
                                    <span>{{ part }}</span>
                                </template>
                                <template v-if="item.rating">
                                    <span class="text-text-subtle">·</span>
                                    <span class="inline-flex items-center gap-1 font-semibold text-text-heading">
                                        <Star class="size-3 fill-current stroke-none" aria-hidden="true" />{{ item.rating.toFixed(1) }}
                                    </span>
                                </template>
                                <span v-for="badge in videoBadges" :key="badge"
                                    class="rounded-full bg-text-heading/15 px-2 text-label font-semibold leading-5 text-text-heading first-of-type:ml-1">{{ badge }}</span>
                            </div>
                          </div>
                        </div>
                    </div>

                    <!-- Body below backdrop -->
                    <div class="mx-auto max-w-[1200px] px-gutter pt-4 pb-6 md:px-gutter-wide">

                        <!-- Actions -->
                        <div class="flex flex-wrap items-center gap-2.5 mb-4">
                            <button v-if="isPlayable(item)" @click="playMedia"
                                class="flex-1 min-w-[180px] md:flex-none md:min-w-[280px] md:px-8 flex items-center justify-center gap-2 h-[50px] rounded-2xl bg-accent-purple text-accent-ink font-semibold text-body active:scale-[0.98] transition cursor-pointer">
                                <Play class="size-4 fill-current stroke-none" />
                                {{ resumePositionLabel ? t('detail.resume', { time: resumePositionLabel }) : t('common.play') }}
                            </button>

                            <button v-if="nextEpisode" @click="playNextEpisode"
                                class="flex-1 min-w-[180px] md:flex-none md:min-w-[280px] md:px-8 flex items-center justify-center gap-2 h-[50px] rounded-2xl bg-accent-purple text-accent-ink font-semibold text-body active:scale-[0.98] transition cursor-pointer">
                                <Play class="size-4 fill-current stroke-none" />
                                {{ nextEpisodeLabel }}
                            </button>

                            <button v-if="isMusicCollection" @click="playAlbum"
                                class="flex-1 min-w-[180px] md:flex-none md:min-w-[280px] md:px-8 flex items-center justify-center gap-2 h-[50px] rounded-2xl bg-accent-purple text-accent-ink font-semibold text-body active:scale-[0.98] transition cursor-pointer">
                                <Play class="size-4 fill-current stroke-none" /> {{ item.kind === 'album' ? t('detail.playAlbum') : t('detail.playAll') }}
                            </button>
                            <button v-if="isMusicCollection" @click="shuffleAlbum" :aria-label="t('detail.shuffle')"
                                class="flex items-center justify-center size-[50px] rounded-2xl bg-surface border border-border-default text-text-heading active:scale-95 transition cursor-pointer">
                                <Shuffle class="size-5" />
                            </button>
                            <TrackActionsMenu v-if="isMusicCollection"
                                trigger-class="size-[50px] rounded-2xl bg-surface border border-border-default text-text-heading"
                                @play-next="queueAlbum('next')" @add-to-queue="queueAlbum('end')" />

                            <!-- Download (single item) -->
                            <button v-if="isItemDownloaded && !isDownloading" @click="deleteDownload"
                                :aria-label="t('detail.downloadedDelete')"
                                class="flex items-center justify-center size-[50px] rounded-2xl bg-accent-purple/15 border border-accent-purple/40 text-accent-purple active:scale-95 transition cursor-pointer">
                                <Check class="size-5" />
                            </button>
                            <button v-else-if="canDownload(item) && !isItemDownloaded && !isDownloading" @click="handleDownload"
                                :aria-label="t('detail.download')"
                                class="flex items-center justify-center size-[50px] rounded-2xl bg-surface border border-border-default text-text-heading active:scale-95 transition cursor-pointer">
                                <DownloadIcon class="size-5" />
                            </button>
                            <button v-if="isDownloading" @click="cancelDownload"
                                :aria-label="t('detail.downloadingCancel', { percent: downloadProgress })"
                                class="flex items-center justify-center size-[50px] rounded-2xl bg-surface border border-border-default text-accent-purple active:scale-95 transition cursor-pointer">
                                <Loader2 class="size-5 animate-spin" />
                            </button>

                            <!-- Bulk download Season / Series -->
                            <button v-if="item.kind === 'season'" @click="openBulkDialog('season')"
                                :aria-label="t('detail.bulkTitle', { name: item.title })"
                                class="flex items-center justify-center size-[50px] rounded-2xl bg-surface border border-border-default text-text-heading active:scale-95 transition cursor-pointer">
                                <DownloadIcon class="size-5" />
                            </button>
                            <button v-if="item.kind === 'series'" @click="openBulkDialog('series')"
                                :aria-label="t('detail.bulkTitle', { name: item.title })"
                                class="flex items-center justify-center size-[50px] rounded-2xl bg-surface border border-border-default text-text-heading active:scale-95 transition cursor-pointer">
                                <DownloadIcon class="size-5" />
                            </button>

                            <!-- Mark all watched (Series / Season) -->
                            <button v-if="item.kind === 'series' || item.kind === 'season'"
                                :disabled="togglingWatched" @click="toggleWatched"
                                :aria-label="item.user.played ? t('detail.markAllUnwatched') : t('detail.markAllWatched')"
                                class="flex items-center justify-center size-[50px] rounded-2xl border active:scale-95 transition cursor-pointer"
                                :class="item.user.played
                                    ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple'
                                    : 'bg-surface border-border-default text-text-heading'">
                                <Loader2 v-if="togglingWatched" class="size-5 animate-spin" />
                                <Check v-else class="size-5" />
                            </button>

                            <!-- Watched toggle (single playable) -->
                            <button
                                v-if="item.kind !== 'series' && item.kind !== 'season' && item.kind !== 'album' && item.kind !== 'artist' && item.kind !== 'playlist' && item.kind !== 'collection'"
                                :disabled="togglingWatched" @click="toggleWatched"
                                :aria-label="item.user.played ? t('common.markUnwatched') : t('common.markWatched')"
                                class="flex items-center justify-center size-[50px] rounded-2xl border active:scale-95 transition cursor-pointer"
                                :class="item.user.played
                                    ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple'
                                    : 'bg-surface border-border-default text-text-heading'">
                                <Loader2 v-if="togglingWatched" class="size-5 animate-spin" />
                                <Check v-else class="size-5" />
                            </button>
                        </div>

                        <!-- Resume progress bar -->
                        <div v-if="resumePercent > 0 && resumePercent < 100"
                            class="h-1 rounded-full bg-surface-hover overflow-hidden mb-4 md:max-w-[280px]">
                            <div class="h-full bg-accent-purple rounded-full" :style="{ width: resumePercent + '%' }" />
                        </div>

                        <!-- Overview -->
                        <div v-if="item.overview" class="mb-4 max-w-2xl">
                            <p class="text-body leading-relaxed text-text-body m-0 transition-all"
                                :class="overviewExpanded ? '' : 'line-clamp-3'">
                                {{ item.overview }}
                            </p>
                            <button @click="overviewExpanded = !overviewExpanded"
                                class="mt-1 min-h-11 text-caption font-medium text-accent-purple hover:text-accent-purple-light transition-colors cursor-pointer">
                                {{ overviewExpanded ? t('detail.showLess') : t('detail.showMore') }}
                            </button>
                        </div>

                        <!-- Genres -->
                        <div v-if="genres.length" class="flex flex-wrap gap-2 mb-4">
                            <span v-for="g in genres" :key="g"
                                class="px-3.5 py-1.5 rounded-full text-xs font-medium text-text-primary bg-surface-hover">
                                {{ g }}
                            </span>
                        </div>

                        <!-- Director / Studio inline -->
                        <div class="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                            <span v-if="directorNames.length">
                                <span class="text-text-subtle uppercase tracking-wider text-label mr-1.5">{{ t('detail.director') }}</span>
                                <span class="text-text-primary">{{ directorNames.join(', ') }}</span>
                            </span>
                            <span v-if="studioNames.length">
                                <span class="text-text-subtle uppercase tracking-wider text-label mr-1.5">{{ t('detail.studio') }}</span>
                                <span class="text-text-primary">{{ studioNames.join(', ') }}</span>
                            </span>
                        </div>
                    </div>

                    <!-- Media Info dialog content -->
                            <DialogContent
                                class="max-w-lg max-h-[85dvh] overflow-y-auto bg-surface-raised border-border-default">
                                <DialogHeader>
                                    <DialogTitle class="text-text-heading text-lg">{{ t('detail.mediaInfoTitle') }}</DialogTitle>
                                    <DialogDescription class="text-text-muted text-sm">{{ t('detail.mediaInfoFor', { name: item.title }) }}</DialogDescription>
                                </DialogHeader>

                                <div v-if="videoDetails.length" class="mt-4">
                                    <h4 class="text-sm font-semibold text-accent-purple-light uppercase tracking-wider mb-3">{{ t('detail.videoStream') }}</h4>
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
                                    <h4 class="text-sm font-semibold text-accent-purple-light uppercase tracking-wider mb-3">{{ t('detail.mediaSource') }}</h4>
                                    <div class="grid grid-cols-2 gap-2">
                                        <template v-for="row in sourceDetails" :key="`s-${row.label}`">
                                            <div class="bg-surface-hover/50 rounded-lg px-3 py-2"
                                                :class="row.wide ? 'col-span-2' : ''">
                                                <div class="text-[11px] text-text-muted uppercase tracking-wider">{{ row.label }}</div>
                                                <div class="text-sm font-medium text-text-heading mt-0.5 break-all">{{ row.value }}</div>
                                            </div>
                                        </template>
                                        <div v-if="fileSizeHuman" class="bg-surface-hover/50 rounded-lg px-3 py-2">
                                            <div class="text-[11px] text-text-muted uppercase tracking-wider">{{ t('detail.fileSize') }}</div>
                                            <div class="text-sm font-medium text-text-heading mt-0.5">{{ fileSizeHuman }}</div>
                                        </div>
                                    </div>
                                </div>

                                <DialogFooter class="mt-4">
                                    <DialogClose as-child>
                                        <Button variant="outline">{{ t('common.close') }}</Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                </section>
            </Dialog>

            <!-- ── SECTIONS ──────────────────────────────────── -->
            <div class="mx-auto max-w-[1200px] px-gutter pb-12 md:px-gutter-wide">

                <!-- Seasons -->
                <Section v-if="item.kind === 'series' && seasons.length" :title="t('detail.seasons')">
                    <MediaRail>
                        <div v-for="season in seasons" :key="season.id"
                            class="w-32 shrink-0 sm:w-36 cursor-pointer group rounded-xl overflow-hidden bg-surface-raised border border-border-default hover:-translate-y-1 hover:border-border-hover transition-all duration-200 active:scale-[0.97] active:opacity-75"
                            @click="goToItem(season.id)">
                            <div class="relative w-full aspect-[2/3] overflow-hidden">
                                <LazyImg :src="artUrl(season.id, season.images.poster, POSTER)" :alt="season.title"
                                    kind="season" class="w-full h-full object-cover" />
                                <button @click.stop="toggleWatchedSeason(season)" :disabled="watchingSeasonId === season.id"
                                    class="absolute top-1 right-1 flex size-10 items-center justify-center rounded-full transition-all duration-200 cursor-pointer pointer-events-auto disabled:opacity-50"
                                    :class="season.user.played ? 'bg-accent-purple text-accent-ink' : 'bg-black/50 text-white/80'"
                                    :aria-label="season.user.played ? t('common.markUnwatched') : t('common.markWatched')">
                                    <Loader2 v-if="watchingSeasonId === season.id" class="size-4 animate-spin" />
                                    <Check v-else class="size-4" />
                                </button>
                                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-center pb-2 pointer-events-none">
                                    <button @click.stop="playNextInSeason(season)" :disabled="playingSeasonId === season.id"
                                        :aria-label="t('common.play')"
                                        class="flex size-10 items-center justify-center bg-white/90 hover:bg-white text-black rounded-full shadow-lg transition-all disabled:opacity-60 pointer-events-auto cursor-pointer">
                                        <Loader2 v-if="playingSeasonId === season.id" class="size-4 animate-spin" />
                                        <Play v-else class="size-4 fill-black stroke-none" />
                                    </button>
                                </div>
                            </div>
                            <div class="px-2 py-2 text-center text-caption font-semibold text-text-primary">{{ season.title }}</div>
                        </div>
                    </MediaRail>
                </Section>

                <!-- Episodes -->
                <Section v-if="item.kind === 'season' && episodes.length" :title="t('detail.episodesTitle')">
                    <div class="flex flex-col gap-2">
                        <div v-for="ep in episodes" :key="ep.id"
                            class="flex gap-3 sm:gap-4 p-2.5 rounded-xl cursor-pointer transition-all duration-200 border border-transparent hover:bg-surface-raised hover:border-border-default active:opacity-75"
                            @click="goToItem(ep.id)">
                            <!-- Thumbnail -->
                            <div class="relative group w-[100px] h-[56px] sm:w-[180px] sm:h-[101px] rounded-lg overflow-hidden shrink-0 bg-black/40"
                                :class="ep.user.played && 'opacity-60'">
                                <LazyImg :src="artUrl(ep.id, ep.images.thumb ?? ep.images.poster, EPISODE_STILL)" :alt="ep.title"
                                    kind="episode" class="w-full h-full object-cover" />
                                <div class="absolute inset-0 bg-black/50 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <button @click.stop="playEpisode(ep)" :aria-label="t('common.play')"
                                        class="flex size-10 items-center justify-center bg-white/90 text-black rounded-full shadow-lg pointer-events-auto active:scale-95 cursor-pointer">
                                        <Play class="size-4 fill-black stroke-none" />
                                    </button>
                                </div>
                                <!-- Progress bar -->
                                <div v-if="playedPercent(ep) > 0 && playedPercent(ep) < 100"
                                    class="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                                    <div class="h-full bg-accent-purple"
                                        :style="{ width: playedPercent(ep) + '%' }" />
                                </div>
                            </div>
                            <!-- Info -->
                            <div class="flex-1 min-w-0 py-0.5">
                                <div class="flex items-start justify-between gap-2 mb-1">
                                    <p class="font-semibold text-sm m-0 leading-snug" :class="ep.user.played ? 'text-text-muted' : 'text-text-heading'">
                                        <span class="text-text-subtle mr-1">{{ ep.episodeNumber }}.</span>{{ ep.title }}
                                    </p>
                                    <div class="flex items-center gap-1.5 shrink-0">
                                        <span v-if="ep.durationMs"
                                            class="text-xs text-text-subtle hidden sm:block tabular-nums">{{ formatMsDuration(ep.durationMs) }}</span>
                                        <span v-if="offlineStore.isItemDownloaded(ep.id)"
                                            class="flex size-10 items-center justify-center rounded-full bg-accent-purple/20 text-accent-purple"
                                            :title="t('common.downloaded')">
                                            <DownloadIcon class="size-3.5" />
                                        </span>
                                        <span v-else-if="downloadStore.isDownloading(ep.id)"
                                            class="flex size-10 items-center justify-center rounded-full bg-accent-purple/20 text-accent-purple animate-pulse"
                                            :title="t('detail.downloading', { percent: downloadStore.getTask(ep.id)?.progress ?? 0 })">
                                            <Loader2 class="size-3.5 animate-spin" />
                                        </span>
                                        <button v-else
                                            @click.stop="handleEpisodeDownload(ep)"
                                            class="flex size-10 items-center justify-center rounded-full bg-surface-hover text-text-muted hover:bg-surface-raised hover:text-text-heading transition-all active:scale-95 cursor-pointer"
                                            :aria-label="t('detail.download')">
                                            <DownloadIcon class="size-3.5" />
                                        </button>
                                        <button @click.stop="toggleWatchedEpisode(ep)" :disabled="watchingEpId === ep.id"
                                            class="flex size-10 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                            :class="ep.user.played ? 'bg-accent-purple text-accent-ink' : 'bg-surface-hover text-text-muted hover:bg-surface-raised hover:text-text-heading'"
                                            :aria-label="ep.user.played ? t('common.markUnwatched') : t('common.markWatched')">
                                            <Check class="size-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <p v-if="ep.overview"
                                    class="text-text-muted text-xs leading-relaxed mb-0 line-clamp-2">
                                    {{ ep.overview }}
                                </p>
                                <p v-else class="text-text-subtle text-xs italic mb-0">{{ t('detail.noSynopsis') }}</p>
                                <div v-if="ep.rating || ep.premiereDate" class="flex gap-2 mt-1">
                                    <span v-if="ep.rating" class="inline-flex items-center gap-1 text-xs text-text-muted">
                                        <Star class="size-2.5 fill-current stroke-none" aria-hidden="true" />{{ ep.rating.toFixed(1) }}
                                    </span>
                                    <span v-if="ep.premiereDate" class="text-xs text-text-subtle">{{ new Date(ep.premiereDate).getFullYear() }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </Section>

                <!-- Audio Tracks -->
                <Section v-if="(item.kind === 'album' || item.kind === 'playlist') && audioTracks.length"
                    :title="t('detail.tracks')">
                    <div class="flex flex-col gap-0.5">
                        <div v-for="(track, i) in audioTracks" :key="track.id"
                            class="grid grid-cols-[36px_1fr_56px_36px] gap-3 items-center rounded-lg pl-3 pr-1 py-2.5 cursor-pointer transition-all duration-150 hover:bg-surface-raised"
                            :class="audioPlayerStore.currentTrack?.id === track.id ? 'bg-accent-purple/10 text-accent-purple-light' : ''"
                            @click="playTrack(i)">
                            <div class="text-center text-text-subtle font-medium text-sm tabular-nums">{{ item.kind === 'playlist' ? i + 1 : track.trackNumber || '·' }}</div>
                            <div class="min-w-0">
                                <div class="font-medium text-text-primary truncate text-sm"
                                    :class="audioPlayerStore.currentTrack?.id === track.id ? 'text-accent-purple-light' : ''">
                                    {{ track.title }}
                                </div>
                                <div v-if="track.artists.length" class="text-text-subtle text-xs mt-0.5 truncate">{{ track.artists.map((a) => a.name).join(', ') }}</div>
                            </div>
                            <div class="flex items-center gap-1.5 justify-end">
                                <DownloadIcon v-if="offlineStore.isItemDownloaded(track.id)" class="size-3.5 text-accent-purple" :aria-label="t('common.downloaded')" />
                                <Loader2 v-else-if="downloadStore.isDownloading(track.id)" class="size-3.5 text-accent-purple animate-spin" />
                                <span class="text-text-subtle text-xs tabular-nums">{{ formatMsDuration(track.durationMs) }}</span>
                            </div>
                            <TrackActionsMenu :track="track" @play-next="queueTrack(track, 'next')" @add-to-queue="queueTrack(track, 'end')" />
                        </div>
                    </div>
                </Section>

                <!-- Cast -->
                <Section v-if="cast.length" :title="t('detail.cast')">
                    <MediaRail role="list">
                        <div v-for="p in cast" :key="p.personId || p.name"
                            class="w-[110px] shrink-0 text-center group cursor-pointer" role="listitem" :title="p.name"
                            @click="navigateToPerson(p.personId)">
                            <div class="w-full aspect-[2/3] rounded-xl overflow-hidden bg-surface-raised shadow-lg mb-2 group-hover:-translate-y-1 transition-transform duration-200">
                                <LazyImg :src="personImageUrl(p)" :alt="p.name" kind="person"
                                    class="w-full h-full object-cover object-top" />
                            </div>
                            <div class="font-medium text-text-primary truncate text-xs">{{ p.name }}</div>
                            <div v-if="p.character" class="text-text-subtle text-xs mt-0.5 truncate">{{ p.character }}</div>
                        </div>
                    </MediaRail>
                </Section>

                <!-- Artist albums -->
                <Section v-if="artistAlbums.length" :title="t('library.music.albums')">
                    <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
                        <li v-for="album in artistAlbums" :key="album.id" class="cursor-pointer active:opacity-75" @click="goToItem(album.id)">
                            <div class="aspect-square rounded-xl overflow-hidden bg-black/60 shadow-lg">
                                <LazyImg :src="artUrl(album.id, album.images.poster, SQUARE)" :alt="album.title" kind="album"
                                    class="w-full h-full object-cover" />
                            </div>
                            <div class="mt-1.5 text-xs font-medium text-text-heading truncate">{{ album.title }}</div>
                            <div v-if="album.year" class="text-[10.5px] text-text-muted">{{ album.year }}</div>
                        </li>
                    </ul>
                </Section>

                <!-- Similar Items -->
                <Section v-if="similarItems.length" :title="t('detail.moreLikeThis')">
                    <MediaRail role="list">
                        <div v-for="sim in similarItems" :key="sim.id"
                            class="w-32 shrink-0 sm:w-36 cursor-pointer group rounded-xl overflow-hidden bg-surface-raised border border-border-default hover:-translate-y-1 hover:border-border-hover transition-all duration-200 active:scale-[0.97] active:opacity-75"
                            role="listitem" @click="goToItem(sim.id)">
                            <div class="relative w-full aspect-[2/3] overflow-hidden">
                                <LazyImg :src="artUrl(sim.id, sim.images.poster, POSTER)" :alt="sim.title"
                                    :kind="sim.kind" class="w-full h-full object-cover" />
                                <div v-if="offlineStore.isItemDownloaded(sim.id)"
                                    class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
                                    <DownloadIcon class="size-3 text-white" />
                                </div>
                                <div v-else-if="downloadStore.isDownloading(sim.id)"
                                    class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
                                    <Loader2 class="size-3 text-white animate-spin" />
                                </div>
                            </div>
                            <div class="p-2">
                                <div class="font-medium text-text-primary text-xs truncate">{{ sim.title }}</div>
                                <div class="text-text-subtle text-xs mt-0.5">{{ sim.year }}</div>
                            </div>
                        </div>
                    </MediaRail>
                </Section>

            </div>

        </template>

    <!-- Transcode Download Options Dialog -->
    <TranscodeDownloadDialog
        v-if="pendingTranscodeTarget"
        v-model:open="showTranscodeDialog"
        :item="pendingTranscodeTarget.metadata"
        :items="transcodeItems"
        :needs-conversion="transcodeNeedsConversion"
        @confirm="onTranscodeConfirm"
        @original="onTranscodeOriginal"
    />

    <!-- Bulk Download Confirmation Dialog -->
    <Dialog v-model:open="showBulkDialog">
        <DialogContent class="max-w-sm bg-surface-raised border-border-default">
            <DialogHeader>
                <DialogTitle class="text-text-heading">
                    {{ t('detail.bulkTitle', { name: item?.title ?? '' }) }}
                </DialogTitle>
                <DialogDescription class="text-text-muted text-sm">
                    {{ t('detail.bulkQuestion') }}
                </DialogDescription>
            </DialogHeader>
            <div class="flex flex-col gap-3 mt-2">
                <Button @click="startBulkDownload('unwatched')" class="w-full justify-center gap-2">
                    <DownloadIcon class="size-4" /> {{ t('detail.bulkUnwatched') }}
                </Button>
                <Button variant="outline" @click="startBulkDownload('all')" class="w-full justify-center gap-2">
                    <DownloadIcon class="size-4" /> {{ t('detail.bulkAll') }}
                </Button>
                <DialogClose as-child>
                    <Button variant="ghost" class="w-full">{{ t('common.cancel') }}</Button>
                </DialogClose>
            </div>
        </DialogContent>
    </Dialog>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { playedPercent } from '@/domain';
import type { Album, Credit, Episode, ImageRef, ImageSize, LibraryQuery, MediaItem, Season, Track } from '@/domain';
import { useBackend, useImageUrl } from '@/composables/useBackend';
import { useOfflineStore } from '@/store/offline-store';
import { useAudioPlayerStore, type AudioTrack } from '@/store/audio-player-store';
import { useDownloadStore } from '@/store/download-store';
import { useMetadataCacheStore } from '@/store/metadata-cache-store';
import { useSessionStore } from '@/store/session-store';
import {
    buildOfflineArtworkTargets,
    downloadService,
    type OfflineArtworkType,
} from '@/services/downloadService';
import { offlineDatabase, type DownloadedMedia } from '@/services/offlineDatabase';
import { downloadedTracks, localLibraryPage } from '@/utils/offlineLibrary';
import { offlineResumeSeconds } from '@/utils/watchProgress';
import LazyImg from '@/components/LazyImg.vue';
import { formatMsDuration, formatMsHuman, formatBytes } from '@/utils/helpers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Play, Check, Download as DownloadIcon, ChevronLeft, Loader2, Info, Shuffle, Star, Tv2 } from 'lucide-vue-next';
import { MediaRail, Section } from '@/components/layout';
import CastPlugin, { type CastState } from '@/plugins/CastPlugin';
import { usePlatform } from '@/composables/usePlatform';
import { useToast } from '@/composables/useToast';
import { logger } from '@/utils/logger';
import TranscodeDownloadDialog from '@/components/TranscodeDownloadDialog.vue';
import TrackActionsMenu from '@/components/TrackActionsMenu.vue';
import { trackToAudioTrack } from '@/utils/audioTrack';
import { hdrLabel, metaParts, nextEpisodeOf, resolutionLabel } from '@/utils/detailMeta';
import type { TranscodeOptions } from '@/store/download-store';

const backend = useBackend();
const imageUrl = useImageUrl();
const session = useSessionStore();
const offlineStore = useOfflineStore();
const audioPlayerStore = useAudioPlayerStore();
const downloadStore = useDownloadStore();
const metadataCache = useMetadataCacheStore();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const POSTER: ImageSize = { width: 300, height: 450 };
const SQUARE: ImageSize = { width: 300, height: 300 };
const EPISODE_STILL: ImageSize = { width: 240, height: 135 };
const HERO_STILL: ImageSize = { width: 960, height: 540 };
const COVER: ImageSize = { width: 800, height: 800 };
const BACKDROP: ImageSize = { width: 1920, height: 1080 };
const PERSON: ImageSize = { width: 220 };
const TICKS_PER_MS = 10_000;

// Deep links (Android Auto, notifications) open a detail page with nothing behind it: land on Home.
function goBack() {
    if (window.history.state?.back) router.back();
    else router.replace({ name: 'libraries' });
}
const toast = useToast();
const { showError } = toast;

const loading = ref(true);
const overviewExpanded = ref(false);
const error = ref<string | null>(null);
const item = ref<MediaItem | null>(null);
const seasons = ref<Season[]>([]);
const episodes = ref<Episode[]>([]);
const audioTracks = ref<Track[]>([]);
const artistAlbums = ref<Album[]>([]);
const isMusicCollection = computed(() => {
    const kind = item.value?.kind;
    if (kind === 'artist') return artistAlbums.value.length > 0;
    return (kind === 'album' || kind === 'playlist') && audioTracks.value.length > 0;
});
const similarItems = ref<MediaItem[]>([]);

const itemId = computed(() => route.params.id as string);

const showMediaInfo = ref(false);
const showBulkDialog = ref(false);
const bulkDownloadTarget = ref<'season' | 'series'>('season');
const showTranscodeDialog = ref(false);
const pendingTranscodeTarget = ref<{ itemId: string; metadata: MediaItem } | null>(null);
const pendingBulkTranscode = ref<Episode[] | null>(null);
// Items covered by the open dialog (single item or a bulk set) — drives the size estimate.
const transcodeItems = ref<MediaItem[]>([]);
// Whether the pending download's source needs conversion to play on this device.
const transcodeNeedsConversion = ref(false);
const playingSeasonId = ref<string | null>(null);
const watchingSeasonId = ref<string | null>(null);
const watchingEpId = ref<string | null>(null);
const togglingWatched = ref(false);
const offlineProgressSeconds = ref<number | null>(null);
const cachedArtworkUrls = ref<Record<string, string>>({});
/** Every downloaded album of an artist or the one album of a page, by release date. */
const ALL_LOCAL: LibraryQuery = { view: 'albums', sort: { by: 'releaseDate', order: 'asc' }, filter: {}, offset: 0, limit: 1000 };

// ── Offline artwork ──────────────────────────────────────────────────────────

async function loadCachedArtwork(media: MediaItem) {
    const targets = new Map<string, { itemId: string; imageType: OfflineArtworkType }>();
    for (const target of buildOfflineArtworkTargets(media)) targets.set(`${target.itemId}:${target.imageType}`, target);
    for (const child of [...seasons.value, ...episodes.value, ...artistAlbums.value]) {
        targets.set(`${child.id}:Primary`, { itemId: child.id, imageType: 'Primary' });
    }
    const entries = await Promise.all(
        [...targets.values()].map(async ({ itemId: id, imageType }) => {
            const url = await downloadService.getCachedImageUrl(id, imageType);
            return url ? [[`${id}:${imageType}`, url] as [string, string]] : [];
        }),
    );
    cachedArtworkUrls.value = Object.fromEntries(entries.flat());
}

function cachedArtworkUrl(id: string | undefined, imageType: OfflineArtworkType): string {
    return id ? cachedArtworkUrls.value[`${id}:${imageType}`] || '' : '';
}

/** Cached copy first (offline), else the server image while online. */
function artUrl(id: string, ref: ImageRef | undefined, size: ImageSize, imageType: OfflineArtworkType = 'Primary'): string {
    const cached = cachedArtworkUrl(id, imageType);
    if (cached) return cached;
    return offlineStore.isFullyOnline ? imageUrl(ref, size) : '';
}

// ── Loading ──────────────────────────────────────────────────────────────────

const isKind = <K extends MediaItem['kind']>(kind: K) =>
    (media: MediaItem): media is Extract<MediaItem, { kind: K }> => media.kind === kind;

const NO_USER_STATE = { played: false, playCount: 0, favorite: false };
/** Minimal item for a parent known only from downloads (no cached metadata). */
const localItem = (id: string, title: string) => ({ id, title, genres: [], studios: [], images: {}, user: NO_USER_STATE });

function resetChildren() {
    seasons.value = [];
    episodes.value = [];
    seriesNextUp.value = null;
    audioTracks.value = [];
    artistAlbums.value = [];
    similarItems.value = [];
    offlineProgressSeconds.value = null;
    cachedArtworkUrls.value = {};
}

/** Offline: an album or artist known from downloaded tracks. */
function loadLocalMusic(id: string): boolean {
    const tracks = offlineStore.downloads.filter((d) => d.item.kind === 'track');
    const albumTracks = tracks.filter((d) => d.albumId === id);
    if (albumTracks.length) {
        item.value = metadataCache.get(id, true) ?? localLibraryPage(albumTracks, 'music', ALL_LOCAL, 1).items[0];
        audioTracks.value = downloadedTracks(albumTracks)
            .sort((a, b) => (a.discNumber ?? 0) - (b.discNumber ?? 0) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
        return true;
    }
    const artistTracks = tracks.filter((d) => d.item.kind === 'track' && d.item.albumArtists.some((artist) => artist.id === id));
    if (!artistTracks.length) return false;
    const first = artistTracks[0].item;
    const name = first.kind === 'track' ? first.albumArtists.find((a) => a.id === id)?.name ?? '' : '';
    item.value = metadataCache.get(id, true) ?? { ...localItem(id, name), kind: 'artist' };
    artistAlbums.value = localLibraryPage(artistTracks, 'music', ALL_LOCAL, 1).items.filter(isKind('album'));
    return true;
}

function localSeason(seasonId: string, seasonNumber: number | undefined, seriesId: string, seriesTitle: string): Season {
    return { ...localItem(seasonId, `Season ${seasonNumber ?? ''}`.trim()), kind: 'season', seasonNumber, seriesId, seriesTitle };
}

/** Offline: a series or season known from downloaded episodes. */
function loadLocalShow(id: string): boolean {
    const series = offlineStore.tvShowsGrouped.find((group) => group.seriesId === id);
    if (series) {
        item.value = metadataCache.get(id, true) ?? { ...localItem(series.seriesId, series.seriesName), kind: 'series', credits: [] };
        seasons.value = series.seasons.map((season) => localSeason(season.seasonId, season.seasonNumber, series.seriesId, series.seriesName));
        return true;
    }
    for (const group of offlineStore.tvShowsGrouped) {
        const season = group.seasons.find((candidate) => candidate.seasonId === id);
        if (!season) continue;
        item.value = metadataCache.get(id, true) ?? localSeason(season.seasonId, season.seasonNumber, group.seriesId, group.seriesName);
        episodes.value = season.episodes.map((ep: DownloadedMedia) => ep.item).filter(isKind('episode'));
        return true;
    }
    return false;
}

async function loadOffline(id: string): Promise<boolean> {
    const cached = offlineStore.getDownload(id);
    if (cached) {
        item.value = cached.item;
        const progress = await offlineDatabase.getWatchProgress(id);
        // The most recent playback wins: this device offline, or another one before.
        offlineProgressSeconds.value = offlineResumeSeconds(cached.item, progress ?? undefined) ?? null;
        return true;
    }
    return loadLocalMusic(id) || loadLocalShow(id);
}

async function loadChildren(media: MediaItem) {
    const { catalog, music } = backend.value;
    if (media.kind === 'series') {
        [seasons.value, seriesNextUp.value] = await Promise.all([
            catalog.seasons(media.id),
            catalog.nextEpisode(media.id).catch(() => null),
        ]);
    }
    if (media.kind === 'season') episodes.value = await catalog.episodes(media.id);
    if (media.kind === 'album') audioTracks.value = await music.albumTracks(media.id);
    if (media.kind === 'playlist') audioTracks.value = await music.playlistTracks(media.id);
    if (media.kind === 'artist') artistAlbums.value = await music.artistAlbums(media.id);
    if (media.kind === 'movie' || media.kind === 'series') similarItems.value = await catalog.similar(media.id);
}

async function load() {
    loading.value = true;
    error.value = null;
    resetChildren();
    try {
        if (!offlineStore.isFullyOnline && await loadOffline(itemId.value)) return;
        const media = await backend.value.catalog.item(itemId.value);
        item.value = media;
        await loadChildren(media);
    } catch {
        // Network failed — fall back to cached download data if available.
        const cached = offlineStore.getDownload(itemId.value);
        if (cached) item.value = cached.item;
        else error.value = t('detail.loadError');
    } finally {
        if (item.value) await loadCachedArtwork(item.value);
        loading.value = false;
    }
}

// ── Cast (Jellyfin receiver; hidden on servers without the capability) ─────────
const castState = ref<CastState>('NO_DEVICES_AVAILABLE');
const canCast = computed(() => session.backend?.capabilities.cast ?? false);
let castStateListener: { remove: () => void } | null = null;
let castSessionListener: { remove: () => void } | null = null;

function castCurrentItem() {
    if (!item.value) return Promise.resolve();
    return CastPlugin.castMedia({
        itemId: item.value.id,
        serverUrl: session.active?.baseUrl ?? '',
        accessToken: session.token ?? '',
        startPositionTicks: (item.value.user.resumePositionMs ?? 0) * TICKS_PER_MS,
        title: item.value.title,
    });
}

async function initCast() {
    const { isNative } = usePlatform();
    if (!isNative || !canCast.value) return;
    try {
        await CastPlugin.initialize();
        const stateResult = await CastPlugin.getState();
        castState.value = stateResult.state;
        castStateListener = await CastPlugin.addListener('castStateChanged', (d) => {
            castState.value = d.state;
        });
        castSessionListener = await CastPlugin.addListener('sessionStarted', castCurrentItem);
    } catch {
        // Cast not available (web / non-Google device)
    }
}

async function castItem() {
    // Already connected — cast directly
    if (castState.value === 'CONNECTED' && item.value) await castCurrentItem();
    else await CastPlugin.showPicker();
}

onMounted(() => { load(); initCast(); });
onUnmounted(() => { castStateListener?.remove(); castSessionListener?.remove(); });
watch(() => route.params.id, load);

// ── Hero ─────────────────────────────────────────────────────────────────────

const SQUARE_KINDS = new Set<MediaItem['kind']>(['album', 'track', 'artist', 'playlist']);
const isSquareArtwork = computed(() => !!item.value && SQUARE_KINDS.has(item.value.kind));

const posterUrl = computed(() => {
    const media = item.value;
    if (!media) return '';
    if (media.kind === 'episode') return artUrl(media.id, media.images.thumb ?? media.images.poster, HERO_STILL);
    return artUrl(media.id, media.images.poster, isSquareArtwork.value ? COVER : POSTER);
});

/** Seasons and episodes carry the series backdrop (a season poster upscaled looks pixelated). */
const backdropUrl = computed(() => {
    const media = item.value;
    if (!media) return '';
    const ownerId = media.kind === 'episode' || media.kind === 'season' ? media.seriesId : media.id;
    return artUrl(ownerId, media.images.backdrop, BACKDROP, 'Backdrop');
});

// Cinematic hero image: prefer a wide backdrop, fall back to the poster so
// items without a backdrop (most albums) still render a header.
const heroImageUrl = computed(() => backdropUrl.value || posterUrl.value);

// Square cover art cropped to a 16:10 hero looks broken; show it whole over a
// blurred copy of itself instead.
const showCoverHero = computed(() => !backdropUrl.value && isSquareArtwork.value);

const breadcrumb = computed(() => {
    const media = item.value;
    if (media?.kind === 'episode') {
        return { seriesId: media.seriesId, seriesTitle: media.seriesTitle, seasonId: media.seasonId, seasonTitle: media.seasonTitle };
    }
    if (media?.kind === 'season') return { seriesId: media.seriesId, seriesTitle: media.seriesTitle };
    return null;
});

const albumArtists = computed(() =>
    item.value?.kind === 'album' ? item.value.artists.filter((artist) => artist.id) : []);

/** Resume point in ms: progress saved offline (most recent) wins over the server's. */
const resumeMs = computed(() => {
    if (offlineProgressSeconds.value && offlineProgressSeconds.value > 0) return offlineProgressSeconds.value * 1000;
    return item.value?.user.resumePositionMs ?? 0;
});

const resumePercent = computed(() => {
    const duration = item.value?.durationMs;
    return duration && resumeMs.value > 0 ? Math.min(100, (resumeMs.value / duration) * 100) : 0;
});

const resumePositionLabel = computed(() => (resumeMs.value > 0 ? formatMsHuman(resumeMs.value) : null));

// Series: the server's next-up episode. Season: picked from the loaded episodes.
const seriesNextUp = ref<Episode | null>(null);
const nextEpisode = computed<Episode | null>(() => {
    if (item.value?.kind === 'series') return seriesNextUp.value;
    if (item.value?.kind === 'season') return nextEpisodeOf(episodes.value);
    return null;
});
const nextEpisodeLabel = computed(() => {
    const ep = nextEpisode.value;
    if (!ep) return '';
    const seasonNumber = ep.seasonNumber ?? (item.value?.kind === 'season' ? item.value.seasonNumber : undefined) ?? 1;
    const code = `S${seasonNumber}E${ep.episodeNumber ?? 1}`;
    return (ep.user.resumePositionMs ?? 0) > 0
        ? t('detail.resumeEpisode', { code })
        : t('detail.playEpisode', { code });
});

function episodeAfter(ep: Episode): Episode | undefined {
    const sorted = [...episodes.value].sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
    const index = sorted.findIndex((e) => e.id === ep.id);
    return index >= 0 ? sorted[index + 1] : undefined;
}

function playNextEpisode() {
    const ep = nextEpisode.value;
    if (!ep) return;
    const startMs = ep.user.resumePositionMs;
    const following = episodeAfter(ep);
    router.push({
        name: 'Player',
        params: { id: ep.id },
        query: {
            ...(startMs ? { startMs: String(startMs) } : {}),
            ...(following ? { nextEpisodeId: following.id } : {}),
        },
    });
}

const heroMeta = computed(() => (item.value ? metaParts(item.value, t, episodes.value.length || undefined) : []));
const genres = computed<string[]>(() => item.value?.genres ?? []);

const credits = computed<Credit[]>(() => (item.value && 'credits' in item.value ? item.value.credits : []));
const directorNames = computed(() => credits.value.filter((c) => c.role === 'director').map((c) => c.name));
const cast = computed<Credit[]>(() => credits.value.filter((c) => c.role === 'actor'));
const studioNames = computed(() => item.value?.studios ?? []);

function personImageUrl(person: Credit) {
    if (!person.image) return '';
    return person.personId ? artUrl(person.personId, person.image, PERSON) : imageUrl(person.image, PERSON);
}

function navigateToPerson(id?: string) {
    if (id) router.push({ name: 'PersonDetail', params: { id } });
}

const PLAYABLE_KINDS = new Set<MediaItem['kind']>(['movie', 'episode', 'track']);

function isPlayable(media: MediaItem | null) {
    return !!media && PLAYABLE_KINDS.has(media.kind);
}

function playMedia() {
    const media = item.value;
    if (!media) return;
    if (media.kind === 'track') {
        audioPlayerStore.playTrack(itemToAudioTrack(media));
        return;
    }
    router.push({
        name: 'Player',
        params: { id: media.id },
        query: resumeMs.value > 0 ? { startMs: String(Math.round(resumeMs.value)) } : {},
    });
}

function goToItem(id: string) {
    router.push({ name: 'ItemDetails', params: { id } });
}

/** A season's button plays its first unwatched episode (or the first one when all are watched). */
async function playNextInSeason(season: Season) {
    if (playingSeasonId.value) return;
    playingSeasonId.value = season.id;
    try {
        const seasonEpisodes = await backend.value.catalog.episodes(season.id);
        const sorted = [...seasonEpisodes].sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
        const ep = sorted.find((candidate) => !candidate.user.played) ?? sorted[0];
        if (ep) router.push({ name: 'Player', params: { id: ep.id } });
    } finally {
        playingSeasonId.value = null;
    }
}

function playEpisode(ep: Episode) {
    const next = episodeAfter(ep);
    router.push({ name: 'Player', params: { id: ep.id }, query: next ? { nextEpisodeId: next.id } : {} });
}

/** Toggle the played flag on the server and mirror the change on the local object. */
async function togglePlayedState(target: MediaItem) {
    const played = !target.user.played;
    await backend.value.userData.setPlayed(target.id, played);
    target.user.played = played;
}

async function toggleWatched() {
    if (togglingWatched.value || !item.value) return;
    togglingWatched.value = true;
    try {
        await togglePlayedState(item.value);
    } finally {
        togglingWatched.value = false;
    }
}

async function toggleWatchedSeason(season: Season) {
    if (watchingSeasonId.value) return;
    watchingSeasonId.value = season.id;
    try {
        await togglePlayedState(season);
    } finally {
        watchingSeasonId.value = null;
    }
}

async function toggleWatchedEpisode(ep: Episode) {
    if (watchingEpId.value) return;
    watchingEpId.value = ep.id;
    try {
        await togglePlayedState(ep);
    } finally {
        watchingEpId.value = null;
    }
}

// ── Music ────────────────────────────────────────────────────────────────────

function itemToAudioTrack(track: Track): AudioTrack {
    return trackToAudioTrack(track, item.value?.title || '');
}

/** Album / playlist tracks, or every track of an artist (fetched on demand). */
async function collectionTracks(): Promise<AudioTrack[]> {
    if (item.value?.kind === 'artist' && !audioTracks.value.length) {
        audioTracks.value = await backend.value.music.artistTracks(item.value.id);
    }
    return audioTracks.value.map(itemToAudioTrack);
}

function playTrack(index: number) {
    audioPlayerStore.playAlbum(audioTracks.value.map(itemToAudioTrack), index);
}

async function playAlbum() {
    audioPlayerStore.playAlbum(await collectionTracks(), 0);
}

async function shuffleAlbum() {
    audioPlayerStore.playShuffled(await collectionTracks());
}

function enqueue(tracks: AudioTrack[], where: 'next' | 'end') {
    if (where === 'next') audioPlayerStore.playNext(tracks);
    else audioPlayerStore.addToQueue(tracks);
    toast.show(where === 'next' ? t('audio.playingNext') : t('audio.addedToQueue'), 'success', 2000);
}

function queueTrack(track: Track, where: 'next' | 'end') {
    enqueue([itemToAudioTrack(track)], where);
}

async function queueAlbum(where: 'next' | 'end') {
    enqueue(await collectionTracks(), where);
}

// ── Media info ───────────────────────────────────────────────────────────────

const firstSource = computed(() => (item.value && 'versions' in item.value ? item.value.versions[0] ?? null : null));
const primaryVideo = computed(() => firstSource.value?.video[0] ?? null);

/** Badges after the hero meta line: resolution class, HDR format, codec. */
const videoBadges = computed(() => {
    const v = primaryVideo.value;
    const codec = v?.codec ? v.codec.toUpperCase() : null;
    return [resolutionLabel(v), hdrLabel(v), codec].filter((b): b is string => !!b);
});

type InfoRow = { label: string; value: string; wide?: boolean };

/** Readable value for the media info dialog: yes/no for flags, Mbit/s for bitrates. */
function infoValue(key: string, val: unknown): string {
    if (typeof val === 'boolean') return val ? t('common.yes') : t('common.no');
    if (key.endsWith('Bitrate') && typeof val === 'number') {
        return t('detail.info.mbps', { n: (val / 1_000_000).toLocaleString(locale.value, { maximumFractionDigits: 1 }) });
    }
    return String(val);
}

function infoRows(pairs: Array<[string, unknown]>): InfoRow[] {
    return pairs
        .filter(([, val]) => val !== null && val !== undefined && val !== '')
        .map(([key, val]) => ({ label: t(`detail.info.${key}`), value: infoValue(key, val), wide: key === 'path' }));
}

const videoDetails = computed<InfoRow[]>(() => {
    const v = primaryVideo.value;
    if (!v) return [];
    return infoRows([
        ['codec', v.codec?.toUpperCase()],
        ['profile', v.profile],
        ['level', v.level],
        ['resolution', v.width && v.height ? `${v.width} × ${v.height}` : null],
        ['aspectRatio', v.aspectRatio],
        ['realFrameRate', v.frameRate],
        ['videoBitrate', v.bitrate],
        ['bitDepth', v.bitDepth],
        ['refFrames', v.refFrames],
        ['interlaced', v.isInterlaced],
        ['pixelFormat', v.pixelFormat],
        ['colorSpace', v.colorSpace],
        ['colorTransfer', v.colorTransfer],
        ['colorPrimaries', v.colorPrimaries],
        ['hdrType', hdrLabel(v)],
        ['doviProfile', v.dolbyVisionProfile],
        ['doviLevel', v.dolbyVisionLevel],
    ]);
});

const sourceDetails = computed<InfoRow[]>(() => {
    const src = firstSource.value;
    if (!src) return [];
    return infoRows([
        ['container', src.container],
        ['totalBitrate', src.bitrate],
        ['path', src.path],
    ]);
});

const fileSizeHuman = computed(() => formatBytes(firstSource.value?.sizeBytes));

// ── Downloads ────────────────────────────────────────────────────────────────

const DOWNLOADABLE_KINDS = new Set<MediaItem['kind']>(['movie', 'episode', 'track', 'album']);

function canDownload(media: MediaItem | null): boolean {
    return !!media && DOWNLOADABLE_KINDS.has(media.kind) && (session.backend?.capabilities.downloads ?? false);
}

// A server can't serve an album as one file: an album download is its tracks.
const downloadIds = computed<string[]>(() =>
    item.value?.kind === 'album' ? audioTracks.value.map((track) => track.id) : [itemId.value]);

const isItemDownloaded = computed(() =>
    downloadIds.value.length > 0 && downloadIds.value.every((id) => offlineStore.isItemDownloaded(id)));

const isDownloading = computed(() => downloadIds.value.some((id) => downloadStore.isDownloading(id)));

const downloadProgress = computed(() => {
    const ids = downloadIds.value;
    const total = ids.reduce((sum, id) =>
        sum + (offlineStore.isItemDownloaded(id) ? 100 : downloadStore.getTask(id)?.progress ?? 0), 0);
    return ids.length ? Math.round(total / ids.length) : 0;
});

/** True when the item carries a video stream (i.e. resolution/transcode options apply). */
function hasVideoStream(media: MediaItem): boolean {
    return 'versions' in media && media.versions.some((version) => version.video.length > 0);
}

function startOne(media: MediaItem, failMessage: string, options?: TranscodeOptions) {
    downloadStore.startDownload(media.id, media, options).catch((error: { name?: string }) => {
        if (error?.name !== 'AbortError') showError(failMessage);
    });
}

/**
 * Open the download options dialog (quality, tracks, size) for a video item.
 * Audio-only items skip the dialog and download directly.
 */
async function requestDownload(media: MediaItem, failMessage: string) {
    if (!hasVideoStream(media)) {
        startOne(media, failMessage);
        return;
    }
    pendingTranscodeTarget.value = { itemId: media.id, metadata: media };
    pendingBulkTranscode.value = null;
    transcodeItems.value = [media];
    transcodeNeedsConversion.value = await downloadStore.checkNeedsTranscode(media);
    showTranscodeDialog.value = true;
}

async function handleDownload() {
    if (!item.value) return;
    if (item.value.kind === 'album') {
        for (const track of audioTracks.value) {
            if (offlineStore.isItemDownloaded(track.id)) continue;
            await requestDownload(track, t('detail.downloadEpisodeFailed', { name: track.title }));
        }
        return;
    }
    await requestDownload(item.value, t('detail.downloadFailed'));
}

async function handleEpisodeDownload(ep: Episode) {
    await requestDownload(ep, t('detail.downloadEpisodeFailed', { name: ep.title }));
}

/**
 * Launch the download(s) that were waiting on the transcode dialog.
 * Called with options when the user confirms a transcode, without options
 * when they choose to keep the original quality.
 */
function startPendingDownloads(options?: TranscodeOptions) {
    if (pendingBulkTranscode.value) {
        for (const ep of pendingBulkTranscode.value) {
            startOne(ep, t('detail.downloadEpisodeFailed', { name: ep.title }), options);
        }
        pendingBulkTranscode.value = null;
    } else if (pendingTranscodeTarget.value) {
        startOne(pendingTranscodeTarget.value.metadata, t('detail.downloadFailed'), options);
        pendingTranscodeTarget.value = null;
    }
}

function onTranscodeConfirm(options: TranscodeOptions) {
    startPendingDownloads(options);
}

function onTranscodeOriginal() {
    startPendingDownloads({ forceOriginal: true });
}

async function deleteDownload() {
    if (!item.value) return;
    if (!confirm(t('detail.confirmDelete', { name: item.value.title }))) return;
    try {
        for (const id of downloadIds.value) {
            await downloadService.deleteOfflineFile(id);
            await offlineStore.removeDownload(id);
        }
    } catch {
        showError(t('detail.deleteFailed'));
    }
}

function cancelDownload() {
    if (!item.value) return;
    for (const id of downloadIds.value) {
        if (downloadStore.isDownloading(id)) downloadStore.cancelDownload(id);
    }
}

function openBulkDialog(target: 'season' | 'series') {
    bulkDownloadTarget.value = target;
    showBulkDialog.value = true;
}

async function bulkCandidates(): Promise<Episode[] | null> {
    if (bulkDownloadTarget.value === 'season') return [...episodes.value];
    try {
        return await backend.value.catalog.seriesEpisodes(item.value!.id);
    } catch (e) {
        logger.error('[BulkDownload] Failed to fetch series episodes:', e);
        return null;
    }
}

async function startBulkDownload(mode: 'all' | 'unwatched') {
    showBulkDialog.value = false;
    if (!item.value) return;
    const all = await bulkCandidates();
    if (!all) return;
    const candidates = all
        .filter((ep) => mode === 'all' || !ep.user.played)
        .filter((ep) => !offlineStore.isItemDownloaded(ep.id));
    if (candidates.length === 0) return;

    logger.log(`[BulkDownload] Queueing ${candidates.length} episodes (mode: ${mode})`);

    // Open the options dialog once — quality and track choice apply to every episode,
    // and the size estimate covers the whole batch. Compatibility is checked on the
    // first episode with stream info as a representative sample.
    const firstWithStreams = candidates.find((ep) => (ep.versions[0]?.video.length ?? 0) > 0) || candidates[0];
    pendingTranscodeTarget.value = { itemId: firstWithStreams.id, metadata: firstWithStreams };
    pendingBulkTranscode.value = candidates;
    transcodeItems.value = candidates;
    transcodeNeedsConversion.value = await downloadStore.checkNeedsTranscode(firstWithStreams);
    showTranscodeDialog.value = true;
}
</script>
