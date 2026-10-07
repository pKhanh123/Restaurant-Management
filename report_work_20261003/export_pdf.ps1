$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath '.').Path
$docx = Join-Path $root 'Tuan3_PhanVanKhanh_BaoCaoHoanChinh.docx'
$pdf = Join-Path $root 'report_work_20261003\BaoCao_Final_QA.pdf'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$document = $null
try {
    Write-Output 'Opening document'
    $document = $word.Documents.Open($docx, $false, $true)
    Write-Output ('Pages=' + $document.ComputeStatistics(2))
    Write-Output 'Saving PDF'
    $document.SaveAs2($pdf, 17)
    Write-Output 'PDF saved'
}
finally {
    if ($document -ne $null) { $document.Close(0) }
    $word.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
