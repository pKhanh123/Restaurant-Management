from pathlib import Path
import pypdfium2 as pdfium
p=pdfium.PdfDocument('report_work_20261007/final_v1.pdf')
no=[]
for i in range(len(p)):
 t=p[i].get_textpage().get_text_range()
 if 'Đồ án 3:' not in t:no.append(i+1)
print('header absent',no)
