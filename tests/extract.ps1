Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path "Master_Resume.docx"))
$e = $z.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
$s = $e.Open()
$r = New-Object System.IO.StreamReader($s)
$t = $r.ReadToEnd()
$r.Close()
$s.Close()
$z.Dispose()
$clean = [System.Text.RegularExpressions.Regex]::Replace($t, '<[^>]+>', ' ')
$clean = $clean -replace '&amp;', '&' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&quot;', '"'
Write-Output ([System.Text.RegularExpressions.Regex]::Replace($clean, '\s+', ' ').Trim())
