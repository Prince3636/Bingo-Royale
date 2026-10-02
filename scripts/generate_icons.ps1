[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')

$srcPath = "C:\Users\raj72\.gemini\antigravity-ide\brain\fa4fed88-970c-4d8e-a6f2-c66e036f0123\.user_uploaded\media_1790574151161.jpg"
if (!(Test-Path $srcPath)) {
    Write-Error "Source icon not found at $srcPath"
    exit 1
}

$src = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Source image loaded successfully: $($src.Width)x$($src.Height)"

# Helper to create high quality graphics object
function Get-HQGraphics($destBitmap) {
    $g = [System.Drawing.Graphics]::FromImage($destBitmap)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    return $g
}

# Standard direct resize
function Resize-Image($img, $width, $height, $outPath) {
    $dest = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = Get-HQGraphics $dest
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($img, 0, 0, $width, $height)
    $dest.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    Write-Host "  -> Generated: $outPath ($width x $height)"
}

# Rounded rectangle launcher icon
function Create-RoundedIcon($img, $size, $radiusPercent, $outPath) {
    $dest = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = Get-HQGraphics $dest
    $g.Clear([System.Drawing.Color]::Transparent)

    $radius = [int]($size * $radiusPercent)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $radius, $radius, 180, 90)
    $path.AddArc($size - $radius, 0, $radius, $radius, 270, 90)
    $path.AddArc($size - $radius, $size - $radius, $radius, $radius, 0, 90)
    $path.AddArc(0, $size - $radius, $radius, $radius, 90, 90)
    $path.CloseFigure()

    $g.SetClip($path)
    $g.DrawImage($img, 0, 0, $size, $size)
    $path.Dispose()

    $dest.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    Write-Host "  -> Generated Rounded Icon: $outPath ($size x $size)"
}

# Circular launcher icon
function Create-RoundIcon($img, $size, $outPath) {
    $dest = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = Get-HQGraphics $dest
    $g.Clear([System.Drawing.Color]::Transparent)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $size, $size)
    $g.SetClip($path)
    $g.DrawImage($img, 0, 0, $size, $size)
    $path.Dispose()

    $dest.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    Write-Host "  -> Generated Round Icon: $outPath ($size x $size)"
}

# Adaptive foreground icon (Android 8.0+): safe zone is the central ~70%
function Create-AdaptiveForeground($img, $size, $outPath) {
    $dest = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = Get-HQGraphics $dest
    $g.Clear([System.Drawing.Color]::Transparent)

    # Scale icon to ~72% so crown and text are inside the safe adaptive viewport
    $scale = 0.72
    $fgSize = [int]($size * $scale)
    $offset = [int](($size - $fgSize) / 2)

    $g.DrawImage($img, $offset, $offset, $fgSize, $fgSize)
    $dest.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    Write-Host "  -> Generated Adaptive Foreground: $outPath ($size x $size)"
}

# Splash screen generator (centered icon on dark purple background)
function Create-SplashImage($img, $width, $height, $outPath) {
    $dest = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = Get-HQGraphics $dest
    $bgColor = [System.Drawing.ColorTranslator]::FromHtml("#160432")
    $g.Clear($bgColor)

    # Size icon appropriately for splash
    $minDim = [Math]::Min($width, $height)
    $iconDim = [Math]::Min([int]($minDim * 0.45), 360)
    $x = [int](($width - $iconDim) / 2)
    $y = [int](($height - $iconDim) / 2)

    $g.DrawImage($img, $x, $y, $iconDim, $iconDim)
    $dest.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    Write-Host "  -> Generated Splash: $outPath ($width x $height)"
}

Write-Host "`n1. Generating Android Mipmap Icons..."
$densities = @(
    @{ folder = 'mipmap-mdpi'; size = 48; fgSize = 108 },
    @{ folder = 'mipmap-hdpi'; size = 72; fgSize = 162 },
    @{ folder = 'mipmap-xhdpi'; size = 96; fgSize = 216 },
    @{ folder = 'mipmap-xxhdpi'; size = 144; fgSize = 324 },
    @{ folder = 'mipmap-xxxhdpi'; size = 192; fgSize = 432 }
)

foreach ($d in $densities) {
    $dir = "d:\Projects\bingo-royale\android\app\src\main\res\$($d.folder)"
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
    # Legacy Square/Squircle Icon
    Create-RoundedIcon $src $d.size 0.22 "$dir\ic_launcher.png"
    # Legacy Round Icon
    Create-RoundIcon $src $d.size "$dir\ic_launcher_round.png"
    # Adaptive Foreground
    Create-AdaptiveForeground $src $d.fgSize "$dir\ic_launcher_foreground.png"
}

Write-Host "`n2. Generating Web & Play Store Assets..."
$publicDir = "d:\Projects\bingo-royale\public"
if (!(Test-Path $publicDir)) { New-Item -ItemType Directory -Path $publicDir -Force | Out-Null }

Resize-Image $src 512 512 "d:\Projects\bingo-royale\android\app\src\main\playstore-icon-512.png"
Resize-Image $src 192 192 "$publicDir\icon-192.png"
Resize-Image $src 512 512 "$publicDir\icon-512.png"
Resize-Image $src 64 64 "$publicDir\favicon.png"
Resize-Image $src 1024 1024 "$publicDir\app-icon-source.png"

Write-Host "`n3. Generating Android Splash Screens..."
$splashConfigs = @(
    @{ folder = 'drawable'; w = 480; h = 800 },
    @{ folder = 'drawable-port-mdpi'; w = 320; h = 480 },
    @{ folder = 'drawable-port-hdpi'; w = 480; h = 800 },
    @{ folder = 'drawable-port-xhdpi'; w = 720; h = 1280 },
    @{ folder = 'drawable-port-xxhdpi'; w = 960; h = 1600 },
    @{ folder = 'drawable-port-xxxhdpi'; w = 1280; h = 1920 },
    @{ folder = 'drawable-land-mdpi'; w = 480; h = 320 },
    @{ folder = 'drawable-land-hdpi'; w = 800; h = 480 },
    @{ folder = 'drawable-land-xhdpi'; w = 1280; h = 720 },
    @{ folder = 'drawable-land-xxhdpi'; w = 1600; h = 960 },
    @{ folder = 'drawable-land-xxxhdpi'; w = 1920; h = 1280 }
)

foreach ($sc in $splashConfigs) {
    $dir = "d:\Projects\bingo-royale\android\app\src\main\res\$($sc.folder)"
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Create-SplashImage $src $sc.w $sc.h "$dir\splash.png"
}

$src.Dispose()
Write-Host "`n=== ALL ANDROID & WEB ICONS SUCCESSFULLY GENERATED ==="
