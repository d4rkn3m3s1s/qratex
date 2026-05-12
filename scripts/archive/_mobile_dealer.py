f = 'app/dealer/page.tsx'
c = open(f, 'r', encoding='utf-8').read()

# Hero stat value - text-3xl too big on mobile for stat cards
# The AnimatedStat text-3xl is used for stat values in the hero
# Line 375: grid-cols-2 lg:grid-cols-4 - already OK

# grid-cols-12 section: ensure it stacks on mobile
# Line 458: lg:grid-cols-12 - falls to grid-cols-1 on mobile, good

# Grid-cols-3 in sentiment section - ensure padding
c = c.replace(
    'grid grid-cols-3 gap-2 text-center',
    'grid grid-cols-3 gap-1 sm:gap-2 text-center'
)

# Hero section - ensure readable on mobile
c = c.replace(
    'text-3xl md:text-4xl font-bold text-white',
    'text-2xl sm:text-3xl md:text-4xl font-bold text-white'
)

open(f, 'w', encoding='utf-8').write(c)
print(f"{f} done")
