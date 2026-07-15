import { action, KeyDownEvent } from "@elgato/streamdeck";
import { BaseAction, BaseSettings } from "./base-action";

type VolumeSettings = BaseSettings & {
	volume: number;
};

@action({ UUID: "com.blazzzplay.streamdek-controller.set-volume" })
export class SetVolumeAction extends BaseAction<VolumeSettings> {
	override async onKeyDown(ev: KeyDownEvent<VolumeSettings>): Promise<void> {
		try {
			const port = this.getPort(ev.payload.settings);

			// PIからは文字列で来ることがあるため数値化する
			let volume = Number(ev.payload.settings.volume);
			if (!Number.isFinite(volume)) {
				console.warn("[SetVolumeAction] Volume is not configured.");
				return;
			}

			// 本家(pear-desktop)が5刻みのため、5の倍数にスナップしてから0〜100にクランプする。
			// (GET /volume は不安定なため参照せず、指定値をそのまま設定する)
			volume = Math.max(0, Math.min(100, Math.round(volume / 5) * 5));

			await this.post(port, "/volume", { volume });
		} catch (error) {
			console.error("[SetVolumeAction] Error:", error);
		}
	}
}
