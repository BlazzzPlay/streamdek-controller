import { action, KeyDownEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { BaseAction, BaseSettings } from "./base-action";

type TrackSettings = BaseSettings & {
	videoId: string;
	forcePlay: boolean;
};

@action({ UUID: "jp.hayate-kojima.ytm-desktop-controller.add-track-to-queue" })
export class AddTrackToQueueAction extends BaseAction<TrackSettings> {
	override async onKeyDown(ev: KeyDownEvent<TrackSettings>): Promise<void> {
		console.log("Button pressed. Adding track to queue...");
		try {
			// 設定読み込み
			const settings = ev.payload.settings;
			const port = this.getPort(settings);
			const videoId = settings.videoId;
			const forcePlay = !!settings.forcePlay;

			if (!videoId) {
				console.warn("Video ID is not configured.");
				return;
			}
			
			const queueData = await this.get(port, "/queue");
			const isQueueBlank = queueData && Array.isArray(queueData.items) ? queueData.items.length === 0 : true;

			if (forcePlay) {
				// 現在のキューをクリアしてから追加する
				await this.delete(port, "/queue");
			}

			try {
				await this.post(port, "/queue", { videoId: videoId });
			} catch (reqError) {
				// BaseActionでログが出力されるため、ここでは何もしない
			}

			await new Promise((r) => setTimeout(r, 1000));

			if (forcePlay) {
				// DELETEで待機列はクリアしたが、再生中/一時停止中の「現在曲」は
				// そのまま残る(DELETEは再生を止めない)。そのため /next で
				// 追加した曲へ明示的に進めないと現在曲が切り替わらない。
				await this.post(port, "/next");
				await this.post(port, "/play");
			}
			else if (isQueueBlank) {
				await this.post(port, "/play");
			}

		} catch (error) {
			console.error("Error adding track to queue:", error);
		}
	}
}
