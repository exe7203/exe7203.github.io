Add-Type -AssemblyName System.Drawing

function New-QuickNavIcon {
    param(
        [Parameter(Mandatory = $true)][int]$Size,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#171819'))

    $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(42, 209, 213, 217), ($Size * 0.012))
    $graphics.DrawEllipse($ringPen, ($Size * 0.09), ($Size * 0.09), ($Size * 0.82), ($Size * 0.82))

    $routePen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#d1d5d9'), ($Size * 0.075))
    $routePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $routePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawBezier(
        $routePen,
        [System.Drawing.PointF]::new(($Size * 0.26), ($Size * 0.72)),
        [System.Drawing.PointF]::new(($Size * 0.55), ($Size * 0.62)),
        [System.Drawing.PointF]::new(($Size * 0.36), ($Size * 0.28)),
        [System.Drawing.PointF]::new(($Size * 0.72), ($Size * 0.27))
    )

    $darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#171819'))
    $silverBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#d1d5d9'))
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f4f5f6'))

    $small = $Size * 0.105
    $large = $Size * 0.17
    $graphics.FillEllipse($silverBrush, ($Size * 0.20), ($Size * 0.66), $small, $small)
    $graphics.FillEllipse($darkBrush, ($Size * 0.225), ($Size * 0.685), ($small * 0.52), ($small * 0.52))
    $graphics.FillEllipse($whiteBrush, ($Size * 0.635), ($Size * 0.185), $large, $large)
    $graphics.FillEllipse($darkBrush, ($Size * 0.688), ($Size * 0.238), ($large * 0.38), ($large * 0.38))

    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $ringPen.Dispose()
    $routePen.Dispose()
    $darkBrush.Dispose()
    $silverBrush.Dispose()
    $whiteBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

$publicDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'public'
New-QuickNavIcon -Size 192 -OutputPath (Join-Path $publicDirectory 'icon-192.png')
New-QuickNavIcon -Size 512 -OutputPath (Join-Path $publicDirectory 'icon-512.png')
New-QuickNavIcon -Size 180 -OutputPath (Join-Path $publicDirectory 'apple-touch-icon.png')
