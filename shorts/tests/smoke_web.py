"""A real render of the web adapter, with a test-only silent voice fixture; no API calls."""
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'ink'))
from ink import shorts3d

out=Path('shorts/web-smoke').resolve();out.mkdir(parents=True,exist_ok=True)
fixture=out/'fixture.mp3'
subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i','anullsrc=r=44100:cl=mono','-t','1.5',str(fixture)],check=True)
sb=shorts3d.validate({'title':'Kiểm tra kết nối web','hook':'BẮT ĐẦU từ việc nhỏ','palette':['#142438','#e8a15a'],
 'shots':[{'say':'Một bước nhỏ.','visual':'Bóng đèn được ghép từ đế, cổ và bóng phát sáng', 'objects':[
 {'shape':'cylinder','position':[0,-.8,0],'scale':[1.4,.4,1.4],'color':'#64748b'},
 {'shape':'cylinder','position':[0,0,0],'scale':[.4,1.3,.4],'color':'#94a3b8'},
 {'shape':'sphere','position':[0,1,0],'scale':[1.2,1.2,1.2],'color':'#e8a15a','glow':True,'label':'Bắt đầu'}]}]})
shorts3d.preview(sb,str(out))
with patch.object(shorts3d.V,'narrate',return_value=(str(fixture),[(0,0,1.5)],[(0,'Một',0,.5),(0,'bước',.5,1),(0,'nhỏ.',1,1.5)],'test-fixture')):
    shorts3d.render(sb,str(out),{'pace':'normal','mood':'none'})
print('Web adapter: preview + timeline + 3D + assembly + full decode + SRT passed')
