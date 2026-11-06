import { experimental_generateVideo, generateImage, generateSpeech } from "ai";
import { describe, expect, it } from "vitest";
import { createCutPro } from "../src/index";

type Sent = { method: string; url: URL; body: string | FormData | undefined };

const QUOTE = { credits: 21, model: "google/nano-banana-pro", kind: "image", mode: "text", resolution: "2k", seconds: null, aspect_ratio: "1:1", audio: null, warnings: [] };

function generation(status: "processing" | "ready" | "failed", extra: object = {}) {
	return { id: "741", status, credits_charged: 21, seed: 7, error_code: null, output: null, outputs: [{ kind: "video", url: "https://files.example/preview", media_type: "video/mp4", bytes: 1, media_id: "9", file_name: null }], ...extra };
}

// Answers by route, so the order of requests the AI SDK makes does not matter.
function mockApi(routes: Record<string, Array<object | Uint8Array>>) {
	const sent: Sent[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		sent.push({ method: init?.method ?? "GET", url, body: init?.body instanceof FormData ? init.body : init?.body?.toString() });
		const key = `${init?.method ?? "GET"} ${url.host === "files.example" ? url.pathname : url.pathname.replace("/api/v1", "")}`;
		const reply = routes[key]?.shift();
		if (!reply) throw new Error(`unexpected ${key}`);
		if (reply instanceof Uint8Array) return new Response(new Blob([reply.slice()]), { status: 200 });
		return new Response(JSON.stringify(reply), { status: key.startsWith("POST /generations") && !key.endsWith("quote") && !key.endsWith("media") ? 201 : 200 });
	};
	return { fetcher, sent };
}

const bodyOf = (sent: Sent[], path: string) => JSON.parse(String(sent.find((request) => request.url.pathname === `/api/v1${path}` && request.method === "POST")?.body));

describe("cutpro provider", () => {
	it("generateImage quotes, creates, waits and returns the downloaded bytes", async () => {
		const { fetcher, sent } = mockApi({
			"POST /generations/quote": [QUOTE],
			"POST /generations": [generation("ready")],
			"GET /generations/741/download": [{ url: "https://files.example/full.png" }],
			"GET /full.png": [new Uint8Array([1, 2, 3])],
		});
		const cutpro = createCutPro({ apiKey: "key", fetch: fetcher });
		const { image, warnings, providerMetadata } = await generateImage({
			model: cutpro.image("google/nano-banana-pro"),
			prompt: { text: "a red fox", images: ["https://img.example/a.png", "https://img.example/b.png"] },
			aspectRatio: "4:5",
			size: "1024x1024",
			providerOptions: { cutpro: { resolution: "2k" } },
		});
		expect(Array.from(image.uint8Array)).toEqual([1, 2, 3]);
		expect(bodyOf(sent, "/generations")).toMatchObject({
			model: "google/nano-banana-pro",
			prompt: "a red fox",
			aspect_ratio: "4:5",
			mode: "references",
			image_urls: ["https://img.example/a.png", "https://img.example/b.png"],
			resolution: "2k",
			credits: 21,
		});
		expect(warnings).toContainEqual(expect.objectContaining({ type: "unsupported", feature: "size" }));
		expect(providerMetadata.cutpro).toMatchObject({ images: [{ id: "741", credits: 21 }] });
	});

	it("generateImage uploads bytes before generating", async () => {
		const { fetcher, sent } = mockApi({
			"POST /generations/media": [{ id: "m1", kind: "image", seconds: null }],
			"POST /generations/quote": [QUOTE],
			"POST /generations": [generation("ready")],
			"GET /generations/741/download": [{ url: "https://files.example/full.png" }],
			"GET /full.png": [new Uint8Array([9])],
		});
		const cutpro = createCutPro({ apiKey: "key", fetch: fetcher });
		await generateImage({ model: cutpro.image("google/nano-banana-pro"), prompt: { text: "edit", images: [new Uint8Array([137, 80, 78, 71])] } });
		expect(sent[0]?.body).toBeInstanceOf(FormData);
		expect(bodyOf(sent, "/generations")).toMatchObject({ image_ids: ["m1"], mode: "references" });
	});

	it("generateSpeech reads the text in the voice and returns the MP3", async () => {
		const { fetcher, sent } = mockApi({
			"POST /generations/quote": [{ ...QUOTE, model: "google/gemini-3.1-flash-tts", kind: "speech", credits: 2 }],
			"POST /generations": [generation("ready")],
			"GET /generations/741/download": [{ url: "https://files.example/voice.mp3" }],
			"GET /voice.mp3": [new Uint8Array([73, 68, 51])],
		});
		const cutpro = createCutPro({ apiKey: "key", fetch: fetcher });
		const { audio, warnings } = await generateSpeech({ model: cutpro.speech("google/gemini-3.1-flash-tts"), text: "Olá, tudo bem?", voice: "Kore", speed: 1.2 });
		expect(Array.from(audio.uint8Array)).toEqual([73, 68, 51]);
		expect(bodyOf(sent, "/generations")).toMatchObject({ model: "google/gemini-3.1-flash-tts", prompt: "Olá, tudo bem?", voice: "Kore", credits: 2 });
		expect(warnings).toContainEqual(expect.objectContaining({ feature: "speed" }));
	});

	it("experimental_generateVideo starts, polls and returns the video", async () => {
		const { fetcher, sent } = mockApi({
			"POST /generations/quote": [{ ...QUOTE, model: "bytedance/seedance-2.5", kind: "video", credits: 225 }],
			"POST /generations": [generation("processing")],
			"GET /generations/741": [generation("processing"), generation("ready")],
			"GET /generations/741/download": [{ url: "https://files.example/video.mp4" }],
			"GET /video.mp4": [new Uint8Array([0, 0, 0, 24])],
		});
		const cutpro = createCutPro({ apiKey: "key", fetch: fetcher });
		const { video } = await experimental_generateVideo({
			model: cutpro.video("bytedance/seedance-2.5"),
			prompt: { text: "a dog surfing", image: "https://img.example/first.png" },
			aspectRatio: "16:9",
			resolution: "1280x720",
			duration: 5,
			poll: { intervalMs: 1 },
			download: async ({ url }) => ({ data: new Uint8Array(await (await fetcher(url)).arrayBuffer()), mediaType: "video/mp4" }),
		});
		expect(Array.from(video.uint8Array)).toEqual([0, 0, 0, 24]);
		expect(bodyOf(sent, "/generations")).toMatchObject({
			model: "bytedance/seedance-2.5",
			mode: "image",
			image_urls: ["https://img.example/first.png"],
			resolution: "720p",
			seconds: 5,
			aspect_ratio: "16:9",
			credits: 225,
		});
	});

	it("a failed video surfaces the error_code", async () => {
		const { fetcher } = mockApi({
			"POST /generations/quote": [{ ...QUOTE, kind: "video", credits: 225 }],
			"POST /generations": [generation("processing")],
			"GET /generations/741": [generation("failed", { error_code: "SAFETY_BLOCKED" })],
		});
		const cutpro = createCutPro({ apiKey: "key", fetch: fetcher });
		await expect(experimental_generateVideo({ model: cutpro.video("bytedance/seedance-2.5"), prompt: "x", poll: { intervalMs: 1 } })).rejects.toThrow(/SAFETY_BLOCKED/);
	});
});
