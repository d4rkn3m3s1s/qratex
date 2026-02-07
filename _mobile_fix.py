import os

# ─── 1. Customer Dashboard ───
f = 'app/customer/page.tsx'
c = open(f, 'r', encoding='utf-8').read()

# Fix Quick Actions: 5 cols too many on sm
c = c.replace(
    'grid-cols-2 sm:grid-cols-5',
    'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
)

# Make profile avatar smaller on mobile
c = c.replace('w-24 h-24 ring-4', 'w-20 h-20 sm:w-24 sm:h-24 ring-4')
c = c.replace('text-2xl font-bold">{user?.name', 'text-xl sm:text-2xl font-bold">{user?.name')

open(f, 'w', encoding='utf-8').write(c)
print(f"1. {f} - mobile fixes applied")

# ─── 2. Customer Badges ───
f = 'app/customer/badges/page.tsx'
c = open(f, 'r', encoding='utf-8').read()

# Hero stats: trophy circle too big on mobile
c = c.replace('w-28 h-28 rounded-full bg-gradient-to-br from-primary', 'w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-primary')
c = c.replace('<Trophy className="w-14 h-14 text-white" />', '<Trophy className="w-10 h-10 sm:w-14 sm:h-14 text-white" />')
c = c.replace('text-4xl font-bold', 'text-2xl sm:text-4xl font-bold')
c = c.replace('text-muted-foreground text-lg', 'text-muted-foreground text-sm sm:text-lg')

# Hero quick stats: 3 cols too tight on very small screens
c = c.replace(
    '<div className="grid grid-cols-3 gap-4">',
    '<div className="grid grid-cols-3 gap-2 sm:gap-4">',
    1  # only first occurrence (hero section)
)
c = c.replace(
    'text-center p-4 rounded-xl bg-background/60',
    'text-center p-2 sm:p-4 rounded-xl bg-background/60'
)

# Modal: make smaller max-w on mobile
c = c.replace(
    'w-full max-w-lg my-8',
    'w-full max-w-lg my-4 sm:my-8'
)

# Modal padding mobile
c = c.replace(
    '<div className="relative z-10 p-8">',
    '<div className="relative z-10 p-4 sm:p-8">'
)

# Modal title size
c = c.replace(
    'text-3xl font-bold text-white mb-3',
    'text-2xl sm:text-3xl font-bold text-white mb-3'
)

# Modal description
c = c.replace(
    'text-center text-white/85 text-base mb-5',
    'text-center text-white/85 text-sm sm:text-base mb-5'
)

# Filter buttons wrap better
c = c.replace(
    '<div className="flex flex-wrap items-center gap-3">',
    '<div className="flex flex-wrap items-center gap-2 sm:gap-3">'
)

open(f, 'w', encoding='utf-8').write(c)
print(f"2. {f} - mobile fixes applied")

print("Customer dashboard + badges mobile done!")
