import { action, KeyDownEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import YouTubeMusic from "youtube-music-ts-api";
import { BaseAction, BaseSettings } from "./base-action";

type PlaylistSettings = BaseSettings & {
	playlistId: string;
	forcePlay: boolean;
	showArtwork: boolean;
	shuffle: boolean;
};

@action({ UUID: "com.blazzzplay.streamdek-controller.add-playlist-to-queue" })
export class AddPlaylistToQueueAction extends BaseAction<PlaylistSettings> {
	override async onKeyDown(ev: KeyDownEvent<PlaylistSettings>): Promise<void> {
		console.log("Button pressed. Fetching playlist...");
		try {
			// 設定読み込み
			const settings = ev.payload.settings;
			const port = this.getPort(settings);
			const playlistId = settings.playlistId;
			const forcePlay = !!settings.forcePlay;
			const shuffle = settings.shuffle;

			if (!playlistId) {
				console.warn("Playlist ID is not configured.");
				return;
			}

			const ytm = new YouTubeMusic();
			// ゲストモードでアクセス
			const guest = await ytm.guest();

			
			const queueData = await this.get(port, "/queue");
			const isQueueBlank = queueData && Array.isArray(queueData.items) ? queueData.items.length === 0 : true;

			// YouTube Musicのプレイリスト情報を取得
			const playlist = await guest.getPlaylist(playlistId);

			if (!playlist || !playlist.tracks) {
				return;
			}

			// トラックをシャッフル
			let shuffledTracks = playlist.tracks;
			if (shuffle) {
				shuffledTracks = this.shuffleArray(playlist.tracks);
			}

			// プレイリストの取得に成功してから、forcePlay時のみキューをクリアする
			// (取得失敗時に既存キューを消してしまわないよう、この順序にしている)
			if (forcePlay) {
				await this.delete(port, "/queue");
			}

			// 順番にリクエストを送信
			for (const track of shuffledTracks) {
				if (!track.id) continue;

				try {
					await this.post(port, "/queue", { videoId: track.id });
				} catch (reqError) {
					// BaseActionでログが出力されるため、ここでは何もしない
				}
			}

			await new Promise((r) => setTimeout(r, 1000));

			if (forcePlay) {
				// DELETEで待機列はクリアしたが、再生中/一時停止中の「現在曲」は
				// そのまま残る(DELETEは再生を止めない)。そのため /next で
				// 追加した先頭トラックへ明示的に進めないと現在曲が切り替わらない。
				await this.post(port, "/next");
				await this.post(port, "/play");
			}
			else if (isQueueBlank) {
				await this.post(port, "/play");
			}

		} catch (error) {
			console.error("Error fetching playlist:", error);
		}
	}

	private shuffleArray<T>(array: T[]): T[] {
		const newArray = [...array];
		for (let i = newArray.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[newArray[i], newArray[j]] = [newArray[j], newArray[i]];
		}
		return newArray;
	}
}
