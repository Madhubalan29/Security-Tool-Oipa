
param([string])
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
Add-Type -AssemblyName System.Runtime.WindowsRuntime

 = ([System.Windows.Forms.Form].Assembly.GetType('System.Windows.Forms.TaskExtensions') -or [object])

function Await() {
    while (.Status -eq 'Started') { [System.Threading.Thread]::Sleep(10) }
    return .GetResults()
}

[Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime] | Out-Null

 = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync())
 = Await (.OpenAsync([Windows.Storage.FileAccessMode]::Read))
 = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync())
 = Await (.GetSoftwareBitmapAsync())
 = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
 = Await (.RecognizeAsync())
Write-Output .Text
