param(
    [string]$Owner = "MrdjaMarko",
    [string]$Repo = "ProTuneMaps",
    [string]$ProjectTitle = "ProTuneMaps MVP Backlog",
    [switch]$SkipProject
)

$ErrorActionPreference = "Stop"

function Ensure-Label {
    param(
        [string]$Name,
        [string]$Color,
        [string]$Description
    )

    $existing = gh label list --repo "$Owner/$Repo" --json name --limit 200 | ConvertFrom-Json
    if (-not ($existing | Where-Object { $_.name -eq $Name })) {
        gh label create $Name --repo "$Owner/$Repo" --color $Color --description $Description | Out-Null
    }
}

$labelsToEnsure = @(
    @{ name = "type:feature"; color = "1f6feb"; description = "Feature work" },
    @{ name = "priority:P0"; color = "d1242f"; description = "Must ship in MVP" },
    @{ name = "priority:P1"; color = "fbca04"; description = "Post-core MVP" },
    @{ name = "sprint:1"; color = "0e8a16"; description = "Sprint 1" },
    @{ name = "sprint:2"; color = "0b7f13"; description = "Sprint 2" },
    @{ name = "sprint:3"; color = "07670f"; description = "Sprint 3" },
    @{ name = "sprint:4"; color = "055a0c"; description = "Sprint 4" },
    @{ name = "area:auth"; color = "5319e7"; description = "Authentication and identity" },
    @{ name = "area:tuner"; color = "6f42c1"; description = "Tuner profile and workflows" },
    @{ name = "area:compatibility"; color = "c2e0c6"; description = "Vehicle compatibility systems" },
    @{ name = "area:marketplace"; color = "bfdadc"; description = "Marketplace discovery" },
    @{ name = "area:listings"; color = "fef2c0"; description = "Map listing lifecycle" },
    @{ name = "area:delivery"; color = "f9d0c4"; description = "File delivery and entitlements" },
    @{ name = "area:checkout"; color = "0052cc"; description = "Payments and checkout" },
    @{ name = "area:orders"; color = "0366d6"; description = "Order management" },
    @{ name = "area:support"; color = "bfd4f2"; description = "Support and ticketing" },
    @{ name = "area:admin"; color = "d4c5f9"; description = "Admin and moderation" },
    @{ name = "area:reviews"; color = "f9d0c4"; description = "Ratings and reviews" },
    @{ name = "area:platform"; color = "cfd3d7"; description = "Observability and platform" }
)

foreach ($label in $labelsToEnsure) {
    Ensure-Label -Name $label.name -Color $label.color -Description $label.description
}

$issuesPath = Join-Path $PSScriptRoot "issues.json"
$issues = Get-Content $issuesPath -Raw | ConvertFrom-Json

$createdIssues = @()

foreach ($issue in $issues) {
    $existingIssue = gh issue list --repo "$Owner/$Repo" --search "in:title \"$($issue.title)\"" --json number,title --limit 10 | ConvertFrom-Json |
        Where-Object { $_.title -eq $issue.title } |
        Select-Object -First 1

    if ($existingIssue) {
        $createdIssues += [PSCustomObject]@{
            id = $issue.id
            number = $existingIssue.number
            title = $existingIssue.title
        }
        continue
    }

    $labels = $issue.labels -join ","
    $created = gh issue create --repo "$Owner/$Repo" --title $issue.title --body $issue.body --label $labels --json number,title,url | ConvertFrom-Json
    $createdIssues += [PSCustomObject]@{
        id = $issue.id
        number = $created.number
        title = $created.title
    }
}

if (-not $SkipProject) {
    $project = gh project list --owner $Owner --format json | ConvertFrom-Json | Where-Object { $_.title -eq $ProjectTitle } | Select-Object -First 1

    if (-not $project) {
        gh project create --owner $Owner --title $ProjectTitle | Out-Null
        $project = gh project list --owner $Owner --format json | ConvertFrom-Json | Where-Object { $_.title -eq $ProjectTitle } | Select-Object -First 1
    }

    if ($project) {
        gh project link $project.number --owner $Owner --repo "$Owner/$Repo" | Out-Null

        foreach ($item in $createdIssues) {
            gh project item-add $project.number --owner $Owner --url "https://github.com/$Owner/$Repo/issues/$($item.number)" | Out-Null
        }
    }
}

Write-Host "Created or found $($createdIssues.Count) issues in $Owner/$Repo"
$createdIssues | Sort-Object number | Format-Table -AutoSize
