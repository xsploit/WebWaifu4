param(
    [string] $PromptFile = "",
    [string] $CompletionPromise = "YOURWIFEY_GRILLO_MEMORY_COMPLETE",
    [string] $AbortPromise = "",
    [int] $MinIterations = 1,
    [int] $MaxIterations = 20,
    [string] $Workdir = "",
    [string] $Codex = "codex",
    [string] $Model = "",
    [ValidateSet("read-only", "workspace-write", "danger-full-access")]
    [string] $Sandbox = "danger-full-access",
    [string] $ApprovalPolicy = "",
    [string] $LogDir = ".ralph-loop",
    [int] $SleepSeconds = 0,
    [switch] $Search,
    [switch] $Ephemeral,
    [switch] $Json,
    [switch] $SkipGitRepoCheck,
    [switch] $BypassApprovalsAndSandbox,
    [switch] $Status,
    [AllowNull()]
    [string] $AddContext = $null,
    [switch] $ClearContext,
    [switch] $DryRun,
    [string[]] $ExtraArgs = @()
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Workdir)) {
    $Workdir = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
} else {
    $Workdir = (Resolve-Path $Workdir).Path
}

$ResolvedLogDir = Join-Path $Workdir $LogDir
$StateFile = Join-Path $ResolvedLogDir "ralph-state.json"
$ContextFile = Join-Path $ResolvedLogDir "ralph-context.md"
New-Item -ItemType Directory -Force -Path $ResolvedLogDir | Out-Null

function Write-RalphState {
    param(
        [int] $Iteration,
        [string] $LastMessageFile,
        [string] $LogFile,
        [string] $Phase,
        [int] $ExitCode = 0
    )

    $State = [ordered]@{
        active = $Phase -eq "running"
        phase = $Phase
        iteration = $Iteration
        minIterations = $MinIterations
        maxIterations = $MaxIterations
        completionPromise = $CompletionPromise
        abortPromise = $AbortPromise
        promptFile = $PromptFile
        workdir = $Workdir
        lastMessageFile = $LastMessageFile
        lastLogFile = $LogFile
        lastExitCode = $ExitCode
        updatedAt = (Get-Date).ToString("o")
    }
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($StateFile, (($State | ConvertTo-Json -Depth 4) + [Environment]::NewLine), $Utf8NoBom)
}

function Show-RalphStatus {
    Write-Host ("[ralph-codex] workdir: {0}" -f $Workdir)
    Write-Host ("[ralph-codex] state:   {0}" -f $StateFile)
    if (Test-Path -LiteralPath $StateFile) {
        Get-Content -Raw -LiteralPath $StateFile | Write-Host
    } else {
        Write-Host "[ralph-codex] no state file yet"
    }

    if (Test-Path -LiteralPath $ContextFile) {
        $Context = Get-Content -Raw -LiteralPath $ContextFile
        $Preview = if ($Context.Length -gt 500) { $Context.Substring(0, 500) + "..." } else { $Context }
        Write-Host ("[ralph-codex] pending context: {0} bytes" -f $Context.Length)
        Write-Host $Preview
    } else {
        Write-Host "[ralph-codex] no pending context"
    }

    $LastLogs = Get-ChildItem -LiteralPath $ResolvedLogDir -Filter "iteration-*.log" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 3
    if ($LastLogs) {
        Write-Host "[ralph-codex] latest logs:"
        foreach ($Log in $LastLogs) {
            Write-Host ("  {0}" -f $Log.FullName)
        }
    }
}

function Test-ContainsPromise {
    param([string] $Text, [string] $Promise)
    return (-not [string]::IsNullOrWhiteSpace($Promise)) -and $Text.Contains($Promise)
}

if ($Status) {
    Show-RalphStatus
    if ([string]::IsNullOrWhiteSpace($PromptFile)) {
        exit 0
    }
}

if ($ClearContext) {
    Remove-Item -LiteralPath $ContextFile -ErrorAction SilentlyContinue
    Write-Host ("[ralph-codex] cleared context: {0}" -f $ContextFile)
    if ([string]::IsNullOrWhiteSpace($PromptFile) -and -not $PSBoundParameters.ContainsKey("AddContext")) {
        exit 0
    }
}

if ($PSBoundParameters.ContainsKey("AddContext")) {
    $Stamp = Get-Date -Format "o"
    $Entry = "## Operator Context $Stamp`r`n$AddContext`r`n"
    if (Test-Path -LiteralPath $ContextFile) {
        Add-Content -LiteralPath $ContextFile -Value ("`r`n" + $Entry)
    } else {
        $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($ContextFile, ("# Ralph Loop Context`r`n`r`n" + $Entry), $Utf8NoBom)
    }
    Write-Host ("[ralph-codex] added context to {0}" -f $ContextFile)
    if ([string]::IsNullOrWhiteSpace($PromptFile)) {
        exit 0
    }
}

if ([string]::IsNullOrWhiteSpace($PromptFile)) {
    throw "PromptFile is required unless using -Status, -AddContext, or -ClearContext."
}

if (-not (Test-Path -LiteralPath $PromptFile) -and (Test-Path -LiteralPath (Join-Path $Workdir $PromptFile))) {
    $PromptFile = Join-Path $Workdir $PromptFile
}
$PromptFile = (Resolve-Path $PromptFile).Path

Push-Location $Workdir
try {
    for ($Iteration = 1; $Iteration -le $MaxIterations; $Iteration++) {
        $Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $LastMessageFile = Join-Path $ResolvedLogDir ("iteration-{0:D3}-{1}.last.md" -f $Iteration, $Stamp)
        $LogFile = Join-Path $ResolvedLogDir ("iteration-{0:D3}-{1}.log" -f $Iteration, $Stamp)
        $Prompt = Get-Content -Raw -LiteralPath $PromptFile
        $ContextAtStart = ""
        if (Test-Path -LiteralPath $ContextFile) {
            $ContextAtStart = Get-Content -Raw -LiteralPath $ContextFile
        }

        $ContextBlock = ""
        if (-not [string]::IsNullOrWhiteSpace($ContextAtStart)) {
            $ContextBlock = @"

<operator_context>
$ContextAtStart
</operator_context>
"@
        }

        $LoopPrompt = @"
You are Codex running one Ralph Wiggum loop iteration.

Use the stable prompt below. Treat the repository, tests, status docs, logs, and git history as durable memory. Read the requested files before acting. Make the next smallest verified patch, or prove the blocker with exact logs. Update status docs and commit coherent checkpoints when the stable prompt asks for that. Do not print "$CompletionPromise" unless the stable prompt's completion criteria are truly satisfied. If an abort condition is proven, print "$AbortPromise" only when the stable prompt or operator context says to abort.
$ContextBlock
<ralph_prompt>
$Prompt
</ralph_prompt>
"@

        Write-Host ("[ralph-codex] iteration {0}/{1}" -f $Iteration, $MaxIterations)
        Write-RalphState -Iteration $Iteration -LastMessageFile $LastMessageFile -LogFile $LogFile -Phase "running"

        $ArgsList = @(
            "exec",
            "-C", $Workdir,
            "--output-last-message", $LastMessageFile
        )
        if ($BypassApprovalsAndSandbox) {
            $ArgsList += "--dangerously-bypass-approvals-and-sandbox"
        } else {
            $ArgsList += @("--sandbox", $Sandbox)
            if (-not [string]::IsNullOrWhiteSpace($ApprovalPolicy)) {
                Write-Warning "This Codex CLI does not expose --ask-for-approval; ignoring -ApprovalPolicy. Use -BypassApprovalsAndSandbox for unattended no-prompt runs."
            }
        }
        if (-not [string]::IsNullOrWhiteSpace($Model)) {
            $ArgsList += @("--model", $Model)
        }
        if ($Search) {
            $ArgsList += "--search"
        }
        if ($Ephemeral) {
            $ArgsList += "--ephemeral"
        }
        if ($Json) {
            $ArgsList += "--json"
        }
        if ($SkipGitRepoCheck) {
            $ArgsList += "--skip-git-repo-check"
        }
        if ($ExtraArgs.Count -gt 0) {
            $ArgsList += $ExtraArgs
        }
        $ArgsList += $LoopPrompt

        if ($DryRun) {
            Write-Host ("[ralph-codex] workdir: {0}" -f $Workdir)
            Write-Host ("[ralph-codex] prompt:  {0}" -f $PromptFile)
            Write-Host ("[ralph-codex] logs:    {0}" -f $ResolvedLogDir)
            Write-Host ("[ralph-codex] command: {0} {1}" -f $Codex, (($ArgsList[0..($ArgsList.Count - 2)] | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join " "))
            exit 0
        }

        $PreviousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $Output = & $Codex @ArgsList 2>&1
            $ExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $PreviousErrorActionPreference
        }
        $OutputText = $Output | Out-String
        $OutputText | Tee-Object -FilePath $LogFile

        $LastMessage = ""
        if (Test-Path -LiteralPath $LastMessageFile) {
            $LastMessage = Get-Content -Raw -LiteralPath $LastMessageFile
        }
        $PromiseText = $LastMessage
        if ([string]::IsNullOrWhiteSpace($PromiseText)) {
            Write-Warning "[ralph-codex] last assistant message is empty; skipping promise detection for this iteration to avoid matching echoed prompt text."
            $PromiseText = ""
        }

        if (-not [string]::IsNullOrWhiteSpace($ContextAtStart) -and (Test-Path -LiteralPath $ContextFile)) {
            $ContextNow = Get-Content -Raw -LiteralPath $ContextFile
            if ($ContextNow -eq $ContextAtStart) {
                Remove-Item -LiteralPath $ContextFile -ErrorAction SilentlyContinue
                Write-Host "[ralph-codex] consumed pending context"
            }
        }

        if (Test-ContainsPromise -Text $PromiseText -Promise $AbortPromise) {
            Write-RalphState -Iteration $Iteration -LastMessageFile $LastMessageFile -LogFile $LogFile -Phase "aborted" -ExitCode $ExitCode
            Write-Host ("[ralph-codex] abort promise observed: {0}" -f $AbortPromise)
            exit 1
        }

        if (Test-ContainsPromise -Text $PromiseText -Promise $CompletionPromise) {
            if ($Iteration -lt $MinIterations) {
                Write-Host ("[ralph-codex] completion promise observed before min iterations {0}; continuing" -f $MinIterations)
            } else {
                Write-RalphState -Iteration $Iteration -LastMessageFile $LastMessageFile -LogFile $LogFile -Phase "completed" -ExitCode $ExitCode
                Write-Host ("[ralph-codex] completion promise observed: {0}" -f $CompletionPromise)
                exit 0
            }
        }

        Write-RalphState -Iteration $Iteration -LastMessageFile $LastMessageFile -LogFile $LogFile -Phase "running" -ExitCode $ExitCode

        if ($ExitCode -ne 0) {
            Write-Host ("[ralph-codex] codex exited {0}; continuing because completion promise was not observed" -f $ExitCode)
        }

        if ($SleepSeconds -gt 0 -and $Iteration -lt $MaxIterations) {
            Start-Sleep -Seconds $SleepSeconds
        }
    }

    Write-RalphState -Iteration $MaxIterations -LastMessageFile "" -LogFile "" -Phase "max_iterations"
    Write-Error ("[ralph-codex] max iterations reached without completion promise: {0}" -f $CompletionPromise)
    exit 2
} finally {
    Pop-Location
}
