import type { QualityPreset } from '@/types/player';

/**
 * Quality presets shared by the streaming player and the download dialog.
 * `bitrate` is the max streaming bitrate in bps (0 = Auto / source resolution);
 * `minHeight` is the source height at or above which the preset is offered.
 */
export const QUALITY_PRESETS: QualityPreset[] = [
    { label: 'Auto',   bitrate: 0,          minHeight: 0    },
    { label: '4K',     bitrate: 80_000_000, minHeight: 2160 },
    { label: '1080p',  bitrate: 20_000_000, minHeight: 1080 },
    { label: '720p',   bitrate:  8_000_000, minHeight: 720  },
    { label: '480p',   bitrate:  3_000_000, minHeight: 480  },
    { label: '360p',   bitrate:  1_500_000, minHeight: 360  },
];
