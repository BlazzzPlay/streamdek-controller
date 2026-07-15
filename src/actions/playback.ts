import { action, KeyDownEvent } from "@elgato/streamdeck";
import { BaseAction, BaseSettings } from "./base-action";

@action({ UUID: "com.blazzzplay.streamdek-controller.toggle-play" })
export class TogglePlayAction extends BaseAction<BaseSettings> {
	override async onKeyDown(ev: KeyDownEvent<BaseSettings>): Promise<void> {
		try {
			const port = this.getPort(ev.payload.settings);
			await this.post(port, "/toggle-play");
		} catch (error) {
			console.error("[TogglePlayAction] Error:", error);
		}
	}
}

@action({ UUID: "com.blazzzplay.streamdek-controller.next" })
export class NextAction extends BaseAction<BaseSettings> {
	override async onKeyDown(ev: KeyDownEvent<BaseSettings>): Promise<void> {
		try {
			const port = this.getPort(ev.payload.settings);
			await this.post(port, "/next");
		} catch (error) {
			console.error("[NextAction] Error:", error);
		}
	}
}

@action({ UUID: "com.blazzzplay.streamdek-controller.previous" })
export class PreviousAction extends BaseAction<BaseSettings> {
	override async onKeyDown(ev: KeyDownEvent<BaseSettings>): Promise<void> {
		try {
			const port = this.getPort(ev.payload.settings);
			await this.post(port, "/previous");
			await this.post(port, "/previous");
		} catch (error) {
			console.error("[PreviousAction] Error:", error);
		}
	}
}
