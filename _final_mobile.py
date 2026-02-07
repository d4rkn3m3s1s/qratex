fixes = 0

def fix(f, pairs):
    global fixes
    c = open(f, 'r', encoding='utf-8').read()
    ch = False
    for old, new in pairs:
        if old in c:
            c = c.replace(old, new)
            ch = True
            fixes += 1
    if ch:
        open(f, 'w', encoding='utf-8').write(c)
        print(f"  OK: {f}")

# ═══ Dealer page ═══
fix('app/dealer/page.tsx', [
    # Hero padding
    ('from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8',
     'from-violet-600 via-purple-600 to-fuchsia-600 p-4 sm:p-6 md:p-8'),
    # AnimatedStat text too big
    ('<span className="text-3xl font-bold">{value}</span>',
     '<span className="text-xl sm:text-3xl font-bold">{value}</span>'),
    # Stat card values
    ('<span className="text-2xl font-bold">\n',
     '<span className="text-lg sm:text-2xl font-bold">\n'),
    # Weekly feedbacks
    ('<p className="text-2xl font-bold">{stats.weeklyFeedbacks}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{stats.weeklyFeedbacks}</p>'),
    # Sentiment section p-6
    ('<CardContent className="p-6">\n              <div className="space-y-4">\n                <p className="text-sm',
     '<CardContent className="p-3 sm:p-6">\n              <div className="space-y-4">\n                <p className="text-sm'),
])

# ═══ Admin page ═══
fix('app/admin/page.tsx', [
    # Welcome text
    ('<h2 className="text-2xl font-bold">',
     '<h2 className="text-lg sm:text-2xl font-bold">'),
    # Totals values
    ('<p className="text-2xl font-bold">{data.totals.users}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{data.totals.users}</p>'),
    ('<p className="text-2xl font-bold">{data.totals.feedbacks}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{data.totals.feedbacks}</p>'),
    ('<p className="text-2xl font-bold">{data.totals.qrCodes}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{data.totals.qrCodes}</p>'),
    ('<p className="text-2xl font-bold">{data.totals.activeQRCodes}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{data.totals.activeQRCodes}</p>'),
    ('<p className="text-2xl font-bold">{data.totals.scans}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{data.totals.scans}</p>'),
])

# ═══ Admin badges ═══
fix('app/admin/badges/page.tsx', [
    ('<p className="text-2xl font-bold">{stats.total}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{stats.total}</p>'),
    ('<p className="text-2xl font-bold">{count}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{count}</p>'),
])

# ═══ Customer feedbacks ═══
fix('app/customer/feedbacks/page.tsx', [
    ('<p className="text-2xl font-bold">{totalFeedbacks}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{totalFeedbacks}</p>'),
    ('<p className="text-2xl font-bold">{avgRating}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{avgRating}</p>'),
    ('<p className="text-2xl font-bold">{consumptionReviews.length * 50}+</p>',
     '<p className="text-lg sm:text-2xl font-bold">{consumptionReviews.length * 50}+</p>'),
])

# ═══ Customer consumptions ═══
fix('app/customer/consumptions/page.tsx', [
    ('<p className="text-2xl font-bold">{stat.value}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{stat.value}</p>'),
    ('<CardContent className="p-6">\n',
     '<CardContent className="p-3 sm:p-6">\n'),
])

# ═══ Dealer analytics ═══
fix('app/dealer/analytics/page.tsx', [
    ('from-violet-600 via-purple-600 to-fuchsia-600 p-6 md:p-8',
     'from-violet-600 via-purple-600 to-fuchsia-600 p-4 sm:p-6 md:p-8'),
    # stat values
    ('<p className="text-2xl font-bold">{current}{suffix}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{current}{suffix}</p>'),
    ('<p className="text-2xl font-bold">\n',
     '<p className="text-lg sm:text-2xl font-bold">\n'),
    ('<p className="text-2xl font-bold">{topic.count}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{topic.count}</p>'),
])

# ═══ Admin settings profile card ═══
fix('app/admin/settings/page.tsx', [
    ('<CardContent className="p-6">\n                <div className="flex flex-col sm:flex-row items-center gap-6">',
     '<CardContent className="p-4 sm:p-6">\n                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">'),
])

# ═══ Customer settings profile card ═══
fix('app/customer/settings/page.tsx', [
    ('<CardContent className="p-6">\n                <div className="flex flex-col sm:flex-row items-center gap-6">',
     '<CardContent className="p-4 sm:p-6">\n                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">'),
])

# ═══ Admin AI detailed - grid-cols-5 too many on mobile ═══
fix('app/admin/ai-detailed/page.tsx', [
    ('grid grid-cols-5 gap-2 sm:gap-4',
     'grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4'),
])

# ═══ Admin AI dashboard - sentiment values ═══
fix('app/admin/ai-dashboard/page.tsx', [
    ('<p className="text-2xl font-bold">{stats?.analyzedFeedbacks || 0}</p>',
     '<p className="text-lg sm:text-2xl font-bold">{stats?.analyzedFeedbacks || 0}</p>'),
])

print(f"\nTotal: {fixes} fixes")
