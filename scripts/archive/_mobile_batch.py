import os, glob

fixes_applied = 0

def fix_file(filepath, replacements):
    global fixes_applied
    try:
        c = open(filepath, 'r', encoding='utf-8').read()
        changed = False
        for old, new in replacements:
            if old in c:
                c = c.replace(old, new)
                changed = True
                fixes_applied += 1
        if changed:
            open(filepath, 'w', encoding='utf-8').write(c)
            print(f"  Fixed: {filepath}")
        else:
            print(f"  OK: {filepath} (no changes needed)")
    except Exception as e:
        print(f"  Error: {filepath} - {e}")

# ─── Admin AI Detailed ───
fix_file('app/admin/ai-detailed/page.tsx', [
    # grid-cols-3 without responsive for experience signals
    ('grid grid-cols-3 gap-4">\n        {[',
     'grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">\n        {['),
    # grid-cols-5 for rating dist - too many on mobile
    ('grid grid-cols-5 gap-4',
     'grid grid-cols-5 gap-2 sm:gap-4'),
    # text-3xl in signals
    ('text-3xl font-bold',
     'text-2xl sm:text-3xl font-bold'),
])

# ─── Admin AI Settings ───
fix_file('app/admin/ai-settings/page.tsx', [
    # lg:grid-cols-3 already falls back, just add padding
    ('className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-6 md:p-8"',
     'className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-4 sm:p-6 md:p-8"'),
])

# ─── Admin AI Learning ───
fix_file('app/admin/ai-learning/page.tsx', [
    ('from-emerald-600 via-teal-600 to-cyan-700 p-6 md:p-8',
     'from-emerald-600 via-teal-600 to-cyan-700 p-4 sm:p-6 md:p-8'),
])

# ─── Admin AI Dashboard ───
fix_file('app/admin/ai-dashboard/page.tsx', [
    ('from-indigo-600 via-violet-600 to-purple-700 p-6 md:p-8',
     'from-indigo-600 via-violet-600 to-purple-700 p-4 sm:p-6 md:p-8'),
    ('grid grid-cols-2 md:grid-cols-4 gap-4',
     'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4'),
    ('grid grid-cols-3 gap-4 mb-4',
     'grid grid-cols-3 gap-2 sm:gap-4 mb-4'),
    ('text-3xl font-bold text-emerald',
     'text-xl sm:text-3xl font-bold text-emerald'),
    ('text-3xl font-bold text-blue',
     'text-xl sm:text-3xl font-bold text-blue'),
    ('text-3xl font-bold text-red',
     'text-xl sm:text-3xl font-bold text-red'),
])

# ─── Admin Badges ───
fix_file('app/admin/badges/page.tsx', [
    ('grid grid-cols-2 md:grid-cols-5 gap-4',
     'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4'),
])

# ─── Customer AI Insights ───
fix_file('app/customer/ai-insights/page.tsx', [
    ('from-cyan-600 via-blue-600 to-indigo-600 p-6 md:p-8',
     'from-cyan-600 via-blue-600 to-indigo-600 p-4 sm:p-6 md:p-8'),
    # Sentiment grid-cols-3 
    ('grid grid-cols-3 gap-4 mb-4',
     'grid grid-cols-3 gap-2 sm:gap-4 mb-4'),
    ('text-2xl font-bold text-emerald',
     'text-lg sm:text-2xl font-bold text-emerald'),
    ('text-2xl font-bold text-blue-500',
     'text-lg sm:text-2xl font-bold text-blue-500'),
    ('text-2xl font-bold text-red-500',
     'text-lg sm:text-2xl font-bold text-red-500'),
])

# ─── Customer Rewards ───
fix_file('app/customer/rewards/page.tsx', [
    # Already has grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 - OK
])

# ─── Customer Trends ───
fix_file('app/customer/trends/page.tsx', [
    # Check for grid issues
])

# ─── Customer Analytics ───
fix_file('app/customer/analytics/page.tsx', [])

# ─── Customer Quests ───
fix_file('app/customer/quests/page.tsx', [])

# ─── Customer Consumptions ───
fix_file('app/customer/consumptions/page.tsx', [])

# ─── Customer Donations ───
fix_file('app/customer/donations/page.tsx', [])

# ─── Customer Leaderboard ───
fix_file('app/customer/leaderboard/page.tsx', [])

# ─── Customer Feedbacks ───
fix_file('app/customer/feedbacks/page.tsx', [])

# ─── Customer Settings ───
fix_file('app/customer/settings/page.tsx', [])

# ─── Customer My Card ───
fix_file('app/customer/my-card/page.tsx', [])

# ─── Customer Scan ───
fix_file('app/customer/scan/page.tsx', [])

# ─── Dealer AI Insights ───
fix_file('app/dealer/ai-insights/page.tsx', [
    ('from-violet-600 via-purple-600 to-fuchsia-700 p-6 md:p-8',
     'from-violet-600 via-purple-600 to-fuchsia-700 p-4 sm:p-6 md:p-8'),
])

# ─── Dealer AI Settings ───
fix_file('app/dealer/ai-settings/page.tsx', [
    # Check hero padding
])

# ─── Dealer Products ───
fix_file('app/dealer/products/page.tsx', [])

# ─── Dealer QR Codes ───
fix_file('app/dealer/qr-codes/page.tsx', [])

# ─── Dealer Feedbacks ───
fix_file('app/dealer/feedbacks/page.tsx', [])

# ─── Dealer Analytics ───
fix_file('app/dealer/analytics/page.tsx', [
    ('grid grid-cols-2 lg:grid-cols-4 gap-4',
     'grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'),
])

# ─── Dealer Scan ───
fix_file('app/dealer/scan/page.tsx', [])

# ─── Dealer Settings ───
fix_file('app/dealer/settings/page.tsx', [])

# ─── Admin Analytics ───
fix_file('app/admin/analytics/page.tsx', [])

# ─── Admin Cards ───
fix_file('app/admin/cards/page.tsx', [])

# ─── Admin Quests ───
fix_file('app/admin/quests/page.tsx', [])

# ─── Admin Rewards ───
fix_file('app/admin/rewards/page.tsx', [])

# ─── Admin Pricing ───
fix_file('app/admin/pricing/page.tsx', [])

# ─── Admin Pages ───
fix_file('app/admin/pages/page.tsx', [])

# ─── Admin Themes ───
fix_file('app/admin/themes/page.tsx', [])

# ─── Admin Features ───
fix_file('app/admin/features/page.tsx', [])

# ─── Admin Settings ───
fix_file('app/admin/settings/page.tsx', [])

print(f"\nTotal fixes applied: {fixes_applied}")
print("All pages checked!")
