from pathlib import Path
from docx import Document
from docx.shared import Cm
from docx.oxml.ns import qn
from PIL import Image,ImageDraw,ImageFont
import re,json,math
ROOT=Path.cwd();W=ROOT/'report_work_20261007'; D=W/'diagrams';D.mkdir(exist_ok=True)
FONT='C:/Windows/Fonts/times.ttf';BOLD='C:/Windows/Fonts/timesbd.ttf'
def font(n,b=False):return ImageFont.truetype(BOLD if b else FONT,n)
def wrap(draw,text,width,f):
 words=text.split(' ');lines=[];line=''
 for word in words:
  trial=(line+' '+word).strip()
  if draw.textbbox((0,0),trial,font=f)[2]>width and line:lines.append(line);line=word
  else:line=trial
 if line:lines.append(line)
 return lines

def txt(d,box,text,size=32,b=False):
 x,y,x1,y1=box;f=font(size,b);lines=wrap(d,text,x1-x-20,f);height=len(lines)*(size+8);yy=(y+y1-height)/2
 for line in lines:
  bb=d.textbbox((0,0),line,font=f);d.text(((x+x1-bb[2])/2,yy),line,font=f,fill='black');yy+=size+8

def usecase(name,groups):
 im=Image.new('RGB',(1800,250+len(groups)*550),'white');d=ImageDraw.Draw(im)
 txt(d,(20,10,1780,100),'CA SỬ DỤNG HỆ THỐNG CRISPY BITE',44,True)
 for gi,(actor,actions) in enumerate(groups):
  y=130+gi*550;d.rectangle((350,y,1750,y+510),outline='#444',width=3)
  d.ellipse((115,y+160,195,y+240),outline='black',width=4);d.line([(155,y+240),(155,y+340)],fill='black',width=4);d.line([(90,y+280),(220,y+280)],fill='black',width=4);d.line([(100,y+410),(155,y+340),(210,y+410)],fill='black',width=4)
  txt(d,(10,y+425,310,y+505),actor,32,True)
  boxes=[]
  for i,a in enumerate(actions):
   xx=410+(i%2)*650; yy=y+45+(i//2)*145;boxes.append((xx,yy,xx+600,yy+100))
  # Draw association lines first; ellipses cover lines beneath the text.
  for b in boxes:d.line((235,y+280,b[0],(b[1]+b[3])/2),fill='#6B6B6B',width=2)
  for b,a in zip(boxes,actions):d.ellipse(b,fill='#E6EFF7',outline='#444',width=3);txt(d,b,a,31)
 path=D/(name+'.png');im.save(path);return path

schema=(ROOT/'backend/prisma/schema.prisma').read_text(encoding='utf-8');models={}
for name,block in re.findall(r'(?ms)^model\s+(\w+)\s*\{(.*?)^\}',schema):
 fs=[]
 for line in block.splitlines():
  m=re.match(r'^\s*(\w+)\s+(\S+)\s*(.*)$',line)
  if m:fs.append((m[1],m[2],m[3]))
 models[name]=fs

def relational(name,title,names):
 rows=math.ceil(len(names)/2);im=Image.new('RGB',(2000,220+rows*395),'white');d=ImageDraw.Draw(im)
 txt(d,(30,5,1970,90),title,40,True);txt(d,(30,90,1970,155),'PK: khóa chính    FK: khóa ngoại → bảng đích    ?: cho phép rỗng',29)
 for i,n in enumerate(names):
  x=40+(i%2)*990;y=190+(i//2)*395;d.rectangle((x,y,x+930,y+355),fill='#FAFAFA',outline='#333',width=3);d.rectangle((x,y,x+930,y+65),fill='#C5D9F1',outline='#333',width=3)
  txt(d,(x,y,x+930,y+65),n,35 if len(n)<30 else 29,True)
  fks={}
  for f,t,a in models[n]:
   r=re.search(r'@relation\(.*?fields:\s*\[([^]]+)\]',a)
   if r:
    for k in r[1].split(','):fks[k.strip()]=t.rstrip('?[]')
  pks=[f for f,t,a in models[n] if '@id' in a]
  chosen=[f for f,t,a in models[n] if f in pks]+[f for f,t,a in models[n] if f in fks][:3]
  for f,t,a in models[n]:
   if len(chosen)>=5:break
   if f not in chosen and t.rstrip('?[]') not in models:chosen.append(f)
  yy=y+80
  for key in chosen[:5]:
   t=next(t for f,t,a in models[n] if f==key)
   text=('PK ' if key in pks else 'FK ' if key in fks else '')+key+('?' if t.endswith('?') else '')
   if key in fks:text+=' → '+fks[key]
   for line in wrap(d,text,890,font(28)):
    d.text((x+20,yy),line,font=font(28),fill='black');yy+=35
  if len(fks)>3:d.text((x+20,y+316),'Các khóa ngoại khác xem bảng liên kết và Phụ lục A',font=font(24),fill='#444')
 path=D/(name+'.png');im.save(path);return path

doc=Document(ROOT/'Tuan3_PhanVanKhanh_BaoCaoDaChinhSua.docx')
repl={
'Use case bán hàng và khách':usecase('uc_sales',[('Khách hàng',['Xem thực đơn','Gọi món bằng QR','Theo dõi đơn của mình','Đặt bàn và khai báo tiền cọc']),('Thu ngân',['Tạo đơn POS','Áp dụng voucher','Xác nhận thanh toán','Chuyển bàn','Tra cứu hóa đơn','Xử lý đặt bàn'])]),
'Use case nhân sự':usecase('uc_hr',[('Quản trị viên',['Quản lý hồ sơ','Phân ca và duyệt công','Tính và thanh toán lương','Quản lý hoa hồng']),('Nhân viên',['Chấm công vào ca qua kiosk','Chấm công ra ca qua kiosk'])]),
'Quan hệ dữ liệu đơn hàng':relational('sales','LƯỢC ĐỒ QUAN HỆ BÁN HÀNG',['User','DiningTable','Order','OrderItem','MenuItem','OrderPaymentTransaction']),
'Quan hệ dữ liệu kho và mua hàng':relational('inventory','LƯỢC ĐỒ QUAN HỆ KHO VÀ MUA HÀNG',['Ingredient','MenuItemIngredient','InventoryTransaction','Supplier','PurchaseReceipt','PurchaseReceiptLine']),
'Quan hệ dữ liệu nhân sự':relational('hr','LƯỢC ĐỒ QUAN HỆ NHÂN SỰ',['Employee','Department','JobTitle','WorkShift','EmployeeAttendanceSession','EmployeePayrollLine']),
'Quan hệ dữ liệu tài chính':relational('finance','LƯỢC ĐỒ QUAN HỆ SỔ QUỸ',['FinancialAccount','CashVoucher','CashFlowCategory','Supplier','PurchaseReceipt','SupplierPayment'])}
# Rebuild detailed schemas from the explicitly listed model sets near each figure.
lastnames=[]
for p in doc.paragraphs:
 if 'Các bảng chính là ' in p.text:lastnames=p.text.split('Các bảng chính là ')[1].rstrip('.').split(', ')
 if p.style.name=='Caption' and 'ERD chi tiết' in p.text:
  title=p.text.split(': ',1)[1];repl[title]=relational('detail_'+str(len(repl)),title,lastnames)
for p in doc.paragraphs:
 if p.style.name!='Caption':continue
 title=p.text.split(': ',1)[-1]
 if title not in repl:continue
 prev=p._p.getprevious()
 if prev is not None and list(prev.iter(qn('w:drawing'))):
  from docx.text.paragraph import Paragraph
  q=Paragraph(prev,doc._body);q.clear();q.add_run().add_picture(str(repl[title]),width=Cm(16.2));q.paragraph_format.keep_with_next=True
# Full API listing generated from exact mounted router, preserving module table organization.
app=(ROOT/'backend/src/app.ts').read_text(encoding='utf-8');mounts={r:p for p,r in re.findall(r"app\.use\('([^']+)',\s*(\w+)\)",app)}
route_data=[]
for f in sorted((ROOT/'backend/src/modules').rglob('*.routes.ts')):
 src=f.read_text(encoding='utf-8');m=re.search(r'export const (\w+)\s*=\s*Router',src)
 if not m:continue
 router=m[1];prefix=mounts.get(router,'');routes=re.findall(re.escape(router)+r"\.(get|post|put|patch|delete)\(\s*['\"]([^'\"]+)['\"]",src)
 if not routes:continue
 route_data.append((f.parent.name,f.name,prefix,[(method.upper(),prefix+path.rstrip('/')) for method,path in routes]))
used=set();api_check=[]
for t in doc.tables:
 h=[c.text for c in t.rows[0].cells]
 if h!=['STT','Method','Path tương đối']:continue
 prev=t._tbl.getprevious();caption=''.join(x.text or '' for x in prev.iter(qn('w:t')));module=caption.split('Các API của module ')[1]
 options=[(i,r) for i,r in enumerate(route_data) if r[0]==module and i not in used]
 chosen=next(((i,r) for i,r in options if len(r[3])==len(t.rows)-1),options[0] if options else None)
 if not chosen:continue
 i,(mod,filename,prefix,rs)=chosen;used.add(i)
 t.rows[0].cells[2].text='Đường dẫn API đầy đủ'
 if len(t.rows)-1 != len(rs):api_check.append({'module':module,'source_count':len(t.rows)-1,'current_count':len(rs)})
 for row,(method,path) in zip(t.rows[1:],rs):row.cells[1].text=method;row.cells[2].text=path
 # heading and body note before caption
 note=prev.getprevious()
 from docx.text.paragraph import Paragraph
 p=Paragraph(note,doc._body);p.text=f'Router {filename} gồm {len(rs)} method/path, gắn tại {prefix}. Quyền chi tiết được áp dụng qua middleware của từng route.'
 heading=note.getprevious()
 if heading is not None:
  p=Paragraph(heading,doc._body);p.style='Heading 2';p.text=f'B.{len(used)}. Module '+('attendance-kiosk' if 'kiosk' in filename else mod)
for p in doc.paragraphs:
 if p.text.startswith('Danh mục này được trích máy'):p.text='Danh mục tổng hợp các method/path trong tệp *.routes.ts và tiền tố router được mount tại backend/src/app.ts. Đường dẫn dưới đây là đường dẫn đầy đủ; tham số bắt đầu bằng dấu hai chấm được thay bằng giá trị khi gọi API. Phân quyền, request và response phải đối chiếu controller, schema và middleware tương ứng.'
# Tell exactly what the schematic notation does.
for p in doc.paragraphs:
 if p.text.startswith('Dữ liệu quan hệ được chia') or p.text.startswith('Mô hình dữ liệu được chia'):pass
# Ensure updated text remains formatted.
from docx.shared import Pt,RGBColor
for t in doc.tables:
 for ri,row in enumerate(t.rows):
  for c in row.cells:
   for p in c.paragraphs:
    for r in p.runs:
     if r.font.size is None:r.font.size=Pt(11);r.font.name='Times New Roman';r.font.color.rgb=RGBColor(0,0,0);r.bold=ri==0
(W/'api_check.json').write_text(json.dumps({'routers':len(route_data),'matched':len(used),'count_changes':api_check},ensure_ascii=False,indent=2),encoding='utf-8')
doc.save(ROOT/'Tuan3_PhanVanKhanh_BaoCaoDaChinhSua.docx')
print('Rebuilt diagrams',len(repl),'API matched',len(used),'of',len(route_data))
