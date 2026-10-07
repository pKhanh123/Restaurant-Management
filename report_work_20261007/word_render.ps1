param([string]$InputPath,[string]$OutputPath,[switch]$Refresh)
$ErrorActionPreference='Stop'
$word=New-Object -ComObject Word.Application
$word.Visible=$false
$word.DisplayAlerts=0
$doc=$null
try {
 $doc=$word.Documents.Open($InputPath,$false,(-not $Refresh))
 if($Refresh){
  for($i=0;$i -lt 2;$i++){
   [void]$doc.Fields.Update()
   foreach($t in $doc.TablesOfContents){$t.Update()}
   foreach($t in $doc.TablesOfFigures){$t.Update()}
   $doc.Repaginate()
  }
  $doc.Save()
 }
 $doc.ExportAsFixedFormat($OutputPath,17)
 Write-Output ('Pages='+$doc.ComputeStatistics(2)+'; TOC='+$doc.TablesOfContents.Count+'; TOF='+$doc.TablesOfFigures.Count)
} finally {if($doc){$doc.Close(0)};$word.Quit();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)}
