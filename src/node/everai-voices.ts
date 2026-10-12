// EverAI voice codes (Vietnamese, plus a few others). Credit cost is per 1,000 characters.
export interface EverAIVoice { code: string; name: string; gender: 'nam' | 'nu'; region: 'bac' | 'nam' | 'quocte'; lang: string; use: string; credit: number }

const v = (code: string, name: string, gender: 'nam' | 'nu', region: 'bac' | 'nam' | 'quocte', use: string, lang = 'vi', credit = 1000): EverAIVoice =>
  ({ code, name, gender, region, lang, use, credit });

export const EVERAI_VOICES: EverAIVoice[] = [
  v('vi_male_leduc_mb', 'Lê Đức', 'nam', 'bac', 'Kể chuyện'),
  v('vi_female_thuytien_mn', 'Thùy Tiên', 'nu', 'nam', 'Trò chuyện'),
  v('vi_female_thuytrang_mb', 'Thùy Trang', 'nu', 'bac', 'Nói chuyện'),
  v('vi_female_kimphuong_mb', 'Kim Phượng', 'nu', 'bac', 'Kể chuyện'),
  v('vi_male_lenghia_mb', 'Lê Nghĩa', 'nam', 'bac', 'Kể chuyện'),
  v('vi_male_minhtriet_mb', 'Minh Triết', 'nam', 'bac', 'Sách nói'),
  v('vi_male_lehoang_mb', 'Lê Hoàng', 'nam', 'bac', 'Rõ ràng, mạch lạc'),
  v('vi_male_vanduy_mb', 'Văn Duy', 'nam', 'bac', 'Phân tích, bình luận'),
  v('vi_male_dangkhoa_mb', 'Đăng Khoa', 'nam', 'bac', 'Phân tích, bình luận'),
  v('vi_female_thuylinh_mb', 'Thùy Linh', 'nu', 'bac', 'Podcast'),
  v('vi_female_hoaithuong_mb', 'Hoài Thương', 'nu', 'bac', 'Thì thầm'),
  v('vi_female_hoaian_mb', 'Hoài An', 'nu', 'bac', 'Đọc tin'),
  v('vi_female_hongngan_mn', 'Hồng Ngân', 'nu', 'nam', 'Nhẹ nhàng'),
  v('vi_female_tramanh_mb', 'Trâm Anh', 'nu', 'bac', 'Podcast'),
  v('vi_male_ductrong_mb', 'Đức Trọng', 'nam', 'bac', 'Lồng tiếng nhân vật'),
  v('vi_male_tridung_mn', 'Trí Dũng', 'nam', 'nam', 'Sách nói'),
  v('vi_male_thanhtrung_mn', 'Thành Trung', 'nam', 'nam', 'Podcast'),
  v('vi_male_giahuy_mb', 'Gia Huy', 'nam', 'bac', 'Tin tức'),
  v('vi_male_minhquan_mb', 'Minh Quân', 'nam', 'bac', 'Podcast'),
  v('vi_female_honghanh_mn', 'Hồng Hạnh', 'nu', 'nam', 'Podcast'),
  v('vi_female_khanhhuyentvc_mb', 'Khánh Huyền', 'nu', 'bac', 'Quảng cáo'),
  v('vi_male_minhkhang_mb', 'Minh Khang', 'nam', 'bac', 'Mạng xã hội'),
  v('vi_female_khanhlinh_mb', 'Khánh Linh', 'nu', 'bac', 'Review'),
  v('vi_male_tuankiet_mn', 'Tuấn Kiệt', 'nam', 'nam', 'Tin tức'),
  v('vi_female_trananh_mb', 'Trần Ánh', 'nu', 'bac', 'Tin tức'),
  v('vi_male_vanduc_mn', 'Văn Đức', 'nam', 'nam', 'Tự sự'),
  v('en_female_nova_default', 'Nova (US)', 'nu', 'quocte', 'Podcast', 'en', 100),
  v('en_male_echo_default', 'Echo (US)', 'nam', 'quocte', 'Truyền cảm', 'en', 100),
  v('en_male_onyx_default', 'Onyx (US)', 'nam', 'quocte', 'Trầm ấm', 'en', 100),
];

/** Estimated EverAI credits for a text with a given voice. */
export function everAICredits(chars: number, code: string): number {
  const voice = EVERAI_VOICES.find((x) => x.code === code);
  return Math.ceil((chars * (voice?.credit ?? 1000)) / 1000);
}
