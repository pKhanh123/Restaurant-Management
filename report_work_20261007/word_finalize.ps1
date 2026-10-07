param([string]$InputPath,[string]$OutputPath)
$ErrorActionPreference='Stop'
$word=New-Object -ComObject Word.Application
$word.Visible=$false
$word.DisplayAlerts=0
$word.ScreenUpdating=$false
$doc=$null
try {
 Write-Output 'Opening report'
 $doc=$word.Documents.Open($InputPath,$false,$false)
 $doc.ActiveWindow.View.Type=1
 $word.Options.Pagination=$false
 Write-Output 'Updating caption fields and contents'
 [void]$doc.Fields.Update()
 Write-Output 'Repaginating'
 $doc.Repaginate()
 foreach($t in $doc.TablesOfContents){$t.UpdatePageNumbers()}
 foreach($t in $doc.TablesOfFigures){$t.UpdatePageNumbers()}
 $doc.Repaginate()
 Write-Output 'Saving DOCX'
 $doc.Save()
 Write-Output 'Exporting PDF'
 $doc.ExportAsFixedFormat($OutputPath,17)
 Write-Output ('Pages='+$doc.ComputeStatistics(2)+'; TOC='+$doc.TablesOfContents.Count+'; TOF='+$doc.TablesOfFigures.Count)
} finally {if($doc){$doc.Close(0)};$word.Quit();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)}
