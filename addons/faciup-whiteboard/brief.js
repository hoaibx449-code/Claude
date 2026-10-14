import { WB_KINDS_ } from './faciup-schema.js';
export function whiteboardDirections(){return [
 'Bạn thiết kế WHITEBOARD VẼ TAY cho đúng ý lời kể, không tạo ảnh raster, không sao chép vài cảnh mẫu.',
 'Ưu tiên biểu tượng dễ nhận biết, đối tượng + hành động + quan hệ nhân quả. Chữ là nhãn ngắn nằm cạnh hình, không đoạn văn bên dưới. Đừng dùng hình học vô nghĩa hay ảnh cô gái mặc định.',
 'Mỗi cảnh 2–5 đối tượng vừa đủ giải thích ý chính, bố cục rõ, không chồng nhau. Màu tươi đa dạng, viền tối, nền trắng; bộ dựng tự làm nét tự nhiên và tô màu sau nét.',
 'JSON whiteboard={title:"tiêu đề ngắn",meaning:"ý cần truyền đạt",objects:[{kind:"...",x:0.2,y:0.3,scale:1,label:"≤5 từ",color:"#RRGGBB"}]}. x,y là tọa độ chuẩn hoá vùng minh hoạ 0..1; đặt cách nhau >=0.25, không để cả hình ở mép. 2 đối tượng: x .25/.75 y .35; 3: x .2/.5/.8 y .35; bố cục 2 hàng: y .25/.68.',
 'kind: '+WB_KINDS_.join(', ')+'. arrow cần to:[x,y]; calendar label là ngày/giờ; battery label có thể là Cạn sức; book label tên sách ngắn.',
 'Các kind là công cụ, không phải giới hạn nội dung. Nếu cần vật khác, dùng custom với paths:[{points:[[x,y],...],closed:true,fill:"#..."}], tọa độ cục bộ -150..150 quanh tâm đối tượng. Vẽ đường bao vật nhận biết được; cấm chuỗi nét ngẫu nhiên hoặc vòng tròn/trang giấy trống để lấp chỗ. Không sinh JavaScript, HTML hoặc SVG thực thi.',
 'Không tự thêm thương hiệu, tên cá nhân, giới tính, lời thoại hay CTA ngoài yêu cầu người dùng.'
].join('\n');}
