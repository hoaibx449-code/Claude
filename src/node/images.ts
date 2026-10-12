// Image providers for panels that only have a prompt. Results are cached by
// provider + prompt, so re-rendering a project never pays twice.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ImageGen { name: string; generate(prompt: string): Promise<Buffer> }

/** Fixed style wording keeps every panel of a video consistent with the others. */
export const LINE_ART_STYLE =
  'Hand-drawn black ink line art illustration, clean confident outlines, light cross-hatching only for shadows, ' +
  'no color, no gray fill, plain pure white background, no text, no letters, no frame, centered subject, 4:3 composition. Scene: ';

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`);
  return v;
}

export const openAIImages: ImageGen = {
  name: 'openai',
  async generate(prompt) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${need('OPENAI_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt: LINE_ART_STYLE + prompt, size: '1536x1024', n: 1 }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json();
    return Buffer.from(j.data[0].b64_json, 'base64');
  },
};

export const geminiImages: ImageGen = {
  name: 'gemini',
  async generate(prompt) {
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': need('GEMINI_API_KEY'), 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: LINE_ART_STYLE + prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json();
    const part = j.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
    if (!part) throw new Error('Gemini không trả về ảnh (có thể bị bộ lọc nội dung chặn)');
    return Buffer.from(part.inlineData.data, 'base64');
  },
};

export function pickImages(name?: string): ImageGen | null {
  if (!name || name === 'none') return null;
  if (name === 'openai') return openAIImages;
  if (name === 'gemini') return geminiImages;
  throw new Error(`Không có nhà cung cấp ảnh "${name}"`);
}

export async function cachedImage(gen: ImageGen, prompt: string, cacheDir: string): Promise<string> {
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, createHash('sha256').update(gen.name + '\n' + LINE_ART_STYLE + prompt).digest('hex').slice(0, 20) + '.png');
  if (!existsSync(file)) writeFileSync(file, await gen.generate(prompt));
  return file;
}
