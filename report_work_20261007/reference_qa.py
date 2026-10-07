from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image,ImageDraw
p=Path('report_work_20261007'); pdf=pdfium.PdfDocument(str(p/'reference.pdf')); out=p/'reference_pages'; out.mkdir(exist_ok=True)
for n in [0,1,2,3,4,8,17,23,30,34,35,92,127,140,160,165,166]:
 if n<len(pdf): pdf[n].render(scale=1.2).to_pil().save(out/f'page-{n+1}.png')
for start in range(0,len(pdf),24):
 im=Image.new('RGB',(1440,1600),'#ddd'); dr=ImageDraw.Draw(im)
 for j in range(start,min(start+24,len(pdf))):
  page=pdf[j].render(scale=.38).to_pil();page.thumbnail((240,370));x=(j-start)%6*240;y=(j-start)//6*400;im.paste(page,(x,y));dr.text((x+8,y+372),str(j+1),fill='black')
 im.save(out/f'contact-{start//24+1}.jpg')
print(len(pdf))
