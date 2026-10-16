// Builds the static part of the web app: engine bundle + shared assets.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'web/public');
await build({
  entryPoints: [join(root, 'src/engine/browser.ts')],
  bundle: true, format: 'iife', globalName: 'NV', target: 'es2020', minify: true,
  outfile: join(pub, 'engine.js'),
});
await build({entryPoints:[join(root,'addons/faciup-whiteboard/renderer.ts')],bundle:true,format:'iife',globalName:'FVWhiteboard',target:'es2020',minify:true,outfile:join(pub,'whiteboard-addon.js')});
await build({entryPoints:[join(root,'addons/faciup-illustrated/renderer.ts')],bundle:true,format:'iife',globalName:'FVIllustrated',target:'es2020',minify:true,outfile:join(pub,'illustrated-addon.js')});
mkdirSync(join(pub, 'assets'), { recursive: true });
cpSync(join(root,'addons/faciup-whiteboard/assets'),join(pub,'assets/faciup-whiteboard'),{recursive:true});
for (const dir of ['fonts', 'hands/default', 'hands/poses', 'icons', 'doodles', 'peeps']) cpSync(join(root, 'assets', dir), join(pub, 'assets', dir), { recursive: true });

// app icons (PNG for phones that do not take SVG)
const { createCanvas, loadImage } = await import('@napi-rs/canvas');
const svg = await loadImage(readFileSync(join(pub, 'icons/icon.svg')));
for (const n of [192, 512]) { const c = createCanvas(n, n); c.getContext('2d').drawImage(svg, 0, 0, n, n); writeFileSync(join(pub, `icons/icon-${n}.png`), c.toBuffer('image/png')); }

// demo videos on the landing page: real templates, designed by the same free rules as for users
const { DEFAULT_TEMPLATES } = await import('./src/templates.ts');
const { splitScript } = await import('./src/compose.ts');
const { cleanSpec } = await import('./src/spec.ts');
const picks = [['lai-kep', 'sunset'], ['chia-luong', 'neon'], ['ke-chuyen', 'comic'], ['ngu-ngon', 'pastel'], ['thoi-quen', 'darkboard'], ['hoc-nhanh', 'chalkboard'], ['gioi-thieu-sp', 'whiteboard'], ['khach-hang', 'kraft']];
// the four genres: same free composer, other ways of bringing the board to life
const genres = [['lai-kep', 'sunset', 'hand'], ['chia-luong', 'cosmos', 'motion'], ['hoc-nhanh', 'manim', 'math'], ['thoi-quen', 'bold', 'kinetic']];
const make = ([id, style, mode], intro) => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === id);
  const spec = cleanSpec({ title: t.title, visual: 'sketch', ratio: '9:16', style, mode, channel: 'Nét Vẽ', scenes: splitScript(t.text).map((lines) => ({ lines })).slice(0, 4),
    intro: intro ? { title: t.title, badge: 'MẸO TÀI CHÍNH', icon: 'sparkles' } : null }, 'demo');
  return { id, title: t.title, style, mode: mode || 'hand', spec };
};
const demos = [...picks.map((p, i) => make(p, i === 0)), ...genres.slice(1).map((g) => make(g))];
// one demo per video format, in the niches the site is made for: finance, philosophy, life skills, motivation
const { composeLook } = await import('./src/compose.ts');
const LOOK_DEMOS = {
  director: ['AI đang chọn thương hiệu thay bạn.', 'Nội dung rõ ràng giúp AI hiểu sản phẩm.', 'Được nhìn thấy chưa chắc được khách hàng chọn.', 'Ba việc cần làm: dữ liệu rõ, công cụ đúng, con người lắng nghe.'],
  whiteboard:['Dành thời gian cho gia đình thay vì nhận thêm công việc.','Đọc một trang sách mỗi ngày để bắt đầu thói quen.'],
  kinetic: ['Đừng chờ có động lực mới bắt đầu.', 'Bắt đầu đi, động lực sẽ tới sau.', 'Mỗi ngày chỉ cần 1% tốt hơn.', 'Một năm sau, bạn giỏi gấp 37 lần.'],
  split: ['Người nghèo nhận lương là đi mua sắm.', 'Người giàu nhận lương là cất 20% trước.', 'Người nghèo hết tiền thì vay.', 'Người giàu có quỹ dự phòng 6 tháng.'],
  chat: ['Anh ơi lương về chưa?', 'Về rồi em, 15 triệu.', 'Sao tài khoản giờ còn 2 triệu?', 'Trà sữa với Shopee chắc 4 triệu.', 'Mẹo: nhận lương là cất 20% trước nhé.'],
  story: ['Sáng thứ Hai, Nam tới công ty, lương vừa về.', 'Trưa ra quán, một ly trà sữa, rồi thêm một ly.', 'Cuối tháng ra ngân hàng, số dư còn 2 triệu.', 'Từ tháng sau, Nam cất 20% ngay khi nhận lương.'],
  data: ['Lương mỗi tháng 15 triệu.', 'Nhà 5 triệu, ăn uống 4 triệu, mua sắm 4 triệu, còn lại 2 triệu.', 'Cất 20% mỗi tháng, một năm có 36 triệu.'],
  quiz: ['Lương 15 triệu, mỗi tháng nên cất bao nhiêu?', 'Đáp án là 20%, tức 3 triệu: đủ để tích luỹ mà vẫn sống thoải mái.', 'Bạn đang cất được bao nhiêu? Bình luận nhé.'],
  doc: ['Gần hai nghìn năm trước, Seneca viết: ta khổ trong tưởng tượng nhiều hơn ngoài đời thật.', 'Đến hôm nay, câu ấy vẫn đúng với mỗi đêm mất ngủ vì lo âu.'],
};
const lookDemos = Object.entries(LOOK_DEMOS).map(([look, lines]) => {
  const scenes = look === 'chat' || look === 'quiz' ? lines.map((l) => [l]) : lines.reduce((a, l, i) => (i % 2 ? a[a.length - 1].push(l) : a.push([l]), a), []);
  const c = composeLook({ look, scenes: scenes.map((ls) => ({ lines: ls })) });
  const spec = cleanSpec({ title: lines[0].slice(0, 70), visual: 'sketch', ratio: '9:16', look, channel: 'Nét Vẽ', scenes: c.scenes, sides: c.sides, chatName: c.chatName }, 'demo');
  return { id: 'look-' + look, title: lines[0], look, spec };
});
demos.push(...lookDemos);
// story animation: the hand-written storyboard of the test video (talking to strangers)
{
  const ex = JSON.parse(readFileSync(join(root, 'examples', 'giao-tiep-nguoi-la', 'project.json'), 'utf8'));
  demos.unshift({ id: 'look-act', title: ex.scenes[0].lines[0], look: 'act', spec: cleanSpec({ ...ex, visual: 'sketch', look: 'act' }, 'demo') });
}
// classic hand drawing: Open Doodles and the video's hand-drawn person, revealed by the hand, no subtitles
const { doodlePanels } = await import('./src/doodles.ts');
const classicLines = [['Bạn có biết vì sao đọc sách mỗi ngày lại thay đổi cuộc đời?'], ['Vì sao vậy? Mỗi trang sách là một người thầy.'], ['Mỗi sáng một tách cà phê, mười lăm phút đọc, không cần nhiều hơn.'], ['Bí quyết: đọc mỗi ngày một ít, đừng chờ có thời gian.']];
const classicPanels = doodlePanels(classicLines);
// the hand-drawn styles of the format picker: hand-drawn charts and boards drawn from the words
for (const [id, file] of [['classic-diagram', 'charts'], ['classic-sketch', 'sketchnote']]) {
  const ex = JSON.parse(readFileSync(join(root, 'examples', 'phong-cach', file + '.json'), 'utf8'));
  demos.push({ id, title: ex.scenes[0].lines[0], look: id, spec: cleanSpec(ex, 'demo') });
}
demos.push({ id: 'classic', title: classicLines[0][0], look: 'classic', spec: cleanSpec({ title: 'Đọc sách mỗi ngày', visual: 'doodle', ratio: '9:16', style: 'notebook', mode: 'hand', subtitles: false, channel: 'Nét Vẽ', episode: 'Tập 1',
  scenes: classicLines.map((lines, i) => ({ lines, panels: classicPanels[i] })) }, 'demo') });
writeFileSync(join(pub, 'demos.json'), JSON.stringify(demos));
console.log('web/public built');
