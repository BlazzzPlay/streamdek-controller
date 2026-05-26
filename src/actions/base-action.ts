import { DidReceiveGlobalSettingsEvent, SingletonAction, streamDeck, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";

export type BaseSettings = {
	port: string; // Kept for individual overrides, but global is preferred.
    showArtwork: boolean;
};

export type GlobalSettings = {
    port?: string;
};

export abstract class BaseAction<T extends BaseSettings> extends SingletonAction<T> {

	private imageUpdateInterval: NodeJS.Timeout | undefined;
	private globalSettings: GlobalSettings = {};

	constructor() {
		super();
		streamDeck.settings.getGlobalSettings<GlobalSettings>().then(settings => this.globalSettings = settings || {});
	}

	onDidReceiveGlobalSettings(ev: DidReceiveGlobalSettingsEvent<GlobalSettings>): void {
		this.globalSettings = ev.settings;
	}

    protected getPort(settings: T): string {
        return this.globalSettings.port || settings.port || "26538";
    }
    
    protected getBaseUrl(port: string): string {
        return `http://localhost:${port}/api/v1`;
    }

    protected async request(
        port: string, 
        endpoint: string, 
        options: RequestInit = {}
    ): Promise<Response> {
        const url = `${this.getBaseUrl(port)}${endpoint}`;
        const defaultHeaders: Record<string, string> = {
            "Content-Type": "application/json"
        };

        // options.headers の処理を修正
        const headers = { ...defaultHeaders };
        if (options.headers) {
             Object.assign(headers, options.headers);
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers: headers
            });

            if (!response.ok) {
                console.warn(`[${this.constructor.name}] Request to ${endpoint} failed: ${response.status} ${response.statusText}`);
            }
            return response;
        } catch (error) {
            console.error(`[${this.constructor.name}] Request error (${endpoint}):`, error);
            throw error;
        }
    }

    protected async get(port: string, endpoint: string): Promise<any> {
        const response = await this.request(port, endpoint, { method: "GET" });
        if (response.ok) {
            return response.json();
        }
        return null;
    }

    protected async post(port: string, endpoint: string, body?: any): Promise<Response> {
        return this.request(port, endpoint, {
            method: "POST",
            body: body ? JSON.stringify(body) : undefined
        });
    }

    protected async patch(port: string, endpoint: string, body?: any): Promise<Response> {
        return this.request(port, endpoint, {
            method: "PATCH",
            body: body ? JSON.stringify(body) : undefined
        });
    }

    protected async delete(port: string, endpoint: string, body?: any): Promise<Response> {
        return this.request(port, endpoint, {
            method: "DELETE",
            body: body ? JSON.stringify(body) : undefined
        });
    }

	// JPEG/PNG のヘッダから画像サイズを読む(画素はデコードしない)。読めなければ null。
	private getImageSize(buf: Buffer, mime: string): { w: number; h: number } | null {
		try {
			if (mime.includes("png")) {
				return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
			}
			// JPEG: SOFマーカー(0xC0〜0xCF、ただしC4/C8/CCを除く)を走査
			let off = 2;
			while (off + 8 < buf.length) {
				if (buf[off] !== 0xff) { off++; continue; }
				const marker = buf[off + 1];
				if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
					return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
				}
				off += 2 + buf.readUInt16BE(off + 2);
			}
		} catch {
			// 解析失敗時は null を返してフォールバックさせる
		}
		return null;
	}

	private async updateImage(ev: WillAppearEvent<T>) {
		const settings = ev.payload.settings;
		const showArtwork = !!settings.showArtwork;
		if (!showArtwork) {
			ev.action.setImage(undefined);
			return;
		}

		try {
			const port = this.getPort(settings);

			const songInfo = await this.get(port, "/song");
            
            // if paused, clear image
            if (!songInfo || songInfo.isPaused || !songInfo.imageSrc) {
				ev.action.setImage(undefined);
				return;
			}

			const coverUrl = songInfo.imageSrc;
			const res = await fetch(coverUrl);

			const blob = await res.blob();
			const arrayBuffer = await blob.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			const base64 = buffer.toString("base64");
			const dataUri = `data:${blob.type};base64,${base64}`;

			// YouTubeのサムネ等は長方形(16:9/4:3)で、そのまま渡すと正方形ボタンで
			// 引き伸ばされて潰れる。Stream Deckのキー画像レンダラ(QtSvg)は
			// preserveAspectRatio="slice"を無視して明示width/heightに伸縮するため、
			// 自前で「カバー(正方形を覆う)」寸法を計算し、縦横比を保ったまま中央配置する。
			// ビューポート(size×size)からはみ出した両脇/上下はクリップされて切り落とされる。
			const size = 144;
			const { w, h } = this.getImageSize(buffer, blob.type) ?? { w: size, h: size };
			const scale = Math.max(size / w, size / h);
			const dw = w * scale;
			const dh = h * scale;
			const dx = (size - dw) / 2;
			const dy = (size - dh) / 2;
			const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image href="${dataUri}" x="${dx}" y="${dy}" width="${dw}" height="${dh}" preserveAspectRatio="none"/></svg>`;
			const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

			await ev.action.setImage(image);
		} catch (error) {
			console.error("Error updating image:", error);
			ev.action.setImage(undefined);
		}
	}

    override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
		this.imageUpdateInterval = setInterval(() => this.updateImage(ev), 1000);
	}

	override async onWillDisappear(
		ev: WillDisappearEvent<T>
	): Promise<void> {
		if (this.imageUpdateInterval) {
			clearInterval(this.imageUpdateInterval);
		}
	}
    
}
