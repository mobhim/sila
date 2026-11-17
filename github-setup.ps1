# صلة — ربط المشروع بـ GitHub
# التشغيل:  انقر بزر الفأرة الأيمن على الملف ثم "Run with PowerShell"
#           أو من الطرفية داخل مجلد المشروع:  powershell -ExecutionPolicy Bypass -File .\github-setup.ps1
#
# قبل التشغيل:
#   1) ثبّت Git من https://git-scm.com/download/win  (أو: winget install --id Git.Git -e)
#   2) أنشئ مستودعاً فارغاً على https://github.com/new  (بدون README وبدون .gitignore)
#   3) انسخ رابط المستودع، مثل: https://github.com/USERNAME/sila.git

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location -LiteralPath $PSScriptRoot

function Fail($msg) { Write-Host "`n$msg" -ForegroundColor Red; Read-Host 'اضغط Enter للإغلاق'; exit 1 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail 'Git غير مثبّت. ثبّته من https://git-scm.com/download/win ثم أعد تشغيل هذا الملف.'
}

if (-not (Test-Path .git)) {
  git init -b main | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail 'تعذّر إنشاء المستودع المحلي.' }
  Write-Host 'تم إنشاء المستودع المحلي (الفرع main).' -ForegroundColor Green
}

# لا يُرفع المفتاح أبداً: يجب أن يكون .env مستثنى
git check-ignore -q .env
if ($LASTEXITCODE -ne 0) { Fail 'الملف .env غير مستثنى في .gitignore. أوقفت الرفع حمايةً للمفتاح.' }

if (-not (git config user.name))  { $n = Read-Host 'اسمك كما يظهر في GitHub'; git config user.name  $n }
if (-not (git config user.email)) { $e = Read-Host 'بريدك المسجّل في GitHub';  git config user.email $e }

if ((git remote) -notcontains 'origin') {
  $remote = Read-Host 'الصق رابط المستودع (https://github.com/USERNAME/REPO.git)'
  if ($remote -notmatch '^(https://github\.com/|git@github\.com:).+') { Fail 'الرابط لا يبدو رابط مستودع GitHub.' }
  git remote add origin $remote
}
$remote = git remote get-url origin

git add -A
if (git ls-files .env) { git rm --cached -q .env; Fail 'وُجد .env ضمن الملفات المتتبَّعة وأزلته. أعد تشغيل الملف.' }

if (git status --porcelain) {
  $msg = Read-Host 'وصف التغيير (Enter = "تحديث صلة")'
  if (-not $msg) { $msg = 'تحديث صلة' }
  git commit -q -m $msg
  if ($LASTEXITCODE -ne 0) { Fail 'تعذّر حفظ التغييرات.' }
  Write-Host 'تم حفظ التغييرات.' -ForegroundColor Green
} else {
  Write-Host 'لا تغييرات جديدة للحفظ.'
}

Write-Host "الرفع إلى $remote ..."
git push -u origin main
if ($LASTEXITCODE -ne 0) { Fail 'فشل الرفع. تأكد من تسجيل الدخول إلى GitHub في النافذة التي تظهر، ومن أن المستودع فارغ أو يخصك.' }

Write-Host "`nتم. المشروع الآن على GitHub." -ForegroundColor Green
Write-Host 'للنشر: افتح https://vercel.com/new واختر المستودع، ثم أضف ANTHROPIC_API_KEY في Environment Variables.'
Read-Host 'اضغط Enter للإغلاق'
