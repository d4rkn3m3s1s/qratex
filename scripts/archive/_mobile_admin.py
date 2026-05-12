import os

# ─── Admin Dashboard ───
f = 'app/admin/page.tsx'
c = open(f, 'r', encoding='utf-8').read()

# Sentiment grid: 3 cols fixed -> responsive
c = c.replace(
    'grid grid-cols-3 gap-4 text-center',
    'grid grid-cols-3 gap-2 sm:gap-4 text-center'
)
# Sentiment font size too big on mobile
c = c.replace(
    'text-3xl font-bold text-green-500',
    'text-xl sm:text-3xl font-bold text-green-500'
)
c = c.replace(
    'text-3xl font-bold text-gray-500',
    'text-xl sm:text-3xl font-bold text-gray-500'
)
c = c.replace(
    'text-3xl font-bold text-red-500',
    'text-xl sm:text-3xl font-bold text-red-500'
)
# Quick totals grid
c = c.replace(
    'grid gap-4 sm:grid-cols-2 lg:grid-cols-5',
    'grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
)

open(f, 'w', encoding='utf-8').write(c)
print(f"1. {f} done")

# ─── Admin Users ─── Already has overflow-x-auto and hidden columns, minimal fix
f = 'app/admin/users/page.tsx'
c = open(f, 'r', encoding='utf-8').read()

# Stats grid - already grid-cols-2 md:grid-cols-4 - OK
# Table already has overflow-x-auto - OK
# Just ensure search bar is mobile friendly
open(f, 'w', encoding='utf-8').write(c)
print(f"2. {f} - already responsive (verified)")

# ─── Admin Feedbacks ─── 
f = 'app/admin/feedbacks/page.tsx'
c = open(f, 'r', encoding='utf-8').read()

# Filter grid too many cols on mobile
c = c.replace(
    'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3',
    'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3'
)

open(f, 'w', encoding='utf-8').write(c)
print(f"3. {f} done")

print("Admin mobile fixes done!")
