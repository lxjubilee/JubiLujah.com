$ErrorActionPreference = 'Stop'
$log = 'w:\jubilujah.com\driver-install.log'
function W($m){ $m | Tee-Object -FilePath $log -Append }
"=== Driver install started ===" | Set-Content -Path $log
try {
  $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  W ("Elevated (admin): " + $admin)
  $s=New-Object -ComObject Microsoft.Update.Session
  $sr=$s.CreateUpdateSearcher()
  W "Searching..."
  $r=$sr.Search("IsInstalled=0 and Type='Driver'")
  W ("Found " + $r.Updates.Count + " updates.")
  $dl=New-Object -ComObject Microsoft.Update.UpdateColl
  foreach($u in $r.Updates){ $u.AcceptEula() | Out-Null; $dl.Add($u) | Out-Null }
  $d=$s.CreateUpdateDownloader(); $d.Updates=$dl
  W "Downloading..."
  $dres=$d.Download()
  W ("Download result code: " + $dres.ResultCode)
  $inst=New-Object -ComObject Microsoft.Update.UpdateColl
  foreach($u in $r.Updates){ if($u.IsDownloaded){ $inst.Add($u) | Out-Null } }
  W ("Downloaded and ready to install: " + $inst.Count)
  if($inst.Count -gt 0){
    $i=$s.CreateUpdateInstaller(); $i.Updates=$inst
    W "Installing..."
    $ires=$i.Install()
    W ("Install result code: " + $ires.ResultCode + "  RebootRequired: " + $ires.RebootRequired)
    for($x=0; $x -lt $inst.Count; $x++){ $ur=$ires.GetUpdateResult($x); W (" - [" + $ur.ResultCode + "] " + $inst.Item($x).Title) }
  } else {
    W "Nothing downloaded - install skipped."
  }
} catch {
  W ("ERROR: " + $_.Exception.Message)
}
W "=== Done ==="
