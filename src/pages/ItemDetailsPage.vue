<template>
    <div class="min-h-dvh text-foreground bg-background relative isolate">

        <!-- Loading -->
        <section v-if="loading"
            class="flex items-center justify-center min-h-dvh text-text-muted text-lg">{{ t('common.loading') }}</section>

        <!-- Error -->
        <section v-else-if="error"
            class="flex items-center justify-center min-h-dvh text-error text-lg">{{ error }}</section>

        <template v-else>

            <!-- ── CINEMATIC HERO ────────────────────────────── -->
            <Dialog v-model:open="showMediaInfo">
                <section class="relative">

                    <!-- Backdrop -->
                    <!-- A square cover needs a taller hero on phones to stay a decent size -->
                    <div class="relative w-full overflow-hidden"
                        :class="showCoverHero && posterUrl ? 'aspect-[4/5] max-h-[70vh] sm:aspect-[16/10] sm:max-h-[58vh]' : 'aspect-[16/10] max-h-[58vh]'">
                        <template v-if="showCoverHero && posterUrl">
                            <LazyImg :src="posterUrl" alt="" :item-type="item.Type"
                                class="absolute inset-0 w-full h-full object-cover blur-3xl scale-125 opacity-70" />
                            <!-- Below the top buttons, which sit under the status bar / camera cutout -->
                            <div class="absolute inset-0 flex items-center justify-center pb-24"
                                style="padding-top: calc(56px + var(--sat, env(safe-area-inset-top, 0px)))">
                                <LazyImg :src="posterUrl" :alt="item.Name" :item-type="item.Type"
                                    class="h-full aspect-square rounded-xl object-cover shadow-[0_20px_60px_rgba(0,0,0,0.6)]" />
                            </div>
                        </template>
                        <LazyImg v-else-if="heroImageUrl" :src="heroImageUrl" :alt="item.Name" :item-type="item.Type"
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
                            <div v-if="item.SeriesId || item.SeasonId"
                                class="flex items-center gap-1.5 text-caption text-text-muted mb-1.5">
                                <button v-if="item.SeriesId" @click="goToItem(item.SeriesId)"
                                    class="hover:text-text-heading transition-colors cursor-pointer">{{ item.SeriesName }}</button>
                                <span v-if="item.SeriesId && item.SeasonId" class="text-text-subtle">/</span>
                                <button v-if="item.SeasonId" @click="goToItem(item.SeasonId)"
                                    class="hover:text-text-heading transition-colors cursor-pointer">{{ item.SeasonName }}</button>
                            </div>
                            <h1 class="line-clamp-2 text-page lg:text-page-wide font-bold text-text-heading leading-tight tracking-tight mb-2">{{ item.Name }}</h1>
                            <div v-if="item.Type === 'MusicAlbum' && item.AlbumArtists?.length" class="flex flex-wrap gap-x-2 mb-1.5 text-body font-semibold text-text-primary">
                                <button v-for="artist in item.AlbumArtists" :key="artist.Id" @click="goToItem(artist.Id)"
                                    class="hover:text-text-heading underline-offset-4 hover:underline cursor-pointer">{{ artist.Name }}</button>
                            </div>
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-caption text-text-primary">
                                <template v-for="(part, i) in heroMeta" :key="part">
                                    <span v-if="i" class="text-text-subtle">·</span>
                                    <span>{{ part }}</span>
                                </template>
                                <template v-if="item.CommunityRating">
                                    <span class="text-text-subtle">·</span>
                                    <span class="inline-flex items-center gap-1 font-semibold text-text-heading">
                                        <Star class="size-3 fill-current stroke-none" aria-hidden="true" />{{ item.CommunityRating.toFixed(1) }}
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
                                <Play class="size-4 fill-current stroke-none" /> {{ item.Type === 'MusicAlbum' ? t('detail.playAlbum') : t('detail.playAll') }}
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
                            <button v-if="item.Type === 'Season'" @click="openBulkDialog('season')"
                                :aria-label="t('detail.bulkTitle', { name: item.Name })"
                                class="flex items-center justify-center size-[50px] rounded-2xl bg-surface border border-border-default text-text-heading active:scale-95 transition cursor-pointer">
                                <DownloadIcon class="size-5" />
                            </button>
                            <button v-if="item.Type === 'Series'" @click="openBulkDialog('series')"
                                :aria-label="t('detail.bulkTitle', { name: item.Name })"
                                class="flex items-center justify-center size-[50px] rounded-2xl bg-surface border border-border-default text-text-heading active:scale-95 transition cursor-pointer">
                                <DownloadIcon class="size-5" />
                            </button>

                            <!-- Mark all watched (Series / Season) -->
                            <button v-if="item.Type === 'Series' || item.Type === 'Season'"
                                :disabled="togglingWatched" @click="toggleWatched"
                                :aria-label="item.UserData?.Played ? t('detail.markAllUnwatched') : t('detail.markAllWatched')"
                                class="flex items-center justify-center size-[50px] rounded-2xl border active:scale-95 transition cursor-pointer"
                                :class="item.UserData?.Played
                                    ? 'bg-accent-purple/15 border-accent-purple/40 text-accent-purple'
                                    : 'bg-surface border-border-default text-text-heading'">
                                <Loader2 v-if="togglingWatched" class="size-5 animate-spin" />
                                <Check v-else class="size-5" />
                            </button>

                            <!-- Watched toggle (single playable) -->
                            <button
                                v-if="item.Type !== 'Series' && item.Type !== 'Season' && item.Type !== 'MusicAlbum' && item.Type !== 'MusicArtist' && item.Type !== 'Playlist' && item.Type !== 'BoxSet'"
                                :disabled="togglingWatched" @click="toggleWatched"
                                :aria-label="item.UserData?.Played ? t('common.markUnwatched') : t('common.markWatched')"
                                class="flex items-center justify-center size-[50px] rounded-2xl border active:scale-95 transition cursor-pointer"
                                :class="item.UserData?.Played
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
                        <div v-if="item.Overview" class="mb-4 max-w-2xl">
                            <p class="text-body leading-relaxed text-text-body m-0 transition-all"
                                :class="overviewExpanded ? '' : 'line-clamp-3'">
                                {{ item.Overview }}
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
                                    <DialogDescription class="text-text-muted text-sm">{{ t('detail.mediaInfoFor', { name: item.Name }) }}</DialogDescription>
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
                <Section v-if="item.Type === 'Series' && seasons.length" :title="t('detail.seasons')">
                    <MediaRail>
                        <div v-for="season in seasons" :key="season.Id"
                            class="w-32 shrink-0 sm:w-36 cursor-pointer group rounded-xl overflow-hidden bg-surface-raised border border-border-default hover:-translate-y-1 hover:border-border-hover transition-all duration-200 active:scale-[0.97] active:opacity-75"
                            @click="goToItem(season.Id)">
                            <div class="relative w-full aspect-[2/3] overflow-hidden">
                                <LazyImg :src="getImageUrl(season.Id, 'Primary', 300, 450)" :alt="season.Name"
                                    item-type="Season" class="w-full h-full object-cover" />
                                <button @click.stop="toggleWatchedSeason(season)" :disabled="watchingSeasonId === season.Id"
                                    class="absolute top-1 right-1 flex size-10 items-center justify-center rounded-full transition-all duration-200 cursor-pointer pointer-events-auto disabled:opacity-50"
                                    :class="season.UserData?.Played ? 'bg-accent-purple text-accent-ink' : 'bg-black/50 text-white/80'"
                                    :aria-label="season.UserData?.Played ? t('common.markUnwatched') : t('common.markWatched')">
                                    <Loader2 v-if="watchingSeasonId === season.Id" class="size-4 animate-spin" />
                                    <Check v-else class="size-4" />
                                </button>
                                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end justify-center pb-2 pointer-events-none">
                                    <button @click.stop="playNextInSeason(season)" :disabled="playingSeasonId === season.Id"
                                        :aria-label="t('common.play')"
                                        class="flex size-10 items-center justify-center bg-white/90 hover:bg-white text-black rounded-full shadow-lg transition-all disabled:opacity-60 pointer-events-auto cursor-pointer">
                                        <Loader2 v-if="playingSeasonId === season.Id" class="size-4 animate-spin" />
                                        <Play v-else class="size-4 fill-black stroke-none" />
                                    </button>
                                </div>
                            </div>
                            <div class="px-2 py-2 text-center text-caption font-semibold text-text-primary">{{ season.Name }}</div>
                        </div>
                    </MediaRail>
                </Section>

                <!-- Episodes -->
                <Section v-if="item.Type === 'Season' && episodes.length" :title="t('detail.episodesTitle')">
                    <div class="flex flex-col gap-2">
                        <div v-for="ep in episodes" :key="ep.Id"
                            class="flex gap-3 sm:gap-4 p-2.5 rounded-xl cursor-pointer transition-all duration-200 border border-transparent hover:bg-surface-raised hover:border-border-default active:opacity-75"
                            @click="goToItem(ep.Id)">
                            <!-- Thumbnail -->
                            <div class="relative group w-[100px] h-[56px] sm:w-[180px] sm:h-[101px] rounded-lg overflow-hidden shrink-0 bg-black/40"
                                :class="ep.UserData?.Played && 'opacity-60'">
                                <LazyImg :src="getImageUrl(ep.Id, 'Primary', 240, 135)" :alt="ep.Name"
                                    item-type="Episode" class="w-full h-full object-cover" />
                                <div class="absolute inset-0 bg-black/50 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <button @click.stop="playEpisode(ep)" :aria-label="t('common.play')"
                                        class="flex size-10 items-center justify-center bg-white/90 text-black rounded-full shadow-lg pointer-events-auto active:scale-95 cursor-pointer">
                                        <Play class="size-4 fill-black stroke-none" />
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
                                    <p class="font-semibold text-sm m-0 leading-snug" :class="ep.UserData?.Played ? 'text-text-muted' : 'text-text-heading'">
                                        <span class="text-text-subtle mr-1">{{ ep.IndexNumber }}.</span>{{ ep.Name }}
                                    </p>
                                    <div class="flex items-center gap-1.5 shrink-0">
                                        <span v-if="ep.RunTimeTicks"
                                            class="text-xs text-text-subtle hidden sm:block tabular-nums">{{ formatTicksDuration(ep.RunTimeTicks) }}</span>
                                        <span v-if="offlineStore.isItemDownloaded(ep.Id)"
                                            class="flex size-10 items-center justify-center rounded-full bg-accent-purple/20 text-accent-purple"
                                            :title="t('common.downloaded')">
                                            <DownloadIcon class="size-3.5" />
                                        </span>
                                        <span v-else-if="downloadStore.isDownloading(ep.Id)"
                                            class="flex size-10 items-center justify-center rounded-full bg-accent-purple/20 text-accent-purple animate-pulse"
                                            :title="t('detail.downloading', { percent: downloadStore.getTask(ep.Id)?.progress ?? 0 })">
                                            <Loader2 class="size-3.5 animate-spin" />
                                        </span>
                                        <button v-else
                                            @click.stop="handleEpisodeDownload(ep)"
                                            class="flex size-10 items-center justify-center rounded-full bg-surface-hover text-text-muted hover:bg-surface-raised hover:text-text-heading transition-all active:scale-95 cursor-pointer"
                                            :aria-label="t('detail.download')">
                                            <DownloadIcon class="size-3.5" />
                                        </button>
                                        <button @click.stop="toggleWatchedEpisode(ep)" :disabled="watchingEpId === ep.Id"
                                            class="flex size-10 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                            :class="ep.UserData?.Played ? 'bg-accent-purple text-accent-ink' : 'bg-surface-hover text-text-muted hover:bg-surface-raised hover:text-text-heading'"
                                            :aria-label="ep.UserData?.Played ? t('common.markUnwatched') : t('common.markWatched')">
                                            <Check class="size-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <p v-if="ep.Overview"
                                    class="text-text-muted text-xs leading-relaxed mb-0 line-clamp-2">
                                    {{ ep.Overview }}
                                </p>
                                <p v-else class="text-text-subtle text-xs italic mb-0">{{ t('detail.noSynopsis') }}</p>
                                <div v-if="ep.CommunityRating || ep.PremiereDate" class="flex gap-2 mt-1">
                                    <span v-if="ep.CommunityRating" class="inline-flex items-center gap-1 text-xs text-text-muted">
                                        <Star class="size-2.5 fill-current stroke-none" aria-hidden="true" />{{ ep.CommunityRating.toFixed(1) }}
                                    </span>
                                    <span v-if="ep.PremiereDate" class="text-xs text-text-subtle">{{ new Date(ep.PremiereDate).getFullYear() }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </Section>

                <!-- Audio Tracks -->
                <Section v-if="(item.Type === 'MusicAlbum' || item.Type === 'Playlist') && audioTracks.length"
                    :title="t('detail.tracks')">
                    <div class="flex flex-col gap-0.5">
                        <div v-for="(track, i) in audioTracks" :key="track.Id"
                            class="grid grid-cols-[36px_1fr_56px_36px] gap-3 items-center rounded-lg pl-3 pr-1 py-2.5 cursor-pointer transition-all duration-150 hover:bg-surface-raised"
                            :class="audioPlayerStore.currentTrack?.id === track.Id ? 'bg-accent-purple/10 text-accent-purple-light' : ''"
                            @click="playTrack(track.Id, i)">
                            <div class="text-center text-text-subtle font-medium text-sm tabular-nums">{{ item.Type === 'Playlist' ? i + 1 : track.IndexNumber || '·' }}</div>
                            <div class="min-w-0">
                                <div class="font-medium text-text-primary truncate text-sm"
                                    :class="audioPlayerStore.currentTrack?.id === track.Id ? 'text-accent-purple-light' : ''">
                                    {{ track.Name }}
                                </div>
                                <div v-if="track.Artists?.length" class="text-text-subtle text-xs mt-0.5 truncate">{{ track.Artists.join(', ') }}</div>
                            </div>
                            <div class="flex items-center gap-1.5 justify-end">
                                <DownloadIcon v-if="offlineStore.isItemDownloaded(track.Id)" class="size-3.5 text-accent-purple" :aria-label="t('common.downloaded')" />
                                <Loader2 v-else-if="downloadStore.isDownloading(track.Id)" class="size-3.5 text-accent-purple animate-spin" />
                                <span class="text-text-subtle text-xs tabular-nums">{{ formatTicksDuration(track.RunTimeTicks) }}</span>
                            </div>
                            <TrackActionsMenu :track="track" @play-next="queueTrack(track, 'next')" @add-to-queue="queueTrack(track, 'end')" />
                        </div>
                    </div>
                </Section>

                <!-- Cast -->
                <Section v-if="cast.length" :title="t('detail.cast')">
                    <MediaRail role="list">
                        <div v-for="p in cast" :key="p.Id || p.Name"
                            class="w-[110px] shrink-0 text-center group cursor-pointer" role="listitem" :title="p.Name"
                            @click="navigateToPerson(p.Id)">
                            <div class="w-full aspect-[2/3] rounded-xl overflow-hidden bg-surface-raised shadow-lg mb-2 group-hover:-translate-y-1 transition-transform duration-200">
                                <LazyImg :src="personImageUrl(p)" :alt="p.Name" item-type="person"
                                    class="w-full h-full object-cover object-top" />
                            </div>
                            <div class="font-medium text-text-primary truncate text-xs">{{ p.Name }}</div>
                            <div v-if="p.Role" class="text-text-subtle text-xs mt-0.5 truncate">{{ p.Role }}</div>
                        </div>
                    </MediaRail>
                </Section>

                <!-- Artist albums -->
                <Section v-if="artistAlbums.length" :title="t('library.music.albums')">
                    <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-4">
                        <li v-for="album in artistAlbums" :key="album.Id" class="cursor-pointer active:opacity-75" @click="goToItem(album.Id)">
                            <div class="aspect-square rounded-xl overflow-hidden bg-black/60 shadow-lg">
                                <LazyImg :src="getImageUrl(album.Id, 'Primary', 300, 300)" :alt="album.Name" item-type="MusicAlbum"
                                    class="w-full h-full object-cover" />
                            </div>
                            <div class="mt-1.5 text-xs font-medium text-text-heading truncate">{{ album.Name }}</div>
                            <div v-if="album.ProductionYear" class="text-[10.5px] text-text-muted">{{ album.ProductionYear }}</div>
                        </li>
                    </ul>
                </Section>

                <!-- Similar Items -->
                <Section v-if="similarItems.length" :title="t('detail.moreLikeThis')">
                    <MediaRail role="list">
                        <div v-for="sim in similarItems" :key="sim.Id"
                            class="w-32 shrink-0 sm:w-36 cursor-pointer group rounded-xl overflow-hidden bg-surface-raised border border-border-default hover:-translate-y-1 hover:border-border-hover transition-all duration-200 active:scale-[0.97] active:opacity-75"
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
                    {{ t('detail.bulkTitle', { name: bulkDownloadTarget === 'series' ? item?.Name : (item?.Type === 'Season' ? item?.Name : item?.SeasonName) }) }}
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
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useOfflineStore } from '@/store/offline-store';
import { useAudioPlayerStore, type AudioTrack } from '@/store/audio-player-store';
import { useDownloadStore } from '@/store/download-store';
import { useMetadataCacheStore } from '@/store/metadata-cache-store';
import {
    buildOfflineArtworkTargets,
    downloadService,
    type OfflineArtworkType,
} from '@/services/downloadService';
import { offlineDatabase } from '@/services/offlineDatabase';
import { localLibraryPage, type LocalQuery } from '@/utils/offlineLibrary';
import { offlineResumeSeconds } from '@/utils/watchProgress';
import LazyImg from '@/components/LazyImg.vue';
import { formatTicksDuration, formatTicksHuman, formatBytes } from '@/utils/helpers';
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
import { toAudioTrack } from '@/utils/audioTrack';
import { hdrLabel, heroImage, metaParts, nextEpisodeOf, resolutionLabel } from '@/utils/detailMeta';
import type { TranscodeOptions } from '@/store/download-store';

const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const audioPlayerStore = useAudioPlayerStore();
const downloadStore = useDownloadStore();
const metadataCache = useMetadataCacheStore();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

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
const item = ref<any | null>(null);
const seasons = ref<any[]>([]);
const episodes = ref<any[]>([]);
const audioTracks = ref<any[]>([]);
const artistAlbums = ref<any[]>([]);
const isMusicCollection = computed(() => {
    const type = item.value?.Type;
    if (type === 'MusicArtist') return artistAlbums.value.length > 0;
    return (type === 'MusicAlbum' || type === 'Playlist') && audioTracks.value.length > 0;
});
const similarItems = ref<any[]>([]);

const itemId = computed(() => route.params.id as string);
const accessToken = store.accessToken;

const showMediaInfo = ref(false);
const showBulkDialog = ref(false);
const bulkDownloadTarget = ref<'season' | 'series'>('season');
const showTranscodeDialog = ref(false);
const pendingTranscodeTarget = ref<{ itemId: string; metadata: any } | null>(null);
const pendingBulkTranscode = ref<any[] | null>(null);
// Items covered by the open dialog (single item or a bulk set) — drives the size estimate.
const transcodeItems = ref<any[]>([]);
// Whether the pending download's source needs conversion to play on this device.
const transcodeNeedsConversion = ref(false);
const playingSeasonId = ref<string | null>(null);
const watchingSeasonId = ref<string | null>(null);
const watchingEpId = ref<string | null>(null);
const togglingWatched = ref(false);
const offlineProgressSeconds = ref<number | null>(null);
const cachedArtworkUrls = ref<Record<string, string>>({});
/** Every downloaded album of an artist or the one album of a page, by year then name. */
const ALL_LOCAL: LocalQuery = {
    startIndex: 0, limit: 1000, sortBy: 'PremiereDate', sortOrder: 'Ascending',
    unplayedOnly: false, favoritesOnly: false, genres: [], nameStartsWith: '', seed: 1,
};

async function loadCachedArtwork(metadata: {
    Id?: string;
    Type?: string;
    SeriesId?: string;
    SeasonId?: string;
    People?: Array<{ Id?: string; PrimaryImageTag?: string }>;
}) {
    const targets = new Map<string, { itemId: string; imageType: OfflineArtworkType }>();
    for (const target of buildOfflineArtworkTargets(metadata)) {
        targets.set(`${target.itemId}:${target.imageType}`, target);
    }
    for (const child of [...seasons.value, ...episodes.value, ...artistAlbums.value]) {
        if (child.Id) {
            targets.set(`${child.Id}:Primary`, { itemId: child.Id, imageType: 'Primary' });
        }
    }

    const entries = await Promise.all(
        [...targets.values()].map(async ({ itemId: id, imageType }) => {
            const url = await downloadService.getCachedImageUrl(id, imageType);
            return url ? [`${id}:${imageType}`, url] as const : null;
        }),
    );
    const urls: Record<string, string> = {};
    for (const entry of entries) {
        if (entry) urls[entry[0]] = entry[1];
    }
    cachedArtworkUrls.value = urls;
}

function cachedArtworkUrl(id: string | undefined, imageType: OfflineArtworkType): string {
    return id ? cachedArtworkUrls.value[`${id}:${imageType}`] || '' : '';
}

async function load() {
    loading.value = true;
    error.value = null;
    seasons.value = [];
    episodes.value = [];
    seriesNextUp.value = null;
    audioTracks.value = [];
    artistAlbums.value = [];
    similarItems.value = [];
    offlineProgressSeconds.value = null;
    cachedArtworkUrls.value = {};

    try {
        const isOffline = !offlineStore.isFullyOnline;

        // ── Offline: downloaded episode/movie ────────────────────────────────
        const cached = offlineStore.getDownload(itemId.value);
        if (isOffline && cached) {
            item.value = cached.jellyfinItem;
            const progress = await offlineDatabase.getWatchProgress(itemId.value);
            // The most recent playback wins: this device offline, or another one before.
            offlineProgressSeconds.value = offlineResumeSeconds(cached.jellyfinItem, progress ?? undefined) ?? null;
            return;
        }

        // ── Offline: album or artist with downloaded tracks ──────────────────
        if (isOffline) {
            const tracks = offlineStore.downloads.filter((d) => d.type === 'Audio');
            const albumTracks = tracks.filter((d) => d.albumId === itemId.value);
            if (albumTracks.length) {
                const album = localLibraryPage(albumTracks, 'albums', 'music', ALL_LOCAL).items[0];
                item.value = metadataCache.get(itemId.value, true) ?? album;
                audioTracks.value = albumTracks.map((d) => d.jellyfinItem).sort((a, b) =>
                    (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) || (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0));
                return;
            }
            const artistTracks = tracks.filter((d) =>
                (d.jellyfinItem?.AlbumArtists ?? []).some((artist: any) => artist.Id === itemId.value));
            if (artistTracks.length) {
                const artist = artistTracks[0].jellyfinItem.AlbumArtists.find((a: any) => a.Id === itemId.value);
                item.value = metadataCache.get(itemId.value, true) ?? { Id: itemId.value, Name: artist?.Name ?? '', Type: 'MusicArtist' };
                artistAlbums.value = localLibraryPage(artistTracks, 'albums', 'music', ALL_LOCAL).items;
                return;
            }
        }

        // ── Offline: Series page (has downloaded episodes) ──────────────────
        if (isOffline) {
            const seriesGroup = offlineStore.tvShowsGrouped.find(
                (s: any) => s.seriesId === itemId.value
            );
            if (seriesGroup) {
                item.value = metadataCache.get(itemId.value, true) ?? {
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
                    item.value = metadataCache.get(itemId.value, true) ?? {
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
            [seasons.value, seriesNextUp.value] = await Promise.all([
                store.fetchSeasons(itemId.value),
                store.fetchNextUp(itemId.value).catch(() => null),
            ]);
        }
        if (data?.Type === 'Season') {
            episodes.value = await store.fetchEpisodes(itemId.value);
        }
        if (data?.Type === 'MusicAlbum') {
            audioTracks.value = await store.fetchAudioTracks(itemId.value);
        }
        if (data?.Type === 'Playlist') {
            audioTracks.value = await store.fetchPlaylistTracks(itemId.value);
        }
        if (data?.Type === 'MusicArtist') {
            artistAlbums.value = await store.fetchArtistAlbums(itemId.value);
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
            error.value = t('detail.loadError');
        }
    } finally {
        if (item.value) await loadCachedArtwork(item.value);
        loading.value = false;
    }
}

// ── Cast ────────────────────────────────────────────────────────────────────
const castState = ref<CastState>('NO_DEVICES_AVAILABLE');
let castStateListener: { remove: () => void } | null = null;
let castSessionListener: { remove: () => void } | null = null;

async function initCast() {
    const { isNative } = usePlatform();
    if (!isNative) return;
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

const isSquareArtwork = computed(() =>
    ['MusicAlbum', 'Audio', 'MusicArtist', 'Playlist'].includes(item.value?.Type));

const posterUrl = computed(() => {
    if (!item.value?.Id) return '';
    const cached = cachedArtworkUrl(item.value.Id, 'Primary');
    if (cached) return cached;
    if (!offlineStore.isFullyOnline) return '';
    if (isLandscapePoster.value) {
        return store.getImageUrl(item.value.Id, 'Primary', 960, 540) || '';
    }
    if (isSquareArtwork.value) {
        return store.getImageUrl(item.value.Id, 'Primary', 800, 800) || '';
    }
    return store.getImageUrl(item.value.Id, 'Primary', 300, 450) || '';
});

const backdropUrl = computed(() => {
    if (!item.value?.Id) return '';
    // Seasons and episodes borrow the series backdrop (a season poster upscaled looks pixelated).
    const hero = heroImage(item.value);
    const cached = cachedArtworkUrl(hero.itemId, 'Backdrop');
    if (cached) return cached;
    // Requesting a backdrop the item doesn't have 404s and shows the error
    // placeholder instead of falling back to the poster.
    if (hero.type !== 'Backdrop') return '';
    return offlineStore.isFullyOnline
        ? store.getImageUrl(hero.itemId, 'Backdrop', 1920, 1080) || ''
        : '';
});

// Cinematic hero image: prefer a wide backdrop, fall back to the poster so
// items without a backdrop (most albums) still render a header.
const heroImageUrl = computed(() => backdropUrl.value || posterUrl.value);

// Square cover art cropped to a 16:10 hero looks broken; show it whole over a
// blurred copy of itself instead.
const showCoverHero = computed(() => !backdropUrl.value && isSquareArtwork.value);

const resumePercent = computed(() => {
    const runtime = item.value?.RunTimeTicks;
    if (!runtime) return 0;
    let posTicks = item.value?.UserData?.PlaybackPositionTicks ?? 0;
    if (offlineProgressSeconds.value && offlineProgressSeconds.value > 0) {
        posTicks = Math.floor(offlineProgressSeconds.value * 10_000_000);
    }
    if (posTicks <= 0) return 0;
    return Math.min(100, (posTicks / runtime) * 100);
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

// Series: the server's next-up episode. Season: picked from the loaded episodes.
const seriesNextUp = ref<any | null>(null);
const nextEpisode = computed<any | null>(() => {
    if (item.value?.Type === 'Series') return seriesNextUp.value;
    if (item.value?.Type === 'Season') return nextEpisodeOf(episodes.value);
    return null;
});
const nextEpisodeLabel = computed(() => {
    const ep = nextEpisode.value;
    if (!ep) return '';
    const code = `S${ep.ParentIndexNumber ?? item.value?.IndexNumber ?? 1}E${ep.IndexNumber ?? 1}`;
    return (ep.UserData?.PlaybackPositionTicks ?? 0) > 0
        ? t('detail.resumeEpisode', { code })
        : t('detail.playEpisode', { code });
});

function playNextEpisode() {
    const ep = nextEpisode.value;
    if (!ep) return;
    const ticks = ep.UserData?.PlaybackPositionTicks;
    const sorted = [...episodes.value].sort((a, b) => (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0));
    const following = sorted[sorted.findIndex((e) => e.Id === ep.Id) + 1];
    router.push({
        name: 'Player',
        params: { id: ep.Id },
        query: {
            ...(ticks ? { startTicks: String(ticks) } : {}),
            ...(following ? { nextEpisodeId: following.Id } : {}),
        },
    });
}

const heroMeta = computed(() => (item.value ? metaParts(item.value, t, episodes.value.length || undefined) : []));
const genres = computed<string[]>(() => item.value?.Genres || []);

type Person = { Id?: string; Name: string; Role?: string; Type?: string; PrimaryImageTag?: string };
const people = computed<Person[]>(() => item.value?.People || []);
const directorNames = computed(() => people.value.filter(p => p.Type === 'Director').map(p => p.Name));
const cast = computed<Person[]>(() => people.value.filter(p => p.Type === 'Actor'));
const studioNames = computed(() => (item.value?.Studios || []).map((s: any) => s.Name).filter(Boolean));

function personImageUrl(p: Person) {
    if (!p?.Id || !p.PrimaryImageTag) return '';
    const cached = cachedArtworkUrl(p.Id, 'Primary');
    if (cached) return cached;
    return offlineStore.isFullyOnline
        ? store.getImageUrl(p.Id, 'Primary', 220) || ''
        : '';
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

/** Toggle the Played flag on the server and mirror the change on the local object. */
async function togglePlayedState(target: any) {
    if (target.UserData?.Played) {
        await store.markUnplayed(target.Id);
        if (target.UserData) target.UserData.Played = false;
    } else {
        await store.markPlayed(target.Id);
        if (!target.UserData) target.UserData = {};
        target.UserData.Played = true;
    }
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

async function toggleWatchedSeason(season: any) {
    if (watchingSeasonId.value) return;
    watchingSeasonId.value = season.Id;
    try {
        await togglePlayedState(season);
    } finally {
        watchingSeasonId.value = null;
    }
}

async function toggleWatchedEpisode(ep: any) {
    if (watchingEpId.value) return;
    watchingEpId.value = ep.Id;
    try {
        await togglePlayedState(ep);
    } finally {
        watchingEpId.value = null;
    }
}

function getImageUrl(id: string, type: string, w: number, h: number) {
    const offlineType = type === 'Backdrop' ? 'Backdrop' : 'Primary';
    const cached = cachedArtworkUrl(id, offlineType);
    if (cached) return cached;
    return offlineStore.isFullyOnline
        ? store.getImageUrl(id, type, w, h) || ''
        : '';
}

function itemToAudioTrack(raw: any): AudioTrack {
    return toAudioTrack(raw, item.value?.Name || '');
}

/** Album / playlist tracks, or every track of an artist (fetched on demand). */
async function collectionTracks(): Promise<AudioTrack[]> {
    if (item.value?.Type === 'MusicArtist' && !audioTracks.value.length) {
        audioTracks.value = await store.fetchArtistTracks(item.value.Id);
    }
    return audioTracks.value.map(itemToAudioTrack);
}

function playTrack(_trackId: string, index: number) {
    const tracks = audioTracks.value.map(itemToAudioTrack);
    audioPlayerStore.playAlbum(tracks, index);
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

function queueTrack(track: any, where: 'next' | 'end') {
    enqueue([itemToAudioTrack(track)], where);
}

async function queueAlbum(where: 'next' | 'end') {
    enqueue(await collectionTracks(), where);
}

const mediaStreams = computed<any[]>(() => item.value?.MediaStreams ?? []);
const videoStreams = computed(() => mediaStreams.value.filter(s => s.Type === 'Video'));
const primaryVideo = computed(() => videoStreams.value[0] || null);

/** Badges after the hero meta line: resolution class, HDR format, codec. */
const videoBadges = computed(() => {
    const v = primaryVideo.value;
    const codec = v?.Codec ? String(v.Codec).toUpperCase() : null;
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
        ['codec', v.Codec?.toUpperCase()],
        ['profile', v.Profile],
        ['level', v.Level],
        ['resolution', v.Width && v.Height ? `${v.Width} × ${v.Height}` : null],
        ['aspectRatio', v.AspectRatio],
        ['avgFrameRate', v.AverageFrameRate],
        ['realFrameRate', v.RealFrameRate],
        ['videoBitrate', v.BitRate],
        ['bitDepth', v.BitDepth],
        ['refFrames', v.RefFrames],
        ['interlaced', v.IsInterlaced],
        ['avc', v.IsAVC],
        ['pixelFormat', v.PixelFormat],
        ['colorSpace', v.ColorSpace],
        ['colorTransfer', v.ColorTransfer],
        ['colorPrimaries', v.ColorPrimaries],
        ['videoRange', v.VideoRange],
        ['hdrType', v.VideoRangeType],
        ['doviProfile', v.DvProfile],
        ['doviLevel', v.DvLevel],
        ['doviVersion', v.DvVersionMajor != null ? `${v.DvVersionMajor}.${v.DvVersionMinor ?? 0}` : null],
        ['timeBase', v.TimeBase],
        ['index', v.Index],
    ]);
});

const mediaSources = computed<any[]>(() => item.value?.MediaSources ?? []);
const firstSource = computed(() => mediaSources.value[0] || null);

const sourceDetails = computed<InfoRow[]>(() => {
    const src = firstSource.value;
    if (!src) return [];
    return infoRows([
        ['container', src.Container],
        ['totalBitrate', src.Bitrate],
        ['path', src.Path],
        ['directPlay', src.SupportsDirectPlay],
        ['remux', src.SupportsDirectStream],
        ['transcode', src.SupportsTranscoding],
    ]);
});

const fileSizeHuman = computed(() => {
    const size = firstSource.value?.Size as number | undefined;
    return formatBytes(size);
});

function canDownload(it: any): boolean {
    return it && ['Movie', 'Episode', 'Video', 'Audio', 'MusicAlbum'].includes(it.Type);
}

// Jellyfin can't serve an album as one file: an album download is its tracks.
const downloadIds = computed<string[]>(() =>
    item.value?.Type === 'MusicAlbum' ? audioTracks.value.map((track) => track.Id) : [itemId.value]);

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
function hasVideoStream(metadata: any): boolean {
    const streams = metadata?.MediaStreams ?? metadata?.MediaSources?.[0]?.MediaStreams ?? [];
    return streams.some((s: any) => s.Type === 'Video');
}

/**
 * Open the download options dialog (quality, tracks, size) for a video item.
 * Audio-only items skip the dialog and download directly.
 */
async function requestDownload(id: string, metadata: any, failMessage: string) {
    if (!hasVideoStream(metadata)) {
        downloadStore.startDownload(id, metadata).catch((error: any) => {
            if (error.name !== 'AbortError') showError(failMessage);
        });
        return;
    }
    pendingTranscodeTarget.value = { itemId: id, metadata };
    pendingBulkTranscode.value = null;
    transcodeItems.value = [metadata];
    transcodeNeedsConversion.value = await downloadStore.checkNeedsTranscode(metadata);
    showTranscodeDialog.value = true;
}

async function handleDownload() {
    if (!item.value) return;
    if (item.value.Type === 'MusicAlbum') {
        for (const track of audioTracks.value) {
            if (offlineStore.isItemDownloaded(track.Id)) continue;
            await requestDownload(track.Id, track, t('detail.downloadEpisodeFailed', { name: track.Name }));
        }
        return;
    }
    await requestDownload(itemId.value, item.value, t('detail.downloadFailed'));
}

async function handleEpisodeDownload(ep: any) {
    await requestDownload(ep.Id, ep, t('detail.downloadEpisodeFailed', { name: ep.Name }));
}

/**
 * Launch the download(s) that were waiting on the transcode dialog.
 * Called with options when the user confirms a transcode, without options
 * when they choose to keep the original quality.
 */
function startPendingDownloads(options?: TranscodeOptions) {
    if (pendingBulkTranscode.value) {
        for (const ep of pendingBulkTranscode.value) {
            downloadStore.startDownload(ep.Id, ep, options).catch((err: any) => {
                if (err?.name !== 'AbortError') showError(t('detail.downloadEpisodeFailed', { name: ep.Name }));
            });
        }
        pendingBulkTranscode.value = null;
    } else if (pendingTranscodeTarget.value) {
        const { itemId: id, metadata } = pendingTranscodeTarget.value;
        downloadStore.startDownload(id, metadata, options).catch((error: any) => {
            if (error.name !== 'AbortError') showError(t('detail.downloadFailed'));
        });
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
    if (!confirm(t('detail.confirmDelete', { name: item.value.Name }))) return;
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

async function startBulkDownload(mode: 'all' | 'unwatched') {
    showBulkDialog.value = false;
    if (!item.value) return;

    let candidates: any[] = [];

    if (bulkDownloadTarget.value === 'season') {
        candidates = [...episodes.value];
    } else {
        try {
            candidates = await store.fetchAllSeriesEpisodes(item.value.Id);
        } catch (e) {
            logger.error('[BulkDownload] Failed to fetch series episodes:', e);
            return;
        }
    }

    if (mode === 'unwatched') {
        candidates = candidates.filter(ep => !ep.UserData?.Played);
    }
    candidates = candidates.filter(ep => !offlineStore.isItemDownloaded(ep.Id));
    if (candidates.length === 0) return;

    logger.log(`[BulkDownload] Queueing ${candidates.length} episodes (mode: ${mode})`);

    // Open the options dialog once — quality and track choice apply to every episode,
    // and the size estimate covers the whole batch. Compatibility is checked on the
    // first episode with stream info as a representative sample.
    const firstWithStreams = candidates.find(ep => ep.MediaStreams?.length > 0) || candidates[0];
    pendingTranscodeTarget.value = { itemId: firstWithStreams.Id, metadata: firstWithStreams };
    pendingBulkTranscode.value = candidates;
    transcodeItems.value = candidates;
    transcodeNeedsConversion.value = await downloadStore.checkNeedsTranscode(firstWithStreams);
    showTranscodeDialog.value = true;
}
</script>
