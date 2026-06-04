$url = "https://skyeqimwnyuuozvhubdc.supabase.co/rest/v1/test_results?select=*&order=tc_id"
$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNreWVxaW13bnl1dW96dmh1YmRjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM0NTY0MSwiZXhwIjoyMDg3OTIxNjQxfQ.ffD2MkxHuoACeI6Ks8VAWy2OXj4BvWFYeXCpQIxG7jc"

$result = Invoke-RestMethod -Uri $url -Method GET -Headers @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

$result | ForEach-Object { Write-Host "$($_.tc_id) - $($_.status) - by: $($_.tested_by)" }
