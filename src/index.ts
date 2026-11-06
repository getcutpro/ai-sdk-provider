import {
	NoSuchModelError,
	type ImageModelV4,
	type ImageModelV4CallOptions,
	type ImageModelV4Result,
	type JSONObject,
	type JSONValue,
	type ProviderV4,
	type SharedV4Warning,
	type SpeechModelV4,
	type SpeechModelV4CallOptions,
	type SpeechModelV4Result,
	type Experimental_VideoModelV4 as VideoModelV4,
	type Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
	type Experimental_VideoModelV4File as VideoModelV4File,
	type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
	type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
} from "@ai-sdk/provider";
import { CutPro, CutProError, type AspectRatio, type CreateGenerationRequest, type CutProOptions, type Generation, type GenerationMode } from "@cutpro/sdk";

export { CutProError };

const PROVIDER = "cutpro";
const ASPECT_RATIOS: readonly AspectRatio[] = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"];

export type CutProImageModelId =
	| "google/nano-banana-pro"
	| "google/nano-banana-2"
	| "bytedance/seedream-5-pro"
	| "bytedance/seedream-5-flash"
	| "openai/gpt-image-2.5"
	| "alibaba/qwen-image-3-pro"
	| "xai/grok-imagine-image-2"
	| (string & {});

export type CutProVideoModelId =
	| "bytedance/seedance-2.5"
	| "bytedance/seedance-2"
	| "bytedance/seedance-2-fast"
	| "alibaba/wan-3"
	| "kling/kling-o3-pro"
	| "kling/kling-3-pro"
	| "google/veo-3.1"
	| "google/veo-3.1-fast"
	| "google/gemini-omni-flash-1.1"
	| "xai/grok-imagine-video-1.5"
	| "minimax/h3"
	| (string & {});

export type CutProSpeechModelId =
	| "google/gemini-3.1-flash-tts"
	| "google/gemini-2.5-flash-tts"
	| "minimax/speech-2.8-hd"
	| "elevenlabs/v3"
	| (string & {});

/** Any field of `POST /generations` (`resolution`, `mode`, `options`, `image_ids`, `webhook_url`, `credits`), under `providerOptions.cutpro`. */
export type CutProProviderOptions = Omit<CreateGenerationRequest, "prompt">;

export type CutProProviderSettings = CutProOptions;

export interface CutProProvider extends ProviderV4 {
	image(modelId: CutProImageModelId): ImageModelV4;
	imageModel(modelId: CutProImageModelId): ImageModelV4;
	speech(modelId: CutProSpeechModelId): SpeechModelV4;
	speechModel(modelId: CutProSpeechModelId): SpeechModelV4;
	video(modelId: CutProVideoModelId): VideoModelV4;
	videoModel(modelId: CutProVideoModelId): VideoModelV4;
}

interface Context {
	client: CutPro;
	fetch: typeof fetch;
}

type MediaFile = VideoModelV4File;

function isAspectRatio(value: string): value is AspectRatio {
	return ASPECT_RATIOS.some((ratio) => ratio === value);
}

function cutproOptions(providerOptions: Record<string, JSONObject> | undefined): JSONObject {
	return providerOptions?.[PROVIDER] ?? {};
}

function bytesOf(data: string | Uint8Array): Uint8Array<ArrayBuffer> {
	return typeof data === "string" ? Uint8Array.from(atob(data), (char) => char.charCodeAt(0)) : new Uint8Array(data);
}

// Links go straight in `image_urls`; once any file needs an upload, every one is uploaded so `image_ids` keeps their order (first frame before last).
async function imageInputs(context: Context, files: MediaFile[], signal: AbortSignal | undefined): Promise<Pick<CreateGenerationRequest, "image_ids" | "image_urls">> {
	if (!files.length) return {};
	const urls = files.flatMap((file) => (file.type === "url" ? [file.url] : []));
	if (urls.length === files.length) return { image_urls: urls };
	const uploads = files.map((file) =>
		file.type === "url" ? context.client.media.upload({ url: file.url }, { signal }) : context.client.media.upload(new Blob([bytesOf(file.data)], { type: file.mediaType }), { signal, filename: "input" }),
	);
	return { image_ids: (await Promise.all(uploads)).map((media) => media.id) };
}

async function downloadBytes(context: Context, generation: Generation, signal: AbortSignal | undefined): Promise<Uint8Array> {
	const { url } = await context.client.generations.download(generation.id, { signal });
	const response = await context.fetch(url, { signal });
	if (!response.ok) throw new CutProError("DOWNLOAD_FAILED", response.status, { id: generation.id });
	return new Uint8Array(await response.arrayBuffer());
}

function aspectRatioOf(value: string | undefined, warnings: SharedV4Warning[]): AspectRatio | undefined {
	if (!value || value === "adaptive") return undefined;
	if (isAspectRatio(value)) return value;
	warnings.push({ type: "unsupported", feature: "aspectRatio", details: `Use one of ${ASPECT_RATIOS.join(", ")}.` });
	return undefined;
}

function response(modelId: string) {
	return { timestamp: new Date(), modelId, headers: undefined };
}

class CutProImageModel implements ImageModelV4 {
	readonly specificationVersion = "v4";
	readonly provider = PROVIDER;
	readonly maxImagesPerCall = 1;
	readonly supportsFileInputs = true;
	readonly supportsMaskInputs = false;

	constructor(
		readonly modelId: string,
		private readonly context: Context,
	) {}

	async doGenerate(options: ImageModelV4CallOptions): Promise<ImageModelV4Result> {
		const warnings: SharedV4Warning[] = [];
		if (options.size) warnings.push({ type: "unsupported", feature: "size", details: "Use aspectRatio, or providerOptions.cutpro.resolution." });
		if (options.mask) warnings.push({ type: "unsupported", feature: "mask" });
		const files = options.files ?? [];
		const request: CreateGenerationRequest = {
			model: this.modelId,
			prompt: options.prompt,
			aspect_ratio: aspectRatioOf(options.aspectRatio, warnings),
			seed: options.seed,
			...(files.length ? { mode: "references" } : {}),
			...(await imageInputs(this.context, files, options.abortSignal)),
			...cutproOptions(options.providerOptions),
		};
		const generation = await this.context.client.generations.generate(request, { signal: options.abortSignal, headers: definedHeaders(options.headers) });
		const image = await downloadBytes(this.context, generation, options.abortSignal);
		return {
			images: [image],
			warnings,
			providerMetadata: { [PROVIDER]: { images: [{ id: generation.id, credits: generation.credits_charged, seed: generation.seed }] } },
			response: response(this.modelId),
		};
	}
}

class CutProSpeechModel implements SpeechModelV4 {
	readonly specificationVersion = "v4";
	readonly provider = PROVIDER;

	constructor(
		readonly modelId: string,
		private readonly context: Context,
	) {}

	async doGenerate(options: SpeechModelV4CallOptions): Promise<SpeechModelV4Result> {
		const warnings: SharedV4Warning[] = [];
		if (options.outputFormat && options.outputFormat !== "mp3") warnings.push({ type: "unsupported", feature: "outputFormat", details: "Voices come out as MP3." });
		if (options.instructions) warnings.push({ type: "unsupported", feature: "instructions", details: "Write the delivery into the text, or pick another voice." });
		if (options.speed !== undefined) warnings.push({ type: "unsupported", feature: "speed" });
		if (options.language) warnings.push({ type: "unsupported", feature: "language", details: "Every voice reads the language of the text." });
		const request: CreateGenerationRequest = { model: this.modelId, prompt: options.text, voice: options.voice, ...cutproOptions(options.providerOptions) };
		const generation = await this.context.client.generations.generate(request, { signal: options.abortSignal, headers: definedHeaders(options.headers) });
		return {
			audio: await downloadBytes(this.context, generation, options.abortSignal),
			warnings,
			providerMetadata: { [PROVIDER]: { id: generation.id, credits: generation.credits_charged } },
			response: response(this.modelId),
		};
	}
}

class CutProVideoModel implements VideoModelV4 {
	readonly specificationVersion = "v4";
	readonly provider = PROVIDER;
	readonly maxVideosPerCall = 1;

	constructor(
		readonly modelId: string,
		private readonly context: Context,
	) {}

	async doStart(options: VideoModelV4CallOptions): Promise<VideoModelV4OperationStartResult> {
		const warnings: SharedV4Warning[] = [];
		if (options.fps !== undefined) warnings.push({ type: "unsupported", feature: "fps" });
		const frames = [...(options.frameImages ?? [])].sort((a, b) => (a.frameType === b.frameType ? 0 : a.frameType === "first_frame" ? -1 : 1)).map((frame) => frame.image);
		const references = (options.inputReferences ?? []).filter((file) => {
			const isImage = (file.mediaType ?? "image/").startsWith("image/");
			if (!isImage) warnings.push({ type: "unsupported", feature: "inputReferences", details: "Only image references; send a video with providerOptions.cutpro.video_id." });
			return isImage;
		});
		const [mode, files]: [GenerationMode | undefined, MediaFile[]] = frames.length
			? ["frames", frames]
			: options.image
				? ["image", [options.image]]
				: references.length
					? ["references", references]
					: [undefined, []];
		const [width, height] = (options.resolution ?? "").split("x").map(Number);
		const request: CreateGenerationRequest = {
			model: this.modelId,
			prompt: options.prompt,
			mode,
			resolution: width && height ? `${Math.min(width, height)}p` : undefined,
			seconds: options.duration,
			aspect_ratio: aspectRatioOf(options.aspectRatio, warnings),
			audio: options.generateAudio,
			seed: options.seed,
			...(await imageInputs(this.context, files, options.abortSignal)),
			...cutproOptions(options.providerOptions),
		};
		const generation = await this.context.client.generations.create(request, { signal: options.abortSignal, headers: definedHeaders(options.headers) });
		return { operation: generation.id, warnings, providerMetadata: { [PROVIDER]: { id: generation.id, credits: generation.credits_charged } }, response: response(this.modelId) };
	}

	async doStatus(options: { operation: JSONValue; abortSignal?: AbortSignal; headers?: Record<string, string | undefined> }): Promise<VideoModelV4OperationStatusResult> {
		if (typeof options.operation !== "string") throw new CutProError("OPERATION_INVALID", 0);
		const generation = await this.context.client.generations.get(options.operation, { signal: options.abortSignal, headers: definedHeaders(options.headers) });
		if (generation.status === "processing") return { status: "pending", response: response(this.modelId) };
		if (generation.status === "failed") return { status: "error", error: generation.error_code ?? "GENERATION_FAILED", response: response(this.modelId) };
		const { url } = await this.context.client.generations.download(generation.id, { signal: options.abortSignal });
		return {
			status: "completed",
			videos: [{ type: "url", url, mediaType: generation.outputs[0]?.media_type ?? "video/mp4" }],
			warnings: [],
			providerMetadata: { [PROVIDER]: { id: generation.id, credits: generation.credits_charged, seed: generation.seed } },
			response: response(this.modelId),
		};
	}
}

function definedHeaders(headers: Record<string, string | undefined> | undefined): Record<string, string> | undefined {
	if (!headers) return undefined;
	return Object.fromEntries(Object.entries(headers).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])));
}

export function createCutPro(settings: CutProProviderSettings = {}): CutProProvider {
	const context = (): Context => ({ client: new CutPro(settings), fetch: settings.fetch ?? ((input, init) => fetch(input, init)) });
	const image = (modelId: string) => new CutProImageModel(modelId, context());
	const speech = (modelId: string) => new CutProSpeechModel(modelId, context());
	const video = (modelId: string) => new CutProVideoModel(modelId, context());
	return {
		specificationVersion: "v4",
		image,
		imageModel: image,
		speech,
		speechModel: speech,
		video,
		videoModel: video,
		languageModel(modelId) {
			throw new NoSuchModelError({ modelId, modelType: "languageModel" });
		},
		embeddingModel(modelId) {
			throw new NoSuchModelError({ modelId, modelType: "embeddingModel" });
		},
	};
}

/** Reads the key from `CUTPRO_API_KEY`. */
export const cutpro = createCutPro();
