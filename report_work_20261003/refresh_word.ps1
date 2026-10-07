$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath '.').Path
$docx = Join-Path $root 'Tuan3_PhanVanKhanh_BaoCaoHoanChinh.docx'
$pdf = Join-Path $root 'report_work_20261003\BaoCao_Final_QA.pdf'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$document = $null
try {
    $document = $word.Documents.Open($docx)
    [void]$document.Fields.Update()
    foreach ($toc in $document.TablesOfContents) { $toc.Update() }
    foreach ($tof in $document.TablesOfFigures) { $tof.Update() }
    $document.Repaginate()
    [void]$document.Fields.Update()
    foreach ($toc in $document.TablesOfContents) { $toc.Update() }
    foreach ($tof in $document.TablesOfFigures) { $tof.Update() }
    $document.Repaginate()
    $document.Save()
    $document.ExportAsFixedFormat($pdf, 17)
    Write-Output ('Pages=' + $document.ComputeStatistics(2))
    Write-Output ('TOC=' + $document.TablesOfContents.Count + '; TOF=' + $document.TablesOfFigures.Count)
}
finally {
    if ($document -ne $null) { $document.Close(0) }
    $word.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
