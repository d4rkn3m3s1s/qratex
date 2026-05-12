fixes = 0

def fix(filepath, replacements):
    global fixes
    c = open(filepath, 'r', encoding='utf-8').read()
    changed = False
    for old, new in replacements:
        if old in c:
            c = c.replace(old, new)
            changed = True
            fixes += 1
        else:
            print(f"  WARN: not found in {filepath}: {old[:60]}...")
    if changed:
        open(filepath, 'w', encoding='utf-8').write(c)
        print(f"  OK: {filepath}")

# ═══ 1. Hamburger Menu - bigger ═══
print("1. Hamburger menu...")
fix('components/dashboard/sidebar.tsx', [
    # Make button bigger
    (
        '<Button variant="gradient" size="icon" className="rounded-full shadow-lg">\n            <Menu className="w-5 h-5" />',
        '<Button variant="gradient" size="icon" className="h-14 w-14 rounded-full shadow-xl">\n            <Menu className="w-6 h-6" />'
    ),
])

# ═══ 2. Admin Dashboard - Recent users/feedbacks responsive ═══
print("2. Admin recent lists...")
fix('app/admin/page.tsx', [
    # Recent users list items
    (
        '                    className="flex items-center gap-4"\n                  >\n                    <Avatar>',
        '                    className="flex items-center gap-2 sm:gap-4"\n                  >\n                    <Avatar className="shrink-0">'
    ),
    # Recent users right side - make badge/date smaller
    (
        '                    <div className="text-right">',
        '                    <div className="text-right shrink-0">'
    ),
    # Recent feedbacks list items
    (
        '                    className="flex items-start gap-4"',
        '                    className="flex items-start gap-2 sm:gap-4"'
    ),
])

# ═══ 3. Admin Badges - remove circle wrapper, fix dark mode ═══
print("3. Admin badges circle + dark...")
fix('app/admin/badges/page.tsx', [
    # Grid view: remove the circle wrapper, show icon directly
    (
        '''                      {/* Badge Icon Container - BIGGER */}
                      <div className="relative">
                        <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${config.gradient} blur-xl opacity-30 dark:opacity-50`} />
                        <div className={`relative p-5 rounded-full bg-gradient-to-br ${config.gradient} shadow-2xl ${config.glowColor}`}>
                          <Image
                            src={badge.icon}
                            alt={badge.name}
                            width={80}
                            height={80}
                            className="relative z-10 drop-shadow-2xl"
                          />
                        </div>''',
        '''                      {/* Badge Icon - DIRECT */}
                      <div className="relative">
                        <div className={`absolute inset-4 rounded-full bg-gradient-to-br ${config.gradient} blur-2xl opacity-20 dark:opacity-40`} />
                          <Image
                            src={badge.icon}
                            alt={badge.name}
                            width={96}
                            height={96}
                            className="relative z-10 drop-shadow-2xl brightness-110 dark:brightness-125"
                          />'''
    ),
    # Close the old inner div that's now gone - fix the sparkle positioning
    # The closing </div> for the inner circle container needs to be removed
    # Old code after the image had closing </div> for inner circle
])

# ═══ 4. Admin + Customer Settings Tabs ═══
print("4. Settings tabs...")
fix('app/admin/settings/page.tsx', [
    (
        'TabsList className="grid w-full grid-cols-3 md:grid-cols-6 lg:w-auto"',
        'TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:w-auto"'
    ),
])

fix('app/customer/settings/page.tsx', [
    (
        'TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:w-auto"',
        'TabsList className="flex flex-wrap gap-1 w-full lg:w-auto"'
    ),
])

# ═══ 5. Dealer Dashboard Button ═══
print("5. Dealer button...")
fix('app/dealer/page.tsx', [
    (
        '<Button asChild size="lg" className="bg-white text-purple-600 hover:bg-white/90">',
        '<Button asChild size="default" className="bg-white text-purple-600 hover:bg-white/90 text-sm">'
    ),
])

# ═══ 6. Customer Consumption + Feedbacks boxes ═══
print("6. Customer boxes...")
fix('app/customer/consumptions/page.tsx', [
    (
        '<div className="grid grid-cols-3 gap-4">',
        '<div className="grid grid-cols-3 gap-2 sm:gap-4">'
    ),
    # Hero padding
    (
        'from-orange-500 via-amber-500 to-yellow-500 p-6 md:p-8',
        'from-orange-500 via-amber-500 to-yellow-500 p-4 sm:p-6 md:p-8'
    ),
])

fix('app/customer/feedbacks/page.tsx', [
    (
        '<div className="grid grid-cols-3 gap-4">',
        '<div className="grid grid-cols-3 gap-2 sm:gap-4">'
    ),
])

print(f"\nTotal fixes: {fixes}")
