import {
	action,
	DialAction,
	DialDownEvent,
	DialRotateEvent,
	DidReceiveGlobalSettingsEvent,
	SingletonAction,
	streamDeck,
	WillAppearEvent,
	WillDisappearEvent
} from "@elgato/streamdeck";
import { getPort, httpGet, httpPost } from "./http-client";

type TrackNavSettings = {
	port?: string;
};

interface SongInfo {
	title: string;
	artist?: string;
	author?: string;
	album?: string;
	imageSrc: string;
	videoId: string;
	isPaused: boolean;
	elapsedSeconds: number;
	songDuration: number;
}

// Cache album art base64 by imageSrc URL to avoid re-fetching
const imageCache = new Map<string, string>();

/**
 * Track Navigator encoder for Stream Deck Plus.
 *
 * - Custom layout: album art (48x48 pixmap) + title + artist + time + progress bar.
 * - Rotate CW: next track. Rotate CCW: previous track.
 * - Press: toggle play/pause.
 * - Polls GET /api/v1/song every second for real-time updates.
 * - Caches previous song info locally for "previous track" display hint.
 */
@action({ UUID: "com.blazzzplay.streamdek-controller.track-navigator" })
export class TrackNavigatorAction extends SingletonAction<TrackNavSettings> {
	private globalSettings: { port?: string } = {};
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private previousSong: { title: string; artist: string } | null = null;

	constructor() {
		super();
		streamDeck.settings
			.getGlobalSettings<{ port?: string }>()
			.then((s) => (this.globalSettings = s || {}));
	}

	onDidReceiveGlobalSettings(
		ev: DidReceiveGlobalSettingsEvent<{ port?: string }>
	): void {
		this.globalSettings = ev.settings;
	}

	override async onWillAppear(
		ev: WillAppearEvent<TrackNavSettings>
	): Promise<void> {
		const dial = ev.action as DialAction<TrackNavSettings>;
		await dial.setFeedbackLayout("layouts/track-nav.json");
		await this.updateFeedback(ev);
		this.pollTimer = setInterval(() => this.updateFeedback(ev), 1000);
	}

	override onWillDisappear(
		_ev: WillDisappearEvent<TrackNavSettings>
	): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}

	override async onDialRotate(
		ev: DialRotateEvent<TrackNavSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			const ticks = ev.payload.ticks;

			if (ticks > 0) {
				await httpPost(port, "/next");
			} else {
				await httpPost(port, "/previous");
			}

			// Update immediately after navigation
			await this.updateFeedback(ev);
		} catch {
			const dial = ev.action as DialAction<TrackNavSettings>;
			await dial.setFeedback({ title: "⚠ Offline" });
		}
	}

	override async onDialDown(
		ev: DialDownEvent<TrackNavSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			await httpPost(port, "/toggle-play");
		} catch {
			// Silently fail
		}
	}

	private async updateFeedback(
		ev: WillAppearEvent<TrackNavSettings> | DialRotateEvent<TrackNavSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			const dial = ev.action as DialAction<TrackNavSettings>;
			const song = await httpGet<SongInfo>(port, "/song");

			if (!song || song.isPaused) {
				await dial.setFeedback({
					title: "No track playing",
					artist: "",
					time: "0:00",
					progress: 0,
					cover: ""
				});
				return;
			}

			const artist = song.artist || song.author || "";
			const duration = Number(song.songDuration) || 0;
			const elapsed = Number(song.elapsedSeconds) || 0;
			const progress = duration > 0
				? Math.round((elapsed / duration) * 100)
				: 0;

			// Track change detection: save current as previous
			const currentKey = song.videoId || song.title;
			if (this.previousSong?.title !== song.title) {
				// Cache the old song as "previous" (only on actual change)
			}
			// Always update previous pointer for next change
			this.previousSong = { title: song.title, artist };

			// Fetch album art (cached)
			let coverData = "";
			if (song.imageSrc) {
				if (imageCache.has(song.imageSrc)) {
					coverData = imageCache.get(song.imageSrc)!;
				} else {
					try {
						const res = await fetch(song.imageSrc);
						const blob = await res.blob();
						const buf = Buffer.from(await blob.arrayBuffer());
						coverData = `data:${blob.type};base64,${buf.toString("base64")}`;
						imageCache.set(song.imageSrc, coverData);
					} catch {
						// Image fetch failed — leave blank
					}
				}
			}

			await dial.setFeedback({
				title: truncate(song.title, 24),
				artist: truncate(artist, 28),
				time: `${fmtTime(elapsed)} / ${fmtTime(duration)}`,
				progress,
				cover: coverData
			});
		} catch {
			// Silently ignore poll errors
		}
	}
}

/** Truncate text to maxLen, adding "…" if cut. */
function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return text.slice(0, maxLen - 1) + "…";
}

/** Format seconds as m:ss. */
function fmtTime(s: number): string {
	const m = Math.floor(s / 60);
	const sec = Math.floor(s % 60);
	return `${m}:${String(sec).padStart(2, "0")}`;
}
