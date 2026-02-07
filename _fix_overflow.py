fixes = 0

# ═══ 1. Fix ALL layout files - add min-w-0 to main ═══
for layout in ['app/admin/layout.tsx', 'app/customer/layout.tsx', 'app/dealer/layout.tsx']:
    c = open(layout, 'r', encoding='utf-8').read()
    old = '<main className="flex-1 p-4 lg:p-6 overflow-auto">'
    new = '<main className="flex-1 min-w-0 p-4 lg:p-6 overflow-x-hidden overflow-y-auto">'
    if old in c:
        c = c.replace(old, new)
        open(layout, 'w', encoding='utf-8').write(c)
        fixes += 1
        print(f"  Fixed: {layout}")
    else:
        print(f"  Skip: {layout} (already fixed or different)")

# ═══ 2. Admin page - add overflow-hidden to cards ═══
c = open('app/admin/page.tsx', 'r', encoding='utf-8').read()

# Wrap the entire page content in overflow-hidden
c = c.replace(
    "    <div className=\"space-y-6\">\n      {/* Welcome Card */}",
    "    <div className=\"space-y-6 w-full max-w-full overflow-hidden\">\n      {/* Welcome Card */}"
)

# Make card headers not overflow
c = c.replace(
    '              Son Kayıt Olan Kullanıcılar',
    'Son Kullanıcılar'
)
c = c.replace(
    '              Son Geri Bildirimler',
    'Son Bildirimler'
)

open('app/admin/page.tsx', 'w', encoding='utf-8').write(c)
fixes += 1
print(f"  Fixed: app/admin/page.tsx")

print(f"\nTotal: {fixes} files fixed")
