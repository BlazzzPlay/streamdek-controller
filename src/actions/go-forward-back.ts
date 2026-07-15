import { action, KeyDownEvent } from "@elgato/streamdeck";
import { BaseAction, BaseSettings } from "./base-action";

type GoForwardBackSettings = BaseSettings & {
	time : string;
};

@action({ UUID: "com.blazzzplay.streamdek-controller.go-forward" })
export class GoForwardAction extends BaseAction<GoForwardBackSettings> {
	override async onKeyDown(ev: KeyDownEvent<GoForwardBackSettings>): Promise<void> {
		try {
			const port = this.getPort(ev.payload.settings);
			console.log(`[GoForwardAction] Sending Go Forward request to port ${port}`);
			await this.post(port, "/go-forward", { seconds: parseInt(ev.payload.settings.time, 10) });
		} catch (error) {
			console.error("[GoForwardAction] Error:", error);
		}
	}
}

@action({ UUID: "com.blazzzplay.streamdek-controller.go-back" })
export class GoBackAction extends BaseAction<GoForwardBackSettings> {
    override async onKeyDown(ev: KeyDownEvent<GoForwardBackSettings>): Promise<void> {
        try {
            const port = this.getPort(ev.payload.settings);
            console.log(`[GoBackAction] Sending Go Back request to port ${port}`);
            await this.post(port, "/go-back", { seconds: parseInt(ev.payload.settings.time, 10) });
        } catch (error) {
            console.error("[GoBackAction] Error:", error);
        }
    }
}
