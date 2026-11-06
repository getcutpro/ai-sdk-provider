# Cut.Pro provider for the Vercel AI SDK: Seedance, Wan, Kling, Veo, Nano Banana and Gemini TTS

[![npm](https://img.shields.io/npm/v/@cutpro/ai-sdk-provider)](https://www.npmjs.com/package/@cutpro/ai-sdk-provider) [![license](https://img.shields.io/npm/l/@cutpro/ai-sdk-provider)](LICENSE)

Community provider for the [AI SDK](https://ai-sdk.dev) (`ai` 7). One Cut.Pro key gives `generateImage`, `generateSpeech` and `experimental_generateVideo` access to Seedance 2.5, Wan 3, Kling O3, Veo 3.1, Gemini Omni Flash, Nano Banana Pro, Seedream 5, Qwen Image, GPT Image, Grok Imagine, MiniMax and Gemini TTS voices. Priced per second of video, per image or per 1,000 characters, in reais and dollars: see the [live price list](https://cut.pro/en/models). Pay with Pix or card; companies get an invoice.

```bash
npm install ai @cutpro/ai-sdk-provider
```

Create a key at [cut.pro/studio/me/api-keys](https://cut.pro/studio/me/api-keys) (every account starts with free credits) and set `CUTPRO_API_KEY`.

## Image: Nano Banana Pro with `generateImage`

```ts
import { generateImage } from "ai";
import { cutpro } from "@cutpro/ai-sdk-provider";

const { image } = await generateImage({
	model: cutpro.image("google/nano-banana-pro"),
	prompt: "a ceramic coffee mug on a marble counter, morning light, product photo",
	aspectRatio: "4:5",
});
```

With reference images (links or bytes):

```ts
const { image } = await generateImage({
	model: cutpro.image("google/nano-banana-pro"),
	prompt: {
		text: "the person from the first image wearing the jacket from the second",
		images: ["https://your-cdn.com/person.jpg", "https://your-cdn.com/jacket.jpg"],
	},
});
```

## Video: Seedance 2.5 with `experimental_generateVideo`

```ts
import { experimental_generateVideo as generateVideo } from "ai";
import { cutpro } from "@cutpro/ai-sdk-provider";

const { video } = await generateVideo({
	model: cutpro.video("bytedance/seedance-2.5"),
	prompt: "a golden retriever surfing a wave at sunset, cinematic",
	aspectRatio: "16:9",
	resolution: "1280x720",
	duration: 5,
});
```

Image to video with Wan 3: `prompt: { image: "https://your-cdn.com/product.jpg", text: "the camera slowly orbits the product" }` and `cutpro.video("alibaba/wan-3")`. First and last frame: `frameImages`. The SDK polls until the video is ready (default timeout 10 minutes, set `poll: { timeoutMs }` for longer ones).

Video generation is experimental in the AI SDK itself (`experimental_generateVideo`, `Experimental_VideoModelV4`), so its interface may change between AI SDK releases.

## Voice: Gemini TTS with `generateSpeech`

```ts
import { generateSpeech } from "ai";
import { cutpro } from "@cutpro/ai-sdk-provider";

const { audio } = await generateSpeech({
	model: cutpro.speech("google/gemini-3.1-flash-tts"),
	text: "Welcome to Cut.Pro. Your video is ready.",
	voice: "Kore",
});
// audio.uint8Array is an MP3
```

Voice ids per model are in `GET https://api.cut.pro/api/v1/models?id=google/gemini-3.1-flash-tts` (`voices[].id`), or with [`@cutpro/sdk`](https://github.com/getcutpro/sdk-js): `cutpro.models.list({ id })`.

## What maps to what

| AI SDK | Cut.Pro |
|---|---|
| `prompt` | `prompt` |
| `aspectRatio` | `aspect_ratio` (`21:9`, `16:9`, `3:2`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `2:3`, `9:16`) |
| `resolution: "1280x720"` (video) | `resolution: "720p"` |
| `duration` | `seconds` |
| `generateAudio` | `audio` |
| `seed` | `seed` |
| image `prompt.images` | `mode: "references"` with `image_urls` (bytes are uploaded first) |
| video `prompt.image` / `frameImages` / `inputReferences` | `mode: "image"` / `"frames"` / `"references"` |
| `voice` | `voice` |
| `providerOptions.cutpro` | any other field of `POST /generations`: `resolution`, `mode`, `preset`, `options`, `audio_urls`, `video_id`, `webhook_url`, `credits` |

Not supported (a warning is returned): image `size` and `mask`, video `fps`, speech `speed`, `instructions`, `language` and formats other than MP3. Each call generates one image or video: `n: 4` makes four generations.

Every call quotes the request and agrees to the quoted total before generating. To cap spending, quote first with `@cutpro/sdk` and pass `providerOptions: { cutpro: { credits } }`: if the price changed, nothing is charged and the call fails with `PRICE_CHANGED`. Errors are `CutProError` with `code`, `status` and `extra` (see the [error catalog](https://cut.pro/docs/en/errors)). The provider downloads the full quality file, after which the credits of that generation can no longer be asked back.

`providerMetadata.cutpro` carries the generation `id`, the `credits` charged and the `seed`.

## Settings

```ts
import { createCutPro } from "@cutpro/ai-sdk-provider";

const cutpro = createCutPro({
	apiKey: process.env.CUTPRO_API_KEY,
	workspaceId: "...", // only for a key that reaches more than one workspace
	baseURL: "https://api.cut.pro/api/v1",
	fetch: customFetch,
});
```

## Models

| Kind | Model ids |
|---|---|
| Video | [`bytedance/seedance-2.5`](https://cut.pro/en/models/seedance-2-5), [`alibaba/wan-3`](https://cut.pro/en/models/wan-3), [`kling/kling-o3-pro`](https://cut.pro/en/models/kling-o3-pro), [`google/veo-3.1`](https://cut.pro/en/models/veo-3-1), [`google/gemini-omni-flash-1.1`](https://cut.pro/en/models/gemini-omni-flash-1-1), [`xai/grok-imagine-video-1.5`](https://cut.pro/en/models/grok-imagine-video-1-5), [`minimax/h3`](https://cut.pro/en/models/h3) |
| Image | [`google/nano-banana-pro`](https://cut.pro/en/models/nano-banana-pro), [`bytedance/seedream-5-pro`](https://cut.pro/en/models/seedream-5-pro), [`alibaba/qwen-image-3-pro`](https://cut.pro/en/models/qwen-image-3-pro), [`openai/gpt-image-2.5`](https://cut.pro/en/models/gpt-image-2-5), [`xai/grok-imagine-image-2`](https://cut.pro/en/models/grok-imagine-image-2) |
| Voice | [`google/gemini-3.1-flash-tts`](https://cut.pro/en/models/gemini-3-1-flash-tts), [`minimax/speech-2.8-hd`](https://cut.pro/en/models/speech-2-8-hd) |

Any other image, video or voice model id from the [catalog](https://cut.pro/en/models) works too.

## Em português

Provider da Cut.Pro para o Vercel AI SDK: `generateImage`, `generateSpeech` e `experimental_generateVideo` com Seedance 2.5, Wan 3, Kling O3, Veo 3.1, Nano Banana Pro, Seedream 5, GPT Image e vozes do Gemini TTS, com uma chave só. Preço por segundo de vídeo, por imagem ou por 1.000 caracteres, em reais: [tabela de preços ao vivo](https://cut.pro/pt-BR/models). Pague com Pix ou cartão, com nota fiscal para empresas. Toda conta começa com créditos grátis.

```ts
import { generateSpeech } from "ai";
import { cutpro } from "@cutpro/ai-sdk-provider";

const { audio } = await generateSpeech({ model: cutpro.speech("google/gemini-3.1-flash-tts"), text: "Olá! Seu vídeo está pronto.", voice: "Kore" });
```

Crie a chave em [cut.pro/studio/me/api-keys](https://cut.pro/studio/me/api-keys). Páginas dos modelos: [Seedance 2.5](https://cut.pro/pt-BR/models/seedance-2-5), [Wan 3](https://cut.pro/pt-BR/models/wan-3), [Nano Banana Pro](https://cut.pro/pt-BR/models/nano-banana-pro), [Gemini 3.1 Flash TTS](https://cut.pro/pt-BR/models/gemini-3-1-flash-tts).

## License

MIT
