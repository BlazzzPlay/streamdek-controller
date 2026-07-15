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

type SeekEncoderSettings = {
	port?: string;
};

/**
 * Seek encoder for Stream Deck Plus.
 * - Polls GET /api/v1/song every second for real-time position.
 * - Rotate: ±5s per tick, shows "+5s" / "-10s" briefly, then settles on current time.
 * - Press: toggle play/pause.
 * - Touch strip ($B1): bar 0–100 + mm:ss title, updates continuously.
 */
@action({ UUID: "com.blazzzplay.streamdek-controller.seek-encoder" })
export class SeekEncoderAction extends SingletonAction<SeekEncoderSettings> {
	private globalSettings: { port?: string } = {};
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private lastActionId = "";

	constructor() {
		super();
		streamDeck.settings
			.getGlobalSettings<{ port?: string }>()
			.then((settings) => (this.globalSettings = settings || {}));
	}

	onDidReceiveGlobalSettings(
		ev: DidReceiveGlobalSettingsEvent<{ port?: string }>
	): void {
		this.globalSettings = ev.settings;
	}

	override async onWillAppear(
		ev: WillAppearEvent<SeekEncoderSettings>
	): Promise<void> {
		const dial = ev.action as DialAction<SeekEncoderSettings>;
		await dial.setFeedbackLayout("$B1");
		this.lastActionId = ev.action.id;

		// Read current state immediately
		await this.updateFeedback(ev);

		// Poll every second for real-time position updates
		this.pollTimer = setInterval(() => this.updateFeedback(ev), 1000);
	}

	override onWillDisappear(
		_ev: WillDisappearEvent<SeekEncoderSettings>
	): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}

	override async onDialRotate(
		ev: DialRotateEvent<SeekEncoderSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			const ticks = ev.payload.ticks;
			const delta = ticks * 5;

			const songData = await httpGet<{
				elapsedSeconds: number;
				songDuration: number;
			}>(port, "/song");

			if (songData === null) {
				await ev.action.setFeedback({ value: 0, title: "⚠ Offline" });
				return;
			}

			const duration = Number(songData.songDuration) || 0;
			if (duration === 0) {
				await ev.action.setFeedback({ value: 0, title: "0:00" });
				return;
			}

			const current = Number(songData.elapsedSeconds) || 0;
			const target = Math.max(0, Math.min(duration, current + delta));

			await httpPost(port, "/seek-to", { seconds: target });

			// Show delta briefly (e.g. "+10s" or "-5s")
			const deltaLabel = delta >= 0 ? `+${delta}s` : `${delta}s`;
			const percentage = Math.round((target / duration) * 100);
			await ev.action.setFeedback({ value: percentage, title: deltaLabel });

			// After a short delay, show the actual position (poll will take over)
			setTimeout(() => this.updateFeedback(ev), 800);
		} catch {
			await ev.action.setFeedback({ value: 0, title: "⚠ Offline" });
		}
	}

	override async onDialDown(
		ev: DialDownEvent<SeekEncoderSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			await httpPost(port, "/toggle-play");
		} catch {
			await ev.action.setFeedback({ value: 0, title: "⚠ Offline" });
		}
	}

	/** Fetch current song position from API and update the touch strip. */
	private async updateFeedback(
		ev: WillAppearEvent<SeekEncoderSettings> | DialRotateEvent<SeekEncoderSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			const songData = await httpGet<{
				elapsedSeconds: number;
				songDuration: number;
			}>(port, "/song");
			const dial = ev.action as DialAction<SeekEncoderSettings>;

			if (songData === null) {
				await dial.setFeedback({ value: 0, title: "⚠ Offline" });
				return;
			}

			const duration = Number(songData.songDuration) || 0;
			const elapsed = Number(songData.elapsedSeconds) || 0;

			if (duration === 0) {
				await dial.setFeedback({ value: 0, title: "0:00" });
				return;
			}

			const percentage = Math.round((elapsed / duration) * 100);
			const title = `${formatTime(elapsed)} / ${formatTime(duration)}`;

			await dial.setFeedback({ value: percentage, title });
		} catch {
			// Silently ignore poll errors
		}
	}
}

/** Format seconds as m:ss (e.g. 65 → "1:05"). */
function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}
