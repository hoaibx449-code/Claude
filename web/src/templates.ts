// Ready-made scripts: anyone can make a real video in one click, with no AI and no cost.
// The admin can edit, add or remove them (settings → "Kịch bản mẫu").
export interface Template { id: string; title: string; niche: string; text: string }

export const DEFAULT_TEMPLATES: Template[] = [
  { id: 'lai-kep', title: 'Sức mạnh lãi kép', niche: 'finance', text:
`Vì sao có người đi làm lương thấp mà về già vẫn dư dả? Bí mật nằm ở một thứ gọi là lãi kép.

Gửi 10 triệu, lãi 8% mỗi năm. Tiền lãi lại tiếp tục sinh ra lãi.

Sau 10 năm, bạn có 21,6 triệu. Sau 20 năm là 46,6 triệu.

Và sau 30 năm, con số là hơn 100 triệu, gấp mười lần số vốn ban đầu.

Điều quan trọng không phải bạn có bao nhiêu tiền, mà là bạn bắt đầu sớm thế nào.

Lưu video này lại, và gửi cho người bạn đang định tiêu hết tháng lương này nhé.` },
  { id: 'chia-luong', title: 'Chia lương 3 phần', niche: 'finance', text:
`Lương về mười ngày đã hết? Không phải bạn kiếm ít, mà là bạn chưa chia tiền.

Thứ nhất: trích 20% tiết kiệm ngay ngày nhận lương, trước khi tiêu bất cứ thứ gì.

Thứ hai: 50% cho chi tiêu thiết yếu: nhà, ăn uống, đi lại.

Thứ ba: 30% còn lại để học thêm, đầu tư và tận hưởng.

Người giàu không kiếm nhiều hơn bạn, nhưng họ giữ tiền tốt hơn.

Bạn đang chia lương theo tỷ lệ nào? Bình luận một con số nhé.` },
  { id: 'thoi-quen', title: 'Quy tắc 2 phút', niche: 'self', text:
`Bạn đã bao nhiêu lần hứa sẽ tập thể dục, rồi bỏ sau ba ngày?

Vấn đề không phải ý chí, mà là bạn bắt đầu quá lớn.

Hãy thử quy tắc hai phút: mọi thói quen mới chỉ cần làm trong hai phút.

Muốn đọc sách? Đọc một trang. Muốn chạy bộ? Chỉ cần mang giày và bước ra cửa.

Làm nhỏ nhưng đều đặn mỗi ngày, não bộ sẽ quen và tự kéo bạn làm tiếp.

Lưu lại để tối nay bắt đầu với hai phút đầu tiên nhé.` },
  { id: 'ngu-ngon', title: 'Ngủ ngon hơn tối nay', niche: 'health', text:
`Bạn ngủ đủ tám tiếng mà sáng dậy vẫn mệt? Có thể bạn đang mắc ba sai lầm này.

Sai lầm 1: lướt điện thoại trước khi ngủ. Ánh sáng xanh khiến não tưởng trời vẫn sáng.

Sai lầm 2: uống cà phê sau ba giờ chiều. Caffeine ở lại trong cơ thể tới tận nửa đêm.

Sai lầm 3: giờ ngủ mỗi ngày một khác, nên đồng hồ sinh học bị rối.

Chỉ cần sửa một điều, giấc ngủ của bạn sẽ khác hẳn.

Gửi video này cho người hay than mất ngủ nhé.` },
  { id: 'khach-hang', title: 'Giữ chân khách hàng', niche: 'business', text:
`Tìm một khách hàng mới tốn gấp năm lần giữ một khách hàng cũ.

Vậy mà nhiều chủ shop chỉ lo chạy quảng cáo, quên mất người đã từng mua.

Cách đơn giản nhất: nhắn cảm ơn sau mỗi đơn hàng, và hỏi họ có hài lòng không.

Tặng một ưu đãi nhỏ cho lần mua thứ hai.

Khách quay lại không chỉ mua thêm, họ còn giới thiệu bạn bè.

Bạn đang giữ chân khách theo cách nào? Chia sẻ ở bình luận nhé.` },
  { id: 'hoc-nhanh', title: 'Học nhanh nhớ lâu', niche: 'education', text:
`Tại sao học cả buổi mà hôm sau quên gần hết?

Vì não chỉ giữ lại những gì được nhắc lại đúng lúc.

Hãy ôn lại sau một ngày, sau ba ngày, rồi sau một tuần.

Mỗi lần ôn, hãy tự hỏi và tự trả lời thay vì đọc lại.

Học ít mà nhắc đúng lúc, bạn sẽ nhớ lâu hơn học dồn cả đêm.

Lưu lại để dùng cho kỳ thi tới nhé.` },
  { id: 'ke-chuyen', title: 'Chuyện cái lọ thủng', niche: 'self', text:
`Có một người gánh nước mỗi ngày với hai cái lọ, một lọ bị thủng.

Lọ thủng luôn xấu hổ vì về tới nhà chỉ còn một nửa nước.

Một hôm người gánh nước nói: "Hãy nhìn hai bên đường."

Bên phía lọ thủng, hoa nở kín lối đi, vì ngày nào cũng được tưới.

Điểm yếu của bạn có thể đang làm đẹp cho ai đó mà bạn không biết.

Gửi câu chuyện này cho người đang tự ti về bản thân nhé.` },
  { id: 'gioi-thieu-sp', title: 'Giới thiệu sản phẩm', niche: 'business', text:
`Ngồi máy tính cả ngày mà lưng mỏi, cổ đau?

Vấn đề thường nằm ở chiếc ghế bạn đang ngồi.

Ghế công thái học giữ lưng thẳng, đỡ cổ và giảm áp lực cho cột sống.

Chỉ sau một tuần, bạn sẽ thấy làm việc lâu mà không còn mỏi.

Đầu tư cho sức khỏe là khoản đầu tư không bao giờ lỗ.

Bình luận "ghế" để nhận tư vấn chọn mẫu phù hợp nhé.` },
];
