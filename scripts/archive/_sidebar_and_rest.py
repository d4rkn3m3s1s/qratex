
# ═══ 1. Sidebar - Add referral + campaigns links ═══
c = open('components/dashboard/sidebar.tsx', 'r', encoding='utf-8').read()

# Add Share2, Megaphone to imports
c = c.replace(
    "  Brain,\n  Database,\n  Cpu,\n  Eye,\n} from 'lucide-react';",
    "  Brain,\n  Database,\n  Cpu,\n  Eye,\n  Share2,\n  Megaphone,\n  PieChart,\n} from 'lucide-react';"
)

# Add referral + campaigns to customer nav
c = c.replace(
    "  { href: '/customer/donations', label: 'Sosyal Sorumluluk', icon: Heart },",
    "  { href: '/customer/referral', label: 'Davet Et', icon: Share2 },\n  { href: '/customer/campaigns', label: 'Kampanyalar', icon: Megaphone },\n  { href: '/customer/donations', label: 'Sosyal Sorumluluk', icon: Heart },"
)

# Add campaigns to dealer nav
c = c.replace(
    "  { href: '/dealer/ai-insights', label: 'AI İçgörüler', icon: Sparkles },",
    "  { href: '/dealer/campaigns', label: 'Kampanyalar', icon: Megaphone },\n  { href: '/dealer/ai-insights', label: 'AI İçgörüler', icon: Sparkles },"
)

# Add segments to admin nav
c = c.replace(
    "  { href: '/admin/ai-dashboard', label: 'AI Kontrol Merkezi', icon: Brain },",
    "  { href: '/admin/segments', label: 'Segmentler', icon: PieChart },\n  { href: '/admin/ai-dashboard', label: 'AI Kontrol Merkezi', icon: Brain },"
)

open('components/dashboard/sidebar.tsx', 'w', encoding='utf-8').write(c)
print("1. Sidebar: referral, campaigns, segments links added")
