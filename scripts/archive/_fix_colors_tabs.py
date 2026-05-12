
# ═══ 1. Admin Badges - Fix colors to match customer ═══
c = open('app/admin/badges/page.tsx', 'r', encoding='utf-8').read()

# Fix rarityConfig bgGradient - the dark: prefix on bg-gradient-to-br doesn't work
# Use same pattern as customer badges
old_rarity = """const rarityConfig = {
  COMMON: {
    label: 'Yaygın',
    icon: Shield,
    gradient: 'from-slate-400 to-slate-600',
    bgGradient: 'bg-slate-100 dark:bg-gradient-to-br dark:from-slate-500/20 dark:to-slate-700/20',
    borderColor: 'border-slate-300 dark:border-slate-500/50',
    glowColor: 'shadow-slate-300/20 dark:shadow-slate-500/20',
    textColor: 'text-slate-600 dark:text-slate-300',
    badgeBg: 'bg-slate-200 dark:bg-slate-500/30',
  },
  RARE: {
    label: 'Nadir',
    icon: Gem,
    gradient: 'from-blue-400 to-cyan-500',
    bgGradient: 'bg-blue-50 dark:bg-gradient-to-br dark:from-blue-500/20 dark:to-cyan-500/20',
    borderColor: 'border-blue-300 dark:border-blue-500/50',
    glowColor: 'shadow-blue-300/20 dark:shadow-blue-500/30',
    textColor: 'text-blue-600 dark:text-blue-300',
    badgeBg: 'bg-blue-100 dark:bg-blue-500/30',
  },
  EPIC: {
    label: 'Epik',
    icon: Zap,
    gradient: 'from-purple-400 to-pink-500',
    bgGradient: 'bg-purple-50 dark:bg-gradient-to-br dark:from-purple-500/20 dark:to-pink-500/20',
    borderColor: 'border-purple-300 dark:border-purple-500/50',
    glowColor: 'shadow-purple-300/20 dark:shadow-purple-500/30',
    textColor: 'text-purple-600 dark:text-purple-300',
    badgeBg: 'bg-purple-100 dark:bg-purple-500/30',
  },
  LEGENDARY: {
    label: 'Efsanevi',
    icon: Crown,
    gradient: 'from-amber-400 via-orange-500 to-red-500',
    bgGradient: 'bg-amber-50 dark:bg-gradient-to-br dark:from-amber-500/20 dark:via-orange-500/20 dark:to-red-500/20',
    borderColor: 'border-amber-300 dark:border-amber-500/50',
    glowColor: 'shadow-amber-300/30 dark:shadow-amber-500/40',
    textColor: 'text-amber-600 dark:text-amber-300',
    badgeBg: 'bg-amber-100 dark:bg-gradient-to-r dark:from-amber-500/30 dark:to-red-500/30',
  },
};"""

new_rarity = """const rarityConfig = {
  COMMON: {
    label: 'Yaygın',
    icon: Shield,
    gradient: 'from-slate-400 to-slate-600',
    bgGradient: 'bg-gradient-to-br from-slate-100 via-gray-50 to-slate-100 dark:from-slate-800/80 dark:via-slate-700/60 dark:to-slate-800/80',
    borderColor: 'border-gray-300 dark:border-gray-600/60',
    glowColor: 'shadow-gray-400/20 dark:shadow-gray-500/30',
    textColor: 'text-gray-600 dark:text-gray-400',
    badgeBg: 'bg-gray-200 dark:bg-gray-700/50',
  },
  RARE: {
    label: 'Nadir',
    icon: Gem,
    gradient: 'from-blue-400 to-cyan-500',
    bgGradient: 'bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 dark:from-blue-900/40 dark:via-cyan-900/30 dark:to-blue-800/40',
    borderColor: 'border-blue-300 dark:border-blue-500/50',
    glowColor: 'shadow-blue-400/20 dark:shadow-blue-500/30',
    textColor: 'text-blue-600 dark:text-blue-400',
    badgeBg: 'bg-blue-100 dark:bg-blue-800/40',
  },
  EPIC: {
    label: 'Epik',
    icon: Zap,
    gradient: 'from-purple-400 to-pink-500',
    bgGradient: 'bg-gradient-to-br from-purple-50 via-pink-50 to-fuchsia-100 dark:from-purple-900/40 dark:via-pink-900/30 dark:to-fuchsia-900/40',
    borderColor: 'border-purple-300 dark:border-purple-500/50',
    glowColor: 'shadow-purple-400/20 dark:shadow-purple-500/30',
    textColor: 'text-purple-600 dark:text-purple-400',
    badgeBg: 'bg-purple-100 dark:bg-purple-800/40',
  },
  LEGENDARY: {
    label: 'Efsanevi',
    icon: Crown,
    gradient: 'from-amber-400 via-orange-500 to-red-500',
    bgGradient: 'bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 dark:from-amber-900/40 dark:via-orange-900/30 dark:to-red-900/40',
    borderColor: 'border-amber-300 dark:border-yellow-500/50',
    glowColor: 'shadow-yellow-400/30 dark:shadow-yellow-500/50',
    textColor: 'text-amber-600 dark:text-yellow-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-800/40',
  },
};"""

if old_rarity in c:
    c = c.replace(old_rarity, new_rarity)
    print("1. Admin badges rarityConfig colors fixed!")
else:
    print("ERROR: rarityConfig not found")

# Also fix the stats cards at top - they use bgGradient too
# The total stats card also needs fixing
c = c.replace(
    'className="p-4 rounded-xl bg-card border"',
    'className="p-4 rounded-xl bg-card border border-border"'
)

open('app/admin/badges/page.tsx', 'w', encoding='utf-8').write(c)

# ═══ 2. Admin Settings Tabs - fix overlap ═══
c2 = open('app/admin/settings/page.tsx', 'r', encoding='utf-8').read()

old_tabs = """        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:w-auto">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profil</span>
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Genel</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Görünüm</span>
          </TabsTrigger>
          <TabsTrigger value="auth" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Kimlik</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">AI</span>
          </TabsTrigger>
          <TabsTrigger value="gamification" className="gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Oyunlaştırma</span>
          </TabsTrigger>
        </TabsList>"""

new_tabs = """        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:w-full sm:grid-cols-3 md:grid-cols-6">
            <TabsTrigger value="profile" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <User className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Profil</span>
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <Globe className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Genel</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <Palette className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Görünüm</span>
            </TabsTrigger>
            <TabsTrigger value="auth" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <Shield className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Kimlik</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">AI</span>
            </TabsTrigger>
            <TabsTrigger value="gamification" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <Database className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Oyun</span>
            </TabsTrigger>
          </TabsList>
        </div>"""

if old_tabs in c2:
    c2 = c2.replace(old_tabs, new_tabs)
    print("2. Admin settings tabs fixed - horizontal scroll on mobile!")
else:
    print("ERROR: Admin tabs not found")

open('app/admin/settings/page.tsx', 'w', encoding='utf-8').write(c2)
print("Done!")
