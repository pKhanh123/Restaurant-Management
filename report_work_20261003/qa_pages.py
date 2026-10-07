from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont

work=Path(__file__).resolve().parent
pdf=pdfium.PdfDocument(str(work/'BaoCao_Final_QA.pdf'))
out=work/'allpages';out.mkdir(exist_ok=True)
contacts=work/'contacts';contacts.mkdir(exist_ok=True)
font=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',18)
thumbs=[]
for i in range(len(pdf)):
    image=pdf[i].render(scale=1).to_pil().convert('RGB')
    image.save(out/f'page-{i+1:03d}.png',optimize=True)
    thumb=image.resize((300,424))
    thumbs.append(thumb)
    if len(thumbs)==10 or i==len(pdf)-1:
        sheet=Image.new('RGB',(1500,910),'#e8e8e8')
        draw=ImageDraw.Draw(sheet)
        start=i-len(thumbs)+2
        for j,im in enumerate(thumbs):
            x=(j%5)*300;y=(j//5)*455
            sheet.paste(im,(x,y))
            draw.text((x+8,y+428),str(start+j),font=font,fill='black')
        sheet.save(contacts/f'contact-{(i//10)+1:02d}.jpg',quality=90)
        thumbs=[]
print('rendered',len(pdf),'pages and',len(list(contacts.glob('*.jpg'))),'contact sheets')
