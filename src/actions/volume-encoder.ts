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

type VolumeEncoderSettings = {
	port?: string;
};

/**
 * Volume encoder for Stream Deck Plus.
 * - Polls GET /api/v1/volume every second for real-time state.
 * - Rotate: ±2 per tick, clamped 0–100, reads current volume from API before applying delta.
 * - Press: toggle mute, reading current state from API (no local drift).
 * - Touch strip ($B1): bar 0–100 + "Vol: 75" or "Muted".
 */
@action({ UUID: "com.blazzzplay.streamdek-controller.volume-encoder" })
export class VolumeEncoderAction extends SingletonAction<VolumeEncoderSettings> {
	private globalSettings: { port?: string } = {};
	private pollTimer: ReturnType<typeof setInterval> | null = null;

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
		ev: WillAppearEvent<VolumeEncoderSettings>
	): Promise<void> {
		const dial = ev.action as DialAction<VolumeEncoderSettings>;
		await dial.setFeedbackLayout("$B1");

		// Read current state immediately
		await this.updateFeedback(ev);

		// Poll every second to keep touch strip in sync
		this.pollTimer = setInterval(() => this.updateFeedback(ev), 1000);
	}

	override onWillDisappear(
		_ev: WillDisappearEvent<VolumeEncoderSettings>
	): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}

	override async onDialRotate(
		ev: DialRotateEvent<VolumeEncoderSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			const ticks = ev.payload.ticks;
			const delta = ticks * 2;

			// Always read current volume from API — no local state drift
			const volData = await httpGet<{ state: number; isMuted: boolean }>(
				port,
				"/volume"
			);

			if (volData === null) {
				await ev.action.setFeedback({ value: 0, title: "⚠ Offline" });
				return;
			}

			const current = volData.state;
			const isMuted = volData.isMuted;

			if (isMuted && delta > 0) {
				// CW while muted: unmute at current level + delta
				const target = Math.max(1, Math.min(100, current + delta));
				await httpPost(port, "/volume", { volume: target });
				await ev.action.setFeedback({
					value: target,
					title: `Vol: ${target}`
				});
				return;
			}

			if (isMuted) {
				// CCW while muted: stay muted, adjust hidden volume
				const target = Math.max(0, Math.min(100, current + delta));
				await httpPost(port, "/volume", { volume: target });
				await ev.action.setFeedback({ value: target, title: "Muted" });
				return;
			}

			// Normal rotation
			const target = Math.max(0, Math.min(100, current + delta));
			await httpPost(port, "/volume", { volume: target });
			await ev.action.setFeedback({
				value: target,
				title: target > 0 ? `Vol: ${target}` : "Muted"
			});
		} catch {
			await ev.action.setFeedback({ value: 0, title: "⚠ Offline" });
		}
	}

	override async onDialDown(
		ev: DialDownEvent<VolumeEncoderSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			await httpPost(port, "/toggle-mute");
			// Poll will update the display on next tick
		} catch {
			await ev.action.setFeedback({ value: 0, title: "⚠ Offline" });
		}
	}

	/** Fetch current volume from API and update the touch strip. */
	private async updateFeedback(
		ev: WillAppearEvent<VolumeEncoderSettings> | DialRotateEvent<VolumeEncoderSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			const volData = await httpGet<{ state: number; isMuted: boolean }>(
				port,
				"/volume"
			);
			const dial = ev.action as DialAction<VolumeEncoderSettings>;

			if (volData === null) {
				await dial.setFeedback({ value: 0, title: "⚠ Offline" });
				return;
			}

			if (volData.isMuted) {
				await dial.setFeedback({ value: volData.state, title: "Muted" });
			} else {
				await dial.setFeedback({
					value: volData.state,
					title: `Vol: ${volData.state}`
				});
			}
		} catch {
			// Silently ignore poll errors
		}
	}
}
