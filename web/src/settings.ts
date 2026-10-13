// Site settings edited on the admin page (#/admin). Stored in D1 as one JSON document plus
// encrypted API keys. Defaults below are only starting values: every name shown to users
// can be renamed by the admin, and keys entered there override the Worker secrets.
import { type Env, HttpError } from './util.ts';
import type { User } from './auth.ts';
import { DEFAULT_TEMPLATES, type Template } from './templates.ts';
import { DOODLE_NAMES } from './doodles.ts';
import { DEFAULT_PRIVACY, DEFAULT_REFUND, DEFAULT_TERMS, LEGAL_VERSION, type LegalConfig } from './legal.ts';

export const SECRET_NAMES = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'EVERAI_API_KEY', 'GOOGLE_TTS_API_KEY', 'ELEVENLABS_API_KEY', 'ZALO_BOT_TOKEN', 'SEPAY_API_KEY'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
/** Keys the render machine needs (voices); the Worker uses the AI ones itself. */
const RUNNER_SECRETS: SecretName[] = ['EVERAI_API_KEY', 'GOOGLE_TTS_API_KEY', 'ELEVENLABS_API_KEY'];
/** Visibility of an option ("style:kraft", "feature:zalo"); anything not set is on. */
export const vis = (c: Config, key: string): Vis => (key === 'feature:plans' && c.beta?.enabled ? 'hidden' : c.visibility[key] || 'on');
/** Selling is shown to users: not in beta, plans on. */
export const selling = (c: Config) => vis(c, 'feature:plans') === 'on';

export const STYLE_KEYS = ['sunset', 'cosmos', 'manim', 'bold', 'whiteboard', 'chalkboard', 'neon', 'darkboard', 'comic', 'pastel', 'oly', 'kraft', 'pencil', 'newspaper', 'blueprint', 'ricepaper', 'notebook'] as const;
export const TOOL_KEYS = ['marker', 'chalk', 'fountain', 'colormarker', 'pencil', 'technical', 'brush'] as const;
export const KIND_KEYS = ['sketch', 'bars', 'flow', 'compare', 'steps', 'number', 'statement', 'stick', 'plot'] as const;
/** How the picture comes alive (the four genres of explainer video). */
export const MODE_KEYS = ['hand', 'motion', 'math', 'kinetic'] as const;
/** Video formats (src/engine/looks.ts). */
export const LOOK_KEYS = ['act', 'kinetic', 'split', 'chat', 'story', 'data', 'quiz', 'doc'] as const;
export const GOOGLE_MODES = ['auto', 'popup', 'redirect'] as const;
export const VISUAL_KEYS = ['doodle', 'sketch', 'diagram', 'mix', 'images'] as const;
export const SOURCE_KEYS = ['topic', 'mine-ai', 'mine-free'] as const;
export const ACTION_KEYS = ['idle', 'walk', 'run', 'wave', 'think', 'cheer', 'sad', 'point', 'shrug', 'jump'] as const;
export const AI_KEYS = ['openai', 'gemini'] as const;

/** idea: written down only · test: admins can make videos with it · live: everyone sees it */
export interface CustomFormat { id: string; name: string; base: string; brief: string; note: string; stage: 'idea' | 'test' | 'live'; created: number }
export interface Voice { provider: 'everai' | 'google' | 'elevenlabs' | 'free'; code: string; label: string }

export interface Config {
  brand: { name: string; accent: string; tagline: string };
  labels: {
    styles: Record<string, string>; tools: Record<string, string>; kinds: Record<string, string>;
    visual: Record<string, string>; actions: Record<string, string>; ai: Record<string, string>; sources: Record<string, string>;
    modes: Record<string, string>; looks: Record<string, string>; lookNotes: Record<string, string>;
  };
  /** Ways to start a video the users may pick (AI from a topic, own script + AI pictures, own script free). */
  enabledSources: string[];
  texts: Record<string, string>;
  enabledStyles: string[];
  defaults: { source: string; textAI: string; imageAI: string; style: string; visual: string; ratio: string; seconds: number; voice: string; channel: string; tone: string; subtitles: boolean; mode: string; intro: boolean; look: string; music: string };
  /** Google sign-in: popup (Google's button), redirect (full page, works in installed apps and in-app browsers), auto. */
  auth: { google: string };
  voices: Voice[];
  models: { openaiText: string; openaiImage: string; openaiImageQuality: string; geminiText: string; geminiImage: string; openaiFallback: string; geminiFallback: string };
  /** daily defaults; maxSeconds: longest video anyone may make (plans may allow less) */
  limits: { script: number; image: number; render: number; maxSeconds: number };
  promptExtra: string;
  /** the admin's own brief per video format (empty = the built-in one) */
  briefs: Record<string, string>;
  /** formats made on the training page: a built-in format plus extra instructions, released stage by stage */
  formats: CustomFormat[];
  admins: string[];
  /** Price table used to log what every AI call costs (VND = USD × usdVnd). */
  costs: { usdVnd: number; models: Record<string, [number, number]>; imageOpenai: number; imageGemini: number; everaiPer1000: number; googleTtsPerM: number; elevenPer1000: number };
  /** Days of activity log kept. */
  logDays: number;
  /** Every option shown to users: on (usable) · dev (shown greyed "đang phát triển") · hidden. Keys: "style:whiteboard", "feature:zalo"... */
  visibility: Record<string, Vis>;
  /** settings layout revision (older saved settings are brought up to date on load) */
  rev?: number;
  zalo: ZaloConfig;
  plans: Plan[];
  payment: { enabled: boolean; bank: string; account: string; accountName: string; prefix: string; expiryDays: number; note: string; /** countdown shown in the payment window */ holdMinutes: number };
  /** Shown on the home page above the form (announcements). Empty = nothing. */
  notice: string;
  /** Ready-made scripts users can start from (no AI needed). */
  templates: Template[];
  /** Terms, privacy and refund pages; raising `version` asks everyone to accept again. */
  legal: LegalConfig;
  /** Beta: the public site shows no prices, plans, payment or upgrade prompts. Plan/payment settings stay editable and still set the limits. */
  beta: { enabled: boolean; label: string; note: string };
  /** Home page pictures and sample videos (URL or uploaded "site:" file). */
  site: SiteConfig;
  /** Spending cap for paid APIs (VND, from the logged costs). Over the cap the site switches to free paths. */
  budget: { dailyVnd: number; monthlyVnd: number; warnPct: number; perVideoVnd: number };
  /** documentary format: what one video costs in credits, pictures it covers, packs on sale */
  doc: { creditsPerVideo: number; imagesPerVideo: number; packs: { id: string; name: string; credits: number; price: number }[] };
  /** background music the users can pick (uploaded on the admin page) */
  music: { id: string; title: string; file: string }[];
}
export interface SiteMedia { title: string; caption: string; video: string; poster: string }
export interface SiteConfig {
  heroTitle: string; heroText: string;
  /** picture or video beside the headline; empty = live hand-drawn preview */
  heroMedia: string; heroPoster: string;
  /** short how-to video shown next to the three steps */
  tutorial: string;
  showcase: SiteMedia[];
}
export type Vis = 'on' | 'dev' | 'hidden';
export interface ZaloConfig {
  enabled: boolean; botLink: string;
  /** how messages reach the site: auto (webhook when it works, else polling), webhook only, polling only */
  receive: 'auto' | 'webhook' | 'poll';
  /** People who message the bot without a web account get one automatically. */
  allowGuests: boolean;
  /** How a script sent by chat is illustrated: free rules or AI. */
  scriptSource: 'mine-free' | 'mine-ai';
  autoRender: boolean;
  ownerChat: string;
  notifyOwner: { signup: boolean; failed: boolean; order: boolean; daily: boolean };
  templates: Record<string, string>;
}
export interface Plan {
  id: string; name: string; price: number; days: number; visible: boolean; highlight: boolean; desc: string; features: string[];
  /** per day */ limits: { script: number; image: number; render: number };
  /** 'all' or a list of keys allowed on this plan */ styles: 'all' | string[]; sources: 'all' | string[]; voices: 'all' | string[];
  zalo: boolean; maxSeconds: number;
  /** documentary videos included each month (VIP); others pay credits */
  docPerMonth: number;
}

export const FEATURES: Record<string, string> = {
  zalo: 'Tạo video qua Zalo', imageAI: 'Tranh AI cho cảnh', duplicate: 'Nhân bản video', cover: 'Tải ảnh bìa', templates: 'Kịch bản mẫu',
  subtitles: 'Bật phụ đề trên hình', speed: 'Chỉnh tốc độ đọc', editor: 'Sửa từng cảnh', srt: 'Tải phụ đề SRT', plans: 'Gói cước & nâng cấp', music: 'Nhạc nền',
  intro: 'Mở đầu là ảnh bìa (thumbnail)', character: 'Nhân vật tham chiếu (ảnh thật)', affiliate: 'Tiếp thị liên kết (ảnh SP + mã QR)', community: 'Cộng đồng', platform: 'Xem trước như TikTok / YouTube / Facebook',
};
export const RATIO_KEYS = ['9:16', '16:9'] as const;

/** Every piece of interface text the admin can rename. */
export const DEFAULT_TEXTS: Record<string, string> = {
  loginTitle: 'Video bàn tay vẽ, từ một câu chủ đề',
  loginText: 'AI viết kịch bản, bạn chỉnh từng câu, xem trước bàn tay vẽ ngay trên trang, rồi nhận video MP4 có giọng đọc và phụ đề.',
  homeTitle: 'Xưởng video của bạn',
  newVideo: 'Tạo video mới',
  source: 'Cách tạo', topic: 'Chủ đề', topicHint: 'Ví dụ: Vì sao lương mãi không tăng dù làm việc chăm chỉ?',
  script: 'Kịch bản của bạn', scriptHint: 'Dán kịch bản vào đây. Mỗi đoạn (cách nhau một dòng trống) được chia thành cảnh, mỗi cảnh 1-2 câu.',
  subsOnPicture: 'Phụ đề trên hình',
  textAI: 'AI viết kịch bản', duration: 'Thời lượng', ratio: 'Khung hình', visual: 'Kiểu hình', style: 'Phong cách',
  voice: 'Giọng đọc', tone: 'Giọng văn', toneHint: 'Ví dụ: gần gũi, hài hước nhẹ', channel: 'Tên kênh', episode: 'Số tập', episodeHint: 'Ví dụ: Tập 1',
  write: 'Viết kịch bản', writing: 'AI đang viết…',
  myVideos: 'Video đã tạo', noVideos: 'Chưa có video nào. Nhập chủ đề ở trên để tạo video đầu tiên.',
  allVideos: '← Tất cả video', render: 'Dựng video', drawAll: 'Vẽ tất cả bằng AI', post: 'Nội dung đăng bài',
  export: 'Xuất video', download: 'Tải video MP4', subtitles: 'Tải phụ đề', logout: 'Đăng xuất', admin: 'Quản trị',
};

export function defaultConfig(env: Env): Config {
  return {
    brand: { name: 'Nét Vẽ', accent: 'Studio', tagline: 'Tạo video bàn tay vẽ kèm thuyết minh tiếng Việt.' },
    labels: {
      styles: { sunset: 'Hoàng hôn tím cam', cosmos: 'Vũ trụ phẳng', manim: 'Bảng đen toán học', bold: 'Chữ nổi bật', neon: 'Neon đêm', darkboard: 'Bảng đen hiện đại', comic: 'Truyện tranh', pastel: 'Pastel dễ thương', newspaper: 'Báo giấy cổ điển', whiteboard: 'Bảng trắng', chalkboard: 'Bảng phấn', oly: 'Vở ô ly', kraft: 'Giấy kraft', pencil: 'Sổ phác chì', blueprint: 'Bản vẽ kỹ thuật', ricepaper: 'Giấy dó mực tàu', notebook: 'Giấy kem kể chuyện' },
      tools: { marker: 'Bút dạ bảng', chalk: 'Phấn', fountain: 'Bút máy', colormarker: 'Bút dạ màu', pencil: 'Bút chì', technical: 'Bút kỹ thuật', brush: 'Bút lông' },
      kinds: { plot: 'Đồ thị hàm số', sketch: 'Bảng vẽ tự do (chữ + hình + mũi tên)', bars: 'Biểu đồ cột (mũi tên, đường cong)', flow: 'Chuỗi nguyên nhân → kết quả', compare: 'So sánh ✗ / ✓', steps: 'Các bước', number: 'Con số nổi bật', statement: 'Câu chốt', stick: 'Người que chuyển động' },
      visual: { doodle: 'Tranh vẽ tay lộ dần theo nét bút (Open Doodles, miễn phí)', sketch: 'Bảng vẽ tự do: chữ + hình + sơ đồ', diagram: 'Sơ đồ theo mẫu', mix: 'Kết hợp sơ đồ + tranh AI', images: 'Tranh AI cho mọi cảnh' },
      sources: { topic: 'AI viết từ chủ đề', 'mine-ai': 'Kịch bản của tôi + AI minh hoạ', 'mine-free': 'Kịch bản của tôi + tự minh hoạ (miễn phí)' },
      actions: { idle: 'Đứng', walk: 'Đi bộ', run: 'Chạy', wave: 'Vẫy tay', think: 'Suy nghĩ', cheer: 'Ăn mừng', sad: 'Buồn', point: 'Chỉ tay', shrug: 'Nhún vai', jump: 'Nhảy' },
      ai: { openai: 'OpenAI', gemini: 'Gemini' },
      modes: { hand: 'Bàn tay vẽ (whiteboard)', motion: 'Đồ hoạ chuyển động (motion graphics)', math: 'Toán học / học thuật (kiểu Manim)', kinetic: 'Chữ chuyển động (kinetic typography)' },
      looks: { act: 'Hoạt hình kể chuyện', kinetic: 'Chữ bùng nổ', split: 'Hai bên đối lập', chat: 'Tin nhắn drama', story: 'Kể chuyện người que', data: 'Con số biết nói', quiz: 'Đố vui đếm ngược', doc: 'Phim tài liệu AI' },
      lookNotes: {
        act: 'Bàn tay vẽ nhân vật rồi nhân vật tự diễn: đi lại, trò chuyện, cảm xúc, ví dụ sai/đúng. Hợp kỹ năng sống, tâm lý, kể chuyện.',
        kinetic: 'Chữ to từng nhịp, từ khoá tô vàng. Hợp mẹo nhanh, động lực, câu mở đầu.', split: 'Màn hình chia đôi: sai và đúng, nghèo và giàu. Hợp tài chính, kỹ năng sống.',
        chat: 'Câu chuyện qua tin nhắn, chốt bằng bài học. Hợp gia đình, cảnh báo, tình huống.', story: 'Một nhân vật đi qua các bối cảnh. Hợp kể chuyện đời thường.',
        data: 'Số đếm chạy lên và biểu đồ chia phần. Hợp tài chính, so sánh giá.', quiz: 'Hỏi, đếm ngược 3-2-1 rồi lật đáp án. Kéo bình luận.',
        doc: 'Ảnh AI điện ảnh, máy quay trượt chậm. Hợp triết lý, lịch sử, nhân vật. Tính credit riêng.',
      },
    },
    texts: { ...DEFAULT_TEXTS },
    enabledStyles: [...STYLE_KEYS],
    enabledSources: [...SOURCE_KEYS],
    defaults: { source: 'topic', subtitles: false, textAI: 'gemini', imageAI: 'gemini', style: 'notebook', visual: 'doodle', ratio: '9:16', seconds: 45, voice: 'vi_female_thuytrang_mb', channel: '', tone: '', mode: 'hand', intro: true, look: 'act', music: 'auto' },
    auth: { google: 'auto' },
    voices: [
      ['vi_female_thuytrang_mb', 'Thùy Trang · nữ Bắc · nói chuyện'], ['vi_male_minhtriet_mb', 'Minh Triết · nam Bắc · sách nói'],
      ['vi_male_leduc_mb', 'Lê Đức · nam Bắc · kể chuyện'], ['vi_female_kimphuong_mb', 'Kim Phượng · nữ Bắc · kể chuyện'],
      ['vi_male_lehoang_mb', 'Lê Hoàng · nam Bắc · mạch lạc'], ['vi_male_vanduy_mb', 'Văn Duy · nam Bắc · bình luận'],
      ['vi_female_thuylinh_mb', 'Thùy Linh · nữ Bắc · podcast'], ['vi_female_hoaian_mb', 'Hoài An · nữ Bắc · đọc tin'],
      ['vi_male_minhkhang_mb', 'Minh Khang · nam Bắc · mạng xã hội'], ['vi_female_khanhlinh_mb', 'Khánh Linh · nữ Bắc · review'],
      ['vi_female_thuytien_mn', 'Thùy Tiên · nữ Nam · trò chuyện'], ['vi_female_hongngan_mn', 'Hồng Ngân · nữ Nam · nhẹ nhàng'],
      ['vi_male_tridung_mn', 'Trí Dũng · nam Nam · sách nói'], ['vi_male_thanhtrung_mn', 'Thành Trung · nam Nam · podcast'],
      ['vi_male_tuankiet_mn', 'Tuấn Kiệt · nam Nam · tin tức'], ['vi_male_vanduc_mn', 'Văn Đức · nam Nam · tự sự'],
    ].map(([code, label]): Voice => ({ provider: 'everai', code, label }))
      .concat([
        { provider: 'free', code: 'free-female', label: 'Mai · nữ · rõ ràng' }, { provider: 'free', code: 'free-male', label: 'Nam · nam · trầm ấm' },
        { provider: 'free', code: 'vi-VN-Wavenet-C', label: 'Ngọc · nữ · nhẹ nhàng' }, { provider: 'free', code: 'vi-VN-Wavenet-B', label: 'Hùng · nam · mạnh mẽ' },
        { provider: 'free', code: 'vi-VN-Wavenet-A', label: 'Thảo · nữ · tươi tắn' }, { provider: 'free', code: 'vi-VN-Wavenet-D', label: 'Tuấn · nam · điềm tĩnh' },
      ] as Voice[]),
    models: {
      openaiText: env.OPENAI_TEXT_MODEL || 'gpt-4o-mini', openaiImage: env.OPENAI_IMAGE_MODEL || 'gpt-image-1', openaiImageQuality: env.OPENAI_IMAGE_QUALITY || 'medium',
      geminiText: env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash', geminiImage: env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
      openaiFallback: 'gpt-4.1-mini', geminiFallback: 'gemini-2.5-flash-lite,gemini-2.0-flash',
    },
    limits: { script: Number(env.DAILY_SCRIPTS) || 20, image: Number(env.DAILY_IMAGES) || 60, render: Number(env.DAILY_RENDERS) || 5, maxSeconds: 600 },
    promptExtra: '',
    briefs: {},
    formats: [],
    admins: [],
    costs: {
      usdVnd: 26000,
      // USD per 1M tokens: [input, output]
      models: { 'gpt-4o-mini': [0.15, 0.6], 'gpt-4.1-mini': [0.4, 1.6], 'gpt-4.1': [2, 8], 'gpt-4o': [2.5, 10], 'gemini-2.5-flash-lite': [0.1, 0.4], 'gemini-2.5-flash': [0.3, 2.5], 'gemini-2.0-flash': [0.1, 0.4], 'gemini-2.5-pro': [1.25, 10], '*': [0.5, 2] },
      imageOpenai: 0.063, imageGemini: 0.039, everaiPer1000: 1000, googleTtsPerM: 16, elevenPer1000: 0.18,
    },
    logDays: 180,
    visibility: { 'feature:music': 'dev', 'look:story': 'hidden' },
    zalo: {
      enabled: false, botLink: '', receive: 'auto', allowGuests: true, scriptSource: 'mine-free', autoRender: true, ownerChat: '',
      notifyOwner: { signup: true, failed: true, order: true, daily: false },
      templates: {
        help: 'Chào {ten}! Gửi cho mình:\n• KB + kịch bản của bạn → mình dựng video\n• TAO + chủ đề → AI viết kịch bản rồi dựng\n• TT → xem video đang dựng\n• DS → video gần đây\n• KHUNG DOC hoặc KHUNG NGANG → đổi khung hình\n• DINHDANG → chọn định dạng video\n• GIONG → chọn giọng đọc\n• TAT / BAT → tắt/bật thông báo\n• HUYKETNOI → bỏ liên kết',
        linked: 'Đã kết nối Zalo với tài khoản {email}. Video dựng xong sẽ được gửi về đây. Gõ HUONGDAN để xem lệnh.',
        queued: 'Đã nhận! Video "{tieuDe}" ({canh} cảnh, {dang}) đang được dựng, khoảng vài phút. Mình sẽ gửi link khi xong.{suaWeb}',
        done: '🎬 Video "{tieuDe}" đã xong ({giay} giây).\nXem / tải: {link}\n(Link có hạn {hanNgay} ngày)',
        failed: 'Video "{tieuDe}" dựng chưa được: {loi}. Bạn gửi lại giúp mình, hoặc mở web để sửa.',
        unknown: 'Mình chưa hiểu. Gõ HUONGDAN để xem cách dùng, hoặc gửi KB + kịch bản để tạo video.',
        noAI: 'Hiện chỉ dựng từ kịch bản có sẵn. Hãy gửi: KB + kịch bản của bạn.',
      },
    },
    plans: [
      { id: 'free', name: 'Miễn phí', price: 0, days: 0, visible: true, highlight: false, desc: 'Dùng thử đầy đủ quy trình', features: ['Bảng vẽ tự do', 'Kịch bản của bạn', 'Giọng máy miễn phí'],
        limits: { script: 3, image: 0, render: 2 }, styles: 'all', sources: 'all', voices: 'all', zalo: true, maxSeconds: 90, docPerMonth: 0 },
      { id: 'pro', name: 'Chuyên nghiệp', price: 199000, days: 30, visible: true, highlight: true, desc: 'Cho người làm kênh đều đặn', features: ['AI viết & minh hoạ', 'Giọng EverAI tự nhiên', 'Tranh AI', 'Ưu tiên dựng'],
        limits: { script: 30, image: 60, render: 10 }, styles: 'all', sources: 'all', voices: 'all', zalo: true, maxSeconds: 600, docPerMonth: 4 },
    ],
    payment: { enabled: false, bank: '970436', account: '', accountName: '', prefix: 'NV', expiryDays: 7, holdMinutes: 15, note: 'Chuyển khoản đúng nội dung để được kích hoạt tự động trong 1-2 phút.' },
    notice: '',
    templates: DEFAULT_TEMPLATES,
    beta: { enabled: true, label: 'Beta', note: 'Đang thử nghiệm: tính năng và giao diện có thể thay đổi. Góp ý giúp chúng tôi làm video hay hơn.' },
    site: { heroTitle: 'Tạo video giải thích có giọng đọc tiếng Việt', heroText: 'Dành cho người làm TikTok, giáo viên, chủ shop và người chia sẻ kiến thức: dán kịch bản hoặc một chủ đề, nhận video hoàn chỉnh sau vài phút.', heroMedia: '', heroPoster: '', tutorial: '', showcase: [] },
    budget: { dailyVnd: 200_000, monthlyVnd: 3_000_000, warnPct: 80, perVideoVnd: 15_000 },
    // one documentary ≈ 10 AI pictures + voice ≈ 11.000đ cost; 1 credit = 1 video, packs priced with margin
    doc: { creditsPerVideo: 1, imagesPerVideo: 14, packs: [{ id: 'doc1', name: '1 phim tài liệu', credits: 1, price: 29000 }, { id: 'doc5', name: '5 phim tài liệu', credits: 5, price: 119000 }, { id: 'doc20', name: '20 phim tài liệu', credits: 20, price: 399000 }] },
    music: [],
    legal: { company: 'Nét Vẽ Studio', email: 'hotro@example.com', address: 'Việt Nam', taxId: '', version: LEGAL_VERSION, terms: DEFAULT_TERMS, privacy: DEFAULT_PRIVACY, refund: DEFAULT_REFUND },
  };
}

// ---- validation: stored config is always complete and well-formed
/** multi-line text: keeps line breaks, drops other control characters */
const lines = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max) : '');
const str = (v: unknown, max: number, def: string) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : def);
const int = (v: unknown, lo: number, hi: number, def: number) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.round(Math.min(hi, Math.max(lo, Number(v)))) : def);
const pick = (v: unknown, list: readonly string[], def: string) => (list.includes(v as string) ? (v as string) : def);
const MODEL = /^[a-z0-9][a-z0-9.\-_:]{1,60}$/i;
function labels(v: any, keys: readonly string[], def: Record<string, string>, max = 60) {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = str(v?.[k], max, def[k]) || def[k];
  return out;
}

export function cleanConfig(input: any, base: Config): Config {
  const i = input && typeof input === 'object' ? input : {};
  const L = i.labels || {}, d = i.defaults || {}, m = i.models || {}, lim = i.limits || {};
  // visibility decides (newer settings); the old enabled list only matters for settings saved before it existed
  const enabled: string[] = i.visibility || !Array.isArray(i.enabledStyles) ? [...STYLE_KEYS] : STYLE_KEYS.filter((k) => i.enabledStyles.includes(k));
  const voices = (Array.isArray(i.voices) ? i.voices : base.voices)
    .map((v: any) => ({ provider: pick(v?.provider, ['everai', 'google', 'elevenlabs', 'free'], 'everai') as Voice['provider'], code: str(v?.code, 60, ''), label: str(v?.label, 80, '') }))
    .filter((v: Voice) => /^[A-Za-z0-9_-]{3,60}$/.test(v.code)).map((v: Voice) => ({ ...v, label: v.label || v.code })).slice(0, 80);
  let vs: Voice[] = voices.length ? voices : base.voices;
  // the free voices always exist: the site must work without any paid key
  vs = [...vs.filter((v) => !(v.provider === 'free' && /Miễn phí/.test(v.label))), ...base.voices.filter((v) => v.provider === 'free' && !vs.some((x) => x.code === v.code && !/Miễn phí/.test(x.label)))];
  const en = enabled.length ? enabled : [...STYLE_KEYS];
  return {
    brand: { name: str(i.brand?.name, 40, base.brand.name) || base.brand.name, accent: str(i.brand?.accent, 30, base.brand.accent), tagline: str(i.brand?.tagline, 160, base.brand.tagline) },
    labels: {
      styles: labels(L.styles, STYLE_KEYS, base.labels.styles), tools: labels(L.tools, TOOL_KEYS, base.labels.tools),
      kinds: labels(L.kinds, KIND_KEYS, base.labels.kinds), visual: labels(L.visual, VISUAL_KEYS, base.labels.visual, 80),
      actions: labels(L.actions, ACTION_KEYS, base.labels.actions), ai: labels(L.ai, AI_KEYS, base.labels.ai),
      sources: labels(L.sources, SOURCE_KEYS, base.labels.sources, 80), modes: labels(L.modes, MODE_KEYS, base.labels.modes, 80),
      looks: labels(L.looks, LOOK_KEYS, base.labels.looks, 40), lookNotes: labels(L.lookNotes, LOOK_KEYS, base.labels.lookNotes, 160),
    },
    enabledSources: (() => {
      let v: string[] = Array.isArray(i.enabledSources) ? SOURCE_KEYS.filter((k) => i.enabledSources.includes(k)) : [...base.enabledSources];
      if (i.visibility) v = SOURCE_KEYS.filter((k) => !['hidden', 'dev'].includes(i.visibility['source:' + k]));
      return v.length ? v : ['mine-free'];
    })(),
    texts: labels(i.texts, Object.keys(DEFAULT_TEXTS), base.texts, 240),
    enabledStyles: en.filter((k) => !(i.visibility?.['style:' + k] === 'hidden' || i.visibility?.['style:' + k] === 'dev')).length ? en.filter((k) => !(i.visibility?.['style:' + k] === 'hidden' || i.visibility?.['style:' + k] === 'dev')) : en,
    defaults: {
      source: pick(d.source, SOURCE_KEYS, base.defaults.source), subtitles: typeof d.subtitles === 'boolean' ? d.subtitles : base.defaults.subtitles,
      textAI: pick(d.textAI, AI_KEYS, base.defaults.textAI), imageAI: pick(d.imageAI, AI_KEYS, base.defaults.imageAI),
      style: pick(d.style, en, en.includes(base.defaults.style) ? base.defaults.style : en[0]), visual: pick(d.visual, VISUAL_KEYS, base.defaults.visual),
      ratio: pick(d.ratio, ['9:16', '16:9'], base.defaults.ratio), seconds: int(d.seconds, 15, 1800, base.defaults.seconds),
      voice: pick(d.voice, vs.map((v: Voice) => v.code), vs[0].code), channel: str(d.channel, 40, base.defaults.channel), tone: str(d.tone, 200, base.defaults.tone),
      mode: pick(d.mode, MODE_KEYS, base.defaults.mode), intro: typeof d.intro === 'boolean' ? d.intro : base.defaults.intro,
      look: (Number(i.rev) || 0) < 2 ? 'act' : pick(d.look, LOOK_KEYS.filter((k) => k !== 'doc'), base.defaults.look), music: typeof d.music === 'string' && /^(auto|none|[a-z0-9-]{2,20})$/.test(d.music) ? d.music : base.defaults.music,
    },
    auth: { google: pick(i.auth?.google, GOOGLE_MODES, base.auth.google) },
    voices: vs,
    models: {
      openaiText: MODEL.test(m.openaiText) ? m.openaiText : base.models.openaiText, openaiImage: MODEL.test(m.openaiImage) ? m.openaiImage : base.models.openaiImage,
      openaiImageQuality: pick(m.openaiImageQuality, ['low', 'medium', 'high'], base.models.openaiImageQuality),
      geminiText: MODEL.test(m.geminiText) ? m.geminiText : base.models.geminiText, geminiImage: MODEL.test(m.geminiImage) ? m.geminiImage : base.models.geminiImage,
      openaiFallback: typeof m.openaiFallback === 'string' ? m.openaiFallback.split(',').map((x: string) => x.trim()).filter((x: string) => MODEL.test(x)).slice(0, 4).join(',') : base.models.openaiFallback,
      geminiFallback: typeof m.geminiFallback === 'string' ? m.geminiFallback.split(',').map((x: string) => x.trim()).filter((x: string) => MODEL.test(x)).slice(0, 4).join(',') : base.models.geminiFallback,
    },
    limits: { script: int(lim.script, 0, 1000, base.limits.script), image: int(lim.image, 0, 5000, base.limits.image), render: int(lim.render, 0, 500, base.limits.render), maxSeconds: int(lim.maxSeconds, 30, 1800, base.limits.maxSeconds) },
    promptExtra: str(i.promptExtra, 1500, base.promptExtra),
    briefs: Object.fromEntries(LOOK_KEYS.map((k) => [k, lines(i.briefs?.[k], 4000)]).filter(([, v]) => v)),
    formats: (Array.isArray(i.formats) ? i.formats : []).slice(0, 30).map((f: any) => ({
      id: /^[a-z0-9-]{2,24}$/.test(String(f?.id || '')) ? String(f.id) : '', name: str(f?.name, 40, ''), base: (LOOK_KEYS as readonly string[]).includes(f?.base) && f.base !== 'doc' ? f.base : 'act',
      brief: lines(f?.brief, 3000), note: lines(f?.note, 1500), stage: ['idea', 'test', 'live'].includes(f?.stage) ? f.stage : 'idea', created: Number(f?.created) || Date.now(),
    })).filter((f: CustomFormat) => f.id && f.name),
    costs: (() => {
      const c = i.costs || {}, b = base.costs, n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
      const models: Record<string, [number, number]> = {};
      for (const [k, v] of Object.entries(c.models && typeof c.models === 'object' ? c.models : b.models).slice(0, 40)) {
        if ((/^[a-z0-9.\-_:]{1,60}$/i.test(k) || k === '*') && Array.isArray(v)) models[k] = [n(v[0], 0), n(v[1], 0)];
      }
      if (!models['*']) models['*'] = b.models['*'];
      return { usdVnd: n(c.usdVnd, b.usdVnd), models, imageOpenai: n(c.imageOpenai, b.imageOpenai), imageGemini: n(c.imageGemini, b.imageGemini),
        everaiPer1000: n(c.everaiPer1000, b.everaiPer1000), googleTtsPerM: n(c.googleTtsPerM, b.googleTtsPerM), elevenPer1000: n(c.elevenPer1000, b.elevenPer1000) };
    })(),
    logDays: int(i.logDays, 7, 3650, base.logDays),
    visibility: (() => {
      const v: Record<string, Vis> = {}, src = i.visibility && typeof i.visibility === 'object' ? i.visibility : base.visibility;
      for (const [k, x] of Object.entries(src).slice(0, 400)) if (/^[a-z]+:[A-Za-z0-9:_.-]{1,60}$/.test(k) && (x === 'dev' || x === 'hidden')) v[k] = x;
      // older settings kept a list of enabled styles / ways to start
      if (!i.visibility && Array.isArray(i.enabledStyles)) for (const k of STYLE_KEYS) if (!i.enabledStyles.includes(k)) v['style:' + k] = 'hidden';
      if (!i.visibility && Array.isArray(i.enabledSources)) for (const k of SOURCE_KEYS) if (!i.enabledSources.includes(k)) v['source:' + k] = 'hidden';
      // rev 2: the story animation replaces the stick-figure story
      if ((Number(i.rev) || 0) < 2) v['look:story'] = 'hidden';
      return v;
    })(),
    rev: 2,
    zalo: (() => {
      const z = i.zalo || {}, b = base.zalo;
      const tpl: Record<string, string> = {};
      for (const k of Object.keys(b.templates)) tpl[k] = typeof z.templates?.[k] === 'string' && z.templates[k].trim() ? z.templates[k].slice(0, 1500) : b.templates[k];
      return {
        enabled: typeof z.enabled === 'boolean' ? z.enabled : b.enabled, receive: ['auto', 'webhook', 'poll'].includes(z.receive) ? z.receive : 'auto', botLink: /^https:\/\/[^\s"<>]{4,200}$/.test(z.botLink || '') ? z.botLink : z.botLink === '' ? '' : b.botLink,
        allowGuests: typeof z.allowGuests === 'boolean' ? z.allowGuests : b.allowGuests, scriptSource: z.scriptSource === 'mine-ai' ? 'mine-ai' : 'mine-free',
        autoRender: typeof z.autoRender === 'boolean' ? z.autoRender : b.autoRender, ownerChat: /^[\w.-]{1,80}$/.test(z.ownerChat || '') ? z.ownerChat : z.ownerChat === '' ? '' : b.ownerChat,
        notifyOwner: { signup: z.notifyOwner?.signup ?? b.notifyOwner.signup, failed: z.notifyOwner?.failed ?? b.notifyOwner.failed, order: z.notifyOwner?.order ?? b.notifyOwner.order, daily: z.notifyOwner?.daily ?? b.notifyOwner.daily },
        templates: tpl,
      };
    })(),
    plans: (() => {
      const list = (Array.isArray(i.plans) ? i.plans : base.plans).slice(0, 12).map((p: any, k: number): Plan => {
        const keys = (v: unknown) => (v === 'all' || !Array.isArray(v) ? 'all' : v.map(String).filter((x) => /^[\w:.-]{1,60}$/.test(x)).slice(0, 80)) as any;
        return {
          id: /^[a-z0-9-]{2,20}$/.test(p?.id) ? p.id : 'goi' + (k + 1), name: str(p?.name, 40, 'Gói ' + (k + 1)) || 'Gói ' + (k + 1),
          price: int(p?.price, 0, 100_000_000, 0), days: int(p?.days, 0, 3650, 30), visible: p?.visible !== false, highlight: !!p?.highlight,
          desc: str(p?.desc, 200, ''), features: (Array.isArray(p?.features) ? p.features : []).map((x: unknown) => str(x, 80, '')).filter(Boolean).slice(0, 10),
          limits: { script: int(p?.limits?.script, 0, 1000, 3), image: int(p?.limits?.image, 0, 5000, 0), render: int(p?.limits?.render, 0, 500, 2) },
          styles: keys(p?.styles), sources: keys(p?.sources), voices: keys(p?.voices), zalo: p?.zalo !== false, maxSeconds: int(p?.maxSeconds, 15, 1800, 180),
          docPerMonth: int(p?.docPerMonth, 0, 1000, 0),
        };
      });
      // exactly one free plan, always first
      if (!list.some((p: Plan) => p.price === 0)) list.unshift(base.plans[0]);
      const ids = new Set<string>();
      return list.filter((p: Plan) => !ids.has(p.id) && ids.add(p.id)).sort((a: Plan, b: Plan) => a.price - b.price);
    })(),
    payment: (() => {
      const p = i.payment || {}, b = base.payment;
      return { enabled: !!(p.enabled ?? b.enabled), bank: /^\d{6}$/.test(p.bank || '') ? p.bank : b.bank, account: /^[0-9A-Za-z]{4,30}$/.test(p.account || '') ? p.account : '',
        accountName: str(p.accountName, 60, '').toUpperCase(), prefix: /^[A-Z]{2,4}$/.test(p.prefix || '') ? p.prefix : b.prefix, expiryDays: int(p.expiryDays, 1, 60, b.expiryDays), note: str(p.note, 300, b.note), holdMinutes: int(p.holdMinutes, 3, 120, b.holdMinutes) };
    })(),
    notice: str(i.notice, 500, base.notice),
    templates: (Array.isArray(i.templates) ? i.templates : base.templates).slice(0, 40).map((t: any, k: number) => ({
      id: /^[a-z0-9-]{2,30}$/.test(t?.id) ? t.id : 'mau-' + (k + 1), title: str(t?.title, 60, '') || 'Mẫu ' + (k + 1), niche: str(t?.niche, 20, 'general'), text: typeof t?.text === 'string' ? t.text.replace(/\r/g, '').slice(0, 6000) : '',
    })).filter((t: Template) => t.text.trim().length > 20),
    legal: (() => {
      const l = i.legal || {}, b = base.legal, doc = (v: unknown, d: string) => (typeof v === 'string' && v.trim().length > 50 ? v.replace(/\r/g, '').slice(0, 30000) : d);
      return { company: str(l.company, 120, b.company) || b.company, email: str(l.email, 120, b.email) || b.email, address: str(l.address, 200, b.address), taxId: str(l.taxId, 30, ''),
        version: /^[\w.-]{1,20}$/.test(l.version || '') ? l.version : b.version, terms: doc(l.terms, b.terms), privacy: doc(l.privacy, b.privacy), refund: doc(l.refund, b.refund) };
    })(),
    beta: (() => {
      const b = i.beta || {}, d = base.beta;
      return { enabled: typeof b.enabled === 'boolean' ? b.enabled : d.enabled, label: str(b.label, 20, d.label) || d.label, note: str(b.note, 300, d.note) };
    })(),
    site: (() => {
      const x = i.site || {}, d = base.site;
      const media = (v: unknown) => { const t = String(v ?? '').trim(); return /^(site:[a-f0-9]{24}\.(png|jpg|webp|mp4|webm)|https:\/\/[^\s"'<>]{4,400})$/.test(t) ? t : ''; };
      return {
        heroTitle: str(x.heroTitle, 120, d.heroTitle) || d.heroTitle, heroText: str(x.heroText, 300, d.heroText),
        heroMedia: x.heroMedia === undefined ? d.heroMedia : media(x.heroMedia), heroPoster: x.heroPoster === undefined ? d.heroPoster : media(x.heroPoster),
        tutorial: x.tutorial === undefined ? d.tutorial : media(x.tutorial),
        showcase: (Array.isArray(x.showcase) ? x.showcase : d.showcase).slice(0, 12)
          .map((m: any) => ({ title: str(m?.title, 60, ''), caption: str(m?.caption, 120, ''), video: media(m?.video), poster: media(m?.poster) }))
          .filter((m: SiteMedia) => m.video || m.poster),
      };
    })(),
    budget: (() => {
      const b = i.budget || {}, d = base.budget;
      return { dailyVnd: int(b.dailyVnd, 0, 1_000_000_000, d.dailyVnd), monthlyVnd: int(b.monthlyVnd, 0, 10_000_000_000, d.monthlyVnd), warnPct: int(b.warnPct, 10, 100, d.warnPct), perVideoVnd: int(b.perVideoVnd, 0, 10_000_000, d.perVideoVnd) };
    })(),
    doc: (() => {
      const x = i.doc || {}, d = base.doc;
      const packs = (Array.isArray(x.packs) ? x.packs : d.packs).slice(0, 6).map((p: any, k: number) => ({
        id: /^[a-z0-9-]{2,20}$/.test(p?.id) ? p.id : 'goi-doc' + (k + 1), name: str(p?.name, 40, '') || `${int(p?.credits, 1, 1000, 1)} credit`,
        credits: int(p?.credits, 1, 1000, 1), price: int(p?.price, 1000, 100_000_000, 29000),
      }));
      return { creditsPerVideo: int(x.creditsPerVideo, 1, 100, d.creditsPerVideo), imagesPerVideo: int(x.imagesPerVideo, 4, 60, d.imagesPerVideo), packs };
    })(),
    music: (Array.isArray(i.music) ? i.music : base.music).slice(0, 30)
      .map((m: any, k: number) => ({ id: /^[a-z0-9-]{2,20}$/.test(m?.id) ? m.id : 'nhac-' + (k + 1), title: str(m?.title, 50, '') || 'Nhạc ' + (k + 1), file: String(m?.file || '') }))
      .filter((m: any) => /^site:[a-f0-9]{24}\.(mp3|m4a)$/.test(m.file)),
    admins: (Array.isArray(i.admins) ? i.admins : base.admins).map((e: unknown) => str(e, 100, '').toLowerCase()).filter((e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 20),
  };
}

// ---- encrypted keys (AES-GCM, key derived from RUNNER_TOKEN; never returned to the browser)
async function cryptoKey(env: Env) {
  if (!env.RUNNER_TOKEN || env.RUNNER_TOKEN.length < 32) throw new HttpError(503, 'Thiếu RUNNER_TOKEN nên chưa lưu được khoá.');
  const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RUNNER_TOKEN), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('net-ve-settings'), info: new Uint8Array() }, raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function encrypt(env: Env, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(env), new TextEncoder().encode(text)));
  return b64(iv) + '.' + b64(ct);
}
export async function decrypt(env: Env, blob: string) {
  const [iv, ct] = blob.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await cryptoKey(env), unb64(ct)));
}

// ---- loading (cached briefly per isolate; saving clears the cache)
let cache: { at: number; config: Config; secrets: Partial<Record<SecretName, string>> } | null = null;
export function clearCache() { cache = null; }

export async function load(env: Env) {
  if (cache && Date.now() - cache.at < 15_000) return cache;
  const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key = 'config' OR key LIKE 'secret:%'").all<any>()).results;
  const base = defaultConfig(env);
  let config = base;
  const secrets: Partial<Record<SecretName, string>> = {};
  for (const r of rows) {
    if (r.key === 'config') { try { config = cleanConfig(JSON.parse(r.value), base); } catch { /* keep defaults */ } }
    else {
      const name = r.key.slice(7) as SecretName;
      if (SECRET_NAMES.includes(name)) { try { secrets[name] = await decrypt(env, r.value); } catch { /* RUNNER_TOKEN changed: key must be entered again */ } }
    }
  }
  cache = { at: Date.now(), config, secrets };
  return cache;
}

/** Env with admin settings applied: keys entered on the admin page win over Worker secrets. */
export async function effectiveEnv(env: Env): Promise<Env & { config: Config }> {
  const { config, secrets } = await load(env);
  return {
    ...env,
    // every key entered on the admin page wins over the Worker secret of the same name
    ...Object.fromEntries(SECRET_NAMES.map((n) => [n, secrets[n] || (env as any)[n]])),
    OPENAI_TEXT_MODEL: config.models.openaiText, OPENAI_IMAGE_MODEL: config.models.openaiImage, OPENAI_IMAGE_QUALITY: config.models.openaiImageQuality,
    GEMINI_TEXT_MODEL: config.models.geminiText, GEMINI_IMAGE_MODEL: config.models.geminiImage,
    OPENAI_TEXT_FALLBACK: config.models.openaiFallback, GEMINI_TEXT_FALLBACK: config.models.geminiFallback,
    DAILY_SCRIPTS: String(config.limits.script), DAILY_IMAGES: String(config.limits.image), DAILY_RENDERS: String(config.limits.render),
    config,
  };
}

export async function secretStatus(env: Env) {
  const { secrets } = await load(env);
  const out: Record<string, 'admin' | 'env' | null> = {};
  for (const n of SECRET_NAMES) out[n] = secrets[n] ? 'admin' : (env as any)[n] ? 'env' : null;
  return out;
}

export async function save(env: Env, input: any, secretInput: Record<string, unknown> = {}) {
  const config = cleanConfig(input, defaultConfig(env));
  const now = Date.now();
  const stmts = [env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('config', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(config), now)];
  for (const n of SECRET_NAMES) {
    const v = secretInput[n];
    if (v === null) stmts.push(env.DB.prepare('DELETE FROM settings WHERE key = ?').bind('secret:' + n));
    else if (typeof v === 'string' && v.trim()) {
      const key = v.trim();
      if (key.length < 10 || key.length > 300 || /\s/.test(key)) throw new HttpError(400, `Khoá ${n} không hợp lệ.`);
      stmts.push(env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind('secret:' + n, await encrypt(env, key), now));
    }
  }
  await env.DB.batch(stmts);
  clearCache();
  return config;
}

/** Keys for the render machine (voice providers only). */
export async function runnerSecrets(env: Env) {
  const { secrets } = await load(env);
  return Object.fromEntries(RUNNER_SECRETS.filter((n) => secrets[n]).map((n) => [n, secrets[n]]));
}

/** Fail closed in production; bootstrap ownership must be explicitly configured. */
export async function isAdmin(env: Env, config: Config, user: User) {
  if (config.admins.length) return config.admins.includes(user.email.toLowerCase());
  if (user.id.startsWith('dev-')) return env.DEV_LOGIN === '1';
  return !!env.ADMIN_EMAIL && env.ADMIN_EMAIL.trim().toLowerCase() === user.email.toLowerCase();
}

/** What every visitor's browser needs to draw the interface. */
export function publicConfig(config: Config) {
  return {
    brand: config.brand, labels: config.labels, texts: config.texts, enabledStyles: config.enabledStyles, enabledSources: config.enabledSources, defaults: config.defaults,
    voices: config.voices.filter((v) => config.visibility['voice:' + v.code] !== 'hidden'),
    formats: config.formats.filter((f) => f.stage === 'live').map((f) => ({ id: 'f:' + f.id, name: f.name, base: f.base, note: f.note.split('\n')[0].slice(0, 160) })), visibility: config.beta.enabled ? { ...config.visibility, 'feature:plans': 'hidden' as Vis } : config.visibility, notice: config.notice,
    beta: config.beta.enabled ? { label: config.beta.label, note: config.beta.note } : null,
    site: config.site,
    plans: !selling(config) ? [] : config.plans.filter((p) => p.visible).map((p) => ({ id: p.id, name: p.name, price: p.price, days: p.days, highlight: p.highlight, desc: p.desc, features: p.features, limits: p.limits, maxSeconds: Math.min(p.maxSeconds, config.limits.maxSeconds), docPerMonth: p.docPerMonth || 0 })),
    templates: config.visibility['feature:templates'] === 'hidden' ? [] : config.templates.map((t) => ({ id: t.id, title: t.title, niche: t.niche })),

    zalo: { enabled: config.zalo.enabled && config.visibility['feature:zalo'] !== 'hidden', botLink: config.zalo.botLink, dev: config.visibility['feature:zalo'] === 'dev' },
    payment: { enabled: selling(config) && config.payment.enabled, holdMinutes: config.payment.holdMinutes },
    music: config.music.map((m) => ({ id: m.id, title: m.title })),
    doodles: DOODLE_NAMES,
    // what anyone gets without paying (shown on the home page, in Beta too)
    free: (() => { const p = config.plans.find((x) => x.price === 0) || config.plans[0]; return { render: p.limits.render, script: p.limits.script, maxSeconds: Math.min(p.maxSeconds, config.limits.maxSeconds) }; })(),
    legal: { version: config.legal.version, company: config.legal.company, email: config.legal.email, address: config.legal.address, taxId: config.legal.taxId },
    doc: { perVideo: config.doc.creditsPerVideo, packs: selling(config) && config.payment.enabled ? config.doc.packs : [] },
    limits: { maxSeconds: config.limits.maxSeconds },
    auth: config.auth,
  };
}
