from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image,ImageDraw,ImageFont
import json,sys
w=Path('report_work_20261007'); name=sys.argv[1] if len(sys.argv)>1 else 'final_v1';pdf=pdfium.PdfDocument(str(w/(name+'.pdf')));out=w/(name+'_pages');out.mkdir(exist_ok=True)
texts=[];stats=[];font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
for i in range(len(pdf)):
 page=pdf[i];text=page.get_textpage().get_text_range();texts.append(text)
 page.render(scale=1.35).to_pil().save(out/f'page-{i+1:03d}.png')
 stats.append({'page':i+1,'chars':len(text),'last':text[-170:]})
for start in range(0,len(pdf),16):
 sheet=Image.new('RGB',(1600,2360),'#ddd');draw=ImageDraw.Draw(sheet)
 for i in range(start,min(start+16,len(pdf))):
  im=Image.open(out/f'page-{i+1:03d}.png');im.thumbnail((400,560));x=(i-start)%4*400;y=(i-start)//4*590;sheet.paste(im,(x,y));draw.text((x+10,y+562),str(i+1),fill='black',font=font)
 sheet.save(out/f'contact-{start//16+1:02d}.jpg',quality=88)
(w/(name+'_text.txt')).write_text('\n\n'.join(f'PAGE {i+1}\n{t}' for i,t in enumerate(texts)),encoding='utf-8')
(w/(name+'_stats.json')).write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8')
print('pages',len(pdf),'sparse',[(s['page'],s['chars']) for s in stats if s['chars']<120]);print('errors',[i+1 for i,t in enumerate(texts) if 'Error!' in t or 'Lỗi!' in t])
