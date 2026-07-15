import { action } from "@elgato/streamdeck";
import { BaseAction, BaseSettings } from "./base-action";

@action({ UUID: "com.blazzzplay.streamdek-controller.artwork" })
export class ArtworkAction extends BaseAction<BaseSettings> {
    
}
