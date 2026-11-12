try {
    $excel = New-Object -ComObject Excel.Application
    Write-Output "Excel COM OK - Version: $($excel.Version)"
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
