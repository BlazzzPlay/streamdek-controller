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

type VolumeEncoderSettings = {
	port?: string;
};

/**
 * Volume encoder action for Stream Deck Plus.
 *
 * Rotate CW/CCW: adjust volume by ±2 per tick, clamped 0–100.
 * Press: toggle mute/unmute.
 * Touch strip ($B1): bar indicator (0–100) with numeric title or "Muted".
 */
@action({ UUID: "com.blazzzplay.streamdek-controller.volume-encoder" })
export class VolumeEncoderAction extends SingletonAction<VolumeEncoderSettings> {
	private globalSettings: { port?: string } = {};
	private isMuted = false;
	private previousVolume = 50;

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
	}

	override async onDialRotate(
		ev: DialRotateEvent<VolumeEncoderSettings>
	): Promise<void> {
		try {
			const port = getPort(ev.payload.settings, this.globalSettings);
			const ticks = ev.payload.ticks;
			const delta = ticks * 2;

			if (this.isMuted) {
				if (delta > 0) {
					// CW rotation while muted: unmute at previous volume (no delta)
					this.isMuted = false;
					await httpPost(port, "/volume", {
						volume: this.previousVolume
					});
					await ev.action.setFeedback({
						value: this.previousVolume,
						title: String(this.previousVolume)
					});
				} else {
					// CCW rotation while muted: adjust stored volume, stay muted
					const target = Math.max(
						0,
						Math.min(100, this.previousVolume + delta)
					);
					if (target > 0) {
						this.previousVolume = target;
					}
					await httpPost(port, "/volume", { volume: target });
					await ev.action.setFeedback({
						value: target,
						title: "Muted"
					});
				}
				return;
			}

			// Normal (unmuted) rotation: read current volume, apply delta
			const volumeData = await httpGet<{ volume: number }>(
				port,
				"/volume"
			);
			if (volumeData === null) {
				await ev.action.setFeedback({
					value: 0,
					title: "⚠ Offline"
				});
				return;
			}

			const current = volumeData.volume;
			const target = Math.max(0, Math.min(100, current + delta));
			await httpPost(port, "/volume", { volume: target });

			if (target > 0) {
				this.previousVolume = target;
			}

			await ev.action.setFeedback({
				value: target,
				title: String(target)
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

			if (this.isMuted) {
				// Unmute: restore previous volume
				this.isMuted = false;
				await httpPost(port, "/volume", {
					volume: this.previousVolume
				});
				await ev.action.setFeedback({
					value: this.previousVolume,
					title: String(this.previousVolume)
				});
			} else {
				// Mute
				this.isMuted = true;
				await httpPost(port, "/volume", { volume: 0 });
				await ev.action.setFeedback({ value: 0, title: "Muted" });
			}
		} catch {
			await ev.action.setFeedback({ value: 0, title: "⚠ Offline" });
		}
	}
}
