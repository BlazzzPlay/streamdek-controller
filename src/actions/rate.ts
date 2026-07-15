import { action, KeyDownEvent } from "@elgato/streamdeck";
import { BaseAction, BaseSettings } from "./base-action";

@action({ UUID: "com.blazzzplay.streamdek-controller.like" })
export class LikeAction extends BaseAction<BaseSettings> {
	override async onKeyDown(ev: KeyDownEvent<BaseSettings>): Promise<void> {
		try {
			const port = this.getPort(ev.payload.settings);
			console.log(`[LikeAction] Sending Like request to port ${port}`);
			await this.post(port, "/like");
		} catch (error) {
			console.error("[LikeAction] Error:", error);
		}
	}
}

@action({ UUID: "com.blazzzplay.streamdek-controller.dislike" })
export class DislikeAction extends BaseAction<BaseSettings> {
	override async onKeyDown(ev: KeyDownEvent<BaseSettings>): Promise<void> {
		try {
			const port = this.getPort(ev.payload.settings);
			console.log(`[DislikeAction] Sending Dislike request to port ${port}`);
			await this.post(port, "/dislike");
		} catch (error) {
			console.error("[DislikeAction] Error:", error);
		}
	}
}
