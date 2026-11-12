# Read sheet names from an Excel file via COM Automation.
# Handles SharePoint sharing links by converting them to download URLs.
# Usage: powershell -ExecutionPolicy Bypass -File read-sheets.ps1 -Url "https://..."
# Output: JSON array of sheet names, e.g. ["Sales","Outlet","DSE"]

param(
    [Parameter(Mandatory=$true)]
    [string]$Url
)

$ErrorActionPreference = "Stop"

# --- Convert SharePoint sharing link to a URL Excel can open ---

function Convert-SharePointUrl {
    param([string]$InputUrl)

    # Pattern 1: OneDrive personal sharing link
    # https://host/:x:/g/personal/USER/SHARE_ID?e=TOKEN
    $personalPattern = '^(https?://[^/]+)/:[a-z]:/[a-z]/(personal/[^/]+)/([^?]+)'
    if ($InputUrl -match $personalPattern) {
        $host_ = $Matches[1]
        $userPath = $Matches[2]
        $shareId = $Matches[3]
        $downloadUrl = "$host_/$userPath/_layouts/15/download.aspx?share=$shareId"
        Write-Host "Converted to download URL: $downloadUrl" -ForegroundColor Cyan
        return $downloadUrl
    }

    # Pattern 2: SharePoint site sharing link
    # https://host/:x:/r/sites/SITENAME/Shared Documents/path/file.xlsx?d=SHARE_ID&csf=1
    $sitePattern = '^(https?://[^/]+)/:[a-z]:/[a-z]/(sites/[^?]+)\?'
    if ($InputUrl -match $sitePattern) {
        $host_ = $Matches[1]
        $sitePath = $Matches[2]
        $directUrl = "$host_/$sitePath"
        Write-Host "Converted to direct URL: $directUrl" -ForegroundColor Cyan
        return $directUrl
    }

    # Not a sharing link, return as-is
    Write-Host "Using URL as-is (not a recognized sharing link format)" -ForegroundColor Yellow
    return $InputUrl
}

$openUrl = Convert-SharePointUrl -InputUrl $Url
$excel = $null
$workbook = $null
$tempFile = $null

try {
    # Strategy 1: Try downloading via download.aspx URL first, then open locally
    if ($openUrl -match 'download\.aspx') {
        $tempFile = [System.IO.Path]::Combine($env:TEMP, "wa_preview_$([guid]::NewGuid().ToString('N').Substring(0,8)).xlsx")
        
        Write-Host "Attempting download to temp file..." -ForegroundColor Cyan
        try {
            # Try with default credentials (works on domain-joined machines)
            $wc = New-Object System.Net.WebClient
            $wc.UseDefaultCredentials = $true
            $wc.Headers.Add("User-Agent", "Mozilla/5.0")
            $wc.DownloadFile($openUrl, $tempFile)
            
            # Verify it's actually an Excel file (not HTML error page)
            $bytes = [System.IO.File]::ReadAllBytes($tempFile)
            if ($bytes.Length -lt 100) {
                throw "Downloaded file too small ($($bytes.Length) bytes)"
            }
            # Check for ZIP magic bytes (xlsx is a zip)
            if ($bytes[0] -ne 0x50 -or $bytes[1] -ne 0x4B) {
                throw "Downloaded file is not a valid xlsx (wrong magic bytes)"
            }

            Write-Host "Download successful, opening locally..." -ForegroundColor Green
            $excel = New-Object -ComObject Excel.Application
            $excel.Visible = $false
            $excel.DisplayAlerts = $false
            $excel.AskToUpdateLinks = $false
            $excel.AutomationSecurity = 3
            $workbook = $excel.Workbooks.Open($tempFile, 0, $true)
        } catch {
            Write-Host "Download failed: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "Falling back to Excel COM direct open..." -ForegroundColor Cyan
            
            # Clean up temp file if it exists
            if (Test-Path $tempFile) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
            $tempFile = $null
            
            # Fall through to Strategy 2
        }
    }

    # Strategy 2: Let Excel COM open the URL directly (Excel handles auth)
    if ($workbook -eq $null) {
        if ($excel -eq $null) {
            $excel = New-Object -ComObject Excel.Application
            $excel.Visible = $false
            $excel.DisplayAlerts = $false
            $excel.AskToUpdateLinks = $false
            $excel.AutomationSecurity = 3
        }

        Write-Host "Opening via Excel COM with URL: $openUrl" -ForegroundColor Cyan
        $workbook = $excel.Workbooks.Open($openUrl, 0, $true)

        # Verify the workbook is valid (not HTML garbage)
        $firstSheetName = $workbook.Worksheets.Item(1).Name
        if ($firstSheetName.Length -gt 31 -or $firstSheetName -match '^[A-Za-z0-9+/=]{20,}$') {
            Write-Host "Workbook seems invalid (sheet name looks like URL fragment), trying original URL..." -ForegroundColor Yellow
            $workbook.Close($false)
            $workbook = $null

            # Strategy 3: Try original URL
            if ($openUrl -ne $Url) {
                Write-Host "Trying original URL: $Url" -ForegroundColor Cyan
                $workbook = $excel.Workbooks.Open($Url, 0, $true)
            }
        }
    }

    if ($workbook -eq $null) {
        throw "Tidak bisa membuka file dari URL yang diberikan"
    }

    # Baca nama-nama worksheet
    $sheetNames = @()
    foreach ($ws in $workbook.Worksheets) {
        $sheetNames += $ws.Name
    }

    # Validate: sheet names shouldn't look like URL fragments
    $validSheets = @()
    foreach ($name in $sheetNames) {
        if ($name -notmatch '^[A-Za-z0-9+/=]{20,}$') {
            $validSheets += $name
        }
    }

    if ($validSheets.Count -eq 0 -and $sheetNames.Count -gt 0) {
        throw "File terbaca tapi sheet names tidak valid (kemungkinan file tidak terbuka dengan benar). Pastikan kamu sudah login akun kantor di Microsoft Office."
    }

    $result = if ($validSheets.Count -gt 0) { $validSheets } else { $sheetNames }

    # Output sebagai JSON array
    $result | ConvertTo-Json -Compress

} catch {
    $errMsg = $_.Exception.Message -replace '"', '\"'
    Write-Output "{`"error`":`"$errMsg`"}"
    exit 1
} finally {
    if ($workbook -ne $null) {
        try { $workbook.Close($false) } catch {}
    }
    if ($excel -ne $null) {
        try { $excel.Quit() } catch {}
        try { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null } catch {}
    }
    if ($tempFile -ne $null -and (Test-Path $tempFile)) {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
