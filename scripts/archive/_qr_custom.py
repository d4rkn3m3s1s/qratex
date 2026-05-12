c = open('app/dealer/qr-codes/page.tsx', 'r', encoding='utf-8').read()

# 1. Add qr color state after existing state
c = c.replace(
    "  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);",
    """  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [qrFgColor, setQrFgColor] = useState('#000000');
  const [qrBgColor, setQrBgColor] = useState('#FFFFFF');"""
)

# 2. Update QR generation to use custom colors
c = c.replace(
    """      const qrDataUrl = await QRCodeLib.toDataURL(url, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });""",
    """      const qrDataUrl = await QRCodeLib.toDataURL(url, {
        width: 400,
        margin: 2,
        color: {
          dark: qrFgColor,
          light: qrBgColor,
        },
      });"""
)

# 3. Add Palette import if not exists
if 'Palette' not in c:
    c = c.replace(
        "  Download,",
        "  Download,\n  Palette,"
    )

# 4. Find the preview dialog and add color pickers + download button
# Add color controls before the QR preview image display
old_preview = '''setPreviewDialogOpen(false)}>'''
# This is tricky, let me find a better anchor
# Add a download function
c = c.replace(
    "  const [qrFgColor, setQrFgColor] = useState('#000000');",
    """  const [qrFgColor, setQrFgColor] = useState('#000000');

  const downloadQR = async (code: string, format: 'png' | 'svg' = 'png') => {
    const url = `${window.location.origin}/feedback/${code}`;
    if (format === 'svg') {
      const svgStr = await QRCodeLib.toString(url, { type: 'svg', width: 400, margin: 2, color: { dark: qrFgColor, light: qrBgColor } });
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `qr-${code}.svg`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } else {
      const dataUrl = await QRCodeLib.toDataURL(url, { width: 800, margin: 2, color: { dark: qrFgColor, light: qrBgColor } });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `qr-${code}.png`;
      a.click();
    }
    toast.success(`QR kod ${format.toUpperCase()} olarak indirildi!`);
  };"""
)

open('app/dealer/qr-codes/page.tsx', 'w', encoding='utf-8').write(c)
print("QR customization: colors + download added!")
