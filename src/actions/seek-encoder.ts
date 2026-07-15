import {
	action,
	DialAction,
	DialDownEvent,
	DialRotateEvent,
	DidReceiveGlobalSettingsEvent,
	SingletonAction,
	streamDeck,
	WillAppearEvent
} from "@elgato/streamdeck";
import { getPort, httpGet, httpPost } from "./http-client";

type SeekEncoderSettings = {
	port?: string;
};

/**
 * Seek encoder action for Stream Deck Plus.
 *
 * Rotate CW/CCW: seek by ±5 seconds per tick, clamped 0..track duration.
 * Press: toggle play/pause.
 * Touch strip ($B1): bar indicator (0–100) with mm:ss title.
 */
@action({ UUID: "com.blazzzplay.streamdek-controller.seek-encoder" })
export class SeekEncoderAction extends SingletonAction<SeekEncoderSettings> {
	private globalSettings: { port?: string } = {};

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
				await ev.action.setFeedback({
					value: 0,
					title: "⚠ Offline"
				});
				return;
			}

			const duration = Number(songData.songDuration) || 0;

			// No track loaded: no-op
			if (duration === 0) {
				await ev.action.setFeedback({ value: 0, title: "0:00" });
				return;
			}

			const current = Number(songData.elapsedSeconds) || 0;
			const target = Math.max(
				0,
				Math.min(duration, current + delta)
			);

			await httpPost(port, "/seek-to", { seconds: target });

			const percentage = Math.round((target / duration) * 100);
			const title = formatTime(target);

			await ev.action.setFeedback({ value: percentage, title });
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
}

/** Format seconds as mm:ss (e.g. 65 → "1:05"). */
function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}
