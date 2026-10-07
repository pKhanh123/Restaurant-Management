from pathlib import Path
from zipfile import ZipFile
from lxml import etree
from collections import Counter
p=Path('Tuan3_PhanVanKhanh_BaoCaoDaChinhSua.docx')
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with ZipFile(p) as z:
 x=etree.fromstring(z.read('word/document.xml'));parts=Counter()
 print('Field nodes',len(x.xpath('//w:fldChar',namespaces=ns)),'text nodes',len(x.xpath('//w:t',namespaces=ns)))
 print('Field char',Counter(x.xpath('//w:fldChar/@w:fldCharType',namespaces=ns)))
 print('Sections',len(x.xpath('//w:sectPr',namespaces=ns)))
 print('Blank paragraph page breaks',len(x.xpath('//w:p[w:r/w:br[@w:type="page"]]',namespaces=ns)))
 print('Heading breaks',len(x.xpath('//w:pPr/w:pageBreakBefore[not(@w:val="0")]',namespaces=ns)))
