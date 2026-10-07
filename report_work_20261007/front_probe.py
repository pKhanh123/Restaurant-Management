from docx import Document
from docx.oxml.ns import qn
p=Document('Tuan3_PhanVanKhanh_BaoCaoDaChinhSua.docx')
for i,x in enumerate(p.paragraphs[:95]):
 print(i,x.style.name,repr(x.text[:95]),'break',x._p.xpath('.//w:br/@w:type'),'sect',len(x._p.xpath('.//w:sectPr')),'pbreak',x.paragraph_format.page_break_before)
for s in p.sections:print(s._sectPr.xml)
print('evenodd',p.settings.odd_and_even_pages_header_footer)
